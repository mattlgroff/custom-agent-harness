import { cookies } from "next/headers";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { DomainError } from "./store";

export async function ownerId(create = false) {
  const jar = await cookies();
  const existing = jar.get("parcel_session")?.value;
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  if (!create) throw new DomainError("Start a demo case first.", 401);
  const owner = randomBytes(32).toString("hex");
  jar.set("parcel_session", owner, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 604800,
  });
  return owner;
}
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next.js can normalize Request.url to an internal hostname. Use the incoming Host.
  const host = request.headers.get("host");
  if (
    !origin ||
    new URL(origin).host !== host ||
    new URL(origin).protocol !== new URL(request.url).protocol
  )
    throw new DomainError("A same-origin request is required.", 403);
}
export function checkOperatorToken(token: string) {
  const expected = process.env.OPERATOR_TOKEN;
  if (!expected || expected.length < 24 || token.length > 512) return false;
  return timingSafeEqual(
    createHash("sha256").update(token).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
function reviewerSignature(owner: string) {
  return createHmac("sha256", process.env.OPERATOR_TOKEN!)
    .update(`${owner}:reviewer`)
    .digest("hex");
}
export async function isReviewer(owner: string) {
  if (!process.env.OPERATOR_TOKEN || process.env.OPERATOR_TOKEN.length < 24)
    return false;
  const token = (await cookies()).get("parcel_reviewer")?.value;
  return token === reviewerSignature(owner);
}
export async function grantReviewer(owner: string) {
  (await cookies()).set("parcel_reviewer", reviewerSignature(owner), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 3600,
  });
}
export function apiError(error: unknown) {
  if (error instanceof SyntaxError)
    return Response.json({ error: "Invalid JSON request." }, { status: 400 });
  if (error instanceof DomainError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Application request failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error:
        "The request failed. Check that PostgreSQL is running and migrations have completed.",
    },
    { status: 500 },
  );
}
