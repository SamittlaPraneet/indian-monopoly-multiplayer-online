export default function Rules() {
  return (
    <article className="rules">
      <h2>How to Play</h2>
      <p>
        Travel around India, buy cities, collect automatic rent and develop full
        colour groups. The rupee amounts are game values. Classic ends when one
        player or team remains solvent.
      </p>
      <h3>Your turn</h3>
      <p>
        Roll two dice, resolve the landing, then manage your portfolio and end
        your turn. Doubles earn another roll; three consecutive doubles send you
        directly to Jail. Passing or landing on GO pays ₹200. Free Parking is
        neutral.
      </p>
      <h3>Property & buildings</h3>
      <p>
        Declining an unowned deed starts an auction when enabled. Everyone,
        including the declining player, may bid; permanently passing ends your
        participation. Each response has 6 seconds. Own the complete colour
        group to build. Build and sell evenly unless the host disables this
        rule. There are 32 houses and 12 hotels. A hotel needs four houses on
        every deed in its group; its upgrade returns four houses to the bank.
        Hotel breakdown needs four available bank houses. You may sell all
        buildings in the group at half cost if breakdown is impossible.
      </p>
      <p>
        Rent on undeveloped complete sets doubles, including unmortgaged deeds
        in a partly mortgaged set. No rent on the mortgaged deed itself.
        Transports charge ₹25/50/100/200 for 1/2/3/4 holdings. Utilities charge
        4× or 10× the dice total for one or two holdings.
      </p>
      <h3>Jail, taxes & debt</h3>
      <p>
        Pay ₹50 before rolling, use a held release card, or try doubles up to
        three turns. Jail doubles release you without an extra roll. The third
        failed roll requires ₹50, then moves by that roll after payment. Income
        Tax offers ₹200 or 10% of cash plus deed purchase values and full
        building costs, rounded up. Choose before seeing the calculated
        percentage. Luxury Tax costs ₹100.
      </p>
      <p>
        Debt cannot be skipped. Sell buildings, mortgage eligible deeds, or
        settle. The 60-second deadline liquidates legally, then bankrupts the
        account if necessary. Mortgage redemption costs principal plus 10%. A
        mortgage received in a trade requires immediate 10% interest, or
        principal plus 10% if redeemed immediately. Deferred redemption pays
        another 10%. Bankruptcy to another account transfers cash, deeds and
        cards after buildings are sold; bankruptcy to the bank returns cards and
        auctions deeds.
      </p>
      <h3>Trading & fairness</h3>
      <p>
        Negotiate cash, undeveloped deeds, mortgaged deeds and held release
        cards. No pure cash gifts or loans. Assets and cash are checked again
        atomically on acceptance. Estimated imbalance above 4:1 requires both
        parties to confirm and opens a 10-second objection window. A strict
        majority of eligible uninvolved humans can cancel it. This is a custom
        fairness extension and cannot prevent friends coordinating outside the
        game.
      </p>
      <h3>Teams</h3>
      <p>
        2–4 teams of exactly two seats share cash, deeds and release cards.
        Starting cash is doubled per team. Each seat keeps its own token, Jail
        state and turn. Team holdings determine sets and rent; teammates pay no
        rent to their own account. If one forfeits, the partner continues with
        all team assets. Shared insolvency eliminates the team. The
        earliest-joined active seat is the designated trade responder, with the
        next connected teammate as fallback.
      </p>
      <h3>Fast scoring</h3>
      <p>
        Fast ends after complete rounds with equal scheduled turn opportunities.
        Net worth is cash plus deed purchase prices, minus mortgage principal on
        mortgaged deeds, plus half of all building investment. A hotel counts as
        five building purchases. Release cards have no score. Ties compare cash,
        then total deed purchase value, then declare a shared win. This is
        game-specific scoring.
      </p>
      <h3>Rooms & disconnects</h3>
      <p>
        Invitation holders can enter the lobby or spectate after start. Refresh
        reconnects this browser to its seat; copying a name or invite cannot
        reclaim another seat. If disconnected, you get 120 seconds of grace then
        a final 60 seconds before forfeit. Decision deadlines keep running.
        Missing a roll skips it; owed money remains due. Host duties transfer
        after 30 seconds of absence. Humans require a strict-majority kick vote;
        bots may be removed by the host in the lobby. A live reset needs a
        majority vote.
      </p>
      <p>
        Active rooms expire after 24 hours, abandoned empty rooms after 10
        minutes, and finished games after 30 minutes. There is no saved-game
        library. Local pass-and-play runs in this tab and ends when it is
        closed.
      </p>
      <p className="muted">
        Baseline: Hasbro / Parker Brothers 40009-I-Rev 2. Timers, automatic
        rent, teams, fairness voting and Fast mode are extensions. Unofficial
        personal property-trading game. Not affiliated with or endorsed by
        Hasbro or Monopoly.
      </p>
    </article>
  );
}
