# Provider compatibility notes

Source review date: 2026-09-29.

## OpenAI GPT-6 Luna

The official [GPT-6 Luna model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) lists Responses and Chat Completions endpoints, function calling and structured outputs, reasoning effort values, and current base input/output pricing. It states that built-in tools and function calling use the Responses API when reasoning is enabled, while Chat Completions function calling is limited to `reasoning_effort: none`.

The reviewer therefore records provider, model ID, API format, reasoning setting, structured-output mode, tool mode, context/output limits, usage reporting, and price revision as one compatibility tuple. The first executable cloud profile uses Responses with server-built packets and no model tools in P1. This note does not freeze a price or imply that a future model route has the same contract.
