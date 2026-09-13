import { z } from "zod";
import { apiError, ownerId, requireSameOrigin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createCase, DomainError } from "@/lib/store";
const bodySchema = z.object({
  scenario: z.enum(["damaged", "missing", "expired", "stock"]),
});
export async function GET() {
  try {
    const owner = await ownerId();
    return Response.json(
      (
        await db().query(
          "SELECT id,scenario,created_at FROM cases WHERE owner=$1 ORDER BY created_at DESC LIMIT 30",
          [owner],
        )
      ).rows,
    );
  } catch (error) {
    if (error instanceof DomainError && error.status === 401)
      return Response.json([]);
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = bodySchema.safeParse(await request.json());
    if (!input.success)
      throw new DomainError("Choose a valid demo scenario.", 400);
    const owner = await ownerId(true);
    return Response.json({ id: await createCase(owner, input.data.scenario) });
  } catch (error) {
    return apiError(error);
  }
}
