import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../convex/schema";
import { defaults } from "../src/engine/types";
const modules = import.meta.glob("../convex/**/*.ts");
const identity = (name: string, token: number) => ({
  name,
  token,
  avatar: token,
  variant: "icon",
  team: 0,
});
describe("authoritative rooms", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SIGNING_KEY", "test-gateway");
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
  const setup = async () => {
    const t = convexTest(schema, modules);
    await t.mutation(anyApi.rooms.enter, {
      gateway: "test-gateway",
      ip: "host",
      code: "ABCD234567",
      create: true,
      secret: "host-secret",
      read: "host-read",
      seat: "host",
      identity: identity("Host", 0),
      spectator: false,
    });
    await t.mutation(anyApi.rooms.enter, {
      gateway: "test-gateway",
      ip: "guest",
      code: "ABCD234567",
      create: false,
      secret: "guest-secret",
      read: "guest-read",
      seat: "guest",
      identity: identity("Guest", 1),
      spectator: false,
    });
    return t;
  };
  it("idle deadline checks preserve the revision of unchanged rooms", async () => {
    const t = await setup();
    const before = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
    const roomId = await t.run(
      async (ctx) => (await ctx.db.query("rooms").first())!._id,
    );
    vi.setSystemTime(Date.now() + 15000);
    await t.mutation(anyApi.rooms.tick, { room: roomId });
    const after = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
    expect(after.revision).toBe(before.revision);
  });
  it("independent guest snapshots, no secret or hidden state", async () => {
    const t = await setup();
    const a = await t.query(anyApi.rooms.snapshot, { read: "host-read" }),
      b = await t.query(anyApi.rooms.snapshot, { read: "guest-read" });
    expect(a.seats).toEqual(b.seats);
    expect(a.me).toBe("host");
    expect(b.me).toBe("guest");
    expect(JSON.stringify(a)).not.toContain("host-secret");
  });
  it("rejects gateway forgery and invalid room credential", async () => {
    const t = await setup();
    await expect(
      t.mutation(anyApi.rooms.heartbeat, {
        gateway: "forged",
        secret: "host-secret",
      }),
    ).rejects.toThrow("Unauthorised");
    await expect(
      t.mutation(anyApi.rooms.heartbeat, {
        gateway: "test-gateway",
        secret: "copied-name",
      }),
    ).rejects.toThrow("Seat unavailable");
  });
  it("readiness, server start, duplicate commands and stale revisions", async () => {
    const t = await setup();
    let r = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
    const send = async (secret: string, key: string, command: object) => {
      const result = await t.mutation(anyApi.rooms.act, {
        gateway: "test-gateway",
        secret,
        key,
        revision: r.revision,
        command,
        lobby: true,
      });
      r = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
      return result;
    };
    await send("host-secret", "ready-host", { type: "ready", ready: true });
    await send("guest-secret", "ready-guest", { type: "ready", ready: true });
    const result = await send("host-secret", "start-0001", { type: "start" });
    expect(r.game).toBeTruthy();
    expect(r.game).not.toHaveProperty("chance");
    const duplicate = await t.mutation(anyApi.rooms.act, {
      gateway: "test-gateway",
      secret: "host-secret",
      key: "start-0001",
      revision: 0,
      command: { type: "start" },
      lobby: true,
    });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.revision).toBe(result.revision);
    await expect(
      t.mutation(anyApi.rooms.act, {
        gateway: "test-gateway",
        secret: "host-secret",
        key: "roll-00001",
        revision: 0,
        command: { type: "roll" },
        lobby: false,
      }),
    ).rejects.toThrow("State changed");
  });
  it("only host changes settings; spectators cannot act", async () => {
    const t = await setup();
    const r = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
    await expect(
      t.mutation(anyApi.rooms.act, {
        gateway: "test-gateway",
        secret: "guest-secret",
        key: "settings-1",
        revision: r.revision,
        command: { type: "settings", settings: defaults },
        lobby: true,
      }),
    ).rejects.toThrow("Host only");
    await t.mutation(anyApi.rooms.enter, {
      gateway: "test-gateway",
      ip: "watch",
      code: "ABCD234567",
      create: false,
      secret: "watch-secret",
      read: "watch-read",
      seat: "watch",
      identity: identity("Watch", 2),
      spectator: true,
    });
    const w = await t.query(anyApi.rooms.snapshot, { read: "watch-read" });
    await expect(
      t.mutation(anyApi.rooms.act, {
        gateway: "test-gateway",
        secret: "watch-secret",
        key: "ready-watch",
        revision: w.revision,
        command: { type: "ready", ready: true },
        lobby: true,
      }),
    ).rejects.toThrow("Spectators");
  });
  it("chat stays text, read credentials rotate, names cannot steal seats", async () => {
    const t = await setup();
    const r = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
    await t.mutation(anyApi.rooms.act, {
      gateway: "test-gateway",
      secret: "guest-secret",
      key: "chat-00001",
      revision: r.revision,
      command: { type: "chat", text: "<script>alert(1)</script>" },
      lobby: true,
    });
    const a = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
    expect(a.chat[0].text).toBe("<script>alert(1)</script>");
    await t.mutation(anyApi.rooms.renew, {
      gateway: "test-gateway",
      secret: "guest-secret",
      read: "guest-new",
    });
    expect(
      await t.query(anyApi.rooms.snapshot, { read: "guest-read" }),
    ).toBeNull();
    expect(
      (await t.query(anyApi.rooms.snapshot, { read: "guest-new" })).me,
    ).toBe("guest");
  });
  it("scheduled presence loss, host migration and absent-seat forfeit", async () => {
    const t = await setup();
    const initial = Date.now();
    const roomId = await t.run(
      async (ctx) => (await ctx.db.query("rooms").first())!._id,
    );
    vi.setSystemTime(initial + 46000);
    await t.mutation(anyApi.rooms.tick, { room: roomId });
    let r = await t.query(anyApi.rooms.snapshot, { read: "guest-read" });
    expect(r.seats.find((s: { id: string }) => s.id === "host").connected).toBe(
      false,
    );
    await t.mutation(anyApi.rooms.renew, {
      gateway: "test-gateway",
      secret: "guest-secret",
      read: "guest-new",
    });
    vi.setSystemTime(initial + 77000);
    await t.mutation(anyApi.rooms.heartbeat, {
      gateway: "test-gateway",
      secret: "guest-secret",
    });
    await t.mutation(anyApi.rooms.tick, { room: roomId });
    r = await t.query(anyApi.rooms.snapshot, { read: "guest-new" });
    expect(r.host).toBe("guest");
    vi.setSystemTime(initial + 227000);
    await t.mutation(anyApi.rooms.heartbeat, {
      gateway: "test-gateway",
      secret: "guest-secret",
    });
    await t.mutation(anyApi.rooms.tick, { room: roomId });
    r = await t.query(anyApi.rooms.snapshot, { read: "guest-new" });
    expect(r.seats.some((s: { id: string }) => s.id === "host")).toBe(false);
    await expect(
      t.mutation(anyApi.rooms.renew, {
        gateway: "test-gateway",
        secret: "host-secret",
        read: "stolen",
      }),
    ).rejects.toThrow("Seat unavailable");
  });
  it("server removes an abandoned room without another client action", async () => {
    const t = await setup();
    const initial = Date.now();
    const roomId = await t.run(
      async (ctx) => (await ctx.db.query("rooms").first())!._id,
    );
    vi.setSystemTime(initial + 46000);
    await t.mutation(anyApi.rooms.tick, { room: roomId });
    vi.setSystemTime(initial + 650000);
    await t.mutation(anyApi.rooms.tick, { room: roomId });
    expect(
      await t.query(anyApi.rooms.snapshot, { read: "host-read" }),
    ).toBeNull();
    expect(
      await t.run(async (ctx) => ctx.db.query("sessions").collect()),
    ).toEqual([]);
  });
  it("strict-majority kick uses a snapshot of eligible humans", async () => {
    const t = await setup();
    await t.mutation(anyApi.rooms.enter, {
      gateway: "test-gateway",
      ip: "third",
      code: "ABCD234567",
      create: false,
      secret: "third-secret",
      read: "third-read",
      seat: "third",
      identity: identity("Third", 2),
      spectator: false,
    });
    let r = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
    await t.mutation(anyApi.rooms.act, {
      gateway: "test-gateway",
      secret: "host-secret",
      key: "kick-00001",
      revision: r.revision,
      command: { type: "vote", target: "third", reason: "Testing vote" },
      lobby: true,
    });
    r = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
    expect(r.votes[0].eligible).toEqual(["host", "guest"]);
    expect(r.seats).toHaveLength(3);
    await expect(
      t.mutation(anyApi.rooms.act, {
        gateway: "test-gateway",
        secret: "third-secret",
        key: "vote-target",
        revision: r.revision,
        command: { type: "voteYes", id: "kick-00001" },
        lobby: true,
      }),
    ).rejects.toThrow("Vote unavailable");
    await t.mutation(anyApi.rooms.act, {
      gateway: "test-gateway",
      secret: "guest-secret",
      key: "vote-guest",
      revision: r.revision,
      command: { type: "voteYes", id: "kick-00001" },
      lobby: true,
    });
    r = await t.query(anyApi.rooms.snapshot, { read: "host-read" });
    expect(r.seats).toHaveLength(2);
    expect(
      await t.query(anyApi.rooms.snapshot, { read: "third-read" }),
    ).toBeNull();
  });
});
