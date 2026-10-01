import { z } from "zod";
const amount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const tile = z.number().int().min(0).max(39);
const side = z
  .object({
    cash: amount,
    properties: z.array(tile).max(28),
    cards: z.array(z.string().max(8)).max(2),
    redeem: z.array(tile).max(28),
  })
  .strict();
const simple = [
  "roll",
  "jailPay",
  "buy",
  "decline",
  "pass",
  "end",
  "settle",
  "bankrupt",
] as const;
export const commandSchema = z.union([
  z
    .object({ type: z.literal("buildingResponse"), tile: tile.nullable() })
    .strict(),
  z
    .object({
      type: z.literal("buildMany"),
      tiles: z.array(tile).min(1).max(16),
    })
    .strict(),
  ...simple.map((type) => z.object({ type: z.literal(type) }).strict()),
  z.object({ type: z.literal("jailCard"), card: z.string().max(8) }).strict(),
  z
    .object({ type: z.literal("tax"), method: z.enum(["fixed", "percent"]) })
    .strict(),
  z.object({ type: z.literal("bid"), amount }).strict(),
  z
    .object({ type: z.enum(["build", "sell", "mortgage", "unmortgage"]), tile })
    .strict(),
  z
    .object({
      type: z.literal("sellGroup"),
      group: z.number().int().min(0).max(7),
    })
    .strict(),
  z
    .object({
      type: z.literal("buildingAuction"),
      tile,
    })
    .strict(),
  z
    .object({
      type: z.literal("trade"),
      id: z.string().min(1).max(64),
      to: z.string().max(64),
      offer: side,
      request: side,
    })
    .strict(),
  z
    .object({
      type: z.enum(["accept", "reject", "withdraw", "confirm", "object"]),
      id: z.string().min(1).max(64),
    })
    .strict(),
]);
export const identitySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(24)
      .regex(
        /^[\p{L}\p{N} ._'’-]+$/u,
        "Use letters, numbers, spaces or simple punctuation",
      ),
    token: z.number().int().min(0).max(19),
    avatar: z.number().int().min(0).max(7),
    variant: z.enum(["icon", "shaded", "model"]),
    team: z.number().int().min(0).max(3),
  })
  .strict();
export const settingsSchema = z
  .object({
    preset: z.enum(["Classic", "Fast"]),
    cash: z.number().int().min(500).max(5000),
    capacity: z.number().int().min(2).max(8),
    teams: z.boolean(),
    auctions: z.boolean(),
    mortgages: z.boolean(),
    even: z.boolean(),
    fasterBuilding: z.boolean(),
    rollSeconds: z.union([z.literal(20), z.literal(30), z.literal(60)]),
    view: z.enum(["flat", "hybrid", "3d"]),
    rounds: z.number().int().min(5).max(20),
  })
  .strict();
export const lobbySchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("botConfig"),
      target: z.string().max(64),
      difficulty: z.enum(["Easy", "Normal", "Hard", "Expert"]),
      team: z.number().int().min(0).max(3),
    })
    .strict(),
  z.object({ type: z.literal("identity"), identity: identitySchema }).strict(),
  z.object({ type: z.literal("settings"), settings: settingsSchema }).strict(),
  z.object({ type: z.literal("ready"), ready: z.boolean() }).strict(),
  z
    .object({
      type: z.literal("addBot"),
      difficulty: z.enum(["Easy", "Normal", "Hard", "Expert"]),
    })
    .strict(),
  z
    .object({ type: z.literal("removeBot"), target: z.string().max(64) })
    .strict(),
  z.object({ type: z.literal("start") }).strict(),
  z.object({ type: z.literal("reset") }).strict(),
  z.object({ type: z.literal("leave") }).strict(),
  z
    .object({
      type: z.literal("vote"),
      target: z.string().max(64),
      reason: z.string().trim().min(1).max(100),
    })
    .strict(),
  z.object({ type: z.literal("voteYes"), id: z.string().max(64) }).strict(),
  z
    .object({
      type: z.literal("chat"),
      text: z.string().trim().min(1).max(280),
    })
    .strict(),
]);
