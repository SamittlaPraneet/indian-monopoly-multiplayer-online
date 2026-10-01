import { Game, Seat, Settings } from "../engine/types";
import { PublicGame } from "../engine/game";
export interface Vote {
  id: string;
  target: string;
  initiator: string;
  reason: string;
  eligible: string[];
  yes: string[];
  due: number;
}
export interface Chat {
  id: number;
  at: number;
  name: string;
  seat: string;
  spectator: boolean;
  text: string;
}
export interface RoomData {
  settings: Settings;
  seats: Seat[];
  game: Game | null;
  host: string;
  revision: number;
  votes: Vote[];
  chat: Chat[];
  lastSeen: Record<string, number>;
  disconnected: Record<string, number>;
  finishedAt: number | null;
  emptyAt: number | null;
  activity: string[];
}
export interface Snapshot extends Omit<
  RoomData,
  "game" | "lastSeen" | "disconnected"
> {
  code: string;
  game: PublicGame | null;
  me: string;
  spectator: boolean;
  expiry: number;
  disconnects: Record<string, number>;
}
