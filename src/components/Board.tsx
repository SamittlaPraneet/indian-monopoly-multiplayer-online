"use client";
import { useContext, useEffect, useRef, useState } from "react";
import { board, money, seatColours } from "../content/board";
import { Event } from "../engine/types";
import { PublicGame } from "../engine/game";
import Token from "./Token";
import { TooltipPreference } from "./Preferences";
export function grid(id: number): [number, number] {
  return id <= 10
    ? [10 - id, 10]
    : id <= 20
      ? [0, 20 - id]
      : id <= 30
        ? [id - 20, 0]
        : [10, id - 30];
}
export default function Board({
  game,
  onInspect,
  view = "flat",
  preview = false,
}: {
  game?: PublicGame | null;
  onInspect?: (id: number) => void;
  view?: string;
  preview?: boolean;
}) {
  const tooltips = useContext(TooltipPreference);
  const positions = useRef<Record<string, HTMLDivElement | null>>({});
  const last = useRef(game?.eventSeq || 0);
  const queue = useRef<Event[]>([]);
  const draining = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      queue.current = [];
    };
  }, []);
  const [zoom, setZoom] = useState(1);
  const pinch = useRef<number | null>(null);
  useEffect(() => {
    if (!game) return;
    const events = game.events.filter(
      (e) => e.id > last.current && e.type === "move",
    );
    last.current = game.eventSeq;
    queue.current.push(...events);
    if (draining.current) return;
    draining.current = true;
    void (async () => {
      while (alive.current && queue.current.length) {
        const event = queue.current.shift()!;
        const node = positions.current[event.seat || ""];
        if (!node || event.from === undefined || event.steps === undefined)
          continue;
        const steps = Math.abs(event.steps);
        const points = Array.from({ length: steps + 1 }, (_, n) => {
          const [x, y] = grid(
            (((event.from! + n * Math.sign(event.steps!)) % 40) + 40) % 40,
          );
          return {
            left: `${((x + 0.5) * 100) / 11}%`,
            top: `${((y + 0.5) * 100) / 11}%`,
          };
        });
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          node.dataset.trail = String(
            (game.seats.find((s) => s.id === event.seat)?.token ?? 0) % 4,
          );
          await node
            .animate(points, {
              duration: Math.min(1400, steps * 85),
              easing: "linear",
            })
            .finished.catch(() => {});
          delete node.dataset.trail;
        }
      }
      draining.current = false;
    })();
  }, [game]);
  return (
    <div
      className={`board-viewport ${preview ? "preview" : ""}`}
      onTouchMove={(e) => {
        if (e.touches.length === 2) {
          const d = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          );
          if (pinch.current)
            setZoom((z) =>
              Math.min(1.8, Math.max(0.65, (z * d) / pinch.current!)),
            );
          pinch.current = d;
        }
      }}
      onTouchEnd={() => (pinch.current = null)}
    >
      {!preview && (
        <div className="zoom">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom(Math.max(0.65, zoom - 0.1))}
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom(Math.min(1.8, zoom + 0.1))}
          >
            +
          </button>
        </div>
      )}
      <div
        className={`board ${view === "hybrid" ? "hybrid" : ""}`}
        style={{ transform: `scale(${zoom})` }}
      >
        <div className="board-centre">
          <span className="eyebrow">PRIVATE ROOMS · BIG PLANS</span>
          <div className="board-mark">
            INDIA<span>Across India</span>
          </div>
          <p>
            Build a little empire.
            <br />
            Keep your friends close.
          </p>
          <div className="card-piles">
            <div>
              ✦<span>CHANCE</span>
            </div>
            <div>
              ❋<span>COMMUNITY CHEST</span>
            </div>
          </div>
          {game && (
            <p className="round">
              ROUND {game.round}{" "}
              {game.settings.preset === "Fast"
                ? `/ ${game.settings.rounds}`
                : ""}
            </p>
          )}
        </div>
        {board.map((t) => {
          const [x, y] = grid(t.id),
            d = game?.deeds[t.id],
            owner = d?.owner
              ? game?.accounts.find((a) => a.id === d.owner)
              : null;
          return (
            <button
              key={t.id}
              className={`tile ${t.kind} ${x === 0 || x === 10 ? "side" : ""} ${game?.events.some((e) => e.type === "set" && e.group === t.group && Date.now() - e.at < 2500) ? "set-glow" : ""}`}
              style={
                {
                  gridColumn: x + 1,
                  gridRow: y + 1,
                  "--tile-colour": t.colour || "#d4b977",
                } as React.CSSProperties
              }
              onClick={() => onInspect?.(t.id)}
              title={tooltips ? t.fullName : undefined}
              aria-label={`${t.fullName}${d?.owner ? ", owned by " + owner?.name : ""}`}
            >
              <i />
              <span className="tile-symbol">
                {t.kind === "chance"
                  ? "✦"
                  : t.kind === "chest"
                    ? "❋"
                    : t.kind === "go"
                      ? "↗"
                      : t.kind === "jail"
                        ? "▥"
                        : t.kind === "parking"
                          ? "P"
                          : t.kind === "goJail"
                            ? "↪"
                            : t.kind === "transport"
                              ? "⇄"
                              : t.kind === "utility"
                                ? "⚙"
                                : t.kind === "tax"
                                  ? "₹"
                                  : ""}
              </span>
              <b>{t.id === 16 ? "Vizag" : t.name}</b>
              {t.price > 0 && <small>{money(t.price)}</small>}
              {d && d.level > 0 && (
                <span key={d.level} className="buildings">
                  {d.level === 5 ? "▰" : Array(d.level).fill("⌂").join("")}
                </span>
              )}
              {owner && (
                <span
                  className="owner-dot"
                  style={{
                    background: seatColours[game!.accounts.indexOf(owner) % 8],
                  }}
                />
              )}
              {d?.mortgaged && <span className="mortgage-mark">M</span>}
            </button>
          );
        })}
        {game?.seats
          .filter((s) => s.active)
          .map((s, n) => {
            const [x, y] = grid(s.position);
            return (
              <div
                key={s.id}
                ref={(node) => {
                  positions.current[s.id] = node;
                }}
                className="board-piece"
                style={{
                  left: `${((x + 0.5) * 100) / 11}%`,
                  top: `${((y + 0.5) * 100) / 11}%`,
                  marginLeft: ((n % 3) - 1) * 12,
                  marginTop: Math.floor(n / 3) * 7,
                }}
                title={tooltips ? `${s.name} · Seat ${n + 1}` : undefined}
              >
                <Token
                  family={s.token}
                  colour={seatColours[n]}
                  variant={s.variant}
                  size={28}
                />
                <small>{n + 1}</small>
              </div>
            );
          })}
      </div>
    </div>
  );
}
