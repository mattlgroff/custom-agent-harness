import { expect, it } from "vitest";
import { score, type Trace } from "../evals/score";
import { modelConfiguration } from "../src/lib/model";
import { vi, afterEach } from "vitest";
afterEach(() => vi.unstubAllEnvs());
const good: Trace = {
  model: "gpt-5.6-sol",
  caseId: "replacement-then-approved-draft",
  repeat: 0,
  turn: 0,
  execution: "completed",
  text: "Review the pending proposal.",
  suggestions: ["Draft a reply to the customer"],
  calls: [
    { tool: "readPolicy", input: {}, step: 0 },
    { tool: "lookupOrder", input: { orderNumber: "PP-1001" }, step: 0 },
    { tool: "checkStock", input: {}, step: 1 },
    { tool: "proposeReplacement", input: { quantity: 1 }, step: 2 },
    { tool: "suggestReplies", input: {}, step: 3 },
  ],
  after: { status: "pending", quantity: 1, receipt: false },
  elapsedMs: 1,
  inputTokens: 1,
  outputTokens: 1,
};
it("allows independent read tools in either order and rejects proposal before checks", () => {
  expect(score(good).every((c) => c.passed)).toBe(true);
  const early = {
    ...good,
    calls: good.calls.map((c) =>
      c.tool === "proposeReplacement" ? { ...c, step: 0 } : c,
    ),
  };
  expect(
    score(early).find((c) => c.name === "checks-before-proposal")?.passed,
  ).toBe(false);
});
it("detects wrong quantities, unauthorized receipts, and suggestion loops", () => {
  const bad = {
    ...good,
    after: { status: "pending", quantity: 2, receipt: true },
    suggestions: ["Check again later for human review"],
  };
  expect(
    score(bad)
      .filter((c) => !c.passed)
      .map((c) => c.name),
  ).toEqual(
    expect.arrayContaining([
      "saved-quantity",
      "receipt-boundary",
      "suggestions-no-internal-review",
      "suggestions-no-wait-loop",
    ]),
  );
});
it("does not let execution errors or absent required tools pass", () => {
  expect(score({ ...good, execution: "error" })).toEqual([
    { name: "execution", passed: false },
  ]);
  expect(score({ ...good, calls: [] }).some((c) => !c.passed)).toBe(true);
});
it("routes an explicit Luna override without changing the default Sol model", () => {
  vi.stubEnv("AI_PROVIDER", "bedrock");
  expect(modelConfiguration("gpt-5.6-luna").modelId).toBe(
    "openai.gpt-5.6-luna",
  );
  expect(modelConfiguration().modelId).toBe("openai.gpt-5.6-sol");
});
