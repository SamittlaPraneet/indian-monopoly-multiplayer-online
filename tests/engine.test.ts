import { describe, expect, it } from "vitest";
import { board } from "../src/content/board";
import {
  apply,
  bankStock,
  invariants,
  netWorth,
  newGame,
  publicGame,
  rent,
} from "../src/engine/game";
import { defaults, Game, Inputs, Seat } from "../src/engine/types";
import { botCommand, botSeat } from "../src/engine/bot";
const seat = (n: number): Seat => ({
  id: `p${n}`,
  name: `Player ${n}`,
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
});
const input = (dice: [number, number] = [1, 2], now = 1000): Inputs => ({
  now,
  dice: () => dice,
  shuffle: (a) => a,
});
const game = (n = 2) =>
  newGame(
    Array.from({ length: n }, (_, n) => seat(n)),
    defaults,
    input(),
  );
const run = (
  g: Game,
  c: Parameters<typeof apply>[2],
  dice: [number, number] = [1, 2],
) => apply(g, g.seats[g.turn].id, c, input(dice));
const own = (g: Game, ids: number[], owner = "p0") =>
  ids.forEach((id) => (g.deeds[id].owner = owner));
describe("board and economy", () => {
  it("has exact board inventory and schedules", () => {
    expect(board.filter((t) => t.kind === "city")).toHaveLength(22);
    expect(board.filter((t) => t.kind === "transport")).toHaveLength(4);
    expect(board.filter((t) => t.kind === "utility")).toHaveLength(2);
    for (const t of board.filter((t) => t.kind === "city")) {
      expect(t.rents).toHaveLength(6);
      expect(t.mortgage).toBe(t.price / 2);
      expect(t.rents.every((v, n) => n === 0 || v > t.rents[n - 1])).toBe(true);
    }
  });
  it("doubles set rent even with partial mortgage", () => {
    const g = game();
    own(g, [1, 3]);
    g.deeds[3].mortgaged = true;
    expect(rent(g, 1, 7)).toBe(4);
    expect(rent(g, 3, 7)).toBe(0);
  });
  it("transport and utility counts include mortgaged holdings", () => {
    const g = game();
    own(g, [5, 15, 25, 35, 12, 28]);
    g.deeds[15].mortgaged = true;
    g.deeds[28].mortgaged = true;
    expect(rent(g, 5, 7)).toBe(200);
    expect(rent(g, 5, 7, "transport")).toBe(400);
    expect(rent(g, 12, 7)).toBe(70);
    expect(rent(g, 12, 7, "utility")).toBe(70);
    g.deeds[28].owner = null;
    expect(rent(g, 12, 7)).toBe(28);
  });
  it("Fast net worth includes five building costs per hotel", () => {
    const g = game();
    own(g, [1, 3]);
    g.deeds[1].level = 5;
    g.deeds[3].mortgaged = true;
    expect(netWorth(g, "p0")).toBe(1500 + 60 + 30 + 125);
  });
});
describe("movement and Jail", () => {
  it("pays GO once and landing GO salary", () => {
    let g = game();
    g.seats[0].position = 38;
    g = run(g, { type: "roll" }, [1, 2]);
    expect(g.accounts[0].cash).toBe(1700);
    expect(g.seats[0].position).toBe(1);
    g = game();
    g.seats[0].position = 37;
    g = run(g, { type: "roll" }, [1, 2]);
    expect(g.accounts[0].cash).toBe(1700);
    expect(g.seats[0].position).toBe(0);
  });
  it("third doubles sends to Jail before movement", () => {
    let g = game();
    g.doubles = 2;
    g = run(g, { type: "roll" }, [6, 6]);
    expect(g.seats[0].position).toBe(10);
    expect(g.seats[0].jail).toBe(0);
    expect(g.extra).toBe(false);
    expect(g.accounts[0].cash).toBe(1500);
  });
  it("doubles release has no extra roll", () => {
    let g = game();
    g.phase = "jail";
    g.seats[0].jail = 1;
    g.seats[0].position = 10;
    g = run(g, { type: "roll" }, [2, 2]);
    expect(g.seats[0].jail).toBe(-1);
    expect(g.seats[0].position).toBe(14);
    expect(g.extra).toBe(false);
  });
  it("third failed Jail roll resolves debt then moves", () => {
    let g = game();
    g.phase = "jail";
    g.seats[0].jail = 2;
    g.seats[0].position = 10;
    g.accounts[0].cash = 10;
    own(g, [5]);
    g = run(g, { type: "roll" }, [1, 2]);
    expect(g.phase).toBe("debt");
    expect(g.seats[0].position).toBe(10);
    g = run(g, { type: "mortgage", tile: 5 });
    g = run(g, { type: "settle" });
    expect(g.seats[0].position).toBe(13);
    expect(g.accounts[0].cash).toBe(60);
  });
  it("paid release and held card return to deck", () => {
    let g = game();
    g.phase = "jail";
    g.seats[0].jail = 0;
    g = run(g, { type: "jailPay" });
    expect(g.phase).toBe("roll");
    expect(g.accounts[0].cash).toBe(1450);
    g.phase = "jail";
    g.seats[0].jail = 0;
    g.chance = g.chance.filter((c) => c !== "c11");
    g.accounts[0].release = ["c11"];
    g = run(g, { type: "jailCard", card: "c11" });
    expect(g.chance).toContain("c11");
    expect(g.accounts[0].release).toHaveLength(0);
  });
  it("back-three at Chance chains into Chest", () => {
    let g = game();
    g.seats[0].position = 33;
    g.chance = ["c9", ...g.chance.filter((x) => x !== "c9")];
    g = run(g, { type: "roll" }, [1, 2]);
    expect(g.seats[0].position).toBe(33);
    expect(g.accounts[0].cash).toBe(1700);
    expect(g.events.filter((e) => e.type === "card")).toHaveLength(2);
  });
  it("card advance to GO collects salary", () => {
    let g = game();
    g.seats[0].position = 4;
    g.chance = ["c2", ...g.chance.filter((x) => x !== "c2")];
    g = run(g, { type: "roll" }, [1, 2]);
    expect(g.seats[0].position).toBe(0);
    expect(g.accounts[0].cash).toBe(1700);
  });
});
describe("auctions", () => {
  const auction = () => {
    let g = game();
    g = run(g, { type: "roll" });
    return run(g, { type: "decline" });
  };
  it("all pass leaves unowned", () => {
    let g = auction();
    g = apply(g, "p0", { type: "pass" }, input());
    g = apply(g, "p1", { type: "pass" }, input());
    expect(g.deeds[3].owner).toBe(null);
    expect(g.phase).toBe("manage");
  });
  it("single binding bidder pays exactly once", () => {
    let g = auction();
    g = apply(g, "p0", { type: "bid", amount: 1 }, input());
    g = apply(g, "p1", { type: "pass" }, input());
    expect(g.deeds[3].owner).toBe("p0");
    expect(g.accounts[0].cash).toBe(1499);
    expect(() => apply(g, "p0", { type: "bid", amount: 2 }, input())).toThrow();
  });
  it("rejects stale bidder and unaffordable bids", () => {
    const g = auction();
    expect(() => apply(g, "p1", { type: "bid", amount: 1 }, input())).toThrow();
    expect(() =>
      apply(g, "p0", { type: "bid", amount: 1501 }, input()),
    ).toThrow();
  });
  it("deadline permanently passes", () => {
    let g = auction();
    g = apply(g, null, { type: "timeout" }, input([1, 2], g.due));
    expect(g.auction?.passed).toEqual(["p0"]);
  });
});
describe("buildings and mortgages", () => {
  it("even builds and sells with finite stock", () => {
    let g = game();
    own(g, [1, 3]);
    g = run(g, { type: "build", tile: 1 });
    expect(() => run(g, { type: "build", tile: 1 })).toThrow();
    g = run(g, { type: "build", tile: 3 });
    g = run(g, { type: "build", tile: 1 });
    expect(bankStock(g).houses).toBe(29);
    expect(() => run(g, { type: "sell", tile: 3 })).toThrow();
    g = run(g, { type: "sell", tile: 1 });
    expect(g.accounts[0].cash).toBe(1375);
  });
  it("relaxed even setting permits uneven development", () => {
    let g = game();
    g.settings.even = false;
    own(g, [1, 3]);
    g = run(g, { type: "build", tile: 1 });
    g = run(g, { type: "build", tile: 1 });
    expect(g.deeds[1].level).toBe(2);
  });
  it("hotel upgrade returns four houses", () => {
    let g = game();
    own(g, [1, 3]);
    g.deeds[1].level = 4;
    g.deeds[3].level = 4;
    g = run(g, { type: "build", tile: 1 });
    expect(bankStock(g)).toEqual({ houses: 28, hotels: 11 });
    g = run(g, { type: "sell", tile: 1 });
    expect(bankStock(g)).toEqual({ houses: 24, hotels: 12 });
  });
  it("mortgage prohibited with buildings and disabled setting", () => {
    let g = game();
    own(g, [1, 3]);
    g.deeds[1].level = 1;
    expect(() => run(g, { type: "mortgage", tile: 3 })).toThrow();
    g.deeds[1].level = 0;
    g = run(g, { type: "mortgage", tile: 1 });
    expect(g.accounts[0].cash).toBe(1530);
    g = run(g, { type: "unmortgage", tile: 1 });
    expect(g.accounts[0].cash).toBe(1497);
    g.settings.mortgages = false;
    expect(() => run(g, { type: "mortgage", tile: 1 })).toThrow();
    expect(() => run(g, { type: "unmortgage", tile: 1 })).toThrow();
  });
});
describe("debt and trades", () => {
  it("rent becomes explicit debt without negative cash", () => {
    let g = game();
    own(g, [3], "p1");
    g.accounts[0].cash = 1;
    g = run(g, { type: "roll" });
    expect(g.phase).toBe("debt");
    expect(g.accounts[0].cash).toBe(1);
    g = run(g, { type: "bankrupt" });
    expect(g.phase).toBe("over");
    expect(g.winner).toEqual(["p1"]);
  });
  it("atomic trade charges transfer interest or immediate redemption", () => {
    let g = game();
    g.phase = "manage";
    own(g, [1]);
    own(g, [3], "p1");
    g.deeds[1].mortgaged = true;
    g = run(g, {
      type: "trade",
      id: "t",
      to: "p1",
      offer: { cash: 0, properties: [1], cards: [], redeem: [] },
      request: { cash: 0, properties: [3], cards: [], redeem: [] },
    });
    g = apply(g, "p1", { type: "accept", id: "t" }, input());
    expect(g.deeds[1].owner).toBe("p1");
    expect(g.accounts[1].cash).toBe(1497);
  });
  it("rejects duplicate, developed or pure cash offers", () => {
    const g = game();
    g.phase = "manage";
    own(g, [1, 3]);
    const empty = { cash: 0, properties: [], cards: [], redeem: [] };
    expect(() =>
      run(g, {
        type: "trade",
        id: "t",
        to: "p1",
        offer: { ...empty, cash: 50 },
        request: empty,
      }),
    ).toThrow();
    expect(() =>
      run(g, {
        type: "trade",
        id: "t",
        to: "p1",
        offer: { ...empty, properties: [1, 1] },
        request: empty,
      }),
    ).toThrow();
    g.deeds[3].level = 1;
    expect(() =>
      run(g, {
        type: "trade",
        id: "t",
        to: "p1",
        offer: { ...empty, properties: [1] },
        request: empty,
      }),
    ).toThrow();
  });
  it("mortgages-disabled debt times out into bankruptcy", () => {
    let g = game();
    g.settings.mortgages = false;
    g.accounts[0].cash = 0;
    g.phase = "debt";
    g.debt = { from: "p0", to: null, amount: 200, reason: "tax" };
    g = apply(g, null, { type: "timeout" }, input([1, 2], g.due + 60000));
    expect(g.accounts[0].active).toBe(false);
  });
  it("does not expose deck order", () => {
    expect(publicGame(game())).not.toHaveProperty("chance");
    expect(publicGame(game())).not.toHaveProperty("chest");
  });
});
describe("teams and Fast simulations", () => {
  it("interleaves paired turns and shares cash", () => {
    let g = newGame(
      Array.from({ length: 4 }, (_, n) => seat(n)),
      { ...defaults, teams: true },
      input(),
    );
    expect(g.seats.map((s) => s.team)).toEqual([0, 1, 0, 1]);
    expect(g.accounts.map((a) => a.cash)).toEqual([3000, 3000]);
    g = apply(g, null, { type: "forfeit", target: "p0" }, input());
    expect(g.accounts[0].active).toBe(true);
    expect(g.seats.find((s) => s.id === "p2")?.active).toBe(true);
  });
  it("team auction contains one bidder per shared account", () => {
    let g = newGame(
      Array.from({ length: 4 }, (_, n) => seat(n)),
      { ...defaults, teams: true },
      input(),
    );
    g = run(g, { type: "roll" });
    g = run(g, { type: "decline" });
    expect(g.auction?.eligible).toEqual(["team-0", "team-1"]);
  });
  it("Fast ends after equal scheduled turns and permits tied result", () => {
    let g = newGame(
      [seat(0), seat(1)],
      { ...defaults, preset: "Fast", rounds: 5 },
      input(),
    );
    for (let n = 0; n < 10; n++)
      g = apply(g, null, { type: "timeout" }, input([1, 2], g.due));
    expect(g.phase).toBe("over");
    expect(g.winner).toEqual(["p0", "p1"]);
  });
  for (const count of [2, 4, 8])
    it(`complete seeded ${count}-bot Fast match`, () => {
      let seed = 41;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
      };
      const i: Inputs = {
        now: 1000,
        dice: () => [
          1 + Math.floor(random() * 6),
          1 + Math.floor(random() * 6),
        ],
        shuffle: (a) => [...a].sort(() => random() - 0.5),
      };
      let g = newGame(
        Array.from({ length: count }, (_, n) => ({
          ...seat(n),
          bot: (["Easy", "Normal", "Hard", "Expert"] as const)[n % 4],
        })),
        { ...defaults, capacity: 8, preset: "Fast", rounds: 5 },
        i,
      );
      let steps = 0;
      while (g.phase !== "over" && steps++ < 3000) {
        const s = botSeat(g);
        expect(s).toBeDefined();
        g = apply(g, s!.id, botCommand(g, s!), i);
        i.now += 1000;
        invariants(g);
      }
      expect(g.phase).toBe("over");
      expect(steps).toBeLessThan(3000);
    });
});
