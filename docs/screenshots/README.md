# Screenshot provenance

These screenshots show the actual local Next.js application, captured by Playwright.

- `workbench.png`: the scenario selection interface.
- `pending-review.png`: a deterministic test case with a saved PostgreSQL proposal and fixture conversation.
- `approved.png`: the same case after the browser's authorized reviewer action executes the real database transaction.

The conversation in the last two screenshots is test fixture text. It is not evidence of a successful OpenAI generation. See `e2e/workbench.spec.ts` for the fixture and capture steps. No API keys or reviewer tokens appear in these images.

## Real model captures

- `live-proposal.png`: actual streamed GPT-5.6 Sol conversation through Bedrock, with medium reasoning explicitly enabled.
- `live-approved.png`: the same workflow after PostgreSQL restart, human approval, and a real model follow-up that reads the saved receipt.

These were captured by the successful `RUN_LIVE=1` browser test on September 13, 2026. Unlike the deterministic fixture images, these capture actual model outputs.
