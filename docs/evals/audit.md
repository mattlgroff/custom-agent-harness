# Domain eval audit

Date: September 13, 2026. This is an initial audit and agent-authored error analysis, not a validated quality score.

Method: applied [eval-audit](https://github.com/ai-evals-course/evals-skills/blob/main/skills/eval-audit/SKILL.md). Inspected the deterministic tests, live script, browser tests, saved live report, and all nine locally saved conversations with assistant messages. All nine conversations use the damaged scenario and include development runs across different harness versions. The separate live report has four single-turn scenarios. These are convenience samples, not representative production traffic.

## Error analysis

### Critical: passing integration checks was presented as product-quality evidence

**Status:** Problem exists.
The live script asserts proposal state, quantity and tool-name presence. Its negative cases only require no proposal. An irrelevant refusal could pass all three negative cases. Neither those assertions nor browser success establishes that the operator received useful guidance.
**Fix:** Keep integration tests. Separately review complete interactions and define failure-specific criteria from the observed problems below. Report business-state checks and human quality judgments separately.

### High: observed failure modes were never captured as a review dataset

**Status:** Problem exists.
The user exposed absent case context and internal approval terminology in customer copy. Additional saved traces contain suggestions to wait for another reviewer and to tell the customer a simulated replacement was fulfilled.
**Fix:** Preserve these as development examples with provenance. Review suggestions as outputs and follow their resulting conversations, rather than judging only the final assistant text. Agent-authored observations remain provisional until a human reviews them.

## Evaluator design

### High: narrow regex checks are incomplete semantic checks

**Status:** Problem exists.
The new browser assertions reject selected phrases in blockquotes. They can miss paraphrases such as “our automated assistant,” or an invented promise such as “It will arrive tomorrow.” They can also reject a truthful negation such as “not shipped.” A heading and a forbidden-word check do not establish correct quantity, audience, status or usefulness.
**Fix:** Use code for exact state, authorization, quantities and persistence. Use human review for audience, grounded promises, and useful next actions. Only introduce a narrowly scoped LLM judge after collecting human labels and checking it against held-out examples. No judge currently exists; judge calibration is not applicable yet.

## Human review process

### High: a workflow mismatch was treated only as a wording bug

**Status:** Problem exists.
The user regards their instruction and review as the decision. The implementation requires an authenticated approval click. The chosen separate approval boundary must be legible to the operator; calling it “human review” obscured who acts and where. A model cannot fix an interaction that leaves the user believing approval is already recorded.
**Fix:** Include a usability review of proposal, explicit approval, and customer draft together. Acceptance requires the operator to understand what is recorded and what action remains. Do not score a rewrite as solving this without that review.

## Labeled data

### High: no independent evaluation set

**Status:** Problem exists.
The nine saved conversations all concern the eligible scenario. Recent regressions use the same wording used to repair the prompt. There are no human-labeled independent examples, no holdout split, and no evidence for a failure-rate estimate.
**Fix:** Treat the observed incidents as development data. After agreeing on failure definitions, create separate cases spanning linked/missing/conflicting damage facts; pending/approved/declined resolutions; policy and stock boundaries; and direct/suggested requests. Keep entire conversations and paraphrase families together when splitting data. Preserve an untouched holdout. Repeat runs to inspect variability, without treating repetitions as independent customer cases.

## Pipeline hygiene

### High: incomplete and misleading run artifacts

**Status:** Problem exists.
`scripts/verify-live.ts` writes its report only after every scenario passes. A failing run leaves the previous successful report in place. The report omits input text, tool arguments/results, prompt revision, code revision and initial/final state. It uses non-streaming generation instead of the chat route, so it misses transport/persistence behavior. Historical saved conversations also lack per-turn harness versions and exact context snapshots.
**Fix:** Write a unique run artifact as each case completes, including failed and errored cases. Capture sanitized messages, tool arguments/results, state transitions, model/provider/settings, prompt and code hashes. Never reconstruct historical prompts from today's code or present final database state as state at every past turn. Keep browser/streaming checks alongside model-level evals.

## Observed development examples

| Evidence                                      | Observation                                                                                               | Review provenance                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Case 38d0b9, first reply                      | Asked for order and damage details already visible in the selected case                                   | User-reported failure, confirmed in saved conversation                                    |
| Case 38d0b9, customer reply                   | Customer-facing copy says “pending human review” and promises a later update without a sending capability | Internal-language failure reported by user; unsupported outreach promise flagged by agent |
| Cases da41e2 and 1c93ec, suggested follow-ups | Suggested checking later for a reviewer instead of addressing the operator's decision                     | Agent observation, needs human review                                                     |
| Case b76557, final suggestion                 | Suggests telling the customer the replacement was recorded as fulfilled; only a simulated receipt exists  | Agent observation, needs human review                                                     |
| Case ea7ff1, post-fix customer draft          | Separates customer text from operator instructions and grounds approval in saved status                   | Candidate positive example, not human-labeled pass                                        |

## Work sequence

1. Preserve and review the observed conversations with free-text notes. Agree on what useful support looks like, including whether the separate approval interaction is understandable.
2. Convert observed failures into explicit binary criteria. Keep facts checked in code separate from judgments requiring interpretation.
3. Build diverse development inputs and an independent holdout, labeled as synthetic. Run full conversations with state transitions, not only isolated prompts.
4. Record every attempt, including errors, in immutable artifacts. Compare the current harness against a frozen baseline on the same inputs and repetitions.
5. Human-review the outputs. Report failures by category and show representative traces. Do not collapse them into one “quality score.”
6. If review volume justifies a judge, calibrate it on human labels with separate development and test sets, measuring both failure detection and false alarms.
7. Explain this process and the observed failures in the article before claiming the example has been evaluated for domain quality.

Completion today: audit and initial trace inspection. Not completed: human labeling, saturation of failure discovery, independent holdout evaluation, judge validation, or a domain-quality release verdict.

## Initial collection command

`npm run eval:domain` runs the six development probes with the configured paid model. It writes a new ignored `.evals/<timestamp>/` directory containing a manifest, JSONL traces, and a reading packet. The manifest includes source snapshots, a source hash, revision and model settings. Each completed probe includes tool inputs/results and before/after business records; execution errors are recorded without raw provider errors. Every human verdict starts unset. The command exits nonzero on execution errors, not on unreviewed quality. It does not replace the streaming/browser regression tests or evaluate multi-turn behavior yet.

The initial probes deliberately use observed development examples. Do not report their results as a held-out benchmark. The review packet's final text is a reading aid; use the JSONL tool trace and state evidence when judging correctness.

## First development run

Run `2026-09-13T20-42-55.300Z`: six probes completed, zero execution errors. Human quality verdicts remain unset. The agent inspected the final outputs, suggested replies and before/after proposal state. All state transitions matched the seeded setup; this is limited execution evidence.

A remaining provisional issue appeared in the operator-decision probe: the assistant correctly explained how to record approval, but suggested “Check the recorded decision again” while the proposal remained pending. The customer-audience probe similarly suggested checking whether approval happened. These may perpetuate the low-value checking loop identified in historical traces. The example needs human judgment about suggestion usefulness; a changed phrase alone does not establish that the failure was resolved. No prompt changes were made during this collection run.
