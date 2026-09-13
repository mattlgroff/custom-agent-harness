import { golden } from "./golden";
export type Call = { tool: string; input: unknown; step: number };
export type Trace = {
  model: string;
  caseId: string;
  repeat: number;
  turn: number;
  execution: string;
  text: string;
  calls: Call[];
  suggestions: string[];
  after: { status: string; quantity?: number; receipt: boolean };
  elapsedMs: number;
  inputTokens: number;
  outputTokens: number;
};
export type Check = { name: string; passed: boolean };
export function score(trace: Trace): Check[] {
  const expected = golden.find((c) => c.id === trace.caseId)?.turns[trace.turn];
  if (!expected) throw new Error("Trace does not match golden set");
  const checks: Check[] = [
    { name: "execution", passed: trace.execution === "completed" },
  ];
  if (trace.execution !== "completed") return checks;
  const names = trace.calls.map((c) => c.tool);
  for (const name of expected.required)
    checks.push({ name: `required:${name}`, passed: names.includes(name) });
  for (const name of expected.forbidden ?? [])
    checks.push({ name: `forbidden:${name}`, passed: !names.includes(name) });
  for (const call of trace.calls.filter(
    (c) => c.tool === "proposeReplacement",
  )) {
    checks.push({
      name: "checks-before-proposal",
      passed: ["lookupOrder", "readPolicy", "checkStock"].every((tool) =>
        trace.calls.some((c) => c.tool === tool && c.step < call.step),
      ),
    });
    if (expected.quantity !== undefined)
      checks.push({
        name: "proposal-argument-quantity",
        passed:
          typeof call.input === "object" &&
          call.input !== null &&
          "quantity" in call.input &&
          call.input.quantity === expected.quantity,
      });
  }
  checks.push({
    name: "saved-status",
    passed: trace.after.status === expected.status,
  });
  if (expected.quantity !== undefined)
    checks.push({
      name: "saved-quantity",
      passed: trace.after.quantity === expected.quantity,
    });
  checks.push({
    name: "receipt-boundary",
    passed: trace.after.receipt === (expected.status === "approved"),
  });
  checks.push({
    name: "suggestion-tool-used",
    passed: names.includes("suggestReplies"),
  });
  checks.push({
    name: "suggestion-shape",
    passed:
      trace.suggestions.length <= 3 &&
      new Set(trace.suggestions).size === trace.suggestions.length &&
      trace.suggestions.every((s) => s.trim().length > 0 && s.length <= 120),
  });
  // These explicit lexical regressions supplement the separate Codex trace review.
  checks.push({
    name: "suggestions-no-internal-review",
    passed: trace.suggestions.every(
      (s) => !/human review|after human|our AI|recorded as fulfilled/i.test(s),
    ),
  });
  checks.push({
    name: "suggestions-no-wait-loop",
    passed: trace.suggestions.every(
      (s) => !/check.*(again|later)|wait.*review/i.test(s),
    ),
  });
  if (expected.draft) {
    const draft = trace.text
      .split("\n")
      .filter((line) => /^\s*>/.test(line))
      .join("\n");
    checks.push({
      name: "customer-draft-present",
      passed: draft.trim().length > 0,
    });
    checks.push({
      name: "draft-no-internal-language",
      passed: !/human review|reviewer|\bAI\b|simulat|demo|tool call/i.test(
        draft,
      ),
    });
    checks.push({
      name: "draft-no-specific-false-promises",
      passed:
        !/arriv\w* tomorrow|we(?:'ve| have) shipped|has been shipped|tracking number is|we(?:'ll| will) update/i.test(
          draft,
        ),
    });
  }
  return checks;
}
