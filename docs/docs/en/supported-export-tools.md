# Supported Export Tools List

> If you are already using the API in any of the following clients, CLI tools, or self-built backends, All API Hub can help you quickly transfer your site configuration, saving you the repetitive steps of filling in `Base URL`, `API Key`, and model names.

## Popular Clients and Tools

| Product | Official Description | Official Link |
|---|---|---|
| Cherry Studio | An AI productivity studio offering intelligent conversations, autonomous agents, and 300+ assistants, providing unified access to cutting-edge large models. | [Official Website](https://www.cherry-ai.com/) / [GitHub](https://github.com/CherryHQ/cherry-studio) |
| Kelivo | A Flutter-based LLM chat client for mobile and desktop. | [GitHub](https://github.com/Chevey339/kelivo) |
| CC Switch | A cross-platform desktop integrated assistant for Claude Code, Codex, OpenCode, openclaw, and Gemini CLI. | [GitHub](https://github.com/farion1231/cc-switch) |
| Kilo Code | Kilo is an integrated Agentic Engineering platform. | [Official Website](https://kilocode.ai/) / [GitHub](https://github.com/Kilo-Org/kilocode) |
| Roo Code | Roo Code allows an entire AI development team to reside directly within your code editor. | [Official Website](https://roocode.com/) / [GitHub](https://github.com/RooCodeInc/Roo-Code) |
| CLIProxyAPI | Encapsulates Gemini CLI, Antigravity, ChatGPT Codex, Claude Code, and Qwen Code into API services compatible with OpenAI / Gemini / Claude / Codex. | [Documentation](https://help.router-for.me/) / [GitHub](https://github.com/router-for-me/CLIProxyAPI) |
| Claude Code Router | Uses Claude Code as the coding infrastructure, allowing you to continuously receive Anthropic updates while deciding how to interact with the model. | [Official Website](https://musistudio.github.io/claude-code-router/) / [GitHub](https://github.com/musistudio/claude-code-router) |

## Exporting to Kelivo Mobile

From the actions for an account key or API credential, select **Export to Kelivo Mobile**. The dialog prefills the protocol, provider name, API key, and Base URL, and you can review or edit each field before copying. In Kelivo Mobile, open provider management and choose Import. You can then scan the QR code from the dialog or paste the copied mobile import code into the text box. Account keys do not have a fixed protocol, so the dialog defaults to OpenAI Compatible; you can change it to Anthropic or Google.

Kelivo for PC currently has no provider import entry point, so it cannot use the QR code or import code. To use the configuration on PC, manually add a provider using the protocol, provider name, API key, and Base URL shown in the dialog.

The import code contains only the provider name, API key, provider type, and the Base URL when applicable. It does not include the model list, custom request headers, or other All API Hub settings. OpenAI Compatible and Anthropic export the Base URL exactly as shown in the dialog. Google providers support only the official API address, so selecting Google fixes the address to that endpoint; switching back to another protocol restores the Base URL you previously entered.

Kelivo also supports OpenAI Responses, but the current `ai-provider:v1` import code does not save the Responses setting. Providers imported as `openai` always start in OpenAI Compatible mode. To use Responses, finish importing first, then enable it in Kelivo's provider settings.

::: warning Protect your import data
Both the QR code and Kelivo Mobile import code contain the API key in plain text. Do not share screenshots or paste the code into public chats, issues, logs, or repositories.
:::

## Self-Built Backends / Management Panels

If you have also set up an AI relay or aggregation backend, All API Hub can directly import the current site into your chosen backend target.

| Product | Official Description | Official Link |
|---|---|---|
| New API | A unified AI model aggregation and distribution center. | [Official Website](https://www.newapi.ai/) / [GitHub](https://github.com/QuantumNous/new-api) |
| AxonHub | Open-source AI Gateway, callable via any SDK with 100+ LLMs, built-in failover, load balancing, cost control, and full-link tracing. | [Official Website](https://axonhub.onrender.com/) / [GitHub](https://github.com/looplj/axonhub) |
| Claude Code Hub | A multi-vendor AI API proxy and operations platform for teams, unifying access to Claude, OpenAI Compatible, Codex, and Gemini, with support for elastic scheduling, monitoring, and price management. | [GitHub](https://github.com/ding113/claude-code-hub) |
| Octopus | An LLM API aggregation service for individuals. | [GitHub](https://github.com/bestruirui/octopus) |
| Veloera | This project is no longer maintained. | [GitHub](https://github.com/Veloera/Veloera) |
| DoneHub | This project is a secondary development based on one-hub. | [GitHub](https://github.com/deanxv/done-hub) |

## Related Documentation

- [Supported Site List](./supported-sites.md)
- [Quick Export Site Configuration](./quick-export.md)
- [CLIProxyAPI Integration](./cliproxyapi-integration.md)
- [Self-Hosted Site Management](./self-hosted-site-management.md)
