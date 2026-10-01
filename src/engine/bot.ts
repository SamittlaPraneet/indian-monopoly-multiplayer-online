import { board, groupTiles } from "../content/board";
import {
  account,
  representative,
  buildingChoices,
  accountId,
  auctionBidder,
  canSell,
  canBuild,
  current,
  holdings,
  liquidationValue,
  ownsSet,
  seatAccount,
  transferCost,
} from "./game";
import { Command, Difficulty, Game, Seat } from "./types";
const strategy: Record<
  Difficulty,
  { reserve: number; premium: number; houses: number }
> = {
  Easy: { reserve: 250, premium: 0.85, houses: 1 },
  Normal: { reserve: 180, premium: 1.05, houses: 2 },
  Hard: { reserve: 140, premium: 1.3, houses: 3 },
  Expert: { reserve: 100, premium: 1.5, houses: 5 },
};
export function botSeat(g: Game): Seat | undefined {
  let id: string | undefined;
  if (g.trade)
    id =
      g.trade.status === "flagged"
        ? [g.trade.from, g.trade.to].find(
            (id) => !g.trade!.confirmations.includes(id),
          )
        : g.trade.to;
  else if (g.phase === "supply") id = g.supply?.eligible[g.supply.cursor];
  else if (g.phase === "debt") id = g.debt?.from;
  else if (g.phase === "auction") id = auctionBidder(g) || undefined;
  else return current(g).bot ? current(g) : undefined;
  const seat = id ? representative(g, id) : undefined;
  return seat?.bot ? seat : undefined;
}
export function botCommand(g: Game, s: Seat): Command {
  const id = accountId(g, s),
    a = account(g, id),
    base = strategy[s.bot || "Normal"];
  const advanced = s.bot === "Hard" || s.bot === "Expert";
  const exposure = advanced
    ? Math.max(
        0,
        ...board
          .filter(
            (t) =>
              g.deeds[t.id].owner &&
              g.deeds[t.id].owner !== id &&
              !g.deeds[t.id].mortgaged,
          )
          .map((t) => t.rents[g.deeds[t.id].level] ?? 0),
      )
    : 0;
  const finalRound =
    g.settings.preset === "Fast" && g.round === g.settings.rounds;
  const cfg = {
    ...base,
    reserve: base.reserve + Math.min(450, Math.ceil(exposure / 3)),
    houses: finalRound && advanced ? 0 : base.houses,
  };
  if (g.trade) {
    const t = g.trade;
    if (t.status === "flagged") return { type: "confirm", id: t.id };
    const received =
      t.request.properties.reduce((n, t) => n + board[t].price, 0) +
      t.request.cash +
      t.request.cards.length * 40;
    const offered =
      t.offer.properties.reduce((n, t) => n + board[t].price, 0) +
      t.offer.cash +
      t.offer.cards.length * 40;
    return {
      type:
        offered >= received * cfg.premium &&
        a.cash >= t.request.cash + transferCost(g, t.offer)
          ? "accept"
          : "reject",
      id: t.id,
    };
  }
  if (g.phase === "supply") {
    const tile = buildingChoices(g, id, g.supply!.kind).find(
      (t) => a.cash > t.build + cfg.reserve && g.deeds[t.id].level < cfg.houses,
    );
    return { type: "buildingResponse", tile: tile?.id ?? null };
  }
  if (g.phase === "roll") return { type: "roll" };
  if (g.phase === "jail") {
    if (a.release.length) return { type: "jailCard", card: a.release[0] };
    if (g.round < 4 && a.cash > cfg.reserve + 50) return { type: "jailPay" };
    return { type: "roll" };
  }
  if (g.phase === "buy") {
    const t = board[current(g).position];
    const nearSet =
      t.group !== undefined &&
      groupTiles(t.group).filter((t) => g.deeds[t.id].owner === id).length >=
        groupTiles(t.group).length - 1;
    return {
      type: a.cash >= t.price + (nearSet ? 0 : cfg.reserve) ? "buy" : "decline",
    };
  }
  if (g.phase === "tax")
    return {
      type: "tax",
      method:
        a.cash +
          holdings(g, id).reduce(
            (n, t) => n + t.price + g.deeds[t.id].level * t.build,
            0,
          ) <
        2000
          ? "percent"
          : "fixed",
    };
  if (g.phase === "auction") {
    const au = g.auction!,
      tile = au.kind === "property" ? au.tile : au.placements[id],
      t = board[tile];
    let max = (au.kind === "property" ? t.price : t.build) * cfg.premium;
    const set = t.group !== undefined ? groupTiles(t.group) : [];
    if (
      set.length &&
      set.filter((t) => g.deeds[t.id].owner === id).length === set.length - 1
    )
      max *= 1.6;
    if (s.bot === "Hard" || s.bot === "Expert") {
      const rival = g.accounts.some(
        (a) =>
          a.id !== id &&
          a.active &&
          set.filter((t) => g.deeds[t.id].owner === a.id).length ===
            set.length - 1,
      );
      if (rival) max *= 1.2;
    }
    max = Math.min(Math.floor(max), Math.max(0, a.cash - cfg.reserve / 2));
    const bid = au.bid + Math.min(10, Math.max(1, Math.floor(t.price / 20)));
    return bid <= max ? { type: "bid", amount: bid } : { type: "pass" };
  }
  if (g.phase === "debt") {
    if (a.cash >= g.debt!.amount) return { type: "settle" };
    const sorted = holdings(g, id).sort(
      (x, y) =>
        board[x.id].rents[g.deeds[x.id].level] / Math.max(1, x.build) -
        board[y.id].rents[g.deeds[y.id].level] / Math.max(1, y.build),
    );
    const sell = sorted.find((t) => canSell(g, id, t.id));
    if (sell) return { type: "sell", tile: sell.id };
    const hotel = sorted.find((t) => g.deeds[t.id].level === 5);
    if (hotel) return { type: "sellGroup", group: hotel.group! };
    const mortgage = sorted.find(
      (t) =>
        !g.deeds[t.id].mortgaged &&
        (t.group === undefined ||
          groupTiles(t.group).every((t) => !g.deeds[t.id].level)),
    );
    if (mortgage && g.settings.mortgages)
      return { type: "mortgage", tile: mortgage.id };
    if (liquidationValue(g, id) < g.debt!.amount) return { type: "bankrupt" };
    return { type: "settle" };
  }
  if (g.phase === "manage") {
    const list = holdings(g, id);
    const redeem = list.find(
      (t) =>
        g.deeds[t.id].mortgaged &&
        a.cash > Math.ceil((t.mortgage * 110) / 100) + cfg.reserve * 2,
    );
    if (redeem && g.settings.mortgages)
      return { type: "unmortgage", tile: redeem.id };
    const build = list
      .filter(
        (t) =>
          t.kind === "city" &&
          ownsSet(g, id, t.group!) &&
          groupTiles(t.group!).every((t) => !g.deeds[t.id].mortgaged) &&
          g.deeds[t.id].level < cfg.houses &&
          a.cash > t.build + cfg.reserve &&
          (!g.settings.even ||
            g.deeds[t.id].level ===
              Math.min(
                ...groupTiles(t.group!).map((t) => g.deeds[t.id].level),
              )) &&
          canBuild(g, id, t.id),
      )
      .sort(
        (x, y) =>
          (y.rents[g.deeds[y.id].level + 1] - y.rents[g.deeds[y.id].level]) /
            y.build -
          (x.rents[g.deeds[x.id].level + 1] - x.rents[g.deeds[x.id].level]) /
            x.build,
      )[0];
    if (build) return { type: "build", tile: build.id };
    return { type: "end" };
  }
  return { type: "end" };
}
export function botFallback(g: Game, s: Seat): Command {
  if (g.trade) return { type: "reject", id: g.trade.id };
  if (g.phase === "auction") return { type: "pass" };
  if (g.phase === "supply") return { type: "buildingResponse", tile: null };
  if (g.phase === "buy") return { type: "decline" };
  if (g.phase === "debt")
    return {
      type: seatAccount(g, s).cash >= g.debt!.amount ? "settle" : "bankrupt",
    };
  if (g.phase === "tax") return { type: "tax", method: "fixed" };
  return g.phase === "roll" || g.phase === "jail"
    ? { type: "roll" }
    : { type: "end" };
}
