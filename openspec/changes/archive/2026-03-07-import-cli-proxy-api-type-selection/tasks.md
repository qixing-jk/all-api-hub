## 1. CLIProxy provider model and service adapters

- [x] 1.1 Add a `CliProxyProviderType` definition and shared provider metadata table for `openai-compatibility`, `codex-api-key`, `claude-api-key`, and `gemini-api-key`
- [x] 1.2 Extend the CLIProxy import request/options shape to carry the selected provider type and any source API-type hint needed for preselection
- [x] 1.3 Refactor `src/services/integrations/cliProxyService.ts` to fetch, patch, and put the correct management list for each supported provider type
- [x] 1.4 Implement provider-family-specific update-vs-append matching rules for OpenAI compatibility, Codex, Claude, and Gemini entries
- [x] 1.5 Add provider-family-specific base URL normalization helpers, including Codex path stripping and optional-empty handling for Claude/Gemini

## 2. CLIProxy import dialog behavior

- [x] 2.1 Extend `src/components/CliProxyExportDialog.tsx` with a provider type selector and translated helper text for each supported provider family
- [x] 2.2 Make dialog fields conditional by provider type (`providerName` visibility, `baseUrl` requiredness, default-upstream hints, manual model entry, provider-specific model suggestions)
- [x] 2.3 Preserve the current OpenAI-compatible default for account/token flows that do not include an API-type hint
- [x] 2.4 Update dialog submit logic to send the selected provider type and normalized provider-family-specific inputs to the integration service
- [x] 2.5 Add or update locale strings for provider labels, descriptions, validation copy, and success/error messages

## 3. Source-type mapping and profile integration

- [x] 3.1 Pass API credential profile `apiType` through the CLIProxy export flow instead of dropping it in the export shims
- [x] 3.2 Implement provider preselection mapping for profile exports: `openai-compatible` -> `openai-compatibility`, `openai` -> `codex-api-key`, `anthropic` -> `claude-api-key`, `google` -> `gemini-api-key`
- [x] 3.3 Ensure profile-based imports write only to the selected provider list, including the OpenAI-to-Codex default path
- [x] 3.4 Keep existing OpenAI-compatible import behavior intact when the source is OpenAI-compatible or the user manually chooses `openai-compatibility`

## 4. Tests and validation

- [x] 4.1 Add unit tests for provider-type mapping and provider-family-specific base URL normalization
- [x] 4.2 Add service tests for selecting the correct management endpoint and updating matching entries without creating duplicates
- [x] 4.3 Add component tests for dialog provider switching, required-field changes, provider-specific model suggestions, and OpenAI profile preselection to `codex-api-key`
- [x] 4.4 Run the smallest affected validation set for the changed files, then run one broader scoped check before finalizing implementation

