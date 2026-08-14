# Supported Export Tools List

> If you are already using the API in any of the following clients, CLI tools, or self-built backends, All API Hub can help you quickly transfer your site configuration, saving you the repetitive steps of filling in `Base URL`, `API Key`, and model names.

## Popular Clients and Tools

| Product | Official Description | Official Link |
|---|---|---|
| Cherry Studio | An AI productivity studio offering intelligent conversations, autonomous agents, and 300+ assistants, providing unified access to cutting-edge large models. | [Official Website](https://www.cherry-ai.com/) / [GitHub](https://github.com/CherryHQ/cherry-studio) |
| Kelivo | A Flutter-based LLM chat client for mobile and desktop. | [GitHub](https://github.com/Chevey339/kelivo) |
| CC Switch | A cross-platform desktop assistant for Claude Code, Codex, Gemini CLI, Grok CLI, Hermes, OpenCode, and OpenClaw. | [GitHub](https://github.com/farion1231/cc-switch) |
| Cursor++ | Use Anthropic, OpenAI, Gemini, and other models in Cursor with your own API keys. | [Official Website](https://ccursor.cometix.dev/) |
| Kilo Code | Kilo is an integrated Agentic Engineering platform. | [Official Website](https://kilocode.ai/) / [GitHub](https://github.com/Kilo-Org/kilocode) |
| Roo Code | Roo Code allows an entire AI development team to reside directly within your code editor. | [Official Website](https://roocode.com/) / [GitHub](https://github.com/RooCodeInc/Roo-Code) |
| CLIProxyAPI | Encapsulates Gemini CLI, Antigravity, ChatGPT Codex, Claude Code, Qwen Code, and iFlow into API services compatible with OpenAI / Gemini / Claude / Codex. | [Documentation](https://help.router-for.me/) / [GitHub](https://github.com/router-for-me/CLIProxyAPI) |
| Claude Code Router | Uses Claude Code as the coding infrastructure, allowing you to continuously receive Anthropic updates while deciding how to interact with the model. | [Official Website](https://musistudio.github.io/claude-code-router/) / [GitHub](https://github.com/musistudio/claude-code-router) |

## Exporting to Kelivo Mobile

From the actions for an account key or API credential, select **Export to Kelivo Mobile**. The dialog prefills the protocol, provider name, API key, and Base URL, and you can review or edit each field before copying. In Kelivo Mobile, open provider management and choose Import. You can then scan the QR code from the dialog or paste the copied mobile import code into the text box. Account keys do not have a fixed protocol, so the dialog defaults to OpenAI Compatible; you can change it to Anthropic or Google.

Kelivo for PC currently has no provider import entry point, so it cannot use the QR code or import code. To use the configuration on PC, manually add a provider using the protocol, provider name, API key, and Base URL shown in the dialog.

The import code contains only the provider name, API key, provider type, and the Base URL when applicable. It does not include the model list, custom request headers, or other All API Hub settings. OpenAI Compatible and Anthropic export the Base URL exactly as shown in the dialog. Google providers support only the official API address, so selecting Google fixes the address to that endpoint; switching back to another protocol restores the Base URL you previously entered.

Kelivo also supports OpenAI Responses, but the current `ai-provider:v1` import code does not save the Responses setting. Providers imported as `openai` always start in OpenAI Compatible mode. To use Responses, finish importing first, then enable it in Kelivo's provider settings.

::: warning Protect your import data
Both the QR code and Kelivo Mobile import code contain the API key in plain text. Do not share screenshots or paste the code into public chats, issues, logs, or repositories.
:::

## Cursor++ Export

From the actions for an account key, select **Export Cursor++ Provider Configuration**. All API Hub reads the OpenAI-compatible model list and generates the `provider` object used by Cursor++ 0.0.13. The object includes a stable provider ID, name, `baseUrl`, API-key authentication, and a model list with `defaultOn: true`.

Before exporting, you can search or remove discovered models and enter or paste multiple model IDs. The export uses the account's existing OpenAI-compatible address by default. If the selected native protocol uses a different path, you can edit the provider Base URL directly.

Cursor++ currently supports these protocol types:

- **OpenAI Chat Completions** (default): exports `type: "openai-chat"`.
- **OpenAI Responses**: exports `type: "openai-responses"`.
- **Anthropic Messages**: exports `type: "anthropic"`.
- **Gemini**: exports `type: "gemini"`.

The protocol selection changes only how Cursor++ calls the provider. All API Hub still discovers models through the account's existing OpenAI-compatible models endpoint and does not automatically validate a corresponding native-protocol endpoint.

After copying, open **Edit Providers Config** in Cursor++ and add the object to the `providers` array in `~/.ccursor/providers.json`. The copied content is a single `provider`; it does not overwrite or replace the full configuration file. If model discovery fails or returns an empty list, add one or more model IDs manually before copying.

::: warning Protect the copied content
The exported JSON contains the API key in plain text. Do not paste it into public chats, issues, logs, or repositories.
:::

## Kilo Code / Roo Code Export

### Kilo Code 7.x

When you select Kilo Code 7.x, each account key or API credential is exported as a clearly named `provider`. Each `provider` contains every model ID discovered and normalized from its endpoint, plus any model IDs manually entered and retained for that provider. Inclusion in the export does not mean All API Hub has verified that the model works in every workflow. Select the default `model` first; when exporting multiple providers, also select the default `provider`.

Each `provider` can use one of these API protocols:

- **OpenAI Compatible** (default): exports `@ai-sdk/openai-compatible`.
- **OpenAI Responses**: exports `@ai-sdk/openai`.
- **Anthropic Messages**: exports `@ai-sdk/anthropic`.

The protocol selection changes only the AI SDK provider package used by Kilo Code. All API Hub keeps its existing model-discovery flow and exports the complete loaded result. Selecting Anthropic Messages does not skip model discovery, rewrite model IDs, or add unverified model metadata.

Choose either of these methods:

- **Download settings file**: Select **Download Kilo 7.x Settings**, then in Kilo Code go to Settings → About Kilo Code → Import, choose the downloaded `kilo-settings.json`, review it, and save. The download is a settings file that can be used directly with Kilo Code's current import flow.
- **Copy configuration**: Select **Copy Provider Configuration** to copy a top-level `{ provider, model }` fragment. Merge those two fields into the corresponding top-level fields of your existing settings JSON. The fragment is not a complete import file.

Kilo Code currently limits settings imports to 1 MiB. If the file exceeds that limit, export a single API credential by copying and manually merging its configuration. For a batch account-key export, select fewer providers or copy and merge the configuration manually.

::: tip The API key field may look empty after import
After importing settings with an inline API key, Kilo Code's provider editor may still show an empty API-key field. This is a current UI limitation, not an export failure: the imported inline key and the editor's authentication state are stored separately, and the key remains available at runtime.
:::

### Legacy Roo Code / Kilo Code 5.x

The legacy format exports one model per configuration. After selecting **Copy Legacy apiConfigs**, merge the copied content into `providerProfiles.apiConfigs` in your settings. To use a complete settings file instead, download `kilo-code-settings.json` and import it with the matching version's settings import feature.

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
