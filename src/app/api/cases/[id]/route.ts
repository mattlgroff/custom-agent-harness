import { z } from "zod";
import { apiError, isReviewer, ownerId } from "@/lib/auth";
import { caseView, DomainError } from "@/lib/store";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new DomainError("Invalid case.", 400);
    const owner = await ownerId();
    return Response.json({
      ...(await caseView(id, owner)),
      reviewer: await isReviewer(owner),
    });
  } catch (error) {
    return apiError(error);
  }
}
