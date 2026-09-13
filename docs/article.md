# Building Custom Agent Harnesses for Specific Domains Using Vercel's AI SDK

## What is an agent harness?

An agent harness is the software around an AI model that lets it work on a task. It supplies context and tools, executes the model's tool requests, feeds back the results, and controls when the agent continues or stops.

The model might request an order lookup. The harness runs that lookup and returns the order. The model can then decide whether to check inventory or ask for missing information. The application still controls which operations are allowed.

HumanLayer describes a coding agent's harness as “the agent’s runtime” in Kyle's [*Skill Issue: Harness Engineering for Coding Agents*](https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents). [Cloudflare's documentation](https://developers.cloudflare.com/agents/harnesses/) describes the work around each model turn, including prompt construction, tool handling, message persistence, and stopping decisions.

Those definitions apply beyond coding. The task determines what the harness needs to provide:

| Agent | Context it needs | Tools it can use | Application controls |
| --- | --- | --- | --- |
| Coding assistant | Repository files, instructions, previous work | Read files, edit code, run tests | File access, command permissions, execution limits |
| Damaged-order support assistant | Selected order, damage report, policy, saved decisions | Look up an order, check stock, propose a replacement | Case ownership, replacement eligibility, approval |

This post walks through the second example using Next.js, Vercel's AI SDK, AI Elements, and PostgreSQL. If you know TypeScript and have built a web application, you should be able to follow the code, run the example, and change its model. The eval results also show where the assistant still makes poor decisions.

An **agent harness** runs the agent. An **eval harness** runs test conversations against it and checks the results. The [example repository](https://github.com/mattlgroff/custom-agent-harness) includes both.

## The job: replace one broken mug

**Parcel & Pine** is a fictional homewares store. A support employee opens a case for Alex Morgan, whose order contained two mugs. One arrived broken.

The employee types:

> Let's replace it for them.

The assistant should already know which order “it” refers to. The case is open on the page. It should check the order, policy, and stock, then save a proposal for one replacement. The employee reviews that proposal and clicks **Approve**. Afterward, “Let the customer know” should produce a customer reply draft based on the recorded decision.

![Parcel and Pine support workbench](screenshots/workbench.png)

*The local workbench uses fictional orders. Each case has independent stock and conversation history.*

The store policy requires a damage report within 30 days of delivery, enough stock, and a replacement quantity within the purchased quantity. The scenarios use a fixed reference date so an eligible example does not expire between publication and the day someone runs it.

Approval creates a simulated replacement record and decrements local stock. The POC does not contact customers or ship anything. That distinction matters when evaluating what the assistant says it has done.

## Where the AI SDK fits

The AI SDK is the library I used to build the harness. Its [`ToolLoopAgent`](https://ai-sdk.dev/docs/agents/overview) handles the loop between model calls and tool results. Our code decides what context enters that loop, which tools exist, and what those tools may change.

The SDK also has a [`HarnessAgent`](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview) integration for established runtimes such as Pi. That is a different integration path. Here, the support application owns the tools and workflow, so I used `ToolLoopAgent`.

[AI Elements](https://ai-sdk.dev/elements) renders the conversation, tool calls, and suggested replies. The surrounding workbench displays the order and saved resolution. A chat bubble saying “approved” does not update that resolution panel; a successful approval transaction does.

The [LangChain custom-harness article](https://www.langchain.com/blog/how-to-build-a-custom-agent-harness) prompted this project. I wanted an example readers could trace through a web application and evaluate against a specific support job.

## Give the agent the case it is working on

The first version got this wrong. The page showed the order, but the agent did not receive that context. When I typed “Let's replace it for them,” it asked for the order number and damage details.

Putting information in a sidebar does not put it in the model's input.

The server now loads the authorized case before every turn. It supplies the order, seeded customer report, current stock, proposal status, and replacement receipt. The browser cannot choose another case's owner or pass a fabricated approval as authoritative state.

Conversation history matters too. If the employee says “Correction: both mugs broke,” the assistant needs to use that new information. If an earlier assistant message incorrectly claimed that a replacement shipped, the saved business record must take precedence.

The [agent configuration](https://github.com/mattlgroff/custom-agent-harness/blob/main/src/lib/agent.ts) uses `prepareCall` to load that context. Its main pieces are:

```ts
// Abridged wiring; see agent.ts for the instructions and implementations.
return new ToolLoopAgent({
  model: supportModel(modelName),
  instructions,
  prepareCall,
  tools: scopedTools,
  stopWhen: isStepCount(8),
  maxOutputTokens: 2500,
  maxRetries: 1,
});
```

The eight-step limit bounds a turn. It does not tell us whether the agent used those steps well. We test that separately.

## Give each tool a specific job

The assistant has six tools:

| Tool | Job |
| --- | --- |
| `lookupOrder` | Verify the linked order within the selected case |
| `readPolicy` | Return the damaged-item replacement rules |
| `checkStock` | Return replacement availability |
| `proposeReplacement` | Validate and save a pending proposal |
| `checkResolution` | Read the saved proposal and receipt status |
| `suggestReplies` | Choose up to three messages the employee can click to submit |

Each business tool is scoped to the case on the server. The model supplies an order number or damaged quantity where needed, but it cannot select another owner or run arbitrary SQL. It has no approval or shipping tool.

Suggested replies deserve the same scrutiny as assistant prose. A chip saying “Draft a reply to the customer” can save typing. A chip saying “Both mugs were cracked” can introduce a fact nobody supplied. Once clicked, that invented detail becomes a user message in the next turn.

Suggestions appear above the composer and submit through the normal chat endpoint. They do not perform approvals. Old suggestions disappear when their saved proposal status no longer matches the case.

![A replacement proposal created by the live model](screenshots/live-proposal.png)

*The assistant checked the order, policy, and stock. The proposal is waiting for the employee's recorded decision.*

## Record approval outside the model

The support employee is the reviewer. The UI needs to make their next action clear: review the saved proposal, then approve or decline it.

The approval endpoint uses a separately authenticated reviewer session. When the employee clicks **Approve**, the server checks case ownership, locks the relevant records, and rechecks policy, quantity, and stock. It saves the replacement receipt and stock change in one PostgreSQL transaction.

Repeating the approval request returns the same receipt without decrementing stock again. A declined proposal cannot later be approved. These rules live in [application code](https://github.com/mattlgroff/custom-agent-harness/blob/main/src/lib/store.ts), where deterministic tests can verify them.

The first customer-facing drafts also exposed a workflow mistake. They talked about “pending human review,” as though the employee were waiting for somebody else. The agent now receives instructions to address the employee directly and keep internal approval guidance outside the customer draft. The evals check how consistently the models follow that distinction.

![A customer reply draft after the replacement was approved](screenshots/live-approved.png)

*The assistant reads the recorded approval before drafting the customer reply. It has no tool for sending that message.*

For this local demo, a generated reviewer token unlocks the approval controls. A real application would use its own user authentication and authorization.

## What passing tests missed

The integration tests established useful facts: proposals persist, duplicate approvals do not consume stock twice, and one case cannot access another case's records. The live browser test also restarts PostgreSQL between proposal and approval, then reloads the conversation.

Those checks missed several bad support interactions:

- Asking for facts already visible in the case.
- Putting internal review language in a customer reply.
- Offering repeated status checks when the employee needs to record a decision.
- Suggesting invented damage details as clickable answers.
- Promising future tracking updates without a workflow that provides them.

A test that asserts “no proposal was saved” can pass even when the agent tried to create an ineligible proposal and the application blocked it. That proves the guard worked. To evaluate tool selection, we also need to inspect the attempted call.

The [eval audit](https://github.com/mattlgroff/custom-agent-harness/blob/main/docs/evals/audit.md), guided by [Eval Skills](https://github.com/ai-evals-course/evals-skills), made those gaps explicit. It led to a separate model comparison with expectations written before the run.

## Compare Sol and Luna on the same conversations

The golden set contains ten scenarios, including missing information, corrected quantities, expired orders, unavailable stock, approval and rejection, and incorrect assistant claims in conversation history. Two scenarios carry live generated responses into a second turn. Other cases start with fixed history to test whether the model follows stale or false claims.

The suite uses code checks for required and forbidden tools, prerequisite steps, quantities, and saved state. It permits the read-only checks to run in any order, including in parallel, but requires them before a proposal. Selected text checks catch known wording regressions.

There are no LLM judge calls. I used Codex to author the expectations and separately review every resulting trace: the input history, tools, reply, and suggestions. Those judgments are recorded as **agent-authored review**, not human labels. The code checks remain useful, but they do not cover every semantic criterion in that review.

Both models ran through Bedrock at medium reasoning. Two repetitions produced 24 evaluated turns per model:

| Measure | GPT-5.6 Sol | GPT-5.6 Luna |
| --- | ---: | ---: |
| Turns passing code checks | 19/24 | 20/24 |
| Tool decisions passing Codex review | 23/24 | 22/24 |
| Responses passing Codex review | 23/24 | 20/24 |
| Suggestion sets passing Codex review | 18/24 | 19/24 |
| Mean observed latency per turn | 3.08 s | 2.33 s |

Luna was faster in this run and slightly ahead on suggestion sets. It also made more unsupported customer promises. Both models invented damage details in suggestions, and both attempted an expired-order replacement that the application blocked.

The [report and per-turn evidence](https://github.com/mattlgroff/custom-agent-harness/blob/main/docs/evals/comparison.md) include disagreements between code checks and trace review. For example, a regex flagged checking stock after replenishment as a repeated-check loop; the review accepted it because the suggestion depended on changed state. Meanwhile, paraphrased promises of future updates passed the text checks and failed review.

These are small, correlated development results. They do not establish production failure rates, dollar savings, or model equivalence. Sol remains the default, and the unresolved failures are documented. The harness was held fixed during the comparison so prompt edits would not change the experiment halfway through.

## Run the app and the comparison

You need Node.js 22.19 or newer, Docker Compose, and credentials for a supported model endpoint. From the [cloned repository](https://github.com/mattlgroff/custom-agent-harness):

```bash
npm ci
npm run setup
```

Add your provider credential to `.env.local`, then start PostgreSQL and the app:

```bash
npm run db:up
npm run db:migrate
npm run dev
```

Open `http://localhost:3000` and choose the broken-mug case. Try “Let's replace it for them.” To record approval, unlock the reviewer controls with `OPERATOR_TOKEN` from `.env.local`, then click **Approve**. Keep the token out of chat. Try “Let the customer know” after approval and inspect the draft.

PostgreSQL runs in Docker Compose; Next.js runs locally. The project does not require Vercel hosting. Any compatible PostgreSQL provider can support an adapted deployment.

The recorded model runs used Bedrock's OpenAI-compatible Responses endpoint. Direct OpenAI is configurable, but its generation path was not successfully verified in this development environment. The [README](https://github.com/mattlgroff/custom-agent-harness#readme) documents provider setup.

Run the comparison with explicit model IDs:

```bash
npm run eval:compare -- --models gpt-5.6-sol,gpt-5.6-luna --repeats 2
```

This makes paid model calls and saves each attempt, including execution errors, under a new `.evals/` directory. The artifacts include source and golden-set snapshots, tool arguments and results, state, token counts, and latency.

You can rerun the code checks on the published results without calling a model:

```bash
npm run eval:compare -- --score-only docs/evals/results/sol-luna-2026-09-13
```

That command currently exits nonzero because the recorded outputs contain failures. Rescoring should preserve those failures until there is a reason to change the expectations or the evaluator.

## What I would carry into another domain

Dex Horthy's [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) connects several choices in this example: explicit context, structured tools, owned control flow, and human intervention. Kyle's HumanLayer post also argues for changing the harness in response to observed failures. Neither requires adding every available agent feature to a small application.

For another domain, start by writing down the job, the facts already available, and the actions the agent may request. Put the business rules in code. Then test conversations that force the model to use those facts, handle corrections, and explain a blocked action.

The next work on this POC is specific: prevent suggestions from inventing customer facts, stop offering approval actions as chat replies, and remove unsupported follow-up promises. After those changes, rerun the same golden set and add fresh cases. The existing results give us something concrete to improve against.
