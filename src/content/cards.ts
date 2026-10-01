export type Effect =
  | { kind: "move"; to: number; salary?: boolean }
  | { kind: "nearest"; type: "transport" | "utility" }
  | { kind: "back"; steps: number }
  | { kind: "money"; amount: number }
  | { kind: "each"; amount: number }
  | { kind: "repairs"; house: number; hotel: number }
  | { kind: "jail" }
  | { kind: "release" };
export interface Card {
  id: string;
  text: string;
  detail: string;
  effect: Effect;
}
const c = (id: string, text: string, detail: string, effect: Effect): Card => ({
  id,
  text,
  detail,
  effect,
});
export const chance: Card[] = [
  c("c0", "Your UPI cashback finally arrived.", "Collect ₹50.", {
    kind: "money",
    amount: 50,
  }),
  c(
    "c1",
    "The cousins chose you as wedding transport coordinator.",
    "Pay ₹15.",
    { kind: "money", amount: -15 },
  ),
  c(
    "c2",
    "Your startup gets a second chance. Start at GO.",
    "Advance to GO; collect ₹200.",
    { kind: "move", to: 0 },
  ),
  c(
    "c3",
    "Gateway of India is calling. Pack light.",
    "Advance to Mumbai; collect ₹200 if passing GO.",
    { kind: "move", to: 39 },
  ),
  c(
    "c4",
    "A meeting near Charminar comes with excellent snacks.",
    "Advance to Hyderabad; collect ₹200 if passing GO.",
    { kind: "move", to: 29 },
  ),
  c(
    "c5",
    "A family invitation takes you to Kochi.",
    "Advance to Kochi; collect ₹200 if passing GO.",
    { kind: "move", to: 11 },
  ),
  c(
    "c6",
    "Last-minute travel: the fare has opinions.",
    "Nearest transport. Pay twice the normal rent if owned.",
    { kind: "nearest", type: "transport" },
  ),
  c(
    "c7",
    "Cricket tickets booked. Now catch the connection.",
    "Nearest transport. Pay twice the normal rent if owned.",
    { kind: "nearest", type: "transport" },
  ),
  c(
    "c8",
    "The society needs a new connection.",
    "Nearest utility. If owned, roll and pay 10× the total.",
    { kind: "nearest", type: "utility" },
  ),
  c("c9", "Your suitcase went the other way.", "Move back 3 spaces.", {
    kind: "back",
    steps: 3,
  }),
  c(
    "c10",
    "That parking shortcut was not a shortcut.",
    "Go directly to Jail. No GO salary.",
    { kind: "jail" },
  ),
  c(
    "c11",
    "A friendly advocate sorts the paperwork.",
    "Keep this Jail release card until used or traded.",
    { kind: "release" },
  ),
  c(
    "c12",
    "Monsoon maintenance is due.",
    "Pay ₹25 per house and ₹100 per hotel.",
    { kind: "repairs", house: 25, hotel: 100 },
  ),
  c(
    "c13",
    "You volunteered to sponsor the cricket team.",
    "Pay each other account ₹50.",
    { kind: "each", amount: -50 },
  ),
  c("c14", "Your festival hamper business pays a dividend.", "Collect ₹150.", {
    kind: "money",
    amount: 150,
  }),
  c(
    "c15",
    "Your train departs from a rather grand station.",
    "Advance to CSMT; collect ₹200 if passing GO.",
    { kind: "move", to: 5 },
  ),
];
export const chest: Card[] = [
  c("h0", "The bank corrected a tiny typo in your favour.", "Collect ₹200.", {
    kind: "money",
    amount: 200,
  }),
  c("h1", "Your annual health check is due.", "Pay ₹50.", {
    kind: "money",
    amount: -50,
  }),
  c("h2", "Diwali orders made your little shop shine.", "Collect ₹100.", {
    kind: "money",
    amount: 100,
  }),
  c("h3", "Your Holi photos won the society contest.", "Collect ₹10.", {
    kind: "money",
    amount: 10,
  }),
  c("h4", "Christmas baking brought a happy surplus.", "Collect ₹20.", {
    kind: "money",
    amount: 20,
  }),
  c("h5", "Onam catering turned a tidy profit.", "Collect ₹25.", {
    kind: "money",
    amount: 25,
  }),
  c("h6", "An Eid gift from family arrives.", "Collect ₹100.", {
    kind: "money",
    amount: 100,
  }),
  c("h7", "Your Vaisakhi stall had a busy afternoon.", "Collect ₹100.", {
    kind: "money",
    amount: 100,
  }),
  c("h8", "The school fundraiser needs your contribution.", "Pay ₹50.", {
    kind: "money",
    amount: -50,
  }),
  c("h9", "The household subscription renewed itself.", "Pay ₹100.", {
    kind: "money",
    amount: -100,
  }),
  c(
    "h10",
    "Happy birthday! The group remembered this time.",
    "Collect ₹10 from each other account.",
    { kind: "each", amount: 10 },
  ),
  c("h11", "Your insurance refund clears.", "Collect ₹100.", {
    kind: "money",
    amount: 100,
  }),
  c(
    "h12",
    "Society maintenance found your buildings.",
    "Pay ₹40 per house and ₹115 per hotel.",
    { kind: "repairs", house: 40, hotel: 115 },
  ),
  c(
    "h13",
    "The paperwork gives you a clean start.",
    "Advance to GO; collect ₹200.",
    { kind: "move", to: 0 },
  ),
  c(
    "h14",
    "You kept the helpful legal contact.",
    "Keep this Jail release card until used or traded.",
    { kind: "release" },
  ),
  c(
    "h15",
    "An administrative mix-up needs sorting.",
    "Go directly to Jail. No GO salary.",
    { kind: "jail" },
  ),
];
export const cards = [...chance, ...chest];
