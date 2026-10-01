export type Difficulty = "Easy" | "Normal" | "Hard" | "Expert";
export type View = "flat" | "hybrid" | "3d";
export interface Settings {
  preset: "Classic" | "Fast";
  cash: number;
  capacity: number;
  teams: boolean;
  auctions: boolean;
  mortgages: boolean;
  even: boolean;
  fasterBuilding: boolean;
  rollSeconds: 20 | 30 | 60;
  view: View;
  rounds: number;
}
export const defaults: Settings = {
  preset: "Classic",
  cash: 1500,
  capacity: 4,
  teams: false,
  auctions: true,
  mortgages: true,
  even: true,
  fasterBuilding: true,
  rollSeconds: 20,
  view: "hybrid",
  rounds: 8,
};
export const roundDefault = (n: number) =>
  n <= 2 ? 12 : n <= 4 ? 8 : n <= 6 ? 6 : 5;
export interface Seat {
  id: string;
  name: string;
  token: number;
  avatar: number;
  variant: "icon" | "shaded" | "model";
  bot?: Difficulty;
  team: number;
  ready: boolean;
  active: boolean;
  position: number;
  jail: number;
  joined: number;
  connected: boolean;
}
export interface Account {
  id: string;
  name: string;
  cash: number;
  release: string[];
  active: boolean;
}
export interface Deed {
  owner: string | null;
  level: number;
  mortgaged: boolean;
}
export type Phase =
  | "roll"
  | "jail"
  | "buy"
  | "auction"
  | "supply"
  | "tax"
  | "debt"
  | "manage"
  | "over";
export interface Event {
  id: number;
  at: number;
  text: string;
  type: string;
  seat?: string;
  from?: number;
  to?: number;
  steps?: number;
  tile?: number;
  group?: number;
}
export interface Payment {
  from: string;
  to: string | null;
  amount: number;
  reason: string;
}
export interface Auction {
  tile: number;
  kind: "property" | "house" | "hotel";
  eligible: string[];
  passed: string[];
  cursor: number;
  bid: number;
  leader: string | null;
  placements: Record<string, number>;
}
export interface TradeSide {
  cash: number;
  properties: number[];
  cards: string[];
  redeem: number[];
}
export interface Trade {
  id: string;
  from: string;
  to: string;
  offer: TradeSide;
  request: TradeSide;
  status: "offered" | "flagged";
  due: number;
  confirmations: string[];
  voters: string[];
  objections: string[];
}
export interface Game {
  schema: 1;
  revision: number;
  settings: Settings;
  seats: Seat[];
  accounts: Account[];
  deeds: Deed[];
  turn: number;
  doubles: number;
  extra: boolean;
  round: number;
  turnsInRound: number;
  phase: Phase;
  due: number;
  dice: [number, number];
  lastCard: string | null;
  payments: Payment[];
  debt: Payment | null;
  afterDebt: "manage" | "roll" | "move";
  pendingMove: number;
  auction: Auction | null;
  auctionQueue: number[];
  supply: {
    kind: "house" | "hotel";
    resume: "roll" | "jail" | "manage";
    eligible: string[];
    cursor: number;
    placements: Record<string, number>;
  } | null;
  trade: Trade | null;
  chance: string[];
  chest: string[];
  events: Event[];
  eventSeq: number;
  winner: string[];
}
export type Command =
  | { type: "roll" }
  | { type: "jailPay" }
  | { type: "jailCard"; card: string }
  | { type: "buy" }
  | { type: "decline" }
  | { type: "tax"; method: "fixed" | "percent" }
  | { type: "bid"; amount: number }
  | { type: "pass" }
  | { type: "build" | "sell" | "mortgage" | "unmortgage"; tile: number }
  | { type: "buildMany"; tiles: number[] }
  | { type: "sellGroup"; group: number }
  | { type: "buildingAuction"; tile: number }
  | { type: "buildingResponse"; tile: number | null }
  | { type: "end" }
  | { type: "settle" }
  | { type: "bankrupt" }
  | {
      type: "trade";
      id: string;
      to: string;
      offer: TradeSide;
      request: TradeSide;
    }
  | {
      type: "accept" | "reject" | "withdraw" | "confirm" | "object";
      id: string;
    }
  | { type: "forfeit"; target: string }
  | { type: "timeout" };
export interface Inputs {
  now: number;
  dice: () => [number, number];
  shuffle: <T>(a: T[]) => T[];
}
