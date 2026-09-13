import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createSupportAgent } from "../src/lib/agent";
import {
  beginRun,
  caseView,
  createCase,
  decide,
  finishRun,
} from "../src/lib/store";
import { db } from "../src/lib/db";
import { MODEL, scenarios } from "../src/lib/fixtures";
config({ path: ".env.local", quiet: true });
const owner = `live-${randomUUID()}`;
const report: unknown[] = [];
try {
  for (const scenario of scenarios) {
    const id = await createCase(owner, scenario.id);
    const text =
      scenario.id === "damaged"
        ? "Let's replace it for them."
        : scenario.prompt;
    const run = await beginRun(id, owner, {
      id: randomUUID(),
      role: "user",
      parts: [{ type: "text", text }],
    });
    const agent = createSupportAgent(id, owner, run.token);
    const result = await agent.generate({ prompt: text, timeout: 90_000 });
    await finishRun(id, run.token);
    const view = await caseView(id, owner);
    assert.equal(view.receipt, null, "Agent must never fulfill a replacement");
    if (scenario.id === "damaged") {
      assert.equal(view.proposal?.status, "pending");
      assert.equal(view.proposal?.quantity, 1);
      const calls = result.steps.flatMap((s) =>
        s.toolCalls.map((c) => c.toolName),
      );
      for (const name of [
        "lookupOrder",
        "readPolicy",
        "checkStock",
        "proposeReplacement",
      ])
        assert(calls.includes(name));
      const receipt = await decide(id, owner, view.proposal!.id, true);
      assert.equal(
        (await decide(id, owner, view.proposal!.id, true))?.id,
        receipt?.id,
      );
    } else
      assert.equal(
        view.proposal,
        null,
        `${scenario.id} must not create a proposal`,
      );
    report.push({
      scenario: scenario.id,
      pass: true,
      model: MODEL,
      provider: process.env.AI_PROVIDER || "openai",
      reasoningEffort: "medium",
      text: result.text,
      tools: result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)),
      usage: result.usage,
    });
    console.log(`${scenario.id}: passed`);
  }
  await mkdir("docs/verification", { recursive: true });
  await writeFile(
    "docs/verification/live-results.json",
    JSON.stringify(
      { verifiedAt: new Date().toISOString(), results: report },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "Live verification failed.",
  );
  process.exitCode = 1;
} finally {
  await db().end();
}
