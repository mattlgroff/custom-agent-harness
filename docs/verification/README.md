# Verification

Verification is separated by what each check can establish:

- `tests/store.test.ts`: actual PostgreSQL transactions, eligibility, concurrent approval replay, rejection, ownership, immutable proposals, message deduplication and stale-run fencing.
- `tests/agent.test.ts`: captures the generated provider request with a mock transport and asserts the Bedrock endpoint, GPT-5.6 Sol model ID, `reasoning.effort=medium`, disabled response storage, and tool surface. It is not a live inference test.
- `e2e/workbench.spec.ts`: browser rendering, mobile width, real authenticated approval, persistence, CSRF, case ownership and forged assistant-message rejection. Conversation/proposal setup is a deterministic fixture.
- `scripts/verify-live.ts`: four real model scenarios. It checks the eligible proposal and tools, no autonomous fulfillment, and no proposal for missing information, out-of-window orders or unavailable stock. The generated `live-results.json` records the time, model output, tools and usage. A single run is functional evidence, not a reliability benchmark.
- `e2e/live-model.spec.ts`: real streamed model conversation, PostgreSQL restart, human approval, model status follow-up and reload. It requires `RUN_LIVE=1` and is excluded from standard CI.

The successful live path uses Amazon Bedrock with `openai.gpt-5.6-sol`. Direct OpenAI generation could not be verified from the implementation environment: it returned `401 token_invalidated` with IDE-specific routing headers. That observation does not establish the account's usage tier or independently diagnose the credential. No automatic model/provider fallback is implemented.

## Completed checks (September 13, 2026)

- Nine deterministic tests passed, including a streamed chat-route regression for stable message IDs and untrusted client history.
- Three standard browser tests passed.
- Four live model scenarios passed through Bedrock with medium reasoning.
- The full live browser/restart/approval/follow-up test passed.
- Next.js production build, TypeScript and ESLint passed.

The model-backed browser test exposed and verified fixes for JSON-incompatible database timestamps in tool outputs and missing assistant message IDs during persistence.
