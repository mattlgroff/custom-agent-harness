import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createSupportAgent } from "../src/lib/agent";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("sends medium reasoning and the Bedrock model ID on the wire without approval authority", async () => {
  vi.stubEnv("AI_PROVIDER", "bedrock");
  vi.stubEnv("BEDROCK_REGION", "us-east-2");
  vi.stubEnv("BEDROCK_API_KEY", "test-key-not-real");
  let captured: unknown;
  let destination = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      destination = String(url);
      captured = JSON.parse(String(init.body));
      return Response.json({
        id: "resp_test",
        object: "response",
        created_at: 1,
        model: "openai.gpt-5.6-sol",
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [
          {
            type: "message",
            id: "msg_test",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "OK", annotations: [] }],
          },
        ],
        usage: {
          input_tokens: 2,
          output_tokens: 1,
          total_tokens: 3,
          input_tokens_details: { cached_tokens: 0 },
          output_tokens_details: { reasoning_tokens: 0 },
        },
      });
    }),
  );
  const agent = createSupportAgent("test-case", "test-owner", "test-run");
  const result = await agent.generate({ prompt: "Say OK." });
  expect(result.text).toBe("OK");
  const sent = z
    .object({
      model: z.string(),
      reasoning: z.object({ effort: z.string() }),
      store: z.boolean(),
      tools: z.array(z.object({ name: z.string() })),
    })
    .parse(captured);
  expect(sent.reasoning.effort).toBe("medium");
  expect(sent.model).toBe("openai.gpt-5.6-sol");
  expect(sent.store).toBe(false);
  expect(destination).toBe(
    "https://bedrock-mantle.us-east-2.api.aws/openai/v1/responses",
  );
  expect(sent.tools.map((t) => t.name)).toEqual([
    "lookupOrder",
    "readPolicy",
    "checkStock",
    "proposeReplacement",
    "checkResolution",
  ]);
});
