import { config } from "dotenv";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { z } from "zod";
import type { ModelMessage } from "ai";
import { golden } from "../evals/golden";
import { score, type Trace } from "../evals/score";
import { createSupportAgent } from "../src/lib/agent";
import {
  createCase,
  propose,
  decide,
  beginRun,
  finishRun,
  caseView,
} from "../src/lib/store";
import { db } from "../src/lib/db";
config({ path: ".env.local", quiet: true });
const args = process.argv.slice(2);
function option(name: string, fallback: string) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
for (let i = 0; i < args.length; i += 2)
  if (
    !["--models", "--repeats", "--score-only"].includes(args[i]) ||
    !args[i + 1]
  )
    throw new Error(
      "Use --models comma-separated-ids --repeats N, or --score-only run-directory",
    );
const models = option("--models", "gpt-5.6-sol,gpt-5.6-luna").split(",");
if (models.some((m) => !/^gpt-[a-z0-9.-]+$/.test(m)))
  throw new Error("Invalid model ID");
const repeats = Number(option("--repeats", "2"));
if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10)
  throw new Error("Repeats must be 1 through 10");
const directory = option(
  "--score-only",
  `.evals/compare-${new Date().toISOString().replaceAll(":", "-")}`,
);
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const goldenHash = hash(JSON.stringify(golden));
const traces: Trace[] = [];
if (args.includes("--score-only")) {
  const manifest = JSON.parse(
    await readFile(`${directory}/manifest.json`, "utf8"),
  );
  if (manifest.goldenHash !== goldenHash)
    throw new Error(
      "Golden set changed; do not silently rescore against a different target.",
    );
  traces.push(
    ...(await readFile(`${directory}/traces.jsonl`, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  );
} else {
  await mkdir(directory, { recursive: true });
  const sourcePaths = [
    "src/lib/agent.ts",
    "src/lib/model.ts",
    "src/lib/fixtures.ts",
    "src/lib/store.ts",
    "evals/golden.ts",
    "evals/score.ts",
    "scripts/compare-models.ts",
  ];
  const sources = await Promise.all(
    sourcePaths.map(async (path) => ({
      path,
      content: await readFile(path, "utf8"),
    })),
  );
  await writeFile(
    `${directory}/manifest.json`,
    JSON.stringify(
      {
        models,
        repeats,
        golden,
        goldenHash,
        sources,
        sourceHash: hash(JSON.stringify(sources)),
        revision: execFileSync("git", ["rev-parse", "HEAD"], {
          encoding: "utf8",
        }).trim(),
        provider: process.env.AI_PROVIDER || "openai",
        reasoning: "medium",
        provenance: "Codex-authored golden set; no LLM judge calls",
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  try {
    for (let repeat = 0; repeat < repeats; repeat++)
      for (const sample of golden) {
        // Alternate provider order between repetitions to reduce time/order bias.
        for (const model of repeat % 2 ? [...models].reverse() : models) {
          const owner = `compare-${randomUUID()}`;
          const id = await createCase(owner, sample.scenario);
          if (sample.initial) {
            const p = await propose(
              id,
              owner,
              1,
              "One ceramic mug arrived broken.",
            );
            if (sample.initial !== "pending")
              await decide(id, owner, p.id, sample.initial === "approved");
          }
          const history: ModelMessage[] = structuredClone(sample.history ?? []);
          for (const [turn, expected] of sample.turns.entries()) {
            if (expected.action) {
              const current = await caseView(id, owner);
              if (current.proposal)
                await decide(
                  id,
                  owner,
                  current.proposal.id,
                  expected.action === "approve",
                );
            }
            const before = await caseView(id, owner);
            const run = await beginRun(id, owner, {
              id: randomUUID(),
              role: "user",
              parts: [{ type: "text", text: expected.input }],
            });
            history.push({ role: "user", content: expected.input });
            const startedAt = Date.now();
            let trace: Trace;
            try {
              const inputHistory = structuredClone(history);
              const result = await createSupportAgent(
                id,
                owner,
                run.token,
                model,
              ).generate({ messages: history, timeout: 90_000 });
              history.push(...result.response.messages);
              const after = await caseView(id, owner);
              const suggestions = result.steps.flatMap((s) =>
                s.toolResults
                  .filter((t) => t.toolName === "suggestReplies")
                  .flatMap(
                    (t) =>
                      z.object({ replies: z.array(z.string()) }).parse(t.output)
                        .replies,
                  ),
              );
              trace = {
                model,
                caseId: sample.id,
                repeat,
                turn,
                execution: "completed",
                text: result.text,
                suggestions,
                calls: result.steps.flatMap((s, step) =>
                  s.toolCalls.map((c) => ({
                    tool: c.toolName,
                    input: c.input,
                    step,
                  })),
                ),
                after: {
                  status: after.proposal?.status ?? "none",
                  quantity: after.proposal?.quantity,
                  receipt: !!after.receipt,
                },
                elapsedMs: Date.now() - startedAt,
                inputTokens: result.totalUsage.inputTokens ?? 0,
                outputTokens: result.totalUsage.outputTokens ?? 0,
              };
              // Store only application-visible history, never reasoning or provider metadata.
              const sanitizedHistory = inputHistory.map((m) => ({
                role: m.role,
                content:
                  typeof m.content === "string"
                    ? m.content
                    : m.content
                        .filter((p) => p.type !== "reasoning")
                        .map((p) =>
                          JSON.parse(
                            JSON.stringify(p, (key, value) =>
                              /provider|encrypted/i.test(key)
                                ? undefined
                                : value,
                            ),
                          ),
                        ),
              }));
              await appendFile(
                `${directory}/traces.jsonl`,
                JSON.stringify({
                  ...trace,
                  history: sanitizedHistory,
                  before: {
                    order: before.order,
                    stock: before.stock,
                    status: before.proposal?.status ?? "none",
                  },
                  steps: result.steps.map((s) => ({
                    text: s.text,
                    results: s.toolResults.map((t) => ({
                      tool: t.toolName,
                      input: t.input,
                      output: t.output,
                    })),
                  })),
                }) + "\n",
              );
            } catch (error) {
              trace = {
                model,
                caseId: sample.id,
                repeat,
                turn,
                execution: "error",
                text: "",
                suggestions: [],
                calls: [],
                after: { status: "unknown", receipt: false },
                elapsedMs: Date.now() - startedAt,
                inputTokens: 0,
                outputTokens: 0,
              };
              await appendFile(
                `${directory}/traces.jsonl`,
                JSON.stringify({
                  ...trace,
                  errorType:
                    error instanceof Error ? error.name : "UnknownError",
                }) + "\n",
              );
            } finally {
              await finishRun(id, run.token);
            }
            traces.push(trace);
            console.log(
              `${model} ${sample.id} r${repeat + 1} t${turn + 1}: ${
                score(trace)
                  .filter((c) => !c.passed)
                  .map((c) => c.name)
                  .join(", ") || "checks passed"
              }`,
            );
            if (trace.execution === "error") break;
          }
        }
      }
  } finally {
    await db().end();
  }
}
const scored = traces.map((t) => ({
  model: t.model,
  caseId: t.caseId,
  repeat: t.repeat,
  turn: t.turn,
  checks: score(t),
}));
await writeFile(`${directory}/scores.json`, JSON.stringify(scored, null, 2));
const scorerSource = await readFile("evals/score.ts", "utf8");
await writeFile(
  `${directory}/scoring-manifest.json`,
  JSON.stringify(
    {
      scoredAt: new Date().toISOString(),
      goldenHash,
      scorerHash: hash(scorerSource),
      scorerSource,
    },
    null,
    2,
  ),
);
const summary = [...new Set(traces.map((t) => t.model))].map((model) => {
  const rows = traces.filter((t) => t.model === model);
  const results = scored.filter((t) => t.model === model);
  return {
    model,
    turns: rows.length,
    executionErrors: rows.filter((t) => t.execution !== "completed").length,
    turnsPassingChecks: results.filter((t) => t.checks.every((c) => c.passed))
      .length,
    inputTokens: rows.reduce((n, t) => n + t.inputTokens, 0),
    outputTokens: rows.reduce((n, t) => n + t.outputTokens, 0),
    meanLatencyMs: Math.round(
      rows.reduce((n, t) => n + t.elapsedMs, 0) / rows.length,
    ),
  };
});
await writeFile(`${directory}/summary.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ directory, summary }, null, 2));
if (scored.some((t) => t.checks.some((c) => !c.passed))) process.exitCode = 1;
