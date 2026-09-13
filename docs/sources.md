# Sources and design decisions

Reviewed September 13, 2026. Installed package documentation and types are the implementation authority; npm's lockfile records exact installed versions.

- [How to Build a Custom Agent Harness](https://www.langchain.com/blog/how-to-build-a-custom-agent-harness): starting question and task/harness fit, not a template to copy.
- [Skill Issue: Harness Engineering for Coding Agents](https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents): Kyle, March 12, 2026. Minimalism, context control, concise verification and removing unhelpful configuration. The article's focus is coding agents; our business-agent implementation adapts the principles.
- [12-Factor Agents](https://github.com/humanlayer/12-factor-agents): Dex Horthy's modular design guidance, particularly explicit prompts/context, structured tools, owned control flow and human interaction. No certification claim.
- [AI SDK agents](https://ai-sdk.dev/docs/agents/overview) and [building agents](https://ai-sdk.dev/docs/agents/building-agents): ToolLoopAgent, typed tools, step control and UI integration.
- [AI SDK harnesses](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview): HarnessAgent preserves established runtimes such as Pi. Our bounded business workflow instead uses ToolLoopAgent.
- [AI SDK message persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence): trusted history, streaming and persistence.
- [AI Elements](https://ai-sdk.dev/elements): source-installed presentation components.
- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol): requested model and medium reasoning.

## Minimal baseline

Five domain tools are sufficient for this bounded example. No runtime skills, MCP servers, subagents, shell tool, vector database or custom summarizer have been added. Those features would need an observed problem and a measurable benefit.

This repository does not present invented before/after model improvements. The baseline model-backed scenario suite is `npm run verify:live`. Store and browser tests are separate evidence and must not be described as successful LLM evaluations.

- [AWS GPT-5.6 Sol model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-openai-gpt-56-sol.html): model-specific `/openai/v1` base path and `openai.gpt-5.6-sol` model ID on Bedrock Mantle.
- [AWS Responses API](https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-mantle.html): bearer authentication and OpenAI-compatible request format.
