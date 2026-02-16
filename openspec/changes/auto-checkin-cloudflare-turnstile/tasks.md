## 1. Runtime Contracts

- [ ] 1.1 Add `ContentWaitForTurnstileToken` runtime action ID and route it in the content message handler
- [ ] 1.2 Add background runtime action ID for Turnstile-assisted temp-context fetch and route it in `runtimeMessages`

## 2. Content Turnstile Guard

- [ ] 2.1 Implement Turnstile detection + throttled auto-start helpers (`entrypoints/content/messageHandlers/utils/turnstileGuard.ts`)
- [ ] 2.2 Implement content handler to wait for a Turnstile token with bounded timeout (`entrypoints/content/messageHandlers/handlers/turnstileGuard.ts`)
- [ ] 2.3 Add unit tests for Turnstile detection + auto-start throttling (`tests/entrypoints/content/messageHandlers/utils/turnstileGuard.test.ts`)

## 3. Temp Context Turnstile-Assisted Fetch

- [ ] 3.1 Implement background handler that navigates temp context to the target page, waits for protection guards, waits for Turnstile token, then performs the API fetch in the same tab (`entrypoints/background/tempWindowPool.ts`)
- [ ] 3.2 Add a `utils/tempWindowFetch.ts` helper that calls the Turnstile-assisted fetch handler from background and non-background contexts

## 4. New API Provider Fallback

- [ ] 4.1 Detect Turnstile-required check-in failures in `services/autoCheckin/providers/newApi.ts`
- [ ] 4.2 Perform a single Turnstile-assisted retry in temp context (page simulation + token + fetch) and return actionable failure when token cannot be obtained
- [ ] 4.3 Add i18n keys/messages for Turnstile-required outcomes in `locales/en/autoCheckin.json` and `locales/zh_CN/autoCheckin.json`
- [ ] 4.4 Add provider unit tests for the Turnstile fallback path (`tests/services/autoCheckin/providers/newApi.test.ts`)
