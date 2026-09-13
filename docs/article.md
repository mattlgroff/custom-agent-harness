# Building Custom Agent Harnesses for Specific Domains Using Vercel's AI SDK

## Start With Something Someone Can Use

I wanted a concrete example of a custom agent harness that people could run, inspect, and adapt to their own application.

Most of the people I expect to read this want an agent inside a web app. Someone opens a page, describes a problem, and gets useful help. Sometimes that help involves an action that a person needs to approve.

So I built a small support workbench for a fictional homewares store called **Parcel & Pine**. Its job is deliberately narrow: investigate a damaged order and propose a replacement.

The stack is Next.js, Vercel's AI SDK, AI Elements, and PostgreSQL. PostgreSQL runs locally through Docker Compose. The app runs with `npm run dev`. There is no deployment, no Eve dependency, and no requirement to use Vercel hosting.

[The complete example is on GitHub](https://github.com/mattlgroff/custom-agent-harness).

![The Parcel and Pine local support workbench](screenshots/workbench.png)

_The actual local application. Each scenario uses isolated, fictional store data._

## What I Mean by a Harness

The [LangChain article about custom agent harnesses](https://www.langchain.com/blog/how-to-build-a-custom-agent-harness) was the starting point for this project. Its useful question is how to give an agent the context and capabilities its task actually requires.

Calling something a “domain-specific harness” does not explain what it does. The useful part is identifying the pieces you control.

In this example, the harness consists of the instructions, available tools, context supplied on each request, execution limits, and application code that validates and records actions. The agent is what runs inside those boundaries to help with damaged orders.

The customization surfaces are ordinary TypeScript files. You can read the prompt, change a tool, adjust the policy, and test the resulting behavior. You do not need to reverse-engineer a hidden support workflow.

## Why I Used the AI SDK

I originally considered Pi. It is a good fit when the goal is to customize an existing agent runtime, including its terminal experience, tools, and session behavior.

For this example, the product is the web application. I wanted the model to call a few application functions and stream its response into a conversation UI.

The AI SDK makes that distinction explicit. [`HarnessAgent`](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview) wraps established runtimes such as Pi. [`ToolLoopAgent`](https://ai-sdk.dev/docs/agents/overview) is the model-and-tools loop you configure for your own application. I used `ToolLoopAgent`.

[AI Elements](https://ai-sdk.dev/elements) supplies the conversation, message rendering, and tool-call presentation. Our own components show the order, saved proposal, reviewer controls, and receipt.

Using these libraries does not decide where the app or database must run. The schema uses ordinary PostgreSQL. Any compatible PostgreSQL provider would be fine if you later choose to host it. This walkthrough uses PostgreSQL locally and makes no cloud-provider recommendation.

## One Damaged Mug

The happy path starts with a customer message:

> One of the mugs in order PP-1001 arrived broken. Can you arrange a replacement?

The assistant looks up that order, reads the damaged-item policy, checks replacement stock, and saves a proposal for one mug.

The policy is fictional and intentionally simple. Damage must be reported within 30 days of delivery. The replacement quantity cannot exceed the purchased quantity. Stock must exist. A human must approve the saved proposal.

The scenarios use a fixed reference date. Otherwise, an eligible order in this article could become ineligible by the time someone clones the repository.

A proposal does not change stock. Approval does. Those are different database operations, and the UI makes the distinction visible.

![A real model-backed replacement proposal awaiting human review](screenshots/live-proposal.png)

_The assistant investigated the order and saved a proposal. No replacement has been fulfilled._

## Keep the Tool Surface Small

The selected case is part of the input. Before every turn, the server loads the authorized case and supplies its order, customer report, damaged quantity, stock, and saved resolution. The page displays the same seeded customer report. “Let's replace it for them” should work without retyping the order number. Missing damage details stay unknown; buying two mugs does not mean two mugs were damaged.

The assistant can also call `suggestReplies` with up to three short next messages. AI Elements renders them above the composer. Clicking one submits an ordinary user message through the same chat endpoint. Suggestions are saved with the conversation, disappear while a new turn runs, and confer no approval authority.

Customer communication is a separate audience from the operator conversation. A request to notify the customer produces a labeled draft, because this example has no sending tool. The draft uses the saved resolution and omits internal review terminology. Approval instructions belong outside that draft and address the operator directly. Suggested replies are hidden when their saved proposal status no longer matches the case.

The agent has five business tools and one presentation tool:

| Tool                 | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `lookupOrder`        | Find the customer-provided order number within this case |
| `readPolicy`         | Read the applicable damaged-item policy                  |
| `checkStock`         | Check replacement availability                           |
| `proposeReplacement` | Validate and save a pending proposal                     |
| `checkResolution`    | Read the actual proposal and receipt status              |

The case and browser owner are bound by the server. They are not arguments the model can choose. If the model asks for an order outside its case, the tool does not return it.

There is no shell, arbitrary SQL tool, approval tool, or generic HTTP tool. For this task, those capabilities would add authority without helping the customer.

The central configuration looks like this, with the instructions and tool definitions omitted here for space:

```ts
return new ToolLoopAgent({
  model: supportModel(),
  providerOptions: {
    openai: {
      forceReasoning: true,
      reasoningEffort: "medium",
      reasoningSummary: null,
      store: false,
    },
  },
  instructions,
  tools,
  stopWhen: isStepCount(8),
  maxOutputTokens: 2500,
  maxRetries: 1,
});
```

The example uses **GPT-5.6 Sol with medium reasoning**. I verified it through Amazon Bedrock's OpenAI-compatible Responses endpoint. Direct OpenAI is also configurable, but that generation path was not successfully verified in this development session.

The Bedrock model ID is `openai.gpt-5.6-sol`. That prefix caused a useful integration finding: the AI SDK did not infer that it was a reasoning model and warned that it was dropping the reasoning option. Setting `forceReasoning: true` corrected that behavior. A test captures the outgoing request and checks that `reasoning.effort` is actually `medium`.

AWS's [model-specific documentation](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-sol.html) also specifies `/openai/v1` for this model on the Mantle endpoint. Checking the exact model documentation mattered.

## Approval Is an Application Boundary

A prompt saying “always ask permission” is not enough for the approval requirement I wanted to demonstrate.

The model can save a proposal. A separately authenticated reviewer decides it through an application endpoint. The reviewer credential is not given to the model or included in its tools.

When the reviewer clicks Approve, the server loads the existing proposal. It checks the reviewer session and case ownership, locks the database records, and rechecks the current policy, quantity, and stock. It then updates stock and saves the receipt in one transaction.

Repeating the request returns the same receipt. It does not decrement inventory again. A rejected proposal cannot later be approved.

![The recorded replacement and the assistant's status follow-up](screenshots/live-approved.png)

_The reviewer approved the saved proposal, and the assistant checked the resulting receipt. This records a simulated replacement, not a real shipment._

The local reviewer token keeps the example small enough to follow. It is not a production identity system. If you adapt this for real users, replace that mechanism with authentication and authorization appropriate to your application.

## Own the Conversation Context

The chat endpoint does not accept the browser's version of history as truth.

It accepts the latest user text, checks its size and role, and loads the earlier conversation from PostgreSQL. A caller cannot manufacture an assistant message saying an action was approved and have it treated as a business decision.

The model receives short tool results with the information it needs. The order lookup returns the relevant order. The policy tool returns the applicable rules. The proposal tool returns the saved ID, quantity, and status.

That last detail came from testing. Returning a raw database row worked in the non-streaming scenario runner but failed during the streaming conversation because PostgreSQL timestamps were JavaScript `Date` objects. The next model step required JSON-compatible values. Returning a smaller result fixed the streaming path and removed fields the model did not need.

The streaming response also generates a stable ID for each assistant message. Without that ID, a conversation can look correct initially and fail when it is reloaded for a follow-up. The chat-route regression test covers that boundary.

The app records tool and application events for inspection. It does not show model reasoning text. The case panel reads business records directly, so the user can still see a saved proposal even if the model fails to finish its explanation.

## Start Small, Then Fix What Fails

Kyle's HumanLayer post, [Skill Issue: Harness Engineering for Coding Agents](https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents), argues for starting with a simple setup, working on real problems, and keeping configuration that demonstrably helps.

I think that applies here too. We need domain rules and an approval boundary because the task requires them. We do not need a collection of skills, subagents, MCP servers, memory systems, and custom compaction strategies just to make the architecture look complete.

This example starts with five business tools, a suggested-reply tool, and a short prompt. If an adapted version repeatedly misses policy details, returns noisy context, or loses track of a larger task, that is evidence to investigate. It is not a reason to install every possible agent feature in advance.

The provider configuration and streaming serialization fixes are actual findings from building this project. I am not claiming that we benchmarked this harness against another framework or established a general reliability improvement.

## Verify the Behavior, Not the Confidence

The deterministic tests use real PostgreSQL transactions. They check eligible and ineligible proposals, stock changes between proposal and approval, simultaneous duplicate approvals, rejected proposals, case ownership, and stale agent runs.

Browser tests cover the visible reviewer flow, authenticated endpoints, persisted results, and mobile layout. Those tests use labeled fixtures and do not make paid model calls.

The separate live suite sends real requests through the configured provider. It covers the eligible replacement, missing information, an expired policy window, and unavailable stock.

The live browser test goes further: it obtains a model-generated proposal, restarts this project's PostgreSQL container, reloads the saved case, approves the proposal, and asks the model to read the resulting receipt. That is the workflow a reader can see and repeat.

These checks establish that the tested cases worked. They are not a statistical reliability benchmark. They also do not prove exactly-once execution against a shipping service, because there is no shipping service connected.

## Run It Yourself

After cloning the [repository](https://github.com/mattlgroff/custom-agent-harness), use:

```sh
npm ci
npm run setup
```

Configure your provider credential in `.env.local`, then:

```sh
npm run db:up
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`, choose a scenario, and send the suggested message. To approve a pending proposal, unlock the reviewer panel using the generated `OPERATOR_TOKEN` from your local environment file. Keep that token out of the conversation.

The repository documents the deterministic checks and the explicit commands for paid model verification. It also includes the exact code used to capture the screenshots.

## Where the 12 Factors Fit

Dex Horthy's [12-Factor Agents](https://github.com/humanlayer/12-factor-agents) is a useful set of design principles for this work. Explicit prompts and context, structured tools, owned control flow, focused scope, and human interaction all have concrete counterparts in this example.

I would not add features just to fill twelve rows in a table. Here, persistence and approval exist because someone needs to review a replacement after the model has finished its turn. The database is authoritative because inventory and receipts must agree.

That is the useful starting point for another domain too: pick the real task, decide what the agent may do, define how you will verify the outcome, and keep the harness small enough to understand.

## Evaluate the domain workflow before changing models

The first tests in this project verified that tools ran and approvals persisted. They missed failures in the support experience: the assistant asked for facts already on the page, leaked internal review language into a customer draft, and suggested checking again instead of helping the operator make a decision.

The comparison runner now accepts explicit models and uses a shared agent-authored golden set. Its ten scenarios include multi-turn clarification, approval and rejection, incorrect conversation history, policy limits, and customer-copy requests. Code checks evaluate required and forbidden tools, prerequisite steps, quantities and saved state. There is no LLM judge in the suite. Codex authored the expectations and separately reviewed the resulting traces, including suggested replies. Those review judgments are recorded as agent judgments, not human labels.

Across two repetitions, Sol and Luna each produced 24 evaluated turns. Codex judged the tool decisions acceptable in 23 Sol turns and 22 Luna turns; suggestion sets in 18 Sol turns and 19 Luna turns; and responses in 23 Sol turns and 20 Luna turns. Both models invented damage details in suggested answers, and both attempted an expired-order replacement that the application blocked. Luna also made more unsupported customer-update promises in this sample. These are small, correlated development results, not production quality estimates.

The [eval report and recorded traces](https://github.com/mattlgroff/custom-agent-harness/blob/main/docs/evals/comparison.md) show why a cheaper or faster model should be compared on the actual workflow. A successful tool call does not prove that the assistant chose the right action or gave the operator something useful to say.
