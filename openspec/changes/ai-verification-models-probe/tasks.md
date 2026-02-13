## 1. Models probe implementation

- [x] 1.1 Update `services/aiApiVerification/probes/modelsProbe.ts` to accept `apiType` and fetch model IDs for OpenAI-compatible/OpenAI, Anthropic, and Google/Gemini
- [x] 1.2 Normalize the probe base URL per API type and ensure probe input diagnostics report the correct `endpoint` path (`/v1/models` or `/v1beta/models`)
- [x] 1.3 Remove API-type gating from `services/aiApiVerification/probeRegistry.ts` and wire `apiType` into the models probe runner
- [x] 1.4 Update `services/aiApiVerification/probes.ts` so all supported API types include the `models` probe
- [x] 1.5 Update `services/aiApiVerification/suiteRunner.ts` to resolve model id via the `models` probe when not explicitly provided
- [x] 1.6 Update `components/VerifyApiDialog/index.tsx` to allow running the suite without an explicit model id (runs `models` first and skips model-required probes when needed)

## 2. Tests

- [x] 2.1 Extend `tests/services/aiApiVerification/apiVerificationService.test.ts` to cover the models probe for each supported API type
- [x] 2.2 Add a test asserting models probe failures redact secret strings from summaries
- [x] 2.3 Add a suite test asserting Google can resolve a model id from the models list when omitted

## 3. Localization

- [x] 3.1 Review `locales/en/aiApiVerification.json` and `locales/zh_CN/aiApiVerification.json` for any now-misleading models-probe strings and update them if needed

## 4. Verification

- [x] 4.1 Run `pnpm -s test` for updated coverage
- [x] 4.2 Run `pnpm -s compile` to ensure TypeScript types are sound
