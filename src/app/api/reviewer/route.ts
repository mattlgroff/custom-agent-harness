import { z } from "zod";
import {
  apiError,
  checkOperatorToken,
  grantReviewer,
  ownerId,
  requireSameOrigin,
} from "@/lib/auth";
import { DomainError } from "@/lib/store";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const input = z
      .object({ token: z.string().max(512) })
      .safeParse(await request.json());
    if (!input.success || !checkOperatorToken(input.data.token))
      throw new DomainError("Invalid reviewer token.", 403);
    await grantReviewer(await ownerId());
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
