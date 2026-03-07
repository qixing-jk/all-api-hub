## Why

Today the CLIProxyAPI import flow always creates an OpenAI-compatible provider, even though CLIProxyAPI supports multiple provider families with different configuration shapes and endpoint rules. This forces users importing non-OpenAI providers to fix the generated config manually, and it makes provider-specific path handling easy to get wrong.

## What Changes

- Add provider type selection to the CLIProxyAPI import dialog instead of assuming every import target is OpenAI-compatible.
- Support type-aware endpoint defaults and path completion rules during import so the saved provider config matches the selected CLIProxyAPI provider family.
- Provide provider-family-specific model suggestions in the import dialog so Claude, Gemini, and Codex imports show corresponding upstream model options instead of OpenAI-compatible-only options.
- Extend the CLIProxyAPI import service to build and update the correct provider payload for each supported type, including mapping OpenAI credentials to `codex-api-key` by default while preserving the current OpenAI-compatible flow for OpenAI-compatible sources.
- Localize the new provider-type UI and add focused tests for provider selection, endpoint handling, and backward compatibility.

## Capabilities

### New Capabilities

- `cli-proxy-provider-type-import`: Allow users to choose a CLIProxyAPI provider type during import and apply provider-specific endpoint completion/normalization so imported providers work without manual post-editing.

### Modified Capabilities

<!-- None -->

## Impact

- UI flows that open the CLIProxyAPI import dialog from token/profile export actions, including `src/components/CliProxyExportDialog.tsx` and its calling entrypoints.
- Integration logic in `src/services/integrations/cliProxyService.ts` and related URL normalization helpers.
- i18n resources for new labels, descriptions, and validation/error messages.
- Tests covering provider-type selection, type-aware endpoint handling, provider-specific model suggestions, OpenAI-to-Codex default mapping, and existing OpenAI-compatible import behavior.
