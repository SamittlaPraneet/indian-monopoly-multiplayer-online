import { v } from "convex/values";
import { anyApi } from "convex/server";
import {
  mutation,
  query,
  internalMutation,
  MutationCtx,
  QueryCtx,
} from "./server";
import { defaults, Inputs } from "../src/engine/types";
import {
  apply,
  log,
  newGame,
  publicGame,
  validateSettings,
} from "../src/engine/game";
import { botCommand, botFallback, botSeat } from "../src/engine/bot";
import {
  commandSchema,
  identitySchema,
  lobbySchema,
} from "../src/lib/validation";
import { RoomData, Snapshot, Vote } from "../src/lib/room-types";
import { GenericId } from "convex/values";
const inputs = (): Inputs => ({
  now: Date.now(),
  dice: () => [
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
  ],
  shuffle: <T>(a: T[]) => {
    const copy = [...a];
    for (let n = copy.length - 1; n > 0; n--) {
      const j = Math.floor(Math.random() * (n + 1));
      [copy[n], copy[j]] = [copy[j], copy[n]];
    }
    return copy;
  },
});
function gateway(key: string) {
  if (
    !process.env.SESSION_SIGNING_KEY ||
    key !== process.env.SESSION_SIGNING_KEY
  )
    throw Error("Unauthorised gateway");
}
async function limit(ctx: MutationCtx, key: string, max: number, seconds = 10) {
  const now = Date.now(),
    old = await ctx.db
      .query("limits")
      .withIndex("key", (q) => q.eq("key", key))
      .unique();
  if (old && now - old.window < seconds * 1000) {
    if (old.count >= max) throw Error("Slow down and try again");
    await ctx.db.patch(old._id, { count: old.count + 1 });
  } else if (old) await ctx.db.patch(old._id, { window: now, count: 1 });
  else await ctx.db.insert("limits", { key, window: now, count: 1 });
}
async function session(ctx: QueryCtx, secret: string) {
  const s = await ctx.db
    .query("sessions")
    .withIndex("secret", (q) => q.eq("secret", secret))
    .unique();
  if (!s || s.revoked || s.expires < Date.now())
    throw Error("Seat unavailable or room expired");
  const room = await ctx.db.get(s.room);
  if (!room || room.expires < Date.now()) throw Error("Room expired");
  return { s, room, data: room.data as RoomData };
}
async function schedule(
  ctx: MutationCtx,
  id: GenericId<"rooms">,
  data: RoomData,
  expiry: number,
  oldTimer?: GenericId<"_scheduled_functions">,
) {
  if (oldTimer) await ctx.scheduler.cancel(oldTimer);
  let at = Math.min(Date.now() + 15000, expiry);
  const g = data.game;
  if (g && g.phase !== "over") {
    at = Math.min(at, g.due, g.trade?.due ?? Infinity);
    const bot = botSeat(g);
    if (
      bot &&
      (!g.trade ||
        !g.trade.confirmations.includes(
          g.settings.teams ? `team-${bot.team}` : bot.id,
        ))
    )
      at = Math.min(at, Date.now() + 700);
  }
  if (data.finishedAt) at = Math.min(at, data.finishedAt + 1800000);
  const timer = await ctx.scheduler.runAt(
    Math.max(Date.now() + 100, at),
    anyApi.rooms.tick,
    { room: id },
  );
  await ctx.db.patch(id, { data, timer });
}
function activity(data: RoomData, text: string) {
  data.activity = [...data.activity, text].slice(-40);
}
function reset(data: RoomData) {
  data.game = null;
  data.chat = [];
  data.activity = [];
  data.votes = [];
  data.finishedAt = null;
  data.seats = data.seats
    .filter((s) => s.bot || s.connected || s.active)
    .map((s) => ({
      ...s,
      ready: !!s.bot,
      active: true,
      position: 0,
      jail: -1,
    }));
  activity(data, "Room reset to lobby.");
}
async function remove(
  ctx: MutationCtx,
  data: RoomData,
  room: GenericId<"rooms">,
  target: string,
) {
  if (data.game) {
    data.game = apply(data.game, null, { type: "forfeit", target }, inputs());
    data.seats = data.game.seats;
  } else data.seats = data.seats.filter((s) => s.id !== target);
  const all = await ctx.db
    .query("sessions")
    .withIndex("room", (q) => q.eq("room", room))
    .collect();
  for (const s of all.filter((s) => s.seat === target))
    await ctx.db.patch(s._id, { revoked: true });
  delete data.lastSeen[target];
  delete data.disconnected[target];
  activity(data, `${target} removed from room.`);
}
function eligible(data: RoomData, target: string) {
  return data.seats
    .filter((s) => s.connected && s.active && !s.bot && s.id !== target)
    .map((s) => s.id);
}
function migration(data: RoomData, now: number) {
  const host = data.seats.find((s) => s.id === data.host);
  if (
    !host ||
    (!host.connected && now - (data.disconnected[host.id] ?? now) >= 30000)
  ) {
    const next = data.seats
      .filter((s) => s.connected && !s.bot && (!data.game || s.active))
      .sort((a, b) => a.joined - b.joined)[0];
    if (next && next.id !== data.host) {
      data.host = next.id;
      activity(data, `${next.name} is now host.`);
    }
  }
}
export const enter = mutation({
  args: {
    gateway: v.string(),
    ip: v.string(),
    code: v.string(),
    create: v.boolean(),
    secret: v.string(),
    read: v.string(),
    seat: v.string(),
    identity: v.any(),
    spectator: v.boolean(),
  },
  handler: async (ctx, args) => {
    gateway(args.gateway);
    await limit(ctx, "enter:" + args.ip, args.create ? 5 : 15, 60);
    const identity = identitySchema.parse(args.identity);
    let room = await ctx.db
      .query("rooms")
      .withIndex("code", (q) => q.eq("code", args.code))
      .unique();
    if (args.create) {
      if (room) throw Error("Code collision; retry");
      const data: RoomData = {
        settings: { ...defaults },
        seats: [],
        game: null,
        host: args.seat,
        revision: 0,
        votes: [],
        chat: [],
        lastSeen: {},
        disconnected: {},
        finishedAt: null,
        emptyAt: null,
        activity: ["Private room created."],
      };
      const id = await ctx.db.insert("rooms", {
        code: args.code,
        data,
        expires: Date.now() + 86400000,
      });
      room = await ctx.db.get(id);
    }
    if (!room || room.expires < Date.now())
      throw Error("Room expired or unavailable");
    const data = room.data as RoomData;
    const spectator = args.spectator || !!data.game;
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("room", (q) => q.eq("room", room!._id))
      .collect();
    if (spectator) {
      if (sessions.filter((s) => s.spectator && !s.revoked).length >= 8)
        throw Error("Spectator seats are full");
    } else {
      if (data.seats.length >= data.settings.capacity)
        throw Error("Player seats are full");
      if (data.seats.some((s) => s.token === identity.token))
        throw Error("Token is taken; choose another");
      data.seats.push({
        ...identity,
        id: args.seat,
        joined: Date.now(),
        connected: true,
        ready: false,
        active: true,
        position: 0,
        jail: -1,
      });
    }
    data.lastSeen[args.seat] = Date.now();
    data.emptyAt = null;
    data.revision++;
    await ctx.db.insert("sessions", {
      room: room._id,
      seat: args.seat,
      secret: args.secret,
      read: args.read,
      readExpiry: Date.now() + 300000,
      expires: room.expires,
      revoked: false,
      spectator,
      name: identity.name,
    });
    activity(
      data,
      `${identity.name} joined as ${spectator ? "spectator" : "player"}.`,
    );
    await schedule(ctx, room._id, data, room.expires, room.timer);
    return {
      code: room.code,
      seat: args.seat,
      spectator,
      revision: data.revision,
      expiry: room.expires,
    };
  },
});
export const renew = mutation({
  args: { gateway: v.string(), secret: v.string(), read: v.string() },
  handler: async (ctx, args) => {
    gateway(args.gateway);
    const { s, room, data } = await session(ctx, args.secret);
    await limit(ctx, "renew:" + s.seat, 20, 60);
    await ctx.db.patch(s._id, {
      read: args.read,
      readExpiry: Date.now() + 300000,
    });
    data.lastSeen[s.seat] = Date.now();
    const seat = data.seats.find((p) => p.id === s.seat);
    if (seat) {
      seat.connected = true;
      if (data.game) {
        const p = data.game.seats.find((p) => p.id === s.seat);
        if (p) p.connected = true;
      }
    }
    delete data.disconnected[s.seat];
    await ctx.db.patch(room._id, { data });
    return {
      code: room.code,
      seat: s.seat,
      spectator: s.spectator,
      read: args.read,
      expiry: s.expires,
    };
  },
});
export const heartbeat = mutation({
  args: { gateway: v.string(), secret: v.string() },
  handler: async (ctx, args) => {
    gateway(args.gateway);
    const { s, room, data } = await session(ctx, args.secret);
    await limit(ctx, "pulse:" + s.seat, 6, 30);
    data.lastSeen[s.seat] = Date.now();
    const seat = data.seats.find((p) => p.id === s.seat);
    if (seat) seat.connected = true;
    if (data.game) {
      const p = data.game.seats.find((p) => p.id === s.seat);
      if (p) p.connected = true;
    }
    if (data.disconnected[s.seat]) {
      delete data.disconnected[s.seat];
      activity(data, `${s.name} reconnected.`);
    }
    await ctx.db.patch(room._id, { data });
  },
});
export const snapshot = query({
  args: { read: v.string() },
  handler: async (ctx, args): Promise<Snapshot | null> => {
    const s = await ctx.db
      .query("sessions")
      .withIndex("read", (q) => q.eq("read", args.read))
      .unique();
    if (!s || s.revoked || s.readExpiry < Date.now()) return null;
    const room = await ctx.db.get(s.room);
    if (!room || room.expires < Date.now()) return null;
    const d = room.data as RoomData;
    const { game, lastSeen: _lastSeen, disconnected, ...rest } = d;
    void _lastSeen;
    return {
      ...rest,
      game: game ? publicGame(game) : null,
      code: room.code,
      me: s.seat,
      spectator: s.spectator,
      expiry: room.expires,
      disconnects: disconnected,
    };
  },
});
export const act = mutation({
  args: {
    gateway: v.string(),
    secret: v.string(),
    key: v.string(),
    revision: v.number(),
    command: v.any(),
    lobby: v.boolean(),
  },
  handler: async (ctx, args) => {
    gateway(args.gateway);
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(args.key))
      throw Error("Invalid command ID");
    const { s, room, data } = await session(ctx, args.secret);
    const duplicate = await ctx.db
      .query("commands")
      .withIndex("command", (q) =>
        q.eq("room", room._id).eq("seat", s.seat).eq("key", args.key),
      )
      .unique();
    if (duplicate) return { revision: duplicate.revision, duplicate: true };
    await limit(ctx, "act:" + s.seat, 12);
    if (args.revision !== data.revision)
      throw Error("State changed; retry from current room");
    const seat = data.seats.find((p) => p.id === s.seat),
      host = data.host === s.seat;
    if (!args.lobby) {
      if (s.spectator || !data.game)
        throw Error("Players only in an active match");
      const command = commandSchema.parse(args.command);
      data.game = apply(data.game, s.seat, command, inputs());
      data.seats = data.game.seats;
    } else {
      const c = lobbySchema.parse(args.command);
      if (s.spectator && !["chat", "leave"].includes(c.type))
        throw Error("Spectators cannot act or vote");
      if (c.type === "chat") {
        await limit(ctx, "chat:" + s.seat, 5);
        data.chat.push({
          id: data.revision + 1,
          at: Date.now(),
          name: s.name,
          seat: s.seat,
          spectator: s.spectator,
          text: c.text,
        });
        data.chat = data.chat.slice(-80);
      } else if (c.type === "leave") {
        if (s.spectator) {
          await ctx.db.patch(s._id, { revoked: true });
          delete data.lastSeen[s.seat];
        } else {
          data.lastSeen[s.seat] = 0;
          data.disconnected[s.seat] = Date.now();
          if (seat) seat.connected = false;
          if (data.game) {
            const p = data.game.seats.find((p) => p.id === s.seat);
            if (p) p.connected = false;
          } else await remove(ctx, data, room._id, s.seat);
        }
        migration(data, Date.now() + 30000);
      } else if (c.type === "reset") {
        if (!host) throw Error("Host only");
        if (!data.game || data.game.phase === "over") reset(data);
        else {
          if (data.votes.some((v) => v.target === "reset"))
            throw Error("Reset vote already open");
          const voters = eligible(data, "");
          const vote: Vote = {
            id: args.key,
            target: "reset",
            initiator: s.seat,
            reason: "Reset the live match",
            eligible: voters,
            yes: [s.seat],
            due: Date.now() + 30000,
          };
          data.votes.push(vote);
          activity(data, `${s.name} requests a match reset.`);
          if (vote.yes.length > vote.eligible.length / 2) reset(data);
        }
      } else if (c.type === "vote") {
        if (!seat?.active || !seat.connected)
          throw Error("Active connected players only");
        if (
          c.target === s.seat ||
          !data.seats.some((p) => p.id === c.target && !p.bot)
        )
          throw Error("Invalid kick target");
        if (data.votes.some((v) => v.target === c.target))
          throw Error("Vote already open");
        await limit(ctx, "vote:" + s.seat, 1, 60);
        const voters = eligible(data, c.target);
        data.votes.push({
          id: args.key,
          target: c.target,
          initiator: s.seat,
          reason: c.reason,
          eligible: voters,
          yes: [s.seat],
          due: Date.now() + 30000,
        });
        activity(data, `${s.name} starts a kick vote: ${c.reason}`);
      } else if (c.type === "voteYes") {
        const vote = data.votes.find((v) => v.id === c.id);
        if (!vote || vote.due < Date.now() || !vote.eligible.includes(s.seat))
          throw Error("Vote unavailable");
        if (!vote.yes.includes(s.seat)) vote.yes.push(s.seat);
      } else {
        if (data.game) throw Error("Lobby settings are locked during a match");
        if (!seat) throw Error("Seat unavailable");
        if (c.type === "identity") {
          if (
            data.seats.some(
              (p) => p.id !== seat.id && p.token === c.identity.token,
            )
          )
            throw Error("Token taken");
          if (
            data.settings.teams &&
            data.seats.filter(
              (p) => p.id !== seat.id && p.team === c.identity.team,
            ).length >= 2
          )
            throw Error("Team is full");
          Object.assign(seat, c.identity, { ready: false });
          await ctx.db.patch(s._id, { name: seat.name });
        }
        if (c.type === "ready") seat.ready = c.ready;
        if (c.type === "settings") {
          if (!host) throw Error("Host only");
          validateSettings(c.settings);
          if (c.settings.capacity < data.seats.length)
            throw Error("Capacity below occupied seats");
          data.settings = c.settings;
          for (const p of data.seats) if (!p.bot) p.ready = false;
        }
        if (c.type === "addBot") {
          if (!host || data.seats.length >= data.settings.capacity)
            throw Error("Host only; room needs capacity");
          const token = Array.from({ length: 20 }, (_, n) => n).find(
            (n) => !data.seats.some((p) => p.token === n),
          )!;
          const team =
            Array.from({ length: 4 }, (_, n) => n).find(
              (n) => data.seats.filter((s) => s.team === n).length < 2,
            ) ?? 0;
          data.seats.push({
            id: `bot-${args.key}`,
            name: `Deccan Bot ${token + 1}`,
            token,
            avatar: token % 8,
            variant: "shaded",
            team,
            bot: c.difficulty,
            ready: true,
            active: true,
            position: 0,
            jail: -1,
            joined: Date.now(),
            connected: true,
          });
        }
        if (c.type === "botConfig") {
          const bot = data.seats.find((p) => p.id === c.target && p.bot);
          if (!host || !bot) throw Error("Host configures bots only");
          if (
            data.settings.teams &&
            data.seats.filter((p) => p.id !== bot.id && p.team === c.team)
              .length >= 2
          )
            throw Error("Team is full");
          bot.bot = c.difficulty;
          bot.team = c.team;
          data.seats.forEach((p) => {
            if (!p.bot) p.ready = false;
          });
        }
        if (c.type === "removeBot") {
          if (!host || !data.seats.some((p) => p.id === c.target && p.bot))
            throw Error("Host can remove bots only");
          data.seats = data.seats.filter((p) => p.id !== c.target);
        }
        if (c.type === "start") {
          if (
            !host ||
            !data.seats.some((p) => !p.bot) ||
            data.seats.some((p) => !p.bot && (!p.ready || !p.connected))
          )
            throw Error("Host starts when all humans are connected and ready");
          data.game = newGame(data.seats, data.settings, inputs());
          data.seats = data.game.seats;
        }
      }
    }
    for (const vote of [...data.votes])
      if (vote.eligible.length && vote.yes.length > vote.eligible.length / 2) {
        if (vote.target === "reset") reset(data);
        else {
          await remove(ctx, data, room._id, vote.target);
          activity(data, "Kick vote passed.");
          data.votes = data.votes.filter((v) => v.id !== vote.id);
        }
      }
    migration(data, Date.now());
    data.revision++;
    if (data.game?.phase === "over" && !data.finishedAt)
      data.finishedAt = Date.now();
    await ctx.db.insert("commands", {
      room: room._id,
      seat: s.seat,
      key: args.key,
      revision: data.revision,
    });
    await schedule(ctx, room._id, data, room.expires, room.timer);
    return { revision: data.revision, duplicate: false };
  },
});
export const tick = internalMutation({
  args: { room: v.id("rooms") },
  handler: async (ctx, args) => {
    const room = await ctx.db.get(args.room);
    if (!room) return;
    const data = room.data as RoomData,
      now = Date.now();
    for (const p of data.seats.filter((s) => !s.bot)) {
      if (p.connected && now - (data.lastSeen[p.id] ?? 0) > 45000) {
        p.connected = false;
        data.disconnected[p.id] = now;
        activity(data, `${p.name} disconnected; 120-second grace begins.`);
        if (data.game) {
          const s = data.game.seats.find((s) => s.id === p.id);
          if (s) s.connected = false;
          log(data.game, inputs(), `${p.name} disconnected.`, "disconnect");
        }
      }
      if (
        !p.connected &&
        now - (data.disconnected[p.id] ?? now) >= 180000 &&
        (!data.game || p.active)
      )
        await remove(ctx, data, room._id, p.id);
    }
    migration(data, now);
    data.votes = data.votes.filter((v) => {
      if (v.due <= now) {
        activity(data, "Vote expired without a majority.");
        return false;
      }
      return true;
    });
    const humans = data.seats.filter((s) => !s.bot && s.connected);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("room", (q) => q.eq("room", room._id))
      .collect();
    const watchers = sessions.some(
      (s) =>
        s.spectator && !s.revoked && now - (data.lastSeen[s.seat] ?? 0) < 45000,
    );
    if (!humans.length && !watchers) {
      data.emptyAt ??= now;
    } else data.emptyAt = null;
    if (
      room.expires <= now ||
      (data.finishedAt && now - data.finishedAt >= 1800000) ||
      (data.emptyAt && now - data.emptyAt >= 600000)
    ) {
      for (const s of sessions) await ctx.db.delete(s._id);
      const commands = await ctx.db
        .query("commands")
        .withIndex("room", (q) => q.eq("room", room._id))
        .collect();
      for (const c of commands) await ctx.db.delete(c._id);
      await ctx.db.delete(room._id);
      return;
    }
    if (data.game && data.game.phase !== "over") {
      let g = data.game;
      if (now >= g.due || (g.trade && now >= g.trade.due))
        g = apply(g, null, { type: "timeout" }, inputs());
      const s = botSeat(g);
      if (
        s &&
        g.phase !== "over" &&
        (!g.trade ||
          !g.trade.confirmations.includes(
            g.settings.teams ? `team-${s.team}` : s.id,
          ))
      ) {
        try {
          g = apply(g, s.id, botCommand(g, s), inputs());
        } catch {
          try {
            g = apply(g, s.id, botFallback(g, s), inputs());
          } catch {
            g = apply(
              g,
              null,
              { type: "timeout" },
              { ...inputs(), now: g.due },
            );
          }
        }
      }
      data.game = g;
      data.seats = g.seats;
      if (g.phase === "over") data.finishedAt = now;
    }
    data.revision++;
    await schedule(ctx, room._id, data, room.expires);
  },
});
export const cleanupLimits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db.query("limits").take(1000);
    for (const x of old)
      if (Date.now() - x.window > 86400000) await ctx.db.delete(x._id);
  },
});
