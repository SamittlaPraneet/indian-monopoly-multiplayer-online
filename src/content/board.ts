export type TileKind =
  | "city"
  | "transport"
  | "utility"
  | "chance"
  | "chest"
  | "tax"
  | "go"
  | "jail"
  | "parking"
  | "goJail";
export interface Tile {
  id: number;
  name: string;
  fullName: string;
  kind: TileKind;
  group?: number;
  colour?: string;
  price: number;
  mortgage: number;
  build: number;
  rents: number[];
  landmark?: string;
}
const colours = [
  "#9d6547",
  "#55b6cf",
  "#cf6d9b",
  "#e79537",
  "#dd555c",
  "#d9b843",
  "#489a79",
  "#526cc6",
];
const rows: [number, string, string, number, number, number[], string][] = [
  [
    1,
    "Cherrapunji",
    "Cherrapunji, Meghalaya",
    60,
    50,
    [2, 10, 30, 90, 160, 250],
    "Waterfalls",
  ],
  [
    3,
    "Kavaratti",
    "Kavaratti, Lakshadweep",
    60,
    50,
    [4, 20, 60, 180, 320, 450],
    "Island lagoon",
  ],
  [
    6,
    "Srinagar",
    "Srinagar, Jammu & Kashmir",
    100,
    50,
    [6, 30, 90, 270, 400, 550],
    "Dal Lake",
  ],
  [
    8,
    "Amritsar",
    "Amritsar, Punjab",
    100,
    50,
    [6, 30, 90, 270, 400, 550],
    "Golden Temple skyline",
  ],
  [
    9,
    "Bhubaneswar",
    "Bhubaneswar, Odisha",
    120,
    50,
    [8, 40, 100, 300, 450, 600],
    "Temple skyline",
  ],
  [
    11,
    "Kochi",
    "Kochi, Kerala",
    140,
    100,
    [10, 50, 150, 450, 625, 750],
    "Chinese fishing nets",
  ],
  [
    13,
    "Jaipur",
    "Jaipur, Rajasthan",
    140,
    100,
    [10, 50, 150, 450, 625, 750],
    "Hawa Mahal",
  ],
  [
    14,
    "Lucknow",
    "Lucknow, Uttar Pradesh",
    160,
    100,
    [12, 60, 180, 500, 700, 900],
    "Bara Imambara",
  ],
  [
    16,
    "Visakhapatnam",
    "Visakhapatnam, Andhra Pradesh",
    180,
    100,
    [14, 70, 200, 550, 750, 950],
    "INS Kursura Submarine Museum",
  ],
  [
    18,
    "Indore",
    "Indore, Madhya Pradesh",
    180,
    100,
    [14, 70, 200, 550, 750, 950],
    "Rajwada",
  ],
  [
    19,
    "Nagpur",
    "Nagpur, Maharashtra",
    200,
    100,
    [16, 80, 220, 600, 800, 1000],
    "Deekshabhoomi",
  ],
  [
    21,
    "Ahmedabad",
    "Ahmedabad, Gujarat",
    220,
    150,
    [18, 90, 250, 700, 875, 1050],
    "Sabarmati riverfront",
  ],
  [
    23,
    "Chandigarh",
    "Chandigarh, India",
    220,
    150,
    [18, 90, 250, 700, 875, 1050],
    "Rock Garden",
  ],
  [
    24,
    "Pune",
    "Pune, Maharashtra",
    240,
    150,
    [20, 100, 300, 750, 925, 1100],
    "Shaniwar Wada",
  ],
  [
    26,
    "Chennai",
    "Chennai, Tamil Nadu",
    260,
    150,
    [22, 110, 330, 800, 975, 1150],
    "Marina Beach",
  ],
  [
    27,
    "Kolkata",
    "Kolkata, West Bengal",
    260,
    150,
    [22, 110, 330, 800, 975, 1150],
    "Howrah Bridge",
  ],
  [
    29,
    "Hyderabad",
    "Hyderabad, Telangana",
    280,
    150,
    [24, 120, 360, 850, 1025, 1200],
    "Charminar",
  ],
  [
    31,
    "Bengaluru",
    "Bengaluru, Karnataka",
    300,
    200,
    [26, 130, 390, 900, 1100, 1275],
    "Namma Metro",
  ],
  [
    32,
    "Gurugram",
    "Gurugram, Haryana",
    300,
    200,
    [26, 130, 390, 900, 1100, 1275],
    "City skyline",
  ],
  [
    34,
    "Delhi",
    "New Delhi, Delhi",
    320,
    200,
    [28, 150, 450, 1000, 1200, 1400],
    "India Gate",
  ],
  [
    37,
    "Goa",
    "Panaji, Goa",
    350,
    200,
    [35, 175, 500, 1100, 1300, 1500],
    "Mandovi waterfront",
  ],
  [
    39,
    "Mumbai",
    "Mumbai, Maharashtra",
    400,
    200,
    [50, 200, 600, 1400, 1700, 2000],
    "Gateway of India",
  ],
];
const groupFor = (id: number) =>
  id < 5
    ? 0
    : id < 10
      ? 1
      : id < 15
        ? 2
        : id < 20
          ? 3
          : id < 25
            ? 4
            : id < 30
              ? 5
              : id < 35
                ? 6
                : 7;
export const board: Tile[] = Array.from({ length: 40 }, (_, id) => ({
  id,
  name: "",
  fullName: "",
  kind: "parking",
  price: 0,
  mortgage: 0,
  build: 0,
  rents: [],
}));
for (const [id, name, fullName, price, build, rents, landmark] of rows) {
  const group = groupFor(id);
  board[id] = {
    id,
    name,
    fullName,
    kind: "city",
    group,
    colour: colours[group],
    price,
    mortgage: price / 2,
    build,
    rents,
    landmark,
  };
}
const specials: [number, string, TileKind, number][] = [
  [0, "GO", "go", 0],
  [2, "Community Chest", "chest", 0],
  [4, "Income Tax", "tax", 200],
  [5, "CSMT", "transport", 200],
  [7, "Chance", "chance", 0],
  [10, "Jail / Just Visiting", "jail", 0],
  [12, "BSNL", "utility", 150],
  [15, "Howrah Junction", "transport", 200],
  [17, "Community Chest", "chest", 0],
  [20, "Free Parking", "parking", 0],
  [22, "Chance", "chance", 0],
  [25, "Delhi Airport", "transport", 200],
  [28, "Cochin Port", "utility", 150],
  [30, "Go to Jail", "goJail", 0],
  [33, "Community Chest", "chest", 0],
  [35, "Bengaluru Airport", "transport", 200],
  [36, "Chance", "chance", 0],
  [38, "Luxury Tax", "tax", 100],
];
for (const [id, name, kind, price] of specials)
  board[id] = {
    id,
    name,
    fullName:
      id === 5
        ? "Chhatrapati Shivaji Maharaj Terminus"
        : id === 25
          ? "Indira Gandhi International Airport"
          : id === 35
            ? "Kempegowda International Airport"
            : id === 12
              ? "Bharat Sanchar Nigam Limited"
              : id === 28
                ? "Cochin Port Authority"
                : name,
    kind,
    price,
    mortgage: ["utility", "transport"].includes(kind) ? price / 2 : 0,
    build: 0,
    rents:
      kind === "transport"
        ? [25, 50, 100, 200]
        : kind === "utility"
          ? [4, 10]
          : [],
  };
export const alternativeTransportLabels = [
  "New Delhi Railway Station",
  "Chennai Central",
];
export const groupTiles = (group: number) =>
  board.filter((t) => t.group === group);
export const money = (n: number) => "₹" + n.toLocaleString("en-IN");
export const tokens = [
  "Car",
  "Retro car",
  "Motorcycle",
  "Scooter",
  "Auto-rickshaw",
  "Bicycle",
  "Bus",
  "Truck",
  "Train engine",
  "Passenger aeroplane",
  "Fighter jet",
  "Propeller plane",
  "Tank",
  "Warship",
  "Sailing ship",
  "Speedboat",
  "Helicopter",
  "Submarine",
  "Adventurer",
  "Robot",
] as const;
export const avatars = [
  "Sun",
  "Lotus",
  "Mountain",
  "Wave",
  "Comet",
  "Leaf",
  "Moon",
  "Kite",
];
export const seatColours = [
  "#ed7954",
  "#61b8ac",
  "#dec55b",
  "#a387d3",
  "#7da0db",
  "#cd7baf",
  "#8fb366",
  "#d4a280",
];
