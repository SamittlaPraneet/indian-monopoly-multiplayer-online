import { board, groupTiles, money } from "../content/board";
import { cards, chance, chest } from "../content/cards";
import {
  Auction,
  Command,
  Game,
  Inputs,
  Seat,
  Settings,
  TradeSide,
} from "./types";

export class RuleError extends Error {}
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new RuleError(message);
}
export const current = (g: Game) => g.seats[g.turn];
export const accountId = (g: Game, seat: Seat) =>
  g.settings.teams ? `team-${seat.team}` : seat.id;
export function representative(
  g: Pick<Game, "seats" | "settings">,
  id: string,
) {
  const members = g.seats
    .filter(
      (s) => s.active && (g.settings.teams ? `team-${s.team}` : s.id) === id,
    )
    .sort((a, b) => a.joined - b.joined);
  return members.find((s) => s.connected) ?? members[0];
}
export const account = (g: Game, id: string) => {
  const a = g.accounts.find((x) => x.id === id);
  if (!a) throw new RuleError("Account unavailable");
  return a;
};
export const seatAccount = (g: Game, s: Seat) => account(g, accountId(g, s));
export const holdings = (g: Game, id: string) =>
  board.filter((t) => g.deeds[t.id].owner === id);
export const ownsSet = (g: Game, id: string, group: number) =>
  groupTiles(group).every((t) => g.deeds[t.id].owner === id);
export const log = (
  g: Game,
  i: Inputs,
  text: string,
  type = "action",
  extra: Partial<Game["events"][number]> = {},
) => {
  g.events.push({ id: ++g.eventSeq, at: i.now, text, type, ...extra });
  g.events = g.events.slice(-120);
};
export const setPhase = (g: Game, phase: Game["phase"], i: Inputs) => {
  g.phase = phase;
  g.due =
    i.now +
    (phase === "auction" || phase === "supply"
      ? 6000
      : phase === "debt"
        ? 60000
        : phase === "roll" || phase === "jail"
          ? g.settings.rollSeconds * 1000
          : 20000);
};
export function validateSettings(s: Settings) {
  assert(
    Number.isSafeInteger(s.cash) && s.cash >= 500 && s.cash <= 5000,
    "Starting cash must be an integer from ₹500 to ₹5,000",
  );
  assert(
    Number.isInteger(s.capacity) && s.capacity >= 2 && s.capacity <= 8,
    "Capacity must be 2–8",
  );
  assert([20, 30, 60].includes(s.rollSeconds), "Invalid roll timer");
  assert(
    Number.isInteger(s.rounds) && s.rounds >= 5 && s.rounds <= 20,
    "Fast rounds must be 5–20",
  );
  assert(
    ["Classic", "Fast"].includes(s.preset) &&
      ["flat", "hybrid", "3d"].includes(s.view),
    "Invalid preset or board view",
  );
}
export function newGame(seats: Seat[], settings: Settings, i: Inputs): Game {
  validateSettings(settings);
  assert(
    seats.length >= 2 && seats.length <= settings.capacity,
    "Need 2–8 seats within capacity",
  );
  assert(
    new Set(seats.map((s) => s.token)).size === seats.length,
    "Choose distinct tokens",
  );
  if (settings.teams) {
    const counts = new Map<number, number>();
    for (const s of seats) counts.set(s.team, (counts.get(s.team) || 0) + 1);
    assert(
      counts.size >= 2 &&
        counts.size <= 4 &&
        [...counts.values()].every((n) => n === 2),
      "Teams need 2–4 pairs",
    );
  }
  const reset = seats.map((s) => ({
    ...s,
    active: true,
    position: 0,
    jail: -1,
  }));
  const ordered = settings.teams
    ? [...new Set(reset.map((s) => s.team))].flatMap((t) =>
        reset.filter((s) => s.team === t),
      )
    : reset;
  const interleaved = settings.teams
    ? [...Array(2)].flatMap((_, n) =>
        [...new Set(ordered.map((s) => s.team))].map(
          (t) => ordered.filter((s) => s.team === t)[n],
        ),
      )
    : ordered;
  const g: Game = {
    schema: 1,
    revision: 0,
    settings: { ...settings },
    seats: interleaved,
    accounts: [],
    deeds: board.map(() => ({ owner: null, level: 0, mortgaged: false })),
    turn: 0,
    doubles: 0,
    extra: false,
    round: 1,
    turnsInRound: 0,
    phase: "roll",
    due: 0,
    dice: [1, 1],
    lastCard: null,
    payments: [],
    debt: null,
    afterDebt: "manage",
    pendingMove: 0,
    auction: null,
    auctionQueue: [],
    supply: null,
    trade: null,
    chance: i.shuffle(chance.map((c) => c.id)),
    chest: i.shuffle(chest.map((c) => c.id)),
    events: [],
    eventSeq: 0,
    winner: [],
  };
  for (const s of g.seats) {
    const id = accountId(g, s);
    if (!g.accounts.some((a) => a.id === id))
      g.accounts.push({
        id,
        name: settings.teams ? `Team ${s.team + 1}` : s.name,
        cash: settings.cash * (settings.teams ? 2 : 1),
        release: [],
        active: true,
      });
  }
  setPhase(g, "roll", i);
  log(
    g,
    i,
    `${settings.preset} match begins. ${current(g).name} rolls first.`,
    "start",
  );
  return g;
}
export function netWorth(g: Game, id: string) {
  return (
    account(g, id).cash +
    holdings(g, id).reduce(
      (sum, t) =>
        sum +
        t.price -
        (g.deeds[t.id].mortgaged ? t.mortgage : 0) +
        (g.deeds[t.id].level * t.build) / 2,
      0,
    )
  );
}
export function rent(
  g: Game,
  tile: number,
  roll: number,
  special?: "transport" | "utility",
) {
  const t = board[tile],
    d = g.deeds[tile];
  if (!d.owner || d.mortgaged) return 0;
  if (t.kind === "transport") {
    const count = holdings(g, d.owner).filter(
      (x) => x.kind === "transport",
    ).length;
    return t.rents[count - 1] * (special === "transport" ? 2 : 1);
  }
  if (t.kind === "utility") {
    const count = holdings(g, d.owner).filter(
      (x) => x.kind === "utility",
    ).length;
    return roll * (special === "utility" ? 10 : count === 2 ? 10 : 4);
  }
  return (
    t.rents[d.level] * (d.level === 0 && ownsSet(g, d.owner, t.group!) ? 2 : 1)
  );
}
function jail(g: Game, i: Inputs) {
  const p = current(g);
  p.position = 10;
  p.jail = 0;
  g.doubles = 0;
  g.extra = false;
  log(g, i, `${p.name} goes directly to Jail.`, "jail");
  setPhase(g, "manage", i);
}
function move(
  g: Game,
  steps: number,
  i: Inputs,
  salary = true,
  special?: "transport" | "utility",
) {
  const p = current(g),
    from = p.position,
    to = (((from + steps) % 40) + 40) % 40;
  if (salary && steps > 0 && from + steps >= 40) {
    seatAccount(g, p).cash += 200;
    log(g, i, `${p.name} collects ₹200 at GO.`, "money");
  }
  p.position = to;
  log(g, i, `${p.name} reaches ${board[to].name}.`, "move", {
    seat: p.id,
    from,
    to,
    steps,
  });
  land(g, i, special);
}
function charge(
  g: Game,
  from: string,
  to: string | null,
  amount: number,
  reason: string,
) {
  if (amount > 0 && from !== to) g.payments.push({ from, to, amount, reason });
}
function land(
  g: Game,
  i: Inputs,
  special?: "transport" | "utility",
  depth = 0,
) {
  assert(depth < 8, "Card movement chain too long");
  const p = current(g),
    a = seatAccount(g, p),
    t = board[p.position],
    d = g.deeds[t.id];
  g.afterDebt = "manage";
  if (["city", "transport", "utility"].includes(t.kind)) {
    if (!d.owner) {
      setPhase(g, "buy", i);
      return;
    }
    if (d.owner !== a.id) {
      const utilityRoll = special === "utility" ? i.dice() : g.dice;
      const amount = rent(g, t.id, utilityRoll[0] + utilityRoll[1], special);
      charge(g, a.id, d.owner, amount, `Rent at ${t.name}`);
    }
  } else if (t.kind === "goJail") {
    jail(g, i);
    return;
  } else if (t.kind === "tax") {
    if (t.id === 4) {
      setPhase(g, "tax", i);
      return;
    }
    charge(g, a.id, null, t.price, `${t.name}`);
  } else if (t.kind === "chance" || t.kind === "chest") {
    const deck = t.kind === "chance" ? g.chance : g.chest;
    const id = deck.shift()!;
    const card = cards.find((c) => c.id === id)!;
    g.lastCard = id;
    log(
      g,
      i,
      `${t.kind === "chance" ? "Chance" : "Community Chest"}: ${card.text} ${card.detail}`,
      "card",
    );
    const e = card.effect;
    if (e.kind === "release") a.release.push(id);
    else deck.push(id);
    if (e.kind === "jail") {
      jail(g, i);
      return;
    }
    if (e.kind === "move" || e.kind === "nearest" || e.kind === "back") {
      let steps = 0;
      let modifier: "transport" | "utility" | undefined;
      if (e.kind === "move") {
        steps = (e.to - p.position + 40) % 40;
        if (steps === 0 && e.to === 0) steps = 40;
      }
      if (e.kind === "back") steps = -e.steps;
      if (e.kind === "nearest") {
        modifier = e.type;
        steps = 1;
        while (board[(p.position + steps) % 40].kind !== e.type) steps++;
      }
      const from = p.position;
      const to = (((from + steps) % 40) + 40) % 40;
      if (steps > 0 && from + steps >= 40) {
        a.cash += 200;
        log(g, i, `${p.name} collects ₹200 at GO.`, "money");
      }
      p.position = to;
      log(g, i, `${p.name} reaches ${board[to].name}.`, "move", {
        seat: p.id,
        from,
        to,
        steps,
      });
      land(g, i, modifier, depth + 1);
      return;
    }
    if (e.kind === "money") {
      if (e.amount > 0) {
        a.cash += e.amount;
        log(g, i, `${a.name} collects ${money(e.amount)}.`, "money");
      } else charge(g, a.id, null, -e.amount, card.text);
    }
    if (e.kind === "each")
      for (const other of g.accounts.filter((x) => x.active && x.id !== a.id)) {
        if (e.amount < 0) charge(g, a.id, other.id, -e.amount, card.text);
        else charge(g, other.id, a.id, e.amount, card.text);
      }
    if (e.kind === "repairs") {
      const cost = holdings(g, a.id).reduce(
        (sum, t) =>
          sum +
          (g.deeds[t.id].level === 5 ? e.hotel : g.deeds[t.id].level * e.house),
        0,
      );
      charge(g, a.id, null, cost, card.text);
    }
  }
  drain(g, i);
}
function drain(g: Game, i: Inputs) {
  g.debt = null;
  while (g.payments.length) {
    const pay = g.payments.shift()!;
    const a = account(g, pay.from);
    if (!a.active) continue;
    if (pay.to && !account(g, pay.to).active) continue;
    if (a.cash < pay.amount) {
      g.debt = pay;
      setPhase(g, "debt", i);
      log(
        g,
        i,
        `${a.name} needs ${money(pay.amount - a.cash)} to settle ${pay.reason}.`,
        "debt",
      );
      return;
    }
    a.cash -= pay.amount;
    if (pay.to) account(g, pay.to).cash += pay.amount;
    log(
      g,
      i,
      `${a.name} pays ${money(pay.amount)}${pay.to ? " to " + account(g, pay.to).name : " to the bank"}: ${pay.reason}.`,
      "money",
    );
  }
  if (g.afterDebt === "move") {
    g.afterDebt = "manage";
    move(g, g.pendingMove, i);
    return;
  }
  if (g.afterDebt === "roll") {
    setPhase(g, "roll", i);
    return;
  }
  if (g.auctionQueue.length) {
    startAuction(g, g.auctionQueue.shift()!, i);
    return;
  }
  setPhase(g, "manage", i);
  checkWinner(g, i);
}
export function bankStock(g: Pick<Game, "deeds">) {
  return {
    houses: 32 - g.deeds.reduce((n, d) => n + (d.level < 5 ? d.level : 0), 0),
    hotels: 12 - g.deeds.filter((d) => d.level === 5).length,
  };
}
export function canBuild(g: Game, id: string, tile: number, stock = true) {
  const t = board[tile],
    d = g.deeds[tile];
  if (
    !t ||
    t.kind !== "city" ||
    d.owner !== id ||
    d.level === 5 ||
    !ownsSet(g, id, t.group!)
  )
    return false;
  const group = groupTiles(t.group!);
  if (group.some((x) => g.deeds[x.id].mortgaged)) return false;
  if (
    g.settings.even &&
    d.level !== Math.min(...group.map((x) => g.deeds[x.id].level))
  )
    return false;
  if (d.level === 4 && group.some((x) => g.deeds[x.id].level < 4)) return false;
  const bank = bankStock(g);
  return !stock || (d.level === 4 ? bank.hotels > 0 : bank.houses > 0);
}
export function canSell(g: Game, id: string, tile: number) {
  const t = board[tile],
    d = g.deeds[tile];
  if (!t || d.owner !== id || d.level === 0) return false;
  const group = groupTiles(t.group!);
  if (
    g.settings.even &&
    d.level !== Math.max(...group.map((x) => g.deeds[x.id].level))
  )
    return false;
  return d.level !== 5 || bankStock(g).houses >= 4;
}
function portfolio(g: Game, id: string, c: Command, i: Inputs) {
  const a = account(g, id);
  if (c.type === "sellGroup") {
    const tiles = groupTiles(c.group);
    assert(
      tiles.every((t) => g.deeds[t.id].owner === id),
      "Own the whole group to sell all buildings",
    );
    for (const t of tiles) {
      const d = g.deeds[t.id];
      a.cash += (d.level * t.build) / 2;
      d.level = 0;
    }
    log(
      g,
      i,
      `${a.name} sells all buildings in group ${c.group + 1}.`,
      "building",
    );
    return;
  }
  assert("tile" in c && typeof c.tile === "number", "Missing deed");
  const t = board[c.tile];
  assert(t, "Unknown deed");
  const d = g.deeds[c.tile];
  assert(d.owner === id, "You do not own this deed");
  if (c.type === "build") {
    assert(
      canBuild(g, id, c.tile),
      "Cannot build: check set, mortgages, even building and bank stock",
    );
    assert(a.cash >= t.build, "Not enough cash");
    a.cash -= t.build;
    d.level++;
    log(
      g,
      i,
      `${a.name} builds ${d.level === 5 ? "a hotel" : "a house"} in ${t.name}.`,
      "building",
      { tile: c.tile },
    );
  }
  if (c.type === "sell") {
    assert(
      canSell(g, id, c.tile),
      "Sell evenly; hotel breakdown needs 4 bank houses. Sell the whole group if unavailable.",
    );
    a.cash += t.build / 2;
    d.level--;
    log(g, i, `${a.name} sells one building in ${t.name}.`, "building", {
      tile: c.tile,
    });
  }
  if (c.type === "mortgage") {
    assert(g.settings.mortgages, "Mortgages are disabled");
    assert(!d.mortgaged && t.mortgage > 0, "Already mortgaged or not a deed");
    assert(
      t.group === undefined ||
        groupTiles(t.group).every((x) => g.deeds[x.id].level === 0),
      "Sell all buildings in the colour group first",
    );
    d.mortgaged = true;
    a.cash += t.mortgage;
    log(
      g,
      i,
      `${a.name} mortgages ${t.name} for ${money(t.mortgage)}.`,
      "mortgage",
    );
  }
  if (c.type === "unmortgage") {
    assert(g.settings.mortgages, "Mortgages are disabled");
    assert(d.mortgaged, "Not mortgaged");
    const cost = Math.ceil((t.mortgage * 110) / 100);
    assert(a.cash >= cost, "Not enough cash");
    a.cash -= cost;
    d.mortgaged = false;
    log(g, i, `${a.name} redeems ${t.name} for ${money(cost)}.`, "mortgage");
  }
}
const activeAccounts = (g: Game) => g.accounts.filter((a) => a.active);
function startAuction(
  g: Game,
  tile: number,
  i: Inputs,
  kind: Auction["kind"] = "property",
  placements: Record<string, number> = {},
) {
  const eligible = activeAccounts(g)
    .filter(
      (a) =>
        a.cash >= 1 && (kind === "property" || placements[a.id] !== undefined),
    )
    .map((a) => a.id);
  g.auction = {
    tile,
    kind,
    eligible,
    passed: [],
    cursor: 0,
    bid: 0,
    leader: null,
    placements,
  };
  setPhase(g, "auction", i);
  log(
    g,
    i,
    `Auction opens: ${kind === "property" ? board[tile].name : kind}. Minimum ₹1.`,
    "auction",
  );
  if (!eligible.length) finishAuction(g, i);
}
export function auctionBidder(g: Game) {
  const a = g.auction;
  if (!a) return null;
  return a.eligible[a.cursor] || null;
}
function advanceAuction(g: Game, i: Inputs) {
  const a = g.auction!;
  const remaining = a.eligible.filter((id) => !a.passed.includes(id));
  if (
    !remaining.length ||
    (remaining.length === 1 && a.leader === remaining[0])
  ) {
    finishAuction(g, i);
    return;
  }
  for (let n = 1; n <= a.eligible.length; n++) {
    const index = (a.cursor + n) % a.eligible.length;
    const id = a.eligible[index];
    if (!a.passed.includes(id) && id !== a.leader) {
      a.cursor = index;
      setPhase(g, "auction", i);
      return;
    }
  }
  finishAuction(g, i);
}
function finishAuction(g: Game, i: Inputs) {
  const a = g.auction!;
  if (a.leader) {
    const winner = account(g, a.leader);
    assert(winner.active && winner.cash >= a.bid, "Binding bid cannot be paid");
    winner.cash -= a.bid;
    const tile = a.kind === "property" ? a.tile : a.placements[winner.id];
    if (a.kind === "property") {
      g.deeds[tile] = { owner: winner.id, level: 0, mortgaged: false };
      const group = board[tile].group;
      if (group !== undefined && ownsSet(g, winner.id, group))
        log(g, i, `${winner.name} completes a colour set.`, "set", { group });
    } else {
      assert(canBuild(g, winner.id, tile), "Building placement became invalid");
      g.deeds[tile].level++;
    }
    log(
      g,
      i,
      `${winner.name} wins ${a.kind === "property" ? board[tile].name : a.kind} for ${money(a.bid)}.`,
      "auction",
    );
  } else log(g, i, "Auction closes without a bid.", "auction");
  g.auction = null;
  if (a.kind !== "property" && g.supply) {
    if (a.leader) {
      delete g.supply.placements[a.leader];
      resolveSupply(g, i);
    } else {
      const resume = g.supply.resume;
      g.supply = null;
      setPhase(g, resume, i);
    }
    return;
  }
  if (g.auctionQueue.length) {
    startAuction(g, g.auctionQueue.shift()!, i);
    return;
  }
  setPhase(g, "manage", i);
  checkWinner(g, i);
}
export function buildingChoices(
  g: Pick<Game, "deeds" | "accounts" | "settings">,
  id: string,
  kind: "house" | "hotel",
) {
  return board.filter(
    (t) =>
      canBuild(g as Game, id, t.id, false) &&
      (g.deeds[t.id].level === 4) === (kind === "hotel"),
  );
}
function beginSupply(g: Game, id: string, tile: number, i: Inputs) {
  assert(canBuild(g, id, tile), "Choose a legal in-stock building placement");
  const kind = g.deeds[tile].level === 4 ? "hotel" : "house";
  const stock = bankStock(g)[kind === "hotel" ? "hotels" : "houses"];
  const eligible = activeAccounts(g)
    .filter(
      (a) => a.id !== id && a.cash > 0 && buildingChoices(g, a.id, kind).length,
    )
    .map((a) => a.id);
  assert(stock < eligible.length + 1, "No building shortage; use Build");
  assert(
    ["roll", "jail", "manage"].includes(g.phase),
    "Building decision unavailable",
  );
  g.supply = {
    kind,
    resume: g.phase as "roll" | "jail" | "manage",
    eligible,
    cursor: 0,
    placements: { [id]: tile },
  };
  setPhase(g, "supply", i);
  log(
    g,
    i,
    `Limited ${kind} supply: each eligible account chooses its own placement or declines.`,
    "building",
  );
}
function supplyResponse(g: Game, id: string, tile: number | null, i: Inputs) {
  const s = g.supply!;
  assert(s.eligible[s.cursor] === id, "Not your building response");
  if (tile !== null) {
    assert(
      buildingChoices(g, id, s.kind).some((t) => t.id === tile),
      "Invalid requested placement",
    );
    s.placements[id] = tile;
  }
  s.cursor++;
  if (s.cursor < s.eligible.length) setPhase(g, "supply", i);
  else resolveSupply(g, i);
}
function resolveSupply(g: Game, i: Inputs) {
  const s = g.supply!;
  for (const [id, tile] of Object.entries(s.placements))
    if (!account(g, id).active || !canBuild(g, id, tile, false))
      delete s.placements[id];
  const entries = Object.entries(s.placements);
  const stock = bankStock(g)[s.kind === "hotel" ? "hotels" : "houses"];
  if (entries.length > stock && stock > 0) {
    startAuction(g, entries[0][1], i, s.kind, s.placements);
    return;
  }
  if (stock >= entries.length)
    for (const [id, tile] of entries) {
      if (account(g, id).cash >= board[tile].build)
        portfolio(g, id, { type: "build", tile }, i);
      else
        log(
          g,
          i,
          `${account(g, id).name} cannot afford the list-price building.`,
          "building",
        );
    }
  g.supply = null;
  setPhase(g, s.resume, i);
}
function returnCard(g: Game, id: string) {
  (id.startsWith("c") ? g.chance : g.chest).push(id);
}
function bankrupt(g: Game, id: string, creditor: string | null, i: Inputs) {
  const a = account(g, id);
  if (!a.active) return;
  for (const t of holdings(g, id)) {
    const d = g.deeds[t.id];
    a.cash += (d.level * t.build) / 2;
    d.level = 0;
  }
  const recipient =
    creditor && account(g, creditor).active ? account(g, creditor) : null;
  if (recipient) {
    recipient.cash += a.cash;
    recipient.release.push(...a.release);
    let interest = 0;
    for (const t of holdings(g, id)) {
      const d = g.deeds[t.id];
      d.owner = recipient.id;
      if (d.mortgaged) interest += Math.ceil(t.mortgage / 10);
    }
    charge(g, recipient.id, null, interest, "Interest on inherited mortgages");
  } else {
    for (const card of a.release) returnCard(g, card);
    for (const t of holdings(g, id)) {
      g.deeds[t.id] = { owner: null, level: 0, mortgaged: false };
      if (g.settings.auctions) g.auctionQueue.push(t.id);
    }
  }
  a.cash = 0;
  a.release = [];
  a.active = false;
  for (const p of g.seats) if (accountId(g, p) === id) p.active = false;
  g.payments = g.payments.filter((p) => p.from !== id && p.to !== id);
  g.trade = null;
  log(
    g,
    i,
    `${a.name} is bankrupt${recipient ? " to " + recipient.name : " to the bank"}.`,
    "bankruptcy",
  );
}
function checkWinner(g: Game, i: Inputs) {
  if (g.debt || g.payments.length || g.auction) return;
  const active = activeAccounts(g);
  if (active.length <= 1) {
    g.winner = active.map((a) => a.id);
    setPhase(g, "over", i);
    log(
      g,
      i,
      active.length ? `${active[0].name} wins!` : "No solvent accounts remain.",
      "victory",
    );
    return;
  }
}
function endTurn(g: Game, i: Inputs, skip = false) {
  assert(
    !g.debt && !g.auction && !g.payments.length,
    "Resolve obligations first",
  );
  if (g.extra && current(g).active && !skip) {
    g.extra = false;
    setPhase(g, "roll", i);
    return;
  }
  g.extra = false;
  g.doubles = 0;
  g.turnsInRound++;
  // Count each originally scheduled seat, including eliminated ones, exactly once per round.
  do {
    g.turn = (g.turn + 1) % g.seats.length;
    if (g.turn === 0) {
      if (g.settings.preset === "Fast" && g.round >= g.settings.rounds) {
        finishFast(g, i);
        return;
      }
      g.round++;
      g.turnsInRound = 0;
    }
  } while (!current(g).active);
  setPhase(g, current(g).jail >= 0 ? "jail" : "roll", i);
  log(g, i, `${current(g).name}'s turn. Round ${g.round}.`, "turn");
}
function finishFast(g: Game, i: Inputs) {
  const ranked = activeAccounts(g).sort(
    (a, b) =>
      netWorth(g, b.id) - netWorth(g, a.id) ||
      b.cash - a.cash ||
      holdings(g, b.id).reduce((n, t) => n + t.price, 0) -
        holdings(g, a.id).reduce((n, t) => n + t.price, 0),
  );
  const best = ranked[0];
  g.winner = ranked
    .filter(
      (a) =>
        netWorth(g, a.id) === netWorth(g, best.id) &&
        a.cash === best.cash &&
        holdings(g, a.id).reduce((n, t) => n + t.price, 0) ===
          holdings(g, best.id).reduce((n, t) => n + t.price, 0),
    )
    .map((a) => a.id);
  setPhase(g, "over", i);
  log(
    g,
    i,
    `${g.winner.map((id) => account(g, id).name).join(" & ")} wins Fast with ${money(netWorth(g, best.id))} net worth.`,
    "victory",
  );
}
function validateSide(g: Game, id: string, side: TradeSide) {
  assert(
    Number.isSafeInteger(side.cash) && side.cash >= 0,
    "Trade cash must be a nonnegative integer",
  );
  assert(
    new Set(side.properties).size === side.properties.length &&
      new Set(side.cards).size === side.cards.length &&
      new Set(side.redeem).size === side.redeem.length,
    "Duplicate trade item",
  );
  for (const tile of side.properties) {
    const t = board[tile];
    assert(
      t && g.deeds[tile].owner === id,
      "Offered property is no longer owned",
    );
    assert(
      t.group === undefined ||
        groupTiles(t.group).every((x) => g.deeds[x.id].level === 0),
      "Developed groups cannot be traded",
    );
  }
  for (const card of side.cards)
    assert(account(g, id).release.includes(card), "Release card unavailable");
  assert(
    side.redeem.every(
      (t) => side.properties.includes(t) && g.deeds[t].mortgaged,
    ),
    "Invalid immediate redemption selection",
  );
}
export function transferCost(g: Game, side: TradeSide) {
  return side.properties.reduce(
    (sum, t) =>
      sum +
      (g.deeds[t].mortgaged
        ? Math.ceil(
            (board[t].mortgage * (side.redeem.includes(t) ? 110 : 10)) / 100,
          )
        : 0),
    0,
  );
}
function valuation(g: Game, side: TradeSide) {
  return (
    side.cash +
    side.properties.reduce(
      (n, t) =>
        n + board[t].price - (g.deeds[t].mortgaged ? board[t].mortgage : 0),
      0,
    ) +
    side.cards.length * 50
  );
}
function acceptTrade(g: Game, i: Inputs) {
  const t = g.trade!;
  const a = account(g, t.from),
    b = account(g, t.to);
  assert(a.active && b.active, "Trade participant unavailable");
  validateSide(g, a.id, t.offer);
  validateSide(g, b.id, t.request);
  const costA = transferCost(g, t.request),
    costB = transferCost(g, t.offer);
  assert(
    a.cash >= t.offer.cash && b.cash >= t.request.cash,
    "Trade cash unavailable",
  );
  assert(
    a.cash - t.offer.cash + t.request.cash >= costA &&
      b.cash - t.request.cash + t.offer.cash >= costB,
    "Cannot pay mortgage transfer obligations",
  );
  a.cash += t.request.cash - t.offer.cash - costA;
  b.cash += t.offer.cash - t.request.cash - costB;
  for (const [side, from, to] of [
    [t.offer, a, b],
    [t.request, b, a],
  ] as const) {
    for (const tile of side.properties) {
      g.deeds[tile].owner = to.id;
      if (side.redeem.includes(tile)) g.deeds[tile].mortgaged = false;
    }
    for (const card of side.cards) {
      from.release = from.release.filter((c) => c !== card);
      to.release.push(card);
    }
  }
  for (const id of [a.id, b.id])
    for (let group = 0; group < 8; group++)
      if (
        ownsSet(g, id, group) &&
        [...t.offer.properties, ...t.request.properties].some(
          (tile) => board[tile].group === group,
        )
      )
        log(g, i, `${account(g, id).name} completes a colour set.`, "set", {
          group,
        });
  log(g, i, `${a.name} and ${b.name} complete trade ${t.id}.`, "trade");
  g.trade = null;
}
function canPortfolio(g: Game, seat: Seat, id: string) {
  return (
    (g.phase === "debt" && g.debt?.from === id) ||
    ((g.phase === "roll" || g.phase === "jail" || g.phase === "manage") &&
      current(g).id === seat.id)
  );
}
export function apply(
  state: Game,
  seatId: string | null,
  c: Command,
  i: Inputs,
): Game {
  const g = structuredClone(state);
  assert(g.schema === 1, "Incompatible game version");
  if (c.type === "timeout") {
    assert(seatId === null, "Only the server processes timeouts");
    timeout(g, i);
    g.revision++;
    invariants(g);
    return g;
  }
  if (c.type === "forfeit") {
    assert(seatId === null, "Only room orchestration can forfeit a seat");
    forfeit(g, c.target, i);
    g.revision++;
    invariants(g);
    return g;
  }
  assert(g.phase !== "over", "Match has finished");
  const seat = g.seats.find((s) => s.id === seatId);
  assert(seat && seat.active, "Seat unavailable");
  const id = accountId(g, seat),
    a = account(g, id);
  if (
    [
      "build",
      "buildMany",
      "sell",
      "sellGroup",
      "mortgage",
      "unmortgage",
    ].includes(c.type)
  ) {
    assert(
      canPortfolio(g, seat, id),
      "Wait for your management phase or your debt",
    );
    assert(!g.trade, "Resolve the pending trade first");
    assert(
      g.phase !== "debt" || ["sell", "sellGroup", "mortgage"].includes(c.type),
      "Resolve debt before spending",
    );
    if (c.type === "buildMany") {
      assert(g.settings.fasterBuilding, "Multi-build controls are disabled");
      assert(
        c.tiles.length > 0 && c.tiles.length <= 16,
        "Choose 1–16 legal placements",
      );
      for (const tile of c.tiles) {
        const kind = g.deeds[tile]?.level === 4 ? "hotel" : "house";
        const possible = activeAccounts(g).filter(
          (a) => a.cash > 0 && buildingChoices(g, a.id, kind).length,
        ).length;
        assert(
          bankStock(g)[kind === "hotel" ? "hotels" : "houses"] >= possible,
          "Limited supply: use a single Build to collect competing requests",
        );
        portfolio(g, id, { type: "build", tile }, i);
      }
    } else if (c.type === "build") {
      const kind = g.deeds[c.tile]?.level === 4 ? "hotel" : "house";
      const possible = activeAccounts(g).filter(
        (a) => a.cash > 0 && buildingChoices(g, a.id, kind).length,
      ).length;
      const stock = bankStock(g)[kind === "hotel" ? "hotels" : "houses"];
      if (stock > 0 && possible > stock) beginSupply(g, id, c.tile, i);
      else portfolio(g, id, c, i);
    } else portfolio(g, id, c, i);
  } else if (c.type === "settle" || c.type === "bankrupt") {
    assert(
      g.phase === "debt" && g.debt?.from === id,
      "No debt for this account",
    );
    const debt = g.debt;
    if (c.type === "settle") {
      assert(a.cash >= debt.amount, "Still insufficient cash");
      g.payments.unshift(debt);
    } else {
      assert(
        liquidationValue(g, id) < debt.amount,
        "Liquidate legal assets before bankruptcy",
      );
      bankrupt(g, id, debt.to, i);
    }
    drain(g, i);
  } else if (
    ["trade", "accept", "reject", "withdraw", "confirm", "object"].includes(
      c.type,
    )
  ) {
    assert(
      g.phase === "manage" && !g.auction && !g.debt,
      "Trading is available during management",
    );
    if (g.settings.teams && c.type !== "object") {
      const responseAccount = c.type === "trade" && !g.trade ? null : id;
      if (responseAccount)
        assert(
          representative(g, responseAccount)?.id === seat.id,
          "The designated connected team responder handles this offer",
        );
    }
    if (c.type === "trade") {
      assert(
        current(g).id === seat.id ||
          (g.trade?.to === id && g.trade.status === "offered"),
        "Only the current seat initiates trades; recipients may counter",
      );
      const other = account(g, c.to);
      assert(other.active && other.id !== id, "Choose an active counterparty");
      assert(
        !g.trade || (g.trade.to === id && g.trade.status === "offered"),
        "Another trade is pending",
      );
      validateSide(g, id, c.offer);
      validateSide(g, c.to, c.request);
      assert(
        c.offer.properties.length +
          c.request.properties.length +
          c.offer.cards.length +
          c.request.cards.length >
          0,
        "Pure cash gifts are not permitted",
      );
      g.trade = {
        id: c.id,
        from: id,
        to: c.to,
        offer: c.offer,
        request: c.request,
        status: "offered",
        due: i.now + 30000,
        confirmations: [],
        voters: [],
        objections: [],
      };
      g.due = Math.max(g.due, g.trade.due);
      log(g, i, `${a.name} proposes a trade to ${other.name}.`, "trade");
    } else {
      const t = g.trade;
      assert(t && "id" in c && t.id === c.id, "Offer expired or unavailable");
      if (c.type === "withdraw") {
        assert(t.from === id, "Only the proposer withdraws");
        g.trade = null;
        log(g, i, `${a.name} withdraws the offer.`, "trade");
      }
      if (c.type === "reject") {
        assert(t.to === id, "Only the recipient rejects");
        g.trade = null;
        log(g, i, `${a.name} declines the offer.`, "trade");
      }
      if (c.type === "accept") {
        assert(
          t.to === id && t.status === "offered",
          "Not your incoming offer",
        );
        const x = valuation(g, t.offer),
          y = valuation(g, t.request);
        if (Math.max(x, y) > 4 * Math.max(1, Math.min(x, y))) {
          t.status = "flagged";
          t.due = i.now + 10000;
          t.confirmations = [id];
          t.voters = [
            ...new Set(
              g.seats
                .filter(
                  (s) =>
                    s.active &&
                    s.connected &&
                    !s.bot &&
                    ![t.from, t.to].includes(accountId(g, s)),
                )
                .map((s) => (g.settings.teams ? accountId(g, s) : s.id)),
            ),
          ];
          log(
            g,
            i,
            "Unequal trade: both parties must confirm; uninvolved humans have 10 seconds to object.",
            "trade",
          );
        } else acceptTrade(g, i);
      }
      if (c.type === "confirm") {
        assert(
          t.status === "flagged" && [t.from, t.to].includes(id),
          "No confirmation due",
        );
        if (!t.confirmations.includes(id)) t.confirmations.push(id);
      }
      if (c.type === "object") {
        const voter = g.settings.teams ? id : seat.id;
        assert(
          t.status === "flagged" && t.voters.includes(voter) && !seat.bot,
          "Not eligible to object",
        );
        if (!t.objections.includes(voter)) t.objections.push(voter);
        if (t.objections.length > t.voters.length / 2) {
          g.trade = null;
          log(g, i, "Flagged trade cancelled by majority objection.", "trade");
        }
      }
    }
  } else if (c.type === "buildingResponse") {
    assert(
      g.phase === "supply" && g.supply && representative(g, id)?.id === seat.id,
      "Only the connected account representative responds",
    );
    supplyResponse(g, id, c.tile, i);
  } else if (c.type === "bid" || c.type === "pass") {
    assert(
      g.phase === "auction" &&
        auctionBidder(g) === id &&
        representative(g, id)?.id === seat.id,
      "Not your auction response",
    );
    const au = g.auction!;
    assert(!au.passed.includes(id), "You permanently passed");
    if (c.type === "bid") {
      assert(
        Number.isSafeInteger(c.amount) &&
          c.amount > au.bid &&
          c.amount <= a.cash,
        "Bid must raise by at least ₹1 within available cash",
      );
      au.bid = c.amount;
      au.leader = id;
      log(g, i, `${a.name} bids ${money(c.amount)}.`, "auction");
    } else {
      au.passed.push(id);
      log(g, i, `${a.name} passes.`, "auction");
    }
    advanceAuction(g, i);
  } else {
    assert(current(g).id === seat.id, "It is another seat’s turn");
    if (c.type === "roll") {
      assert(g.phase === "roll" || g.phase === "jail", "Roll unavailable");
      const jailed = seat.jail >= 0;
      g.dice = i.dice();
      assert(
        g.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6),
        "Invalid server dice",
      );
      const total = g.dice[0] + g.dice[1],
        double = g.dice[0] === g.dice[1];
      log(g, i, `${seat.name} rolls ${g.dice[0]} + ${g.dice[1]}.`, "dice");
      if (jailed) {
        g.extra = false;
        g.doubles = 0;
        if (double) {
          seat.jail = -1;
          move(g, total, i);
        } else {
          seat.jail++;
          if (seat.jail === 3) {
            seat.jail = -1;
            g.pendingMove = total;
            g.afterDebt = "move";
            charge(g, id, null, 50, "Final Jail release");
            drain(g, i);
          } else setPhase(g, "manage", i);
        }
      } else {
        g.doubles = double ? g.doubles + 1 : 0;
        g.extra = double;
        if (g.doubles === 3) jail(g, i);
        else move(g, total, i);
      }
    } else if (c.type === "jailPay") {
      assert(g.phase === "jail" && seat.jail >= 0, "Not in Jail");
      seat.jail = -1;
      g.afterDebt = "roll";
      charge(g, id, null, 50, "Jail release");
      drain(g, i);
    } else if (c.type === "jailCard") {
      assert(
        g.phase === "jail" && a.release.includes(c.card),
        "No held release card",
      );
      a.release = a.release.filter((x) => x !== c.card);
      returnCard(g, c.card);
      seat.jail = -1;
      setPhase(g, "roll", i);
      log(g, i, `${seat.name} uses a release card.`, "jail");
    } else if (c.type === "tax") {
      assert(g.phase === "tax", "No tax decision");
      const value =
        a.cash +
        holdings(g, id).reduce(
          (n, t) => n + t.price + g.deeds[t.id].level * t.build,
          0,
        );
      charge(
        g,
        id,
        null,
        c.method === "fixed" ? 200 : Math.ceil(value / 10),
        "Income Tax",
      );
      g.afterDebt = "manage";
      drain(g, i);
    } else if (c.type === "buy") {
      assert(g.phase === "buy", "No property decision");
      const tile = seat.position,
        t = board[tile];
      assert(
        g.deeds[tile].owner === null && a.cash >= t.price,
        "Property unavailable or unaffordable",
      );
      a.cash -= t.price;
      g.deeds[tile].owner = id;
      if (t.group !== undefined && ownsSet(g, id, t.group))
        log(g, i, `${a.name} completes a colour set.`, "set", {
          group: t.group,
        });
      log(g, i, `${a.name} buys ${t.name} for ${money(t.price)}.`, "purchase");
      setPhase(g, "manage", i);
    } else if (c.type === "decline") {
      assert(g.phase === "buy", "No property decision");
      if (g.settings.auctions) startAuction(g, seat.position, i);
      else setPhase(g, "manage", i);
    } else if (c.type === "buildingAuction") {
      assert(
        g.phase === "manage" && !g.trade,
        "Building requests only in management",
      );
      beginSupply(g, id, c.tile, i);
    } else if (c.type === "end") {
      assert(
        g.phase === "manage" && !g.trade,
        "Resolve decisions and trades first",
      );
      endTurn(g, i);
    } else throw new RuleError("Unknown action");
  }
  g.revision++;
  invariants(g);
  return g;
}
export function liquidationValue(g: Game, id: string) {
  return (
    account(g, id).cash +
    holdings(g, id).reduce(
      (n, t) =>
        n +
        (g.deeds[t.id].level * t.build) / 2 +
        (g.settings.mortgages && !g.deeds[t.id].mortgaged ? t.mortgage : 0),
      0,
    )
  );
}
function liquidate(g: Game, id: string, i: Inputs) {
  const a = account(g, id);
  for (let n = 0; n < 128 && g.debt && a.cash < g.debt.amount; n++) {
    const list = holdings(g, id);
    const sell = list.find((t) => canSell(g, id, t.id));
    if (sell) {
      portfolio(g, id, { type: "sell", tile: sell.id }, i);
      continue;
    }
    const hotel = list.find((t) => g.deeds[t.id].level === 5);
    if (hotel) {
      portfolio(g, id, { type: "sellGroup", group: hotel.group! }, i);
      continue;
    }
    const mortgage = list.find(
      (t) =>
        !g.deeds[t.id].mortgaged &&
        t.mortgage &&
        (t.group === undefined ||
          groupTiles(t.group).every((x) => g.deeds[x.id].level === 0)),
    );
    if (mortgage && g.settings.mortgages) {
      portfolio(g, id, { type: "mortgage", tile: mortgage.id }, i);
      continue;
    }
    break;
  }
}
function timeout(g: Game, i: Inputs) {
  if (g.trade && i.now >= g.trade.due) {
    const t = g.trade;
    if (
      t.status === "flagged" &&
      t.confirmations.includes(t.from) &&
      t.confirmations.includes(t.to) &&
      t.objections.length <= t.voters.length / 2
    ) {
      try {
        acceptTrade(g, i);
      } catch {
        g.trade = null;
        log(g, i, "Trade expired after assets changed.", "trade");
      }
    } else {
      g.trade = null;
      log(g, i, "Trade expired.", "trade");
    }
  }
  if (i.now < g.due || g.phase === "over") return;
  if (g.phase === "roll" || g.phase === "jail") {
    log(g, i, `${current(g).name} misses the roll deadline.`, "timeout");
    endTurn(g, i, true);
  } else if (g.phase === "buy") {
    if (g.settings.auctions) startAuction(g, current(g).position, i);
    else setPhase(g, "manage", i);
  } else if (g.phase === "supply") {
    supplyResponse(g, g.supply!.eligible[g.supply!.cursor], null, i);
  } else if (g.phase === "auction") {
    g.auction!.passed.push(auctionBidder(g)!);
    advanceAuction(g, i);
  } else if (g.phase === "tax") {
    charge(g, seatAccount(g, current(g)).id, null, 200, "Income Tax timeout");
    g.afterDebt = "manage";
    drain(g, i);
  } else if (g.phase === "debt") {
    const d = g.debt!;
    liquidate(g, d.from, i);
    if (account(g, d.from).cash >= d.amount) g.payments.unshift(d);
    else bankrupt(g, d.from, d.to, i);
    drain(g, i);
  } else {
    g.trade = null;
    endTurn(g, i, true);
  }
}
function forfeit(g: Game, target: string, i: Inputs) {
  const p = g.seats.find((s) => s.id === target);
  assert(p, "Seat unavailable");
  if (!p.active) return;
  const id = accountId(g, p);
  p.active = false;
  p.connected = false;
  const partner = g.seats.find(
    (s) => s.id !== p.id && s.active && accountId(g, s) === id,
  );
  if (!partner) {
    if (g.debt?.from === id) {
      const debt = g.debt;
      liquidate(g, id, i);
      if (account(g, id).cash >= debt.amount) {
        account(g, id).cash -= debt.amount;
        if (debt.to) account(g, debt.to).cash += debt.amount;
        log(
          g,
          i,
          `${account(g, id).name} settles ${money(debt.amount)} before forfeiting.`,
          "money",
        );
        bankrupt(g, id, null, i);
      } else bankrupt(g, id, debt.to, i);
      g.debt = null;
      drain(g, i);
    } else bankrupt(g, id, null, i);
  }
  if (g.auction) {
    const au = g.auction;
    if (!partner) {
      au.passed.push(id);
      if (au.leader === id) {
        au.leader = null;
        au.bid = 0;
      }
      if (auctionBidder(g) === id) advanceAuction(g, i);
    }
  }
  log(
    g,
    i,
    `${p.name} forfeits${partner ? "; teammate keeps the shared portfolio" : ""}.`,
    "forfeit",
  );
  if (g.debt?.from === id && partner) return;
  if (g.auctionQueue.length && !g.auction && !g.debt) {
    startAuction(g, g.auctionQueue.shift()!, i);
    return;
  }
  checkWinner(g, i);
  if (current(g).id === target && g.phase !== "over" && !g.debt && !g.auction)
    endTurn(g, i, true);
}
export function invariants(g: Game) {
  for (const a of g.accounts)
    assert(
      Number.isSafeInteger(a.cash) && a.cash >= 0,
      "Cash invariant violated",
    );
  const bank = bankStock(g);
  assert(bank.houses >= 0 && bank.hotels >= 0, "Building stock violated");
  for (const d of g.deeds) {
    assert(
      Number.isInteger(d.level) && d.level >= 0 && d.level <= 5,
      "Building level violated",
    );
    assert(
      !d.owner || g.accounts.some((a) => a.id === d.owner && a.active),
      "Inactive deed owner",
    );
    assert(!d.mortgaged || d.level === 0, "Mortgaged building");
  }
  if (g.settings.even)
    for (let group = 0; group < 8; group++) {
      const levels = groupTiles(group).map((t) => g.deeds[t.id].level);
      assert(Math.max(...levels) - Math.min(...levels) <= 1, "Uneven building");
    }
  const all = [
    ...g.chance,
    ...g.chest,
    ...g.accounts.flatMap((a) => a.release),
  ];
  assert(
    new Set(all).size === 32 && all.length === 32,
    "Card inventory invariant violated",
  );
}
export function publicGame(g: Game) {
  const { chance: _chance, chest: _chest, ...snapshot } = g;
  void _chance;
  void _chest;
  return snapshot;
}
export type PublicGame = ReturnType<typeof publicGame>;
