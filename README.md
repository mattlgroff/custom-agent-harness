# Custom Agent Harness

A local Next.js support workbench built with **Vercel's AI SDK, AI Elements, and PostgreSQL**. The agent investigates damaged orders and proposes replacements. A separately authenticated human reviewer approves or rejects the saved proposal.

![Parcel & Pine workbench](docs/screenshots/workbench.png)

**Model:** GPT-5.6 Sol, medium reasoning. The verified integration uses Amazon Bedrock's OpenAI-compatible Responses endpoint. Direct OpenAI is also configurable. No Eve, AI Gateway, cloud database, or deployment is required.

## Run locally

Requirements: Node.js 22.19+ and Docker with Compose. Model calls require your own compatible provider credential and incur usage charges.

```sh
git clone https://github.com/mattlgroff/custom-agent-harness.git
cd custom-agent-harness
npm ci
npm run setup
```

Edit `.env.local`. The setup script generates a random `OPERATOR_TOKEN`; keep it local. Choose one model connection:

```dotenv
# Amazon Bedrock: the model remains GPT-5.6 Sol.
AI_PROVIDER=bedrock
BEDROCK_REGION=us-east-2
BEDROCK_API_KEY=your-bedrock-api-key
```

Or:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your-openai-api-key
```

Then:

```sh
npm run db:up
npm run db:migrate
npm run dev
```

Open **http://localhost:3000**. Docker Compose starts only PostgreSQL, bound to `127.0.0.1:55439`. Next.js runs directly on your machine. The schema uses standard PostgreSQL; any compatible PostgreSQL provider can host it if you later choose to host the application. This example does not recommend or provision a cloud provider.

## Try the workflow

1. Open **A mug arrived broken** and send “Let's replace it for them.” The assistant already knows the selected case. Click an assistant-suggested reply above the composer to send a follow-up.
2. Inspect the order, policy, stock, and proposal tool calls.
3. Confirm that the proposal is pending and stock has not changed.
4. Select **Unlock reviewer controls** and enter the `OPERATOR_TOKEN` from `.env.local`. Do not paste it into the chat.
5. Approve or decline the exact saved proposal.
6. Ask the assistant to check the saved resolution.
7. Reload the page to see persisted messages and the receipt.

The other scenarios demonstrate missing information, an expired policy window, and unavailable stock. Each case has isolated synthetic data and a fixed reference date. Create a new case with the sidebar's plus button. A rejected or approved proposal is immutable.

The model cannot approve its own proposal. It has no shell, database tool, approval tool, or access to the reviewer credential. The human decision endpoint checks the reviewer cookie and case ownership. The database transaction rechecks stock and eligibility and prevents duplicate fulfillment.

## Verify

```sh
npm run check          # TypeScript and ESLint
npm test               # PostgreSQL invariants and provider request configuration
npm run build          # Production Next.js build
npx playwright install chromium
npm run test:e2e       # Browser/API tests; no paid model calls
npm run verify:live    # Four real model scenarios; uses your provider credential
```

The complete real-model browser test also restarts **this project's PostgreSQL container** to verify recovery. Run it separately, without other tests or requests using that database:

```sh
RUN_LIVE=1 npx playwright test e2e/live-model.spec.ts
```

It exercises streaming, proposal persistence, database restart, reviewer approval, a model follow-up, and page reload. It captures the real run in `docs/screenshots/live-*.png`. Standard browser-test screenshots use deterministic fixtures, clearly documented in [screenshot provenance](docs/screenshots/README.md).

GitHub Actions runs typecheck, lint, deterministic tests, production build, and browser tests using a disposable PostgreSQL service. It does not receive provider credentials or run paid-model evaluations.

## Read the code

| File                                                | Responsibility                                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [agent.ts](src/lib/agent.ts)                        | Instructions, five business tools plus suggested replies, eight-step limit, medium reasoning |
| [model.ts](src/lib/model.ts)                        | Direct OpenAI or Bedrock connection; no automatic fallback                                   |
| [chat route](src/app/api/chat/route.ts)             | Trusted history, input limits, run lease, streaming and persistence                          |
| [store.ts](src/lib/store.ts)                        | Eligibility, proposals, transactions and duplicate prevention                                |
| [auth.ts](src/lib/auth.ts)                          | Local browser ownership and separate reviewer credential                                     |
| [decisions route](src/app/api/decisions/route.ts)   | Human-only approval and rejection                                                            |
| [support-desk.tsx](src/components/support-desk.tsx) | AI Elements conversation/tools and case UI                                                   |

See [architecture](docs/architecture.md), [sources](docs/sources.md), and [verification](docs/verification/README.md).

## A deliberately small harness

Start with a narrow task, concise instructions and explicit tools. Run real cases before adding skills, subagents, MCP servers, memory, or custom context machinery. This example does not claim a measured improvement over another framework or certification against all twelve of Dex Horthy's factors.

Three integration fixes were found through verification: Bedrock's model prefix requires `forceReasoning: true` for the AI SDK to send medium reasoning, and tool results must contain JSON-compatible values rather than database `Date` objects, and persisted assistant messages need generated stable IDs. These are documented implementation findings, not invented model behavior improvements.

## Limits

This is a local teaching application. The store and customer are fictional. Approval records a simulated replacement; it does not ship goods, charge money, send messages, or issue refunds. Duplicate protection applies to the local transaction, not an external fulfillment API.

The reviewer token is intentionally simple local authentication. Real deployment requires an appropriate identity system, operational controls, and environment configuration. Conversation length, step and time limits bound execution but are not a hard spending cap. A crashed agent run releases its case lease after two minutes; unfinished model generation is not durably resumed.

Stop the database without removing data:

```sh
docker compose down
```

To deliberately delete this project's demo database and start fresh:

```sh
docker compose down --volumes
npm run db:up
npm run db:migrate
```

Never commit `.env.local`. Short-lived provider credentials must be replaced when they expire.
