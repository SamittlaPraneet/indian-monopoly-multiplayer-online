"use client";
import { useState } from "react";
import { avatars, seatColours, tokens } from "../content/board";
import { defaults, roundDefault, Seat, Settings } from "../engine/types";
import { Snapshot } from "../lib/room-types";
import Token from "./Token";
import Avatar from "./Avatar";
export type Send = (command: object, lobby?: boolean) => void;
export function Identity({
  value,
  onChange,
  taken = [],
}: {
  value: {
    name: string;
    token: number;
    avatar: number;
    variant: Seat["variant"];
    team: number;
  };
  onChange: (value: {
    name: string;
    token: number;
    avatar: number;
    variant: Seat["variant"];
    team: number;
  }) => void;
  taken?: number[];
}) {
  return (
    <div className="identity">
      <label>
        Display name
        <input
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          maxLength={24}
          placeholder="Your name"
          autoComplete="off"
        />
      </label>
      <label>
        Avatar
        <select
          value={value.avatar}
          onChange={(e) => onChange({ ...value, avatar: +e.target.value })}
        >
          {avatars.map((a, n) => (
            <option key={a} value={n}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <label>
        Board piece
        <select
          value={value.token}
          onChange={(e) => onChange({ ...value, token: +e.target.value })}
        >
          {tokens.map((t, n) => (
            <option key={t} value={n} disabled={taken.includes(n)}>
              {t}
              {taken.includes(n) ? " · taken" : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="token-choice">
        <Token family={value.token} size={54} variant={value.variant} />
        <label>
          Piece style
          <select
            value={value.variant}
            onChange={(e) =>
              onChange({ ...value, variant: e.target.value as Seat["variant"] })
            }
          >
            <option value="icon">2D icon</option>
            <option value="shaded">Shaded</option>
            <option value="model">3D model (in 3D board)</option>
          </select>
        </label>
      </div>
    </div>
  );
}
export function SettingsForm({
  settings,
  onChange,
  disabled = false,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });
  const modified =
    settings.cash !== 1500 ||
    !settings.auctions ||
    !settings.mortgages ||
    !settings.even ||
    settings.teams ||
    settings.rollSeconds !== 20 ||
    settings.view !== "hybrid" ||
    !settings.fasterBuilding ||
    (settings.preset === "Fast" &&
      settings.rounds !== roundDefault(settings.capacity));
  return (
    <fieldset className="settings-grid" disabled={disabled}>
      <legend>Match settings {modified && <small>· Modified</small>}</legend>
      <label>
        Preset
        <select
          value={settings.preset}
          onChange={(e) =>
            onChange({
              ...defaults,
              capacity: settings.capacity,
              preset: e.target.value as Settings["preset"],
              rounds: roundDefault(settings.capacity),
            })
          }
        >
          <option>Classic</option>
          <option>Fast</option>
        </select>
      </label>
      <label>
        Capacity
        <select
          value={settings.capacity}
          onChange={(e) =>
            onChange({
              ...settings,
              capacity: +e.target.value,
              rounds: roundDefault(+e.target.value),
            })
          }
        >
          {[2, 3, 4, 5, 6, 7, 8].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <label>
        Starting cash (₹)
        <input
          type="number"
          min={500}
          max={5000}
          step={100}
          value={settings.cash}
          onChange={(e) => set("cash", +e.target.value)}
        />
      </label>
      <label>
        Roll timer
        <select
          value={settings.rollSeconds}
          onChange={(e) => set("rollSeconds", +e.target.value as 20 | 30 | 60)}
        >
          {[20, 30, 60].map((n) => (
            <option value={n} key={n}>
              {n} seconds
            </option>
          ))}
        </select>
      </label>
      <label>
        Default board
        <select
          value={settings.view}
          onChange={(e) => set("view", e.target.value as Settings["view"])}
        >
          <option value="hybrid">2D / isometric hybrid</option>
          <option value="flat">Flat 2D</option>
          <option value="3d">Actual 3D</option>
        </select>
      </label>
      {settings.preset === "Fast" && (
        <label>
          Round limit
          <input
            type="number"
            value={settings.rounds}
            min={5}
            max={20}
            onChange={(e) => set("rounds", +e.target.value)}
          />
        </label>
      )}
      {(
        ["teams", "auctions", "mortgages", "even", "fasterBuilding"] as const
      ).map((k) => (
        <label className="check" key={k}>
          <input
            type="checkbox"
            checked={settings[k]}
            onChange={(e) => set(k, e.target.checked)}
          />
          {
            (
              {
                teams: "Teams · shared portfolio",
                auctions: "Property auctions",
                mortgages: "Mortgages",
                even: "Even building / selling",
                fasterBuilding: "Multi-build controls",
              } as const
            )[k]
          }
        </label>
      ))}
    </fieldset>
  );
}
export default function Lobby({
  room,
  send,
  busy,
}: {
  room: Snapshot;
  send: Send;
  busy: boolean;
}) {
  const me = room.seats.find((s) => s.id === room.me),
    host = room.host === room.me;
  const [identity, setIdentity] = useState(
    me
      ? {
          name: me.name,
          token: me.token,
          avatar: me.avatar,
          variant: me.variant,
          team: me.team,
        }
      : {
          name: "Guest",
          token: 0,
          avatar: 0,
          variant: "icon" as const,
          team: 0,
        },
  );
  const [settings, setSettings] = useState(room.settings);
  const [difficulty, setDifficulty] = useState("Normal");
  return (
    <div className="lobby-grid">
      <section className="panel">
        <div className="section-head">
          <h2>Your private room</h2>
          <span className="pill">{room.spectator ? "SPECTATOR" : "LOBBY"}</span>
        </div>
        <p>
          Send the invitation to your friends. Anyone with it can request entry.
        </p>
        <div className="invite">
          <code>{room.code}</code>
          <button onClick={() => void navigator.clipboard.writeText(room.code)}>
            Copy code
          </button>
          <button
            onClick={() =>
              void navigator.clipboard.writeText(
                `${location.origin}/?room=${room.code}`,
              )
            }
          >
            Copy invite
          </button>
        </div>
        <div className="seats">
          {room.seats.map((s, n) => (
            <div className="seat" key={s.id}>
              <Token
                family={s.token}
                colour={seatColours[n]}
                variant={s.variant}
              />
              <div>
                <strong>{s.name}</strong>
                <small>
                  <Avatar id={s.avatar} /> {avatars[s.avatar]} · Seat {n + 1}{" "}
                  {s.id === room.host ? "· HOST" : ""}{" "}
                  {s.bot ? `· BOT / ${s.bot}` : ""}{" "}
                  {room.settings.teams ? `· Team ${s.team + 1}` : ""}
                </small>
              </div>
              <span className={s.connected ? "status online" : "status"}>
                {s.ready ? "Ready" : s.connected ? "Here" : "Away"}
              </span>
              {s.bot && host && (
                <div className="bot-controls">
                  <label>
                    Bot difficulty
                    <select
                      value={s.bot}
                      onChange={(e) =>
                        send(
                          {
                            type: "botConfig",
                            target: s.id,
                            difficulty: e.target.value,
                            team: s.team,
                          },
                          true,
                        )
                      }
                    >
                      {["Easy", "Normal", "Hard", "Expert"].map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  {room.settings.teams && (
                    <label>
                      Bot team
                      <select
                        value={s.team}
                        onChange={(e) =>
                          send(
                            {
                              type: "botConfig",
                              target: s.id,
                              difficulty: s.bot,
                              team: +e.target.value,
                            },
                            true,
                          )
                        }
                      >
                        {[0, 1, 2, 3].map((t) => (
                          <option key={t} value={t}>
                            Team {t + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}
              {s.bot && host && (
                <button
                  className="text-button"
                  onClick={() =>
                    send({ type: "removeBot", target: s.id }, true)
                  }
                >
                  Remove
                </button>
              )}
              {!s.bot && s.id !== room.me && !room.spectator && (
                <button
                  className="text-button"
                  onClick={() => {
                    const reason = prompt("Reason for kick vote");
                    if (reason)
                      send({ type: "vote", target: s.id, reason }, true);
                  }}
                >
                  Vote kick
                </button>
              )}
            </div>
          ))}
          {Array.from(
            { length: Math.max(0, room.settings.capacity - room.seats.length) },
            (_, n) => (
              <div className="empty-seat" key={n}>
                Available seat
              </div>
            ),
          )}
        </div>
        {host && (
          <div className="row">
            <select
              aria-label="Bot difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              {["Easy", "Normal", "Hard", "Expert"].map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <button
              disabled={busy || room.seats.length >= room.settings.capacity}
              onClick={() => send({ type: "addBot", difficulty }, true)}
            >
              Add bot
            </button>
          </div>
        )}
        {me && (
          <>
            <h3>Your identity</h3>
            <Identity
              value={identity}
              onChange={setIdentity}
              taken={room.seats
                .filter((s) => s.id !== me.id)
                .map((s) => s.token)}
            />
            {room.settings.teams && (
              <label>
                Team
                <select
                  value={identity.team}
                  onChange={(e) =>
                    setIdentity({ ...identity, team: +e.target.value })
                  }
                >
                  {[0, 1, 2, 3].map((n) => (
                    <option key={n} value={n}>
                      Team {n + 1}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              disabled={busy}
              onClick={() => send({ type: "identity", identity }, true)}
            >
              Apply identity
            </button>
          </>
        )}
      </section>
      <section className="panel">
        <SettingsForm
          settings={host ? settings : room.settings}
          onChange={setSettings}
          disabled={!host}
        />
        {host && (
          <button
            onClick={() => send({ type: "settings", settings }, true)}
            disabled={busy}
          >
            Apply settings
          </button>
        )}
        <div className="rules-note">
          {room.settings.teams ? (
            <p>
              Teams need 2 players each. Cash, deeds and release cards are
              shared; tokens, Jail and turns are individual. Starting team cash
              is twice the configured amount. A teammate can continue alone
              after a forfeit.
            </p>
          ) : (
            <p>
              Each seat has its own cash and deeds. Last solvent player wins
              Classic.
            </p>
          )}
          <p>
            Auctions: 6 seconds per response. Buying: 20 seconds. Trades: 30
            seconds. Debt: 60 seconds. Free Parking has no jackpot.
          </p>
          {room.settings.preset === "Fast" && (
            <p>
              Fast ends after {room.settings.rounds} complete rounds, then
              compares net worth.
            </p>
          )}
          {!room.settings.even && (
            <p>Variant: uneven building and selling permitted.</p>
          )}
          {!room.settings.auctions && (
            <p>Variant: declined deeds stay unowned.</p>
          )}
          {!room.settings.mortgages && (
            <p>Variant: mortgage financing disabled.</p>
          )}
        </div>
        <div className="row">
          {me && (
            <button
              className="primary"
              onClick={() => send({ type: "ready", ready: !me.ready }, true)}
              disabled={busy}
            >
              {me.ready ? "Not ready" : "I’m ready"}
            </button>
          )}
          {host && (
            <button
              className="primary"
              onClick={() => send({ type: "start" }, true)}
              disabled={busy || room.seats.length < 2}
            >
              Start match
            </button>
          )}
        </div>
        <div className="room-activity">
          {room.activity.slice(-5).map((s, n) => (
            <p key={n}>{s}</p>
          ))}
        </div>
      </section>
    </div>
  );
}
