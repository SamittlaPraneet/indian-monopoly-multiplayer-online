"use client";
import { useState } from "react";
import { Snapshot } from "../lib/room-types";
import { Send } from "./Lobby";
export default function RoomControls({
  room,
  send,
}: {
  room: Snapshot;
  send: Send;
}) {
  const [target, setTarget] = useState(
      room.seats.find((s) => s.id !== room.me && !s.bot)?.id || "",
    ),
    [reason, setReason] = useState("Repeated absence");
  if (room.spectator) return null;
  return (
    <details className="panel room-controls">
      <summary>Room controls</summary>
      {room.host === room.me && (
        <button
          onClick={() => {
            if (
              confirm(
                room.game?.phase === "over"
                  ? "Return this room to the lobby?"
                  : "Request a majority vote to reset this live match?",
              )
            )
              send({ type: "reset" }, true);
          }}
        >
          Reset room {room.game?.phase === "over" ? "" : "by vote"}
        </button>
      )}
      <h3>Human vote kick</h3>
      <p>
        Target is excluded; more than half of the other connected active humans
        must vote Yes within 30 seconds.
      </p>
      <label>
        Player
        <select value={target} onChange={(e) => setTarget(e.target.value)}>
          {room.seats
            .filter((s) => s.id !== room.me && !s.bot && s.active)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={100}
        />
      </label>
      <button
        disabled={!target || !reason.trim()}
        onClick={() => send({ type: "vote", target, reason }, true)}
      >
        Start kick vote
      </button>
    </details>
  );
}
