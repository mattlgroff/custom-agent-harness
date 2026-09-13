import { z } from "zod";
import { apiError, isReviewer, ownerId, requireSameOrigin } from "@/lib/auth";
import { decide, DomainError } from "@/lib/store";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const owner = await ownerId();
    if (!(await isReviewer(owner)))
      throw new DomainError(
        "Only an authenticated human reviewer can decide proposals.",
        403,
      );
    const input = z
      .object({ caseId: z.uuid(), proposalId: z.uuid(), approved: z.boolean() })
      .safeParse(await request.json());
    if (!input.success) throw new DomainError("Invalid decision.", 400);
    return Response.json({
      receipt: await decide(
        input.data.caseId,
        owner,
        input.data.proposalId,
        input.data.approved,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
