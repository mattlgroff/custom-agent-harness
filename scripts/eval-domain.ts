import { config } from "dotenv";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { createSupportAgent } from "../src/lib/agent";
import {
  beginRun,
  caseView,
  createCase,
  decide,
  finishRun,
  propose,
} from "../src/lib/store";
import { db } from "../src/lib/db";
import type { Scenario } from "../src/lib/fixtures";

config({ path: ".env.local", quiet: true });
const dataset = JSON.parse(
  await readFile("docs/evals/development-cases.json", "utf8"),
) as {
  cases: {
    id: string;
    scenario: Scenario;
    state: string;
    input: string;
    review: string;
    source: string;
  }[];
};
const runId = new Date().toISOString().replaceAll(":", "-");
const directory = `.evals/${runId}`;
await mkdir(directory, { recursive: true });
const sources = await Promise.all(
  ["agent", "fixtures", "model", "store"].map(async (name) => ({
    path: `src/lib/${name}.ts`,
    content: await readFile(`src/lib/${name}.ts`, "utf8"),
  })),
);
await writeFile(
  `${directory}/manifest.json`,
  JSON.stringify(
    {
      runId,
      revision: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      harnessHash: createHash("sha256")
        .update(JSON.stringify(sources))
        .digest("hex"),
      sources,
      dataset,
      model: "gpt-5.6-sol",
      provider: process.env.AI_PROVIDER || "openai",
      reasoning: "medium",
      scope:
        "Development probes through ToolLoopAgent.generate; not browser/streaming coverage, not a holdout, not human quality verdicts.",
    },
    null,
    2,
  ),
);
let errors = 0;
const state = (view: Awaited<ReturnType<typeof caseView>>) => ({
  order: view.order,
  stock: view.stock,
  proposal: view.proposal,
  receipt: view.receipt,
});
const notes: string[] = [
  "# Development trace review",
  "These are fresh model outputs for manual review. Execution success is not a quality pass.",
];
try {
  for (const sample of dataset.cases) {
    let id: string | undefined;
    let token: string | undefined;
    const owner = `eval-${randomUUID()}`;
    const startedAt = Date.now();
    try {
      id = await createCase(owner, sample.scenario);
      if (sample.state !== "no proposal") {
        const proposal = await propose(
          id,
          owner,
          1,
          "One ceramic mug arrived broken.",
        );
        if (sample.state.startsWith("approved"))
          await decide(id, owner, proposal.id, true);
      }
      const before = state(await caseView(id, owner));
      const run = await beginRun(id, owner, {
        id: randomUUID(),
        role: "user",
        parts: [{ type: "text", text: sample.input }],
      });
      token = run.token;
      const result = await createSupportAgent(id, owner, token).generate({
        prompt: sample.input,
        timeout: 90_000,
      });
      const after = state(await caseView(id, owner));
      const trace = {
        id: sample.id,
        input: sample.input,
        reviewCriterion: sample.review,
        before,
        after,
        text: result.text,
        steps: result.steps.map((step) => ({
          text: step.text,
          calls: step.toolCalls.map((call) => ({
            id: call.toolCallId,
            tool: call.toolName,
            input: call.input,
          })),
          results: step.toolResults.map((value) => ({
            id: value.toolCallId,
            tool: value.toolName,
            output: value.output,
          })),
        })),
        usage: result.totalUsage,
        elapsedMs: Date.now() - startedAt,
        execution: "completed",
        humanVerdict: null,
      };
      await appendFile(
        `${directory}/traces.jsonl`,
        JSON.stringify(trace) + "\n",
      );
      notes.push(
        `## ${sample.id}\n\nInput: ${sample.input}\n\nReview criterion: ${sample.review}\n\n${result.text}\n\nSuggested replies: ${JSON.stringify(result.steps.flatMap((step) => step.toolResults.filter((value) => value.toolName === "suggestReplies").map((value) => value.output)))}\n\nHuman notes: (unreviewed)\n`,
      );
      console.log(`${sample.id}: recorded, quality unreviewed`);
    } catch (error) {
      errors++;
      // Do not persist provider errors: they may contain headers or raw responses.
      await appendFile(
        `${directory}/traces.jsonl`,
        JSON.stringify({
          id: sample.id,
          execution: "error",
          errorType: error instanceof Error ? error.name : "UnknownError",
          humanVerdict: null,
        }) + "\n",
      );
      console.log(`${sample.id}: execution error recorded`);
    } finally {
      if (id && token) await finishRun(id, token);
      await writeFile(`${directory}/review.md`, notes.join("\n\n"));
    }
  }
} finally {
  await db().end();
}
console.log(
  `Review artifacts: ${directory}; ${errors} execution errors; no automated quality verdict.`,
);
if (errors) process.exitCode = 1;
