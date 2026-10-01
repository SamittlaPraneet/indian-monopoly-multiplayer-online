import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    data: v.any(),
    expires: v.number(),
    timer: v.optional(v.id("_scheduled_functions")),
  }).index("code", ["code"]),
  sessions: defineTable({
    room: v.id("rooms"),
    seat: v.string(),
    secret: v.string(),
    read: v.string(),
    readExpiry: v.number(),
    expires: v.number(),
    revoked: v.boolean(),
    spectator: v.boolean(),
    name: v.string(),
  })
    .index("secret", ["secret"])
    .index("read", ["read"])
    .index("room", ["room"]),
  commands: defineTable({
    room: v.id("rooms"),
    seat: v.string(),
    key: v.string(),
    revision: v.number(),
  })
    .index("command", ["room", "seat", "key"])
    .index("room", ["room"]),
  limits: defineTable({
    key: v.string(),
    window: v.number(),
    count: v.number(),
  }).index("key", ["key"]),
});
