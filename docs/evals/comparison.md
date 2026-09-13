# Comparing models without an LLM judge

The golden set in `evals/golden.ts` was authored by Codex before this comparison, from the support workflow and observed failures. It includes exact business expectations, required and forbidden tool calls, and prose criteria for response and suggestion quality. It is an agent-authored development benchmark, not an independently human-labeled holdout.

Run the same cases against explicit model IDs:

```bash
npm run eval:compare -- --models gpt-5.6-sol,gpt-5.6-luna --repeats 2
```

The app still defaults to Sol. The runner passes a model override directly into the same `createSupportAgent` implementation. Both use medium reasoning, the same tools and policy, fresh isolated cases, and the same user turns. Live generated history is carried into the next turn. Explicit operator actions update the database between turns. Two additional cases provide fixed historical assistant messages to test stale or incorrect claims. Model order alternates between repetitions. The runner uses the SDK generation path; existing browser tests separately cover streaming and persistence.

There are no LLM judge requests. The only model calls are to the systems being evaluated. `evals/score.ts` checks tool presence/absence, prerequisite steps, proposal quantity/state, receipt boundaries, suggestion shape and selected lexical regressions. It allows read tools to run in any order, including in parallel, but requires their results before proposal creation. A blocked proposal can still be a tool-selection failure when the policy clearly rules it out. The code assertions do not fully capture semantic quality.

Saved artifacts contain model IDs, source snapshots/hashes, the golden set/hash, full application-visible input history, tool arguments/results, state, token usage and latency. Provider credentials and reasoning metadata are excluded. Each attempt is appended independently, including execution errors. Local runs live under ignored `.evals/` directories.

Rescore existing outputs without paid inference:

```bash
npm run eval:compare -- --score-only .evals/compare-<timestamp>
```

Rescoring refuses a changed golden set. Failures produce a nonzero exit status. Keep original artifacts when changing an evaluator. A successful code-check result does not override a recorded Codex review finding.

For the initial comparison, Codex also reads each recorded history, tool call, reply and suggestion, then records per-turn judgments with reasons. Those judgments are static review artifacts, not an evaluator executed by the suite. No model switch is justified by a single aggregate percentage: inspect tool routing, response grounding and suggestions separately. Token counts are measured usage, not a dollar-cost estimate; provider prices and cache rates must be supplied separately for a valid cost calculation.

The Elios Insights resume-parser suite informed the use of explicit experiments, per-check results and score-only replay. No private implementation or data was copied into this example.

## Initial Sol versus Luna results

September 13, 2026: ten scenarios, twelve turns per repetition, two repetitions, 24 turns per model. Both models ran through Bedrock at medium reasoning. Zero execution errors. The harness and golden set remained unchanged during collection.

| Measure                                   |     Sol |    Luna |
| ----------------------------------------- | ------: | ------: |
| Turns passing deterministic checks        |   19/24 |   20/24 |
| Tool decisions passing Codex review       |   23/24 |   22/24 |
| Responses passing Codex review            |   23/24 |   20/24 |
| Suggestion sets passing Codex review      |   18/24 |   19/24 |
| Turns passing all three review dimensions |   16/24 |   15/24 |
| Mean observed latency per turn            | 3.080 s | 2.332 s |
| Input tokens, all steps                   |  81,118 |  83,005 |
| Output tokens, all steps                  |   4,155 |   4,808 |

These review judgments were made by Codex reading the recorded inputs, tool calls, state, responses and suggestions. They are not runtime judge-model scores or human labels. An entire suggestion set fails review if it includes a materially misleading or unhelpful choice. Valid alternatives and harmless phrasing differences are accepted. Repetitions of these same synthetic cases are correlated; these counts do not establish production failure rates or statistical equivalence.

Observed failures:

- Both models proposed invented damage descriptions as clickable answers while details were unknown. This contaminates the next conversation turn with unsupported facts.
- Sol attempted an expired-order proposal once; Luna attempted it twice. The store guard blocked all three. Tool selection still failed the golden expectation.
- Sol repeatedly suggested checking the same pending status again instead of helping the operator act.
- Luna offered an approval instruction as a chat chip even though clicking it cannot approve, and sometimes made unsupported future-update or tracking promises. Sol also made one unsupported shipping-update promise.
- One lexical flag was a false positive: Luna suggested checking stock after replenishment, which depends on changed state and is a reasonable conditional action. The Codex review accepts it. Conversely, fabricated facts and paraphrased outreach promises passed lexical checks but failed trace review.

Conclusion: Luna is competitive in this small set and was faster in this run, but the models are not interchangeable on the evidence collected. Luna's extra unsupported promises matter. The application still defaults to Sol. Fixing the shared harness failures and rerunning the same golden set should precede a default switch, followed by fresh cases to check generalization. No dollar savings are claimed from token counts alone.

[Run manifest and source snapshots](results/sol-luna-2026-09-13/manifest.json), [synthetic traces](results/sol-luna-2026-09-13/traces.jsonl), [deterministic checks](results/sol-luna-2026-09-13/scores.json), and [Codex per-turn judgments](results/sol-luna-2026-09-13/codex-review.json) are retained together. The scorer is deliberately incomplete for semantics; future runs need another explicit review unless those criteria are encoded into deterministic checks. The suite never calls an LLM judge.

After collection, the scorer was corrected to omit a quantity-argument assertion when the golden case forbids proposals and specifies no expected quantity. The forbidden-tool assertion remains; no per-turn pass/fail totals changed. The published `scoring-manifest.json` records the scorer used for replay separately from the original collection manifest. No model outputs or golden expectations were changed.
