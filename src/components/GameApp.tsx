"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ConvexProvider,
  ConvexReactClient,
  useConvex,
  useQuery,
} from "convex/react";
import { anyApi } from "convex/server";
import { defaults, Game, Inputs, Seat } from "../engine/types";
import {
  representative,
  apply,
  current,
  newGame,
  publicGame,
} from "../engine/game";
import { TooltipPreference } from "./Preferences";
import { botCommand, botSeat } from "../engine/bot";
import { request } from "../lib/client";
import { Snapshot } from "../lib/room-types";
import { lobbySchema } from "../lib/validation";
import Board from "./Board";
import Lobby, { Identity, Send } from "./Lobby";
import Match from "./Match";
import Rules from "./Rules";
import RoomControls from "./RoomControls";
const localInputs = (): Inputs => ({
  now: Date.now(),
  dice: () => [
    1 + Math.floor(Math.random() * 6),
    1 + Math.floor(Math.random() * 6),
  ],
  shuffle: <T,>(a: T[]) => {
    const copy = [...a];
    for (let n = copy.length - 1; n > 0; n--) {
      const j = Math.floor(Math.random() * (n + 1));
      [copy[j], copy[n]] = [copy[n], copy[j]];
    }
    return copy;
  },
});
const human = (n: number): Seat => ({
  id: `local-${n}`,
  name: `Player ${n + 1}`,
  token: n,
  avatar: n % 8,
  team: n % 2,
  variant: "shaded",
  ready: true,
  active: true,
  position: 0,
  jail: -1,
  connected: true,
  joined: n,
});
function initialLocal(): Snapshot {
  return {
    code: "LOCAL",
    me: "local-0",
    spectator: false,
    expiry: Date.now() + 86400000,
    settings: { ...defaults },
    seats: [human(0), human(1)],
    game: null,
    host: "local-0",
    revision: 0,
    votes: [],
    chat: [],
    finishedAt: null,
    emptyAt: null,
    activity: [
      "Local pass-and-play. No saves; closing the tab ends this match.",
    ],
    disconnects: {},
  };
}
function OnlineRoom({
  read,
  send,
  muted,
  busy,
  setError,
}: {
  read: string;
  send: Send;
  muted: boolean;
  busy: boolean;
  setError: (s: string) => void;
}) {
  const room = useQuery(anyApi.rooms.snapshot, { read }) as
    Snapshot | null | undefined;
  const convex = useConvex();
  const [connected, setConnected] = useState(true);
  useEffect(() => {
    const timer = setInterval(
      () => setConnected(convex.connectionState().isWebSocketConnected),
      1000,
    );
    return () => clearInterval(timer);
  }, [convex]);
  useEffect(() => {
    const timer = setInterval(() => {
      void request({ op: "heartbeat" }).catch((e) => setError(e.message));
    }, 15000);
    return () => clearInterval(timer);
  }, [setError]);
  if (room === undefined)
    return <section className="panel">Synchronising your room…</section>;
  if (!room)
    return (
      <section className="panel">
        <h2>Room expired or seat unavailable</h2>
        <p>
          The read credential may have expired. Refresh to renew your current
          guest session.
        </p>
      </section>
    );
  return (
    <>
      <div className="connection">
        <span className={connected ? "status online" : "status"}>
          {connected
            ? "Connected · authoritative server"
            : "Reconnecting · decisions continue on the server"}
        </span>
        <span>
          Room {room.code} · revision {room.revision}{" "}
          {room.spectator ? "· SPECTATOR" : ""}
        </span>
      </div>
      <RoomView room={room} send={send} muted={muted} busy={busy} />
    </>
  );
}
function RoomView({
  room,
  send,
  muted,
  busy,
  local = false,
}: {
  room: Snapshot;
  send: Send;
  muted: boolean;
  busy: boolean;
  local?: boolean;
}) {
  return (
    <>
      {room.votes.map((v) => (
        <div className="vote-banner" key={v.id}>
          <strong>
            {v.target === "reset" ? "Reset match vote" : "Kick vote"}:
          </strong>{" "}
          {v.reason} · {v.yes.length}/{v.eligible.length} Yes{" "}
          {v.eligible.includes(room.me) && (
            <button onClick={() => send({ type: "voteYes", id: v.id }, true)}>
              Vote Yes
            </button>
          )}
        </div>
      ))}
      {room.game ? (
        <Match
          room={room}
          send={send}
          muted={muted}
          busy={busy}
          local={local}
        />
      ) : (
        <Lobby room={room} send={send} busy={busy} />
      )}
      {room.game && !local && <RoomControls room={room} send={send} />}
    </>
  );
}
export default function GameApp() {
  const [screen, setScreen] = useState<
      "menu" | "play" | "rules" | "settings" | "room" | "local"
    >("menu"),
    [identity, setIdentity] = useState({
      name: "",
      token: 0,
      avatar: 0,
      variant: "shaded" as Seat["variant"],
      team: 0,
    }),
    [code, setCode] = useState(""),
    [spectator, setSpectator] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [read, setRead] = useState(""),
    [revision, setRevision] = useState(0),
    [muted, setMuted] = useState(false),
    [tooltips, setTooltips] = useState(true),
    [localRoom, setLocalRoom] = useState<Snapshot | null>(null),
    [localGame, setLocalGame] = useState<Game | null>(null);
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  const client = useMemo(
    () => (url ? new ConvexReactClient(url) : null),
    [url],
  );
  useEffect(() => {
    const invite = new URLSearchParams(location.search).get("room");
    if (invite) {
      setCode(invite);
      setScreen("play");
    }
    if (url)
      void request({ op: "renew" })
        .then((r) => {
          if (invite && r.code !== invite.toUpperCase()) return;
          setRead(r.read);
          setScreen("room");
        })
        .catch(() => {});
  }, [url]);
  useEffect(() => {
    if (!read) return;
    const timer = setInterval(() => {
      void request({ op: "renew" })
        .then((r) => setRead(r.read))
        .catch((e) => setError(e.message));
    }, 240000);
    return () => clearInterval(timer);
  }, [read]);
  useEffect(() => {
    if (!localGame || localGame.phase === "over") return;
    const bot = botSeat(localGame);
    const ms = bot
      ? 700
      : Math.max(
          100,
          Math.min(localGame.due, localGame.trade?.due ?? Infinity) -
            Date.now(),
        );
    const timer = setTimeout(() => {
      try {
        const result = bot
          ? apply(localGame, bot.id, botCommand(localGame, bot), localInputs())
          : apply(localGame, null, { type: "timeout" }, localInputs());
        setLocalGame(result);
        setLocalRoom((r) =>
          r
            ? {
                ...r,
                game: publicGame(result),
                seats: result.seats,
                revision: r.revision + 1,
              }
            : r,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Local decision failed");
      }
    }, ms);
    return () => clearTimeout(timer);
  }, [localGame]);
  useEffect(() => {
    if (screen !== "local" || !localGame || localGame.phase === "over") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [screen, localGame]);
  const onlineSend = useCallback<Send>(
    async (command, lobby = false) => {
      setBusy(true);
      setError("");
      try {
        const r = await request({
          op: "act",
          key: crypto.randomUUID(),
          revision,
          command,
          lobby,
        });
        setRevision(r.revision);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(false);
      }
    },
    [revision],
  );
  const localSend: Send = (command, lobby = false) => {
    if (!localRoom) return;
    setError("");
    try {
      if (!lobby && localGame) {
        const bot = botSeat(localGame);
        if (bot) throw Error("Bot is thinking");
        let seat = current(localGame);
        if (
          localGame.phase === "supply" ||
          localGame.phase === "auction" ||
          localGame.phase === "debt" ||
          localGame.trade
        ) {
          const id = localGame.trade
            ? localGame.trade.status === "flagged" &&
              localGame.trade.confirmations.includes(localGame.trade.to)
              ? localGame.trade.from
              : localGame.trade.to
            : localGame.phase === "supply"
              ? localGame.supply!.eligible[localGame.supply!.cursor]
              : localGame.phase === "auction"
                ? localGame.auction!.eligible[localGame.auction!.cursor]
                : localGame.debt!.from;
          seat = representative(localGame, id)!;
        }
        const result = apply(
          localGame,
          seat.id,
          command as Parameters<typeof apply>[2],
          localInputs(),
        );
        setLocalGame(result);
        setLocalRoom({
          ...localRoom,
          game: publicGame(result),
          seats: result.seats,
          revision: localRoom.revision + 1,
        });
        return;
      }
      const c = lobbySchema.parse(command),
        r = structuredClone(localRoom);
      if (c.type === "settings") r.settings = c.settings;
      if (c.type === "ready")
        r.seats.find((s) => s.id === r.me)!.ready = c.ready;
      if (c.type === "identity")
        Object.assign(
          r.seats.find((s) => s.id === r.me)!,
          c.identity,
        );
      if (c.type === "addBot") {
        if (r.seats.length >= r.settings.capacity)
          throw Error("Room at capacity");
        const n = Array.from({ length: 20 }, (_, n) => n).find(
          (n) => !r.seats.some((s) => s.token === n),
        )!;
        r.seats.push({
          ...human(n),
          name: `Deccan Bot ${n + 1}`,
          bot: c.difficulty,
          team:
            r.seats.length % Math.max(2, Math.floor(r.settings.capacity / 2)),
        });
      }
      if (c.type === "botConfig") {
        const bot = r.seats.find((s) => s.id === c.target && s.bot);
        if (bot) {
          bot.bot = c.difficulty;
          bot.team = c.team;
        }
      }
      if (c.type === "removeBot")
        r.seats = r.seats.filter((s) => s.id !== c.target);
      if (c.type === "start") {
        const game = newGame(r.seats, r.settings, localInputs());
        setLocalGame(game);
        r.game = publicGame(game);
        r.seats = game.seats;
      }
      if (c.type === "reset") {
        if (
          !r.game ||
          r.game.phase === "over" ||
          confirm("All local players agree to reset this match?")
        ) {
          r.game = null;
          r.chat = [];
          setLocalGame(null);
        }
      }
      if (c.type === "chat")
        r.chat.push({
          id: r.revision + 1,
          name: "Local table",
          seat: r.me,
          at: Date.now(),
          spectator: false,
          text: c.text,
        });
      r.revision++;
      setLocalRoom(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  };
  async function enter(op: "create" | "join") {
    setBusy(true);
    setError("");
    try {
      const r = await request({ op, code, identity, spectator });
      setRead(r.read);
      setRevision(r.revision);
      setScreen("room");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enter");
    } finally {
      setBusy(false);
    }
  }
  return (
    <TooltipPreference value={tooltips}>
      <main className="shell">
        <header className="app-header">
          <button
            className="brand"
            onClick={() => {
              if (
                screen === "local" &&
                localGame?.phase !== "over" &&
                !confirm("Leave the live local match? It will be lost.")
              )
                return;
              setScreen("menu");
            }}
          >
            <span className="brand-icon">↗</span>
            <span>
              Indian Monopoly<small>MULTIPLAYER ONLINE</small>
            </span>
          </button>
          <nav>
            <button onClick={() => setScreen("rules")}>How to Play</button>
            <button
              aria-label={muted ? "Unmute sound" : "Mute sound"}
              onClick={() => setMuted(!muted)}
            >
              {muted ? "Sound off" : "Sound on"}
            </button>
            {screen === "room" && (
              <button
                onClick={() => {
                  if (
                    confirm(
                      "Leave this room? Your seat has 120 seconds grace then 60 seconds final countdown before forfeit.",
                    )
                  ) {
                    onlineSend({ type: "leave" }, true);
                    setScreen("menu");
                    setRead("");
                  }
                }}
              >
                Leave room
              </button>
            )}
          </nav>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {screen === "menu" && (
          <div className="menu-layout">
            <section className="menu-copy">
              <span className="eyebrow">
                A TABLE FOR FRIENDS. A BOARD FOR INDIA.
              </span>
              <h1>
                Your next big
                <br />
                <em>property deal.</em>
              </h1>
              <p>
                From Cherrapunji’s waterfalls to Mumbai’s waterfront. Roll,
                negotiate and build across India — together, wherever you are.
              </p>
              <div className="menu-actions">
                <button className="primary" onClick={() => setScreen("play")}>
                  Play Game <span>↗</span>
                </button>
                <button onClick={() => setScreen("rules")}>How to Play</button>
                <button onClick={() => setScreen("settings")}>Settings</button>
              </div>
              <div className="menu-tags">
                <span>2–8 seats</span>
                <span>Private invitations</span>
                <span>Classic & Fast</span>
              </div>
            </section>
            <div className="menu-board">
              <Board preview view="hybrid" />
            </div>
          </div>
        )}
        {screen === "play" && (
          <section className="panel setup">
            <span className="eyebrow">BRING YOUR TABLE TOGETHER</span>
            <h1>Play Game</h1>
            <Identity value={identity} onChange={setIdentity} />
            <div className="row">
              <button
                className="primary"
                disabled={busy || !identity.name.trim()}
                onClick={() => void enter("create")}
              >
                Create Room
              </button>
            </div>
            <hr />
            <label>
              Invite code
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={10}
                placeholder="10-character code"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={spectator}
                onChange={(e) => setSpectator(e.target.checked)}
              />
              Join as spectator
            </label>
            <button
              disabled={busy || !identity.name.trim() || code.length !== 10}
              onClick={() => void enter("join")}
            >
              Join Room
            </button>
            <hr />
            <button
              onClick={() => {
                setLocalRoom(initialLocal());
                setLocalGame(null);
                setScreen("local");
              }}
            >
              Local Pass-and-Play
            </button>
            <p className="muted">
              For people around one screen. No saves or offline guarantee.
            </p>
          </section>
        )}
        {screen === "settings" && (
          <section className="panel setup">
            <h2>Settings</h2>
            <label className="check">
              <input
                type="checkbox"
                checked={!muted}
                onChange={(e) => setMuted(!e.target.checked)}
              />
              Game sounds (no music)
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={tooltips}
                onChange={(e) => setTooltips(e.target.checked)}
              />
              Tile tooltips
            </label>
            <p>
              Reduced motion follows your device preference. Board view can be
              changed during play.
            </p>
            <button onClick={() => setScreen("menu")}>Back</button>
          </section>
        )}
        {screen === "rules" && (
          <section className="panel">
            <Rules />
            <button
              onClick={() =>
                setScreen(read ? "room" : localRoom ? "local" : "menu")
              }
            >
              Back
            </button>
          </section>
        )}
        {screen === "room" && client && read && (
          <ConvexProvider client={client}>
            <RevisionObserver read={read} onRevision={setRevision} />
            <OnlineRoom
              read={read}
              send={onlineSend}
              muted={muted}
              busy={busy}
              setError={setError}
            />
          </ConvexProvider>
        )}
        {screen === "local" && localRoom && (
          <>
            <div className="connection">
              <span>
                Local pass-and-play · actions belong to the currently deciding
                seat.
              </span>
              {!localRoom.game && (
                <div className="row">
                  <label>
                    Editing local seat
                    <select
                      value={localRoom.me}
                      onChange={(e) =>
                        setLocalRoom({ ...localRoom, me: e.target.value })
                      }
                    >
                      {localRoom.seats
                        .filter((s) => !s.bot)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    disabled={
                      localRoom.seats.length >= localRoom.settings.capacity
                    }
                    onClick={() => {
                      const n = Array.from({ length: 20 }, (_, n) => n).find(
                        (n) => !localRoom.seats.some((s) => s.token === n),
                      )!;
                      setLocalRoom({
                        ...localRoom,
                        seats: [...localRoom.seats, human(n)],
                      });
                    }}
                  >
                    Add human
                  </button>
                </div>
              )}
            </div>
            <RoomView
              room={localRoom}
              send={localSend}
              muted={muted}
              busy={false}
              local
            />
          </>
        )}
        <footer>
          Unofficial personal property-trading game. Not affiliated with or
          endorsed by Hasbro or Monopoly.
          <span>Original Indian artwork · Game values in ₹</span>
        </footer>
      </main>
    </TooltipPreference>
  );
}
function RevisionObserver({
  read,
  onRevision,
}: {
  read: string;
  onRevision: (n: number) => void;
}) {
  const room = useQuery(anyApi.rooms.snapshot, { read }) as
    Snapshot | undefined | null;
  useEffect(() => {
    if (room) onRevision(room.revision);
  }, [room, onRevision]);
  return null;
}
