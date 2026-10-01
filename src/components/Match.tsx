"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { avatars, board, money, seatColours } from "../content/board";
import { cards } from "../content/cards";
import { Snapshot } from "../lib/room-types";
import { representative, buildingChoices, bankStock } from "../engine/game";
import { Event, View } from "../engine/types";
import assets from "../content/assets.json";
import { sound } from "../lib/client";
import Board from "./Board";
import Token from "./Token";
import Avatar from "./Avatar";
import TradePanel from "./TradePanel";
import { Send } from "./Lobby";
const Board3D = dynamic(() => import("./Board3D"), {
  ssr: false,
  loading: () => (
    <div className="webgl-board">Loading lightweight 3D board…</div>
  ),
});
export default function Match({
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
  const g = room.game!;
  const [view, setView] = useState<View>(g.settings.view),
    [tile, setTile] = useState<number | null>(null),
    [bid, setBid] = useState(1),
    [chat, setChat] = useState(""),
    [muteSeats, setMuteSeats] = useState<string[]>([]),
    [now, setNow] = useState(0),
    [trading, setTrading] = useState(false);
  const last = useRef(g.eventSeq);
  const [visualEvents, setVisualEvents] = useState<Event[]>([]);
  const [artError, setArtError] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const events = g.events.filter((e) => e.id > last.current);
    last.current = g.eventSeq;
    if (events.length) {
      const shown = events.filter((e) =>
        ["money", "building", "set", "victory"].includes(e.type),
      );
      if (shown.length) setVisualEvents(shown);
      events.forEach((e, n) => setTimeout(() => sound(e.type, muted), n * 160));
    }
  }, [g.events, g.eventSeq, muted]);
  const inspect = useCallback((id: number) => {
    setTile(id);
    setArtError(false);
  }, []);
  const fallback = useCallback(() => setView("flat"), []);
  const active = g.seats[g.turn],
    me = local
      ? g.seats.find((s) =>
          g.trade
            ? s.id ===
              representative(
                g,
                g.trade.status === "flagged" &&
                  g.trade.confirmations.includes(g.trade.to)
                  ? g.trade.from
                  : g.trade.to,
              )?.id
            : g.phase === "supply"
              ? s.id ===
                representative(g, g.supply!.eligible[g.supply!.cursor])?.id
              : g.phase === "debt"
                ? s.active &&
                  (g.settings.teams ? `team-${s.team}` : s.id) === g.debt?.from
                : g.phase === "auction"
                  ? s.id ===
                    representative(g, g.auction!.eligible[g.auction!.cursor])
                      ?.id
                  : s.id === active.id,
        )
      : g.seats.find((s) => s.id === room.me);
  const myId = me ? (g.settings.teams ? `team-${me.team}` : me.id) : "";
  const mine = active.id === me?.id && !me?.bot && !room.spectator;
  const a = g.accounts.find((a) => a.id === myId);
  const seconds = Math.max(0, Math.ceil((g.due - (now || g.due)) / 1000));
  const auction = g.auction;
  const bidder = auction?.eligible[auction.cursor];
  const card = cards.find((c) => c.id === g.lastCard);
  const portfolioAllowed =
    !room.spectator &&
    !me?.bot &&
    ((mine && ["roll", "jail", "manage"].includes(g.phase)) ||
      (g.phase === "debt" && g.debt?.from === myId));
  const deed = tile === null ? null : board[tile];
  const d = tile === null ? null : g.deeds[tile];
  return (
    <div className="match-layout">
      <section className="board-section">
        <div className="visual-events" aria-live="polite">
          {visualEvents.map((e) => (
            <p key={e.id} className={`visual-event ${e.type}`}>
              {e.text}
            </p>
          ))}
        </div>
        {g.phase === "over" && (
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 24 }, (_, n) => (
              <i
                key={n}
                style={{
                  left: `${(n * 41) % 100}%`,
                  background: seatColours[n % 8],
                  animationDelay: `${n * 0.06}s`,
                  transform: `rotate(${n * 37}deg)`,
                }}
              />
            ))}
          </div>
        )}
        <div className="board-toolbar">
          <div>
            <span className="eyebrow">
              {g.settings.preset.toUpperCase()}{" "}
              {g.settings.teams ? "· TEAMS" : ""}
            </span>
            <h2>
              {g.phase === "over" ? "Match complete" : `${active.name}’s turn`}
            </h2>
          </div>
          <label className="compact">
            Board view
            <select
              value={view}
              onChange={(e) => setView(e.target.value as View)}
            >
              <option value="flat">Flat 2D</option>
              <option value="hybrid">Hybrid</option>
              <option value="3d">Actual 3D</option>
            </select>
          </label>
        </div>
        {view === "3d" ? (
          <Board3D game={g} onInspect={inspect} onFallback={fallback} />
        ) : (
          <Board game={g} onInspect={inspect} view={view} />
        )}
        <p className="board-help">
          Select any tile for its deed. Pinch / use + − to zoom; scroll to pan.{" "}
          <span className="portrait-note">Landscape gives you more room.</span>
        </p>
      </section>
      <aside className="match-sidebar">
        <section className="panel decision">
          <div className="section-head">
            <span className="pill">{g.phase.toUpperCase()}</span>
            <small>
              Bank: {bankStock(g).houses} houses · {bankStock(g).hotels} hotels
            </small>
            {g.phase !== "over" && (
              <span className={seconds <= 6 ? "countdown urgent" : "countdown"}>
                {seconds}s
              </span>
            )}
          </div>
          <div
            key={g.events.filter((e) => e.type === "dice").at(-1)?.id ?? 0}
            className="dice"
            aria-label={`Dice ${g.dice[0]} and ${g.dice[1]}`}
          >
            <span>{["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][g.dice[0]]}</span>
            <span>{["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][g.dice[1]]}</span>
          </div>
          {room.spectator && (
            <p>
              You’re spectating. Chat and inspect deeds while the players
              decide.
            </p>
          )}
          {["roll", "jail"].includes(g.phase) && (
            <>
              <p>
                {g.phase === "jail"
                  ? `Jail attempt ${(active.jail || 0) + 1} of 3.`
                  : "Roll, travel and see what India has in store."}
              </p>
              <button
                className="primary wide"
                disabled={!mine || busy}
                onClick={() => send({ type: "roll" })}
              >
                {mine ? "Roll dice" : `Waiting for ${active.name}`}
              </button>
              {g.phase === "jail" && mine && (
                <div className="row">
                  <button onClick={() => send({ type: "jailPay" })}>
                    Pay ₹50
                  </button>
                  {a?.release.map((c) => (
                    <button
                      key={c}
                      onClick={() => send({ type: "jailCard", card: c })}
                    >
                      Use release card
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {g.phase === "buy" && (
            <>
              <h3>{board[active.position].name}</h3>
              <p>Purchase for {money(board[active.position].price)}?</p>
              <div className="row">
                <button
                  className="primary"
                  disabled={!mine || busy}
                  onClick={() => send({ type: "buy" })}
                >
                  Buy
                </button>
                <button
                  disabled={!mine || busy}
                  onClick={() => send({ type: "decline" })}
                >
                  {g.settings.auctions ? "Auction" : "Decline"}
                </button>
              </div>
            </>
          )}
          {g.phase === "supply" && g.supply && (
            <>
              <h3>Limited {g.supply.kind} supply</h3>
              <p>
                {
                  g.accounts.find(
                    (a) => a.id === g.supply!.eligible[g.supply!.cursor],
                  )?.name
                }{" "}
                chooses a legal placement, or declines. {seconds}s
              </p>
              <div className="stack">
                {buildingChoices(g, myId, g.supply.kind).map((t) => (
                  <button
                    key={t.id}
                    disabled={
                      representative(g, g.supply!.eligible[g.supply!.cursor])
                        ?.id !== me?.id ||
                      !!me?.bot ||
                      busy
                    }
                    onClick={() =>
                      send({ type: "buildingResponse", tile: t.id })
                    }
                  >
                    Request {t.name}
                  </button>
                ))}
                <button
                  disabled={
                    representative(g, g.supply!.eligible[g.supply!.cursor])
                      ?.id !== me?.id ||
                    !!me?.bot ||
                    busy
                  }
                  onClick={() => send({ type: "buildingResponse", tile: null })}
                >
                  Decline building
                </button>
              </div>
            </>
          )}
          {g.phase === "tax" && (
            <>
              <p>Choose before calculating your percentage tax.</p>
              <div className="row">
                <button
                  disabled={!mine || busy}
                  onClick={() => send({ type: "tax", method: "fixed" })}
                >
                  Pay ₹200
                </button>
                <button
                  disabled={!mine || busy}
                  onClick={() => send({ type: "tax", method: "percent" })}
                >
                  Pay 10%
                </button>
              </div>
            </>
          )}
          {auction && (
            <>
              <h3>
                {auction.kind === "property"
                  ? board[auction.tile].name
                  : `${auction.kind} shortage auction`}
              </h3>
              <p>
                Leading bid: <strong>{money(auction.bid)}</strong>
                {auction.leader
                  ? ` · ${g.accounts.find((a) => a.id === auction.leader)?.name}`
                  : ""}
              </p>
              <p>Responding: {g.accounts.find((a) => a.id === bidder)?.name}</p>
              <label>
                Your bid (₹)
                <input
                  type="number"
                  value={Math.max(bid, auction.bid + 1)}
                  min={auction.bid + 1}
                  max={a?.cash}
                  onChange={(e) => setBid(+e.target.value)}
                />
              </label>
              <div className="row">
                {[1, 10, 50].map((n) => (
                  <button
                    key={n}
                    disabled={bidder !== myId || !!me?.bot || room.spectator}
                    onClick={() =>
                      send({ type: "bid", amount: auction.bid + n })
                    }
                  >
                    +₹{n}
                  </button>
                ))}
              </div>
              <div className="row">
                <button
                  className="primary"
                  disabled={
                    bidder !== myId || busy || !!me?.bot || room.spectator
                  }
                  onClick={() =>
                    send({
                      type: "bid",
                      amount: Math.max(bid, auction.bid + 1),
                    })
                  }
                >
                  Raise bid
                </button>
                <button
                  disabled={
                    bidder !== myId || busy || !!me?.bot || room.spectator
                  }
                  onClick={() => send({ type: "pass" })}
                >
                  Pass permanently
                </button>
              </div>
              <small>
                {auction.eligible
                  .map(
                    (id) =>
                      `${g.accounts.find((a) => a.id === id)?.name}${auction.passed.includes(id) ? " (passed)" : ""}`,
                  )
                  .join(" · ")}
              </small>
            </>
          )}
          {g.phase === "debt" && (
            <>
              <h3>
                {g.accounts.find((a) => a.id === g.debt?.from)?.name} owes{" "}
                {money(g.debt!.amount)}
              </h3>
              <p>
                {g.debt?.reason}. Select your deeds to sell buildings or
                mortgage. Timed liquidation follows the same rules.
              </p>
              <button
                className="primary"
                disabled={myId !== g.debt?.from || busy || !!me?.bot}
                onClick={() => send({ type: "settle" })}
              >
                Settle obligation
              </button>
              <button
                disabled={myId !== g.debt?.from || busy || !!me?.bot}
                onClick={() => {
                  if (
                    confirm(
                      "Declare bankruptcy after exhausting legal financing?",
                    )
                  )
                    send({ type: "bankrupt" });
                }}
              >
                Declare bankruptcy
              </button>
            </>
          )}
          {g.phase === "manage" && (
            <>
              <p>
                {g.extra
                  ? "Doubles: another roll follows after management."
                  : "Manage deeds or negotiate, then pass the dice."}
              </p>
              <div className="row">
                <button
                  disabled={!mine || busy || !!g.trade}
                  className="primary"
                  onClick={() => send({ type: "end" })}
                >
                  {g.extra ? "Next roll" : "End turn"}
                </button>
                <button
                  disabled={room.spectator}
                  onClick={() => setTrading(!trading)}
                >
                  Trade
                </button>
              </div>
            </>
          )}
          {g.phase === "over" && (
            <>
              <h2 className="winner">
                ✦{" "}
                {g.winner
                  .map((id) => g.accounts.find((a) => a.id === id)?.name)
                  .join(" & ")}{" "}
                wins
              </h2>
              {g.settings.preset === "Fast" &&
                g.accounts
                  .filter((a) => a.active)
                  .sort((a, b) => worth(b.id) - worth(a.id))
                  .map((a) => (
                    <p key={a.id}>
                      {a.name}: {money(worth(a.id))} · cash {money(a.cash)}
                    </p>
                  ))}
              {room.host === room.me && (
                <button
                  className="primary"
                  onClick={() => send({ type: "reset" }, true)}
                >
                  Back to lobby
                </button>
              )}
            </>
          )}
          {card && (
            <details className="last-card">
              <summary>Last card</summary>
              <p>{card.text}</p>
              <strong>{card.detail}</strong>
            </details>
          )}
        </section>
        <section className="panel players">
          <h3>Players {g.settings.teams ? "& teams" : ""}</h3>
          {g.seats.map((s, n) => {
            const id = g.settings.teams ? `team-${s.team}` : s.id,
              account = g.accounts.find((a) => a.id === id)!;
            return (
              <div
                className={`player ${active.id === s.id ? "active-player" : ""} ${s.active ? "" : "eliminated"}`}
                key={s.id}
              >
                <Token family={s.token} colour={seatColours[n]} size={32} />
                <div>
                  <strong>{s.name}</strong>
                  <small>
                    <Avatar id={s.avatar} /> {avatars[s.avatar]} ·{" "}
                    {s.bot ? `BOT / ${s.bot}` : `Seat ${n + 1}`}
                    {g.settings.teams ? ` · Team ${s.team + 1}` : ""}
                  </small>
                  <span>
                    {money(account.cash)} ·{" "}
                    {g.deeds.filter((d) => d.owner === id).length} deeds{" "}
                    {s.jail >= 0 ? "· IN JAIL" : ""}
                  </span>
                  {room.disconnects[s.id] && (
                    <small>
                      Reconnect:{" "}
                      {Math.max(
                        0,
                        180 -
                          Math.floor(
                            ((now || room.disconnects[s.id]) -
                              room.disconnects[s.id]) /
                              1000,
                          ),
                      )}
                      s
                    </small>
                  )}
                </div>
              </div>
            );
          })}
        </section>
        <section className="panel">
          <details>
            <summary>Activity feed</summary>
            <div className="feed">
              {g.events
                .slice(-60)
                .reverse()
                .map((e) => (
                  <p key={e.id}>
                    <time>
                      {new Date(e.at).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>{" "}
                    {e.text}
                  </p>
                ))}
            </div>
          </details>
        </section>
        <section className="panel chat">
          <h3>Room chat</h3>
          <div className="chat-messages">
            {room.chat
              .filter((c) => !muteSeats.includes(c.seat))
              .slice(-25)
              .map((c) => (
                <p key={c.id}>
                  <button
                    className="text-button"
                    title="Mute this guest locally"
                    onClick={() => setMuteSeats([...muteSeats, c.seat])}
                  >
                    {c.name}
                    {c.spectator ? " [spectator]" : ""}
                  </button>
                  : {c.text}
                </p>
              ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (chat.trim()) {
                send({ type: "chat", text: chat }, true);
                setChat("");
              }
            }}
          >
            <input
              aria-label="Room chat message"
              value={chat}
              maxLength={280}
              onChange={(e) => setChat(e.target.value)}
              placeholder="A friendly deal, perhaps?"
            />
            <button type="submit">Send</button>
          </form>
          <div className="row">
            {["👍", "😂", "🎉", "🤝"].map((emoji) => (
              <button
                key={emoji}
                onClick={() => send({ type: "chat", text: emoji }, true)}
              >
                {emoji}
              </button>
            ))}
            {muteSeats.length > 0 && (
              <button onClick={() => setMuteSeats([])}>Unmute guests</button>
            )}
          </div>
        </section>
      </aside>
      {(trading || g.trade) && g.phase === "manage" && !room.spectator && (
        <div className="modal-backdrop">
          <div className="modal">
            <button
              className="close"
              aria-label="Close trade panel"
              onClick={() => setTrading(false)}
            >
              ×
            </button>
            <TradePanel
              game={g}
              id={myId}
              send={send}
              canRespond={representative(g, myId)?.id === me?.id}
            />
            <button onClick={() => setTrading(false)}>
              Close negotiation view
            </button>
          </div>
        </div>
      )}
      {deed && d && (
        <div className="modal-backdrop" onClick={() => setTile(null)}>
          <section className="modal deed" onClick={(e) => e.stopPropagation()}>
            <button
              className="close"
              aria-label="Close deed"
              onClick={() => setTile(null)}
            >
              ×
            </button>
            <div
              className="deed-banner"
              style={{ background: deed.colour || "#b4a16e" }}
            >
              <span className="eyebrow">
                TITLE DEED · {deed.kind.toUpperCase()}
              </span>
              <h2>{deed.fullName}</h2>
            </div>
            {deed.kind === "city" && (
              <Image
                className="deed-image"
                unoptimized
                src={
                  artError
                    ? `/art/city-${deed.id}.svg`
                    : assets.find((a) => "tile" in a && a.tile === deed.id)
                        ?.file || `/art/city-${deed.id}.svg`
                }
                alt={`${deed.landmark} in ${deed.name}`}
                width={640}
                height={260}
                onError={() => setArtError(true)}
              />
            )}
            {artError && (
              <p className="muted">
                Original project illustration · photograph unavailable
              </p>
            )}
            {!artError &&
              assets
                .filter((a) => "tile" in a && a.tile === deed.id)
                .map((a) => (
                  <p key={a.file} className="muted">
                    Photo: {a.creator} ·{" "}
                    <a
                      href={"licenceUrl" in a ? a.licenceUrl : undefined}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {a.licence}
                    </a>{" "}
                    ·{" "}
                    <a href={a.source} target="_blank" rel="noreferrer">
                      Source
                    </a>
                    . Resized and compressed.
                  </p>
                ))}
            <p>{deed.landmark}</p>
            <p>
              Owner:{" "}
              {d.owner
                ? g.accounts.find((a) => a.id === d.owner)?.name
                : "Bank"}{" "}
              · {d.level === 5 ? "Hotel" : `${d.level} houses`}{" "}
              {d.mortgaged ? "· MORTGAGED" : ""}
            </p>
            {["city", "transport", "utility"].includes(deed.kind) && (
              <>
                <p>
                  Purchase {money(deed.price)} · Mortgage {money(deed.mortgage)}{" "}
                  · Redeem {money(Math.ceil((deed.mortgage * 110) / 100))}
                </p>
                <dl className="rent-schedule">
                  {deed.rents.map((r, n) => (
                    <div key={n}>
                      <dt>
                        {deed.kind === "city"
                          ? [
                              "Base rent",
                              "1 house",
                              "2 houses",
                              "3 houses",
                              "4 houses",
                              "Hotel",
                            ][n]
                          : deed.kind === "transport"
                            ? `${n + 1} transport${n ? "s" : ""}`
                            : `${n + 1} utilit${n ? "ies" : "y"}`}
                      </dt>
                      <dd>
                        {deed.kind === "utility" ? `${r}× dice` : money(r)}
                      </dd>
                    </div>
                  ))}
                </dl>
                {deed.kind === "city" && (
                  <p>
                    Full undeveloped set: double base rent. House / hotel
                    upgrade: {money(deed.build)}.
                  </p>
                )}
                {d.owner === myId && portfolioAllowed && (
                  <div className="deed-actions">
                    {deed.kind === "city" && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => send({ type: "build", tile: deed.id })}
                        >
                          Build
                        </button>
                        {g.settings.fasterBuilding && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              send({
                                type: "buildMany",
                                tiles: board
                                  .filter((t) => t.group === deed.group)
                                  .sort(
                                    (a, b) =>
                                      g.deeds[a.id].level - g.deeds[b.id].level,
                                  )
                                  .map((t) => t.id),
                              })
                            }
                          >
                            Build once across group
                          </button>
                        )}
                        <button
                          disabled={busy}
                          onClick={() => send({ type: "sell", tile: deed.id })}
                        >
                          Sell one building
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            send({ type: "sellGroup", group: deed.group })
                          }
                        >
                          Sell group buildings
                        </button>
                      </>
                    )}
                    {g.settings.mortgages && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          send({
                            type: d.mortgaged ? "unmortgage" : "mortgage",
                            tile: deed.id,
                          })
                        }
                      >
                        {d.mortgaged
                          ? `Redeem ${money(Math.ceil((deed.mortgage * 110) / 100))}`
                          : `Mortgage ${money(deed.mortgage)}`}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
  function worth(id: string) {
    return (
      g.accounts.find((a) => a.id === id)!.cash +
      board
        .filter((t) => g.deeds[t.id].owner === id)
        .reduce(
          (n, t) =>
            n +
            t.price -
            (g.deeds[t.id].mortgaged ? t.mortgage : 0) +
            (g.deeds[t.id].level * t.build) / 2,
          0,
        )
    );
  }
}
