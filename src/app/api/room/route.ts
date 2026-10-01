import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { z } from "zod";
import { identitySchema } from "../../../lib/validation";
export const runtime = "nodejs";
const cookie = "imm_guest";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const random = () => randomBytes(32).toString("base64url");
function backend() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url || !process.env.SESSION_SIGNING_KEY)
    throw Error("Online backend is not configured");
  return new ConvexHttpClient(url);
}
const requestSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.enum(["create", "join"]),
    code: z.string().optional(),
    identity: identitySchema,
    spectator: z.boolean().default(false),
  }),
  z.object({
    op: z.literal("act"),
    key: z.string(),
    revision: z.number().int(),
    command: z.unknown(),
    lobby: z.boolean(),
  }),
  z.object({ op: z.enum(["heartbeat", "renew"]) }),
]);
export async function POST(req: NextRequest) {
  try {
    if (process.env.VERCEL_ENV === "preview")
      return NextResponse.json(
        { error: "Online mutations are disabled on branch previews." },
        { status: 403 },
      );
    if (process.env.VERCEL_ENV === "production" && !process.env.APP_ORIGIN)
      throw Error("Production origin is not configured");
    const expected = process.env.APP_ORIGIN || req.nextUrl.origin;
    if (req.headers.get("origin") !== expected)
      return NextResponse.json(
        { error: "Origin not allowed" },
        { status: 403 },
      );
    const body = await req.text();
    if (body.length > 12000)
      return NextResponse.json({ error: "Request too large" }, { status: 413 });
    const args = requestSchema.parse(JSON.parse(body));
    const db = backend();
    const jar = await cookies();
    const raw = jar.get(cookie)?.value;
    const gateway = process.env.SESSION_SIGNING_KEY!;
    if (args.op === "create" || args.op === "join") {
      const secret = random(),
        read = random();
      const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
      const code =
        args.op === "create"
          ? Array.from(
              randomBytes(10),
              (b) => alphabet[b % alphabet.length],
            ).join("")
          : (args.code || "").toUpperCase().replace(/\s/g, "");
      if (!/^[A-Z2-9]{10}$/.test(code))
        throw Error("Enter the 10-character invite code");
      const ip = hash(
        req.headers.get("x-vercel-forwarded-for")?.split(",")[0] ||
          req.headers.get("x-forwarded-for")?.split(",")[0] ||
          "local",
      );
      const result = await db.mutation(anyApi.rooms.enter, {
        gateway,
        ip,
        code,
        create: args.op === "create",
        secret: hash(secret),
        read,
        seat: randomUUID(),
        identity: args.identity,
        spectator: args.spectator,
      });
      jar.set(cookie, secret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 86400,
      });
      return NextResponse.json({ ...result, read });
    }
    if (!raw)
      return NextResponse.json({ error: "Seat unavailable" }, { status: 401 });
    const secret = hash(raw);
    if (args.op === "renew") {
      const result = await db.mutation(anyApi.rooms.renew, {
        gateway,
        secret,
        read: random(),
      });
      return NextResponse.json(result);
    }
    if (args.op === "heartbeat") {
      await db.mutation(anyApi.rooms.heartbeat, { gateway, secret });
      return NextResponse.json({ ok: true });
    }
    if (args.op !== "act") throw Error("Unknown request");
    const result = await db.mutation(anyApi.rooms.act, {
      gateway,
      secret,
      key: args.key,
      revision: args.revision,
      command: args.command,
      lobby: args.lobby,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    const cleaned =
      message.split("Uncaught Error: ").pop()?.split("\n")[0] ||
      "Request failed";
    return NextResponse.json({ error: cleaned }, { status: 400 });
  }
}
