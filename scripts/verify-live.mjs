// Explicitly opt in: TEST_BASE_URL=https://... TEST_ONLINE=1 node scripts/verify-live.mjs
// Independent HTTP guest sessions; never prints cookies or read credentials.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = process.env.TEST_BASE_URL;
if (process.env.TEST_ONLINE !== "1" || !origin)
  throw Error("Explicit live-test target required");
const backend =
  process.env.TEST_CONVEX_URL || "https://precious-alpaca-596.convex.cloud";
const identity = (name, token) => ({
  name,
  token,
  avatar: token % 8,
  variant: "icon",
  team: 0,
});
class Guest {
  pulse;
  stop() {
    clearInterval(this.pulse);
  }
  cookie = "";
  read = "";
  seat = "";
  async post(body, expected = 200, requestOrigin = origin) {
    const response = await fetch(`${origin}/api/room`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: requestOrigin,
        Cookie: this.cookie,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const value = await response.json();
    assert.equal(
      response.status,
      expected,
      `HTTP ${response.status}: ${value.error || "unexpected response"}`,
    );
    const cookie = response.headers.get("set-cookie");
    if (cookie) {
      assert.match(cookie, /HttpOnly/i);
      assert.match(cookie, /Secure/i);
      assert.match(cookie, /SameSite=strict/i);
      this.cookie = cookie.split(";")[0];
    }
    if (value.read) this.read = value.read;
    if (value.seat) this.seat = value.seat;
    if (this.cookie && !this.pulse) {
      this.pulse = setInterval(() => {
        void this.post({ op: "heartbeat" }).catch(() => {});
      }, 15000);
      this.pulse.unref();
    }
    return value;
  }
  async snapshot() {
    const response = await fetch(`${backend}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "rooms:snapshot",
        args: { read: this.read },
        format: "json",
      }),
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    assert.equal(result.status, "success", result.errorMessage);
    return result.value;
  }
  async act(command, lobby = true) {
    const room = await this.snapshot();
    return this.post({
      op: "act",
      key: randomUUID(),
      revision: room.revision,
      command,
      lobby,
    });
  }
}
const host = new Guest(),
  guest = new Guest(),
  spectator = new Guest();
const room = await host.post({
  op: "create",
  identity: identity("Live QA Host", 0),
});
await guest.post({
  op: "join",
  code: room.code,
  identity: identity("Live QA Guest", 1),
});
await spectator.post({
  op: "join",
  code: room.code,
  identity: identity("Live QA Spectator", 2),
  spectator: true,
});
assert.notEqual(host.cookie, guest.cookie);
assert.notEqual((await host.snapshot()).me, (await guest.snapshot()).me);
console.log(
  "PASS: three independent guests, secure cookies, live snapshots and spectator entry",
);
const settings = {
  ...(await host.snapshot()).settings,
  capacity: 2,
  rollSeconds: 20,
};
await guest.post(
  {
    op: "act",
    key: randomUUID(),
    revision: (await guest.snapshot()).revision,
    command: { type: "settings", settings },
    lobby: true,
  },
  400,
);
await spectator.post(
  {
    op: "act",
    key: randomUUID(),
    revision: (await spectator.snapshot()).revision,
    command: { type: "ready", ready: true },
    lobby: true,
  },
  400,
);
await host.post({ op: "heartbeat" }, 403, "https://untrusted.invalid");
const before = await host.snapshot();
const action = {
  op: "act",
  key: randomUUID(),
  revision: before.revision,
  command: { type: "chat", text: "<script>untrusted()</script>" },
  lobby: true,
};
await host.post(action);
assert.equal((await host.post(action)).duplicate, true);
assert.equal(
  (await guest.snapshot()).chat.filter(
    (message) => message.text === action.command.text,
  ).length,
  1,
);
await host.post({ ...action, key: randomUUID() }, 400);
const oldCookie = guest.cookie;
await guest.post({ op: "renew" });
assert.equal(guest.cookie, oldCookie);
assert.equal((await guest.snapshot()).me, guest.seat);
console.log(
  "PASS: host privileges, spectator restrictions, origin protection, replay, stale revision and credential renewal",
);
await host.act({ type: "settings", settings });
await host.act({ type: "ready", ready: true });
await guest.act({ type: "ready", ready: true });
await host.act({ type: "start" });
const started = await host.snapshot();
assert.ok(started.game);
assert.equal((await guest.snapshot()).game.turn, started.game.turn);
assert.equal(JSON.stringify(started.game).includes('"decks"'), false);
await host.act({ type: "roll", dice: [6, 6] }, false).then(
  () => assert.fail("Forged dice accepted"),
  () => {},
);
// No player actions: durable timers must advance turns without a browser.
const startingRevision = started.game.revision;
await new Promise((resolve) => setTimeout(resolve, 22500));
const timed = await guest.snapshot();
assert.ok(timed.game.revision > startingRevision);
console.log(
  "PASS: server start, hidden deck state, forged command rejection and unattended roll deadline",
);
await host.act({ type: "reset" });
const vote = (await guest.snapshot()).votes.find(
  (entry) => entry.target === "reset",
);
assert.ok(vote);
await guest.act({ type: "voteYes", id: vote.id });
assert.equal((await host.snapshot()).game, null);
assert.equal((await guest.snapshot()).game, null);
console.log("PASS: live majority reset synchronised across guests");
const mixed = new Guest();
await mixed.post({ op: "create", identity: identity("Live QA Teams", 3) });
const teamSettings = {
  ...(await mixed.snapshot()).settings,
  capacity: 8,
  teams: true,
  preset: "Fast",
  rounds: 5,
};
await mixed.act({ type: "settings", settings: teamSettings });
for (let n = 0; n < 7; n++)
  await mixed.act({
    type: "addBot",
    difficulty: ["Easy", "Normal", "Hard", "Expert"][n % 4],
  });
await mixed.act({ type: "ready", ready: true });
await mixed.act({ type: "start" });
const teams = await mixed.snapshot();
assert.equal(teams.game.seats.length, 8);
assert.equal(teams.game.accounts.length, 4);
assert.ok(teams.game.accounts.every((account) => account.cash === 3000));
assert.equal(
  new Set(teams.game.seats.filter((seat) => seat.bot).map((seat) => seat.bot))
    .size,
  4,
);
console.log(
  "PASS: eight-seat four-team production match with seven bots across all four difficulties",
);
await mixed.act({ type: "reset" });
for (const session of [host, guest, spectator, mixed]) session.stop();
console.log(
  "LIVE API VERIFICATION PASSED; two-browser UI verification is a separate check.",
);
