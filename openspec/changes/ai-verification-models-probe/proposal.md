## Why

The API Verification flow includes a “Models” probe, but it is currently limited to OpenAI-compatible APIs. This makes model discovery inconsistent across the supported API types (OpenAI, Anthropic, Google/Gemini), and forces unnecessary manual model ID guessing even when the upstream API provides a model listing endpoint.

## What Changes

- Expand the API Verification “Models” probe to support all currently supported API types: OpenAI-compatible, OpenAI, Anthropic, and Google/Gemini.
- Use the correct model listing endpoint per API type and return a consistent probe output (model count, suggested model ID, preview list).
- Keep error handling consistent with the other probes (sanitize summaries and avoid leaking secrets).

## Capabilities

### New Capabilities

- `ai-api-verification-models-probe`: Support model list probing for all supported API types and normalize endpoint selection and probe output.

### Modified Capabilities

<!-- none -->

## Impact

- API verification probe wiring and execution (`services/aiApiVerification/*`).
- Provider-specific model listing helpers already used elsewhere (`services/apiService/openaiCompatible`, `services/apiService/anthropic`, `services/apiService/google`).
- i18n strings and UI copy for the models probe (`locales/*/aiApiVerification.json`).
- Tests covering verification probes and model list behavior (Vitest).
