import { createAgentUIStreamResponse, type UIMessage } from "ai";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { apiError, ownerId, requireSameOrigin } from "@/lib/auth";
import { createSupportAgent } from "@/lib/agent";
import { modelConfiguration } from "@/lib/model";
import {
  addEvent,
  beginRun,
  DomainError,
  finishRun,
  getCase,
} from "@/lib/store";

export const runtime = "nodejs";
const inputSchema = z.object({
  id: z.uuid(),
  messages: z
    .array(
      z.object({
        id: z.string().min(1).max(100),
        role: z.string(),
        parts: z.array(z.unknown()),
      }),
    )
    .min(1)
    .max(80),
});
export async function POST(request: Request) {
  let run: { id: string; token: string } | undefined;
  try {
    requireSameOrigin(request);
    const { apiKey } = modelConfiguration();
    if (!apiKey || apiKey.startsWith("replace-"))
      throw new DomainError(
        "Add the selected provider key to .env.local to run the agent.",
        503,
      );
    const raw = await request.text();
    if (raw.length > 100_000)
      throw new DomainError("Message payload is too large.", 413);
    const input = inputSchema.safeParse(JSON.parse(raw));
    if (!input.success) throw new DomainError("Invalid chat request.", 400);
    const { id, messages } = input.data;
    const latest = messages.at(-1)!;
    if (latest.role !== "user")
      throw new DomainError("Only new user messages are accepted.", 400);
    const parts = z
      .array(z.object({ type: z.literal("text"), text: z.string().max(2000) }))
      .min(1)
      .max(1)
      .safeParse(latest.parts);
    if (!parts.success || !parts.data[0].text.trim())
      throw new DomainError(
        "Send one text message of up to 2,000 characters.",
        400,
      );
    const owner = await ownerId();
    const record = await getCase(id, owner);
    if (record.messages.length >= 40)
      throw new DomainError(
        "This demo case has reached its conversation limit. Start a new case.",
      );
    // Ignore all client-supplied history and role/approval claims. Persisted history is authoritative.
    const message: UIMessage = {
      id: latest.id,
      role: "user",
      parts: parts.data,
    };
    const started = await beginRun(id, owner, message);
    run = { id, token: started.token };
    const token = started.token;
    const agent = createSupportAgent(id, owner, token);
    return await createAgentUIStreamResponse({
      agent,
      uiMessages: started.record.messages,
      generateMessageId: randomUUID,
      timeout: 90_000,
      sendReasoning: false,
      onStepEnd: async ({ usage, toolCalls }) => {
        await addEvent(id, "agent_step", {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          tools: toolCalls.map((t) => t.toolName),
        });
      },
      onFinish: async ({ messages: finished }) => {
        await finishRun(id, token, finished);
      },
      onError: () =>
        "The model request failed or timed out. Check your provider configuration and model access, then reload the case. Saved proposals and receipts are unchanged.",
      consumeSseStream: async ({ stream }) => {
        const reader = stream.getReader();
        try {
          while (!(await reader.read()).done) {
            /* Finish persistence even when the browser disconnects. */
          }
        } finally {
          reader.releaseLock();
          await finishRun(id, token);
        }
      },
    });
  } catch (error) {
    if (run) await finishRun(run.id, run.token);
    return apiError(error);
  }
}
