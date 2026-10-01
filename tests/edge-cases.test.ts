import { describe, expect, it } from "vitest";
import {
  apply,
  bankStock,
  invariants,
  newGame,
  transferCost,
} from "../src/engine/game";
import { botSeat } from "../src/engine/bot";
import { board, groupTiles } from "../src/content/board";
import { defaults, Inputs, Seat } from "../src/engine/types";
const i: Inputs = { now: 1000, dice: () => [1, 2], shuffle: (a) => a };
const make = (n = 3, teams = false) =>
  newGame(
    Array.from({ length: n }, (_, n): Seat => ({
      id: "p" + n,
      name: "Player " + n,
      token: n,
      avatar: n,
      variant: "icon",
      team: n % 2,
      ready: true,
      active: true,
      position: 0,
      jail: -1,
      joined: n,
      connected: true,
    })),
    { ...defaults, capacity: 8, teams },
    i,
  );
const empty = { cash: 0, properties: [], cards: [], redeem: [] };
describe("obligations, scarcity and fairness", () => {
  it("utility mortgage redemption remains safe-integer cash", () => {
    let g = make();
    g.deeds[12].owner = "p0";
    g.deeds[12].mortgaged = true;
    g = apply(g, "p0", { type: "unmortgage", tile: 12 }, i);
    expect(g.accounts[0].cash).toBe(1417);
    expect(
      transferCost(
        {
          ...g,
          deeds: g.deeds.map((d, n) =>
            n === 12 ? { ...d, mortgaged: true } : d,
          ),
        },
        { ...empty, properties: [12] },
      ),
    ).toBe(8);
  });
  it("a 30-second trade response is not cut short by management deadline", () => {
    let g = make();
    g.phase = "manage";
    g.deeds[1].owner = "p0";
    g = apply(
      g,
      "p0",
      {
        type: "trade",
        id: "offer",
        to: "p1",
        offer: { ...empty, properties: [1] },
        request: { ...empty, cash: 60 },
      },
      i,
    );
    expect(g.due).toBe(31000);
    g = apply(g, null, { type: "timeout" }, { ...i, now: 21000 });
    expect(g.trade).not.toBeNull();
  });
  it("recipient can counter with edited items", () => {
    let g = make();
    g.phase = "manage";
    g.deeds[1].owner = "p0";
    g = apply(
      g,
      "p0",
      {
        type: "trade",
        id: "offer",
        to: "p1",
        offer: { ...empty, properties: [1] },
        request: { ...empty, cash: 60 },
      },
      i,
    );
    g = apply(
      g,
      "p1",
      {
        type: "trade",
        id: "counter",
        to: "p0",
        offer: { ...empty, cash: 55 },
        request: { ...empty, properties: [1] },
      },
      i,
    );
    expect(g.trade?.id).toBe("counter");
    expect(g.trade?.from).toBe("p1");
  });
  it("strict majority objection cancels flagged gift-like deal", () => {
    let g = make();
    g.phase = "manage";
    g.deeds[39].owner = "p0";
    g = apply(
      g,
      "p0",
      {
        type: "trade",
        id: "offer",
        to: "p1",
        offer: { ...empty, properties: [39] },
        request: { ...empty, cash: 1 },
      },
      i,
    );
    g = apply(g, "p1", { type: "accept", id: "offer" }, i);
    expect(g.trade?.status).toBe("flagged");
    g = apply(g, "p2", { type: "object", id: "offer" }, i);
    expect(g.trade).toBeNull();
    expect(g.deeds[39].owner).toBe("p0");
  });
  it("flagged trade needs both confirmations and resolves after window", () => {
    let g = make(2);
    g.phase = "manage";
    g.deeds[39].owner = "p0";
    g = apply(
      g,
      "p0",
      {
        type: "trade",
        id: "offer",
        to: "p1",
        offer: { ...empty, properties: [39] },
        request: { ...empty, cash: 1 },
      },
      i,
    );
    g = apply(g, "p1", { type: "accept", id: "offer" }, i);
    g = apply(g, "p0", { type: "confirm", id: "offer" }, i);
    g = apply(g, null, { type: "timeout" }, { ...i, now: 11000 });
    expect(g.deeds[39].owner).toBe("p1");
  });
  it("multi-party card collection handles an insolvent payer before subsequent payers", () => {
    let g = make();
    g.seats[0].position = 30;
    g.chest = ["h10", ...g.chest.filter((c) => c !== "h10")];
    g.accounts[1].cash = 0;
    g = apply(g, "p0", { type: "roll" }, i);
    expect(g.phase).toBe("debt");
    expect(g.debt?.from).toBe("p1");
    g = apply(g, "p1", { type: "bankrupt" }, i);
    expect(g.accounts[0].cash).toBe(1510);
    expect(g.accounts[2].cash).toBe(1490);
    expect(g.phase).toBe("manage");
  });
  it("bank bankruptcy auctions returned deeds before declaring completion", () => {
    let g = make();
    g.deeds[1].owner = "p0";
    g.deeds[1].mortgaged = true;
    g.accounts[0].cash = 0;
    g.phase = "debt";
    g.debt = { from: "p0", to: null, amount: 200, reason: "tax" };
    g = apply(g, "p0", { type: "bankrupt" }, i);
    expect(g.phase).toBe("auction");
    expect(g.auction?.eligible).toEqual(["p1", "p2"]);
    g = apply(g, "p1", { type: "pass" }, i);
    g = apply(g, "p2", { type: "pass" }, i);
    expect(g.deeds[1].owner).toBeNull();
  });
  it("team insolvency eliminates both members and transfers team assets", () => {
    let g = make(4, true);
    g.deeds[1].owner = "team-0";
    g.deeds[1].mortgaged = true;
    g.accounts[0].cash = 0;
    g.phase = "debt";
    g.debt = { from: "team-0", to: "team-1", amount: 200, reason: "rent" };
    g = apply(g, "p0", { type: "bankrupt" }, i);
    expect(g.seats.filter((s) => s.team === 0).every((s) => !s.active)).toBe(
      true,
    );
    expect(g.deeds[1].owner).toBe("team-1");
    expect(g.accounts[1].cash).toBe(2997);
    expect(g.phase).toBe("over");
  });
  it("no hotel breakdown when bank has fewer than four houses; whole group liquidation works", () => {
    let g = make();
    for (const t of board.filter((t) => t.kind === "city"))
      g.deeds[t.id].owner = "p0";
    for (const t of groupTiles(0)) g.deeds[t.id].level = 5;
    for (const group of [1, 2, 3])
      for (const t of groupTiles(group)) g.deeds[t.id].level = 3;
    for (const t of groupTiles(4)) g.deeds[t.id].level = 1;
    expect(bankStock(g).houses).toBe(2);
    expect(() => apply(g, "p0", { type: "sell", tile: 1 }, i)).toThrow();
    g = apply(g, "p0", { type: "sellGroup", group: 0 }, i);
    expect(g.deeds[1].level).toBe(0);
    expect(g.accounts[0].cash).toBe(1750);
    invariants(g);
  });
  it("building shortage auction is affordable and places one house", () => {
    let g = make();
    g.phase = "manage";
    for (const t of board.filter((t) => t.kind === "city"))
      g.deeds[t.id].owner = t.group === 0 ? "p0" : "p1";
    for (const group of [1, 2, 3])
      for (const t of groupTiles(group)) g.deeds[t.id].level = 3;
    for (const t of groupTiles(4)) g.deeds[t.id].level = 1;
    g.deeds[21].level = 2;
    expect(bankStock(g).houses).toBe(1);
    g = apply(g, "p0", { type: "buildingAuction", tile: 1 }, i);
    expect(g.phase).toBe("supply");
    g = apply(g, "p1", { type: "buildingResponse", tile: 23 }, i);
    g = apply(g, "p0", { type: "bid", amount: 1 }, i);
    g = apply(g, "p1", { type: "pass" }, i);
    expect(g.deeds[1].level).toBe(1);
    expect(bankStock(g).houses).toBe(0);
  });
  it("team trade response belongs to the designated seat with connected fallback", () => {
    let g = make(4, true);
    g.phase = "manage";
    g.deeds[1].owner = "team-0";
    g = apply(
      g,
      "p0",
      {
        type: "trade",
        id: "team-offer",
        to: "team-1",
        offer: { ...empty, properties: [1] },
        request: { ...empty, cash: 60 },
      },
      i,
    );
    expect(() =>
      apply(g, "p3", { type: "accept", id: "team-offer" }, i),
    ).toThrow(/responder/);
    g.seats.find((s) => s.id === "p1")!.connected = false;
    g = apply(g, "p3", { type: "accept", id: "team-offer" }, i);
    expect(g.deeds[1].owner).toBe("team-1");
  });
  it("bots stop issuing confirmation commands once both confirmations are recorded", () => {
    let g = make(2);
    g.phase = "manage";
    g.seats.forEach((s) => (s.bot = "Expert"));
    g.deeds[39].owner = "p0";
    g = apply(
      g,
      "p0",
      {
        type: "trade",
        id: "bot-offer",
        to: "p1",
        offer: { ...empty, properties: [39] },
        request: { ...empty, cash: 1 },
      },
      i,
    );
    g = apply(g, "p1", { type: "accept", id: "bot-offer" }, i);
    expect(botSeat(g)?.id).toBe("p0");
    g = apply(g, "p0", { type: "confirm", id: "bot-offer" }, i);
    expect(botSeat(g)).toBeUndefined();
  });
  it("multi-build is atomic when a later placement cannot be paid", () => {
    let g = make();
    g.phase = "manage";
    g.deeds[1].owner = "p0";
    g.deeds[3].owner = "p0";
    g.accounts[0].cash = 75;
    expect(() =>
      apply(g, "p0", { type: "buildMany", tiles: [1, 3] }, i),
    ).toThrow(/cash/);
    expect(g.accounts[0].cash).toBe(75);
    expect(g.deeds[1].level).toBe(0);
    g.accounts[0].cash = 100;
    g = apply(g, "p0", { type: "buildMany", tiles: [1, 3] }, i);
    expect(g.deeds[1].level).toBe(1);
    expect(g.deeds[3].level).toBe(1);
    expect(g.accounts[0].cash).toBe(0);
  });
  it("scarcity requires rival consent, timeout declines, and resumes the original roll phase", () => {
    let g = make();
    for (const t of board.filter((t) => t.kind === "city"))
      g.deeds[t.id].owner = t.group === 0 ? "p0" : "p1";
    for (const group of [1, 2, 3])
      for (const t of groupTiles(group)) g.deeds[t.id].level = 3;
    for (const t of groupTiles(4)) g.deeds[t.id].level = 1;
    g.deeds[21].level = 2;
    g = apply(g, "p0", { type: "build", tile: 1 }, i);
    expect(g.phase).toBe("supply");
    expect(() =>
      apply(g, "p0", { type: "buildingResponse", tile: 23 }, i),
    ).toThrow();
    g = apply(g, null, { type: "timeout" }, { ...i, now: 7000 });
    expect(g.phase).toBe("roll");
    expect(g.deeds[1].level).toBe(1);
    expect(g.accounts[0].cash).toBe(1450);
  });
  it("solvent forfeit pays the existing creditor and returns remaining deeds to bank auctions", () => {
    let g = make();
    g.phase = "debt";
    g.deeds[1].owner = "p0";
    g.debt = { from: "p0", to: "p1", amount: 20, reason: "rent" };
    g = apply(g, null, { type: "forfeit", target: "p0" }, i);
    expect(g.accounts[1].cash).toBe(1520);
    expect(g.deeds[1].owner).toBeNull();
    expect(g.phase).toBe("auction");
  });
});
