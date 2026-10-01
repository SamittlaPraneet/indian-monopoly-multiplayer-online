"use client";
import { useState } from "react";
import { board, money } from "../content/board";
import { PublicGame } from "../engine/game";
import { TradeSide } from "../engine/types";
import { Send } from "./Lobby";
const empty = (): TradeSide => ({
  cash: 0,
  properties: [],
  cards: [],
  redeem: [],
});
function SideEditor({
  game,
  id,
  value,
  set,
  title,
}: {
  game: PublicGame;
  id: string;
  value: TradeSide;
  set: (v: TradeSide) => void;
  title: string;
}) {
  const a = game.accounts.find((a) => a.id === id);
  const toggle = (key: "properties" | "redeem", tile: number) =>
    set({
      ...value,
      [key]: value[key].includes(tile)
        ? value[key].filter((t) => t !== tile)
        : [...value[key], tile],
    });
  return (
    <fieldset>
      <legend>{title}</legend>
      <label>
        Cash (₹)
        <input
          type="number"
          min={0}
          max={a?.cash}
          value={value.cash}
          onChange={(e) => set({ ...value, cash: +e.target.value })}
        />
      </label>
      {board
        .filter((t) => game.deeds[t.id].owner === id)
        .map((t) => (
          <div key={t.id}>
            <label className="check">
              <input
                type="checkbox"
                checked={value.properties.includes(t.id)}
                onChange={() => toggle("properties", t.id)}
              />
              {t.name}
              {game.deeds[t.id].mortgaged ? " · mortgaged" : ""}
            </label>
            {game.deeds[t.id].mortgaged && value.properties.includes(t.id) && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={value.redeem.includes(t.id)}
                  onChange={() => toggle("redeem", t.id)}
                />
                Recipient redeems immediately (
                {money(Math.ceil((t.mortgage * 110) / 100))})
              </label>
            )}
          </div>
        ))}
      {a?.release.map((c) => (
        <label className="check" key={c}>
          <input
            type="checkbox"
            checked={value.cards.includes(c)}
            onChange={() =>
              set({
                ...value,
                cards: value.cards.includes(c)
                  ? value.cards.filter((x) => x !== c)
                  : [...value.cards, c],
              })
            }
          />
          Jail release card {c}
        </label>
      ))}
    </fieldset>
  );
}
export default function TradePanel({
  game,
  id,
  send,
  canRespond = true,
}: {
  canRespond?: boolean;
  game: PublicGame;
  id: string;
  send: Send;
}) {
  const [to, setTo] = useState(
    game.accounts.find((a) => a.id !== id && a.active)?.id || "",
  );
  const [offer, setOffer] = useState<TradeSide>(empty);
  const [request, setRequest] = useState<TradeSide>(empty);
  const t = game.trade;
  const cost = (s: TradeSide) =>
    s.properties.reduce(
      (n, t) =>
        n +
        (game.deeds[t].mortgaged
          ? Math.ceil(
              (board[t].mortgage * (s.redeem.includes(t) ? 110 : 10)) / 100,
            )
          : 0),
      0,
    );
  if (t)
    return (
      <div className="trade-panel">
        <h3>Pending trade</h3>
        <p>
          {game.accounts.find((a) => a.id === t.from)?.name} →{" "}
          {game.accounts.find((a) => a.id === t.to)?.name}
        </p>
        {[
          [t.offer, t.from],
          [t.request, t.to],
        ].map(([side, owner], n) => {
          const s = side as TradeSide;
          return (
            <p key={n}>
              <strong>
                {game.accounts.find((a) => a.id === owner)?.name} gives:
              </strong>{" "}
              {money(s.cash)};{" "}
              {s.properties.map((t) => board[t].name).join(", ") || "no deeds"};{" "}
              {s.cards.length} release cards.
              <br />
              Recipient pays {money(cost(s))} mortgage obligations.
            </p>
          );
        })}
        {t.status === "flagged" && (
          <p className="rules-note">
            Imbalance exceeds 4:1. Both parties must confirm; eligible humans
            may object during the 10-second window.
          </p>
        )}
        <div className="row">
          {canRespond && id === t.to && t.status === "offered" && (
            <>
              <button onClick={() => send({ type: "accept", id: t.id })}>
                Accept
              </button>
              <button onClick={() => send({ type: "reject", id: t.id })}>
                Reject
              </button>
            </>
          )}
          {canRespond && id === t.from && (
            <button onClick={() => send({ type: "withdraw", id: t.id })}>
              Withdraw
            </button>
          )}
          {canRespond &&
            t.status === "flagged" &&
            [t.from, t.to].includes(id) && (
              <button
                disabled={t.confirmations.includes(id)}
                onClick={() => send({ type: "confirm", id: t.id })}
              >
                Confirm imbalance
              </button>
            )}
          {t.status === "flagged" && (
            <button onClick={() => send({ type: "object", id: t.id })}>
              Object if eligible
            </button>
          )}
        </div>
        {canRespond && id === t.to && t.status === "offered" && (
          <details>
            <summary>Counteroffer</summary>
            <div className="trade-sides">
              <SideEditor
                game={game}
                id={t.to}
                value={offer}
                set={setOffer}
                title="You offer"
              />
              <SideEditor
                game={game}
                id={t.from}
                value={request}
                set={setRequest}
                title="You request"
              />
            </div>
            <button
              onClick={() =>
                send({
                  type: "trade",
                  id: crypto.randomUUID(),
                  to: t.from,
                  offer,
                  request,
                })
              }
            >
              Send edited counteroffer
            </button>
            <p>Mortgage obligations are revalidated before acceptance.</p>
          </details>
        )}
      </div>
    );
  return (
    <div className="trade-panel">
      <h3>Negotiate a trade</h3>
      <label>
        Counterparty
        <select value={to} onChange={(e) => setTo(e.target.value)}>
          {game.accounts
            .filter((a) => a.id !== id && a.active)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
        </select>
      </label>
      <div className="trade-sides">
        <SideEditor
          game={game}
          id={id}
          value={offer}
          set={setOffer}
          title="You offer"
        />
        <SideEditor
          game={game}
          id={to}
          value={request}
          set={setRequest}
          title="You request"
        />
      </div>
      <p>
        Mortgage costs: you pay {money(cost(request))}; recipient pays{" "}
        {money(cost(offer))}.
      </p>
      <button
        onClick={() =>
          send({ type: "trade", id: crypto.randomUUID(), to, offer, request })
        }
      >
        Propose trade
      </button>
    </div>
  );
}
