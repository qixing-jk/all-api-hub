# AI API Service Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split AI API protocol helpers from the account-site `apiService` layer, with AI API modules importing neutral transport code instead of `~/services/apiService/**`.

**Architecture:** Extract the shared request/error/limiter primitives from `apiService/common` into `services/apiTransport`, keep account-site domain types in `apiService/common/type.ts`, and preserve old account-site common import paths as thin re-exports or aliases. Move OpenAI-compatible, Anthropic, and Google model-list helpers into `services/aiApi`, update all call sites and test mocks to the new paths, and enforce the new dependency direction with ESLint.

**Tech Stack:** TypeScript, WXT, ESLint flat config, Vitest, MSW, existing `pnpm compile` and `pnpm run validate:staged` validation.

---

## File Structure

- Create `src/services/apiTransport/errors.ts`
  - Owns `API_ERROR_CODES`, `ApiErrorCode`, `ApiError`, and `isTempWindowUnsupportedErrorCode`.
- Create `src/services/apiTransport/type.ts`
  - Owns neutral transport DTOs: `ApiResponse`, `AuthConfig`, `ApiTransportRequest`, `FetchApiOptions`, fetch-context types, and OpenAI-compatible upstream model-list types.
  - Exports legacy type aliases such as `ApiServiceRequest` and `API_SERVICE_FETCH_CONTEXT_KINDS` so account-site code can migrate progressively.
- Create `src/services/apiTransport/constant.ts`
  - Owns `REQUEST_CONFIG`.
- Create `src/services/apiTransport/compatHeaders.ts`
  - Owns compatible user-id header fan-out used by the current request builder and site detection.
- Create `src/services/apiTransport/minIntervalLimiter.ts`
  - Owns the per-key min-interval limiter.
- Create `src/services/apiTransport/siteRequestLimiter.ts`
  - Owns the process-local per-site request limiter used by request transport.
- Create `src/services/apiTransport/request.ts`
  - Owns `fetchApiData`, `fetchApi`, `extractDataFromApiResponseBody`, and `isHttpUrl`.
- Modify `src/services/apiService/common/errors.ts`
  - Re-export from `~/services/apiTransport/errors`.
- Modify `src/services/apiService/common/constant.ts`
  - Re-export from `~/services/apiTransport/constant`.
- Modify `src/services/apiService/common/compatHeaders.ts`
  - Re-export from `~/services/apiTransport/compatHeaders`.
- Modify `src/services/apiService/common/minIntervalLimiter.ts`
  - Re-export from `~/services/apiTransport/minIntervalLimiter`.
- Modify `src/services/apiService/common/siteRequestLimiter.ts`
  - Re-export from `~/services/apiTransport/siteRequestLimiter`.
- Modify `src/services/apiService/common/type.ts`
  - Remove neutral request DTO definitions and re-export or alias them from `~/services/apiTransport/type`.
  - Keep account-site domain types such as `PricingResponse`, `ModelPricing`, `LogItem`, `CreateTokenRequest`, and check-in types.
- Modify `src/services/apiService/common/utils.ts`
  - Re-export request helpers from `~/services/apiTransport/request`.
  - Keep account-site utility functions: `getTodayTimestampRange`, `aggregateUsageData`, and `extractAmount`.
- Modify `src/types/tempWindowFetch.ts`
  - Import `ApiErrorCode` from `~/services/apiTransport/errors`.
- Modify `src/utils/browser/tempWindowFetch.ts`
  - Import transport errors, `ApiResponse`, and request parsing helpers from `~/services/apiTransport/**`.
- Create `src/services/aiApi/openaiCompatible/index.ts`
  - Moved from `src/services/apiService/openaiCompatible/index.ts`, importing `fetchApiData` and types from `apiTransport`.
- Create `src/services/aiApi/anthropic/index.ts`
  - Moved from `src/services/apiService/anthropic/index.ts`, importing `fetchApi` from `apiTransport`.
- Create `src/services/aiApi/google/index.ts`
  - Moved from `src/services/apiService/google/index.ts`, importing `fetchApi` from `apiTransport`.
- Delete `src/services/apiService/openaiCompatible/index.ts`
- Delete `src/services/apiService/anthropic/index.ts`
- Delete `src/services/apiService/google/index.ts`
- Modify AI API production import call sites:
  - `src/components/CCSwitchExportDialog.tsx`
  - `src/components/ClaudeCodeRouterImportDialog.tsx`
  - `src/components/CliProxyExportDialog.tsx`
  - `src/components/KiloCodeExportDialog.tsx`
  - `src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx`
  - `src/services/apiCredentialProfiles/modelCatalog.ts`
  - `src/services/managedSites/utils/fetchTokenScopedModels.ts`
  - `src/services/verification/aiApiVerification/probes/modelsProbe.ts`
  - `src/services/verification/webAiApiCheck/background.ts`
- Modify AI API test import and mock paths:
  - `tests/components/CCSwitchExportDialog.test.tsx`
  - `tests/components/ClaudeCodeRouterImportDialog.test.tsx`
  - `tests/components/CliProxyExportDialog.test.tsx`
  - `tests/components/KiloCodeExportDialog.test.tsx`
  - `tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx`
  - `tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx`
  - `tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx`
  - `tests/services/aiApiVerification/apiVerificationService.test.ts`
  - `tests/services/aiApiVerification/probes.additional.test.ts`
  - `tests/services/apiCredentialProfiles/modelCatalog.test.ts`
  - `tests/services/managedSites/fetchManagedSiteAvailableModels.test.ts`
  - `tests/services/managedSites/fetchTokenScopedModels.test.ts`
  - `tests/services/newApiService/newApiService.test.ts`
  - `tests/services/veloeraService/veloeraService.test.ts`
  - `tests/services/webAiApiCheck/background.test.ts`
- Rename or move AI API helper tests:
  - Move `tests/services/apiService/openaiCompatible.index.test.ts` to `tests/services/aiApi/openaiCompatible.index.test.ts`.
  - Move `tests/services/apiService.modelFetchers.test.ts` to `tests/services/aiApi/modelFetchers.test.ts`.
- Rename or move transport tests:
  - Move `tests/services/apiService/common/fetchApi.test.ts` to `tests/services/apiTransport/request.test.ts`.
  - Move `tests/services/apiService/common/errors.test.ts` to `tests/services/apiTransport/errors.test.ts`.
  - Move `tests/services/apiService/common/compatHeaders.test.ts` to `tests/services/apiTransport/compatHeaders.test.ts`.
  - Move `tests/services/apiService/common/minIntervalLimiter.test.ts` to `tests/services/apiTransport/minIntervalLimiter.test.ts`.
  - Move `tests/services/apiService/common/siteRequestLimiter.test.ts` to `tests/services/apiTransport/siteRequestLimiter.test.ts`.
- Modify `eslint.config.js`
  - Add an ESLint `no-restricted-imports` guard for `src/services/aiApi/**`.

---

### Task 1: Extract Transport Errors, Types, Constants, and Limiters

**Files:**
- Create: `src/services/apiTransport/errors.ts`
- Create: `src/services/apiTransport/type.ts`
- Create: `src/services/apiTransport/constant.ts`
- Create: `src/services/apiTransport/compatHeaders.ts`
- Create: `src/services/apiTransport/minIntervalLimiter.ts`
- Create: `src/services/apiTransport/siteRequestLimiter.ts`
- Modify: `src/services/apiService/common/errors.ts`
- Modify: `src/services/apiService/common/type.ts`
- Modify: `src/services/apiService/common/constant.ts`
- Modify: `src/services/apiService/common/compatHeaders.ts`
- Modify: `src/services/apiService/common/minIntervalLimiter.ts`
- Modify: `src/services/apiService/common/siteRequestLimiter.ts`
- Test: `tests/services/apiTransport/errors.test.ts`
- Test: `tests/services/apiTransport/compatHeaders.test.ts`
- Test: `tests/services/apiTransport/minIntervalLimiter.test.ts`
- Test: `tests/services/apiTransport/siteRequestLimiter.test.ts`

- [ ] **Step 1: Move primitive files with git-aware renames**

Run:

```powershell
New-Item -ItemType Directory -Force src\services\apiTransport
git mv src\services\apiService\common\errors.ts src\services\apiTransport\errors.ts
git mv src\services\apiService\common\constant.ts src\services\apiTransport\constant.ts
git mv src\services\apiService\common\compatHeaders.ts src\services\apiTransport\compatHeaders.ts
git mv src\services\apiService\common\minIntervalLimiter.ts src\services\apiTransport\minIntervalLimiter.ts
git mv src\services\apiService\common\siteRequestLimiter.ts src\services\apiTransport\siteRequestLimiter.ts
```

Expected: all five files are staged as renames, and the old paths no longer exist.

- [ ] **Step 2: Recreate old account-site common primitive paths as thin re-exports**

Create `src/services/apiService/common/errors.ts`:

```ts
export {
  API_ERROR_CODES,
  ApiError,
  isTempWindowUnsupportedErrorCode,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
```

Create `src/services/apiService/common/constant.ts`:

```ts
export { REQUEST_CONFIG } from "~/services/apiTransport/constant"
```

Create `src/services/apiService/common/compatHeaders.ts`:

```ts
export {
  COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE,
  buildCompatUserIdHeaders,
} from "~/services/apiTransport/compatHeaders"
```

Create `src/services/apiService/common/minIntervalLimiter.ts`:

```ts
export { createMinIntervalLimiter } from "~/services/apiTransport/minIntervalLimiter"
```

Create `src/services/apiService/common/siteRequestLimiter.ts`:

```ts
export {
  createSiteRequestLimiter,
  withSiteApiRequestLimit,
} from "~/services/apiTransport/siteRequestLimiter"
```

- [ ] **Step 3: Create neutral transport type definitions**

In `src/services/apiTransport/type.ts`, add:

```ts
import type {
  TempWindowFallbackAllowlist,
  TempWindowResponseType,
} from "~/types/tempWindowFetch"
import { AuthTypeEnum } from "~/types"

export interface ApiResponse<T = any> {
  success: boolean
  data: T
  message: string
}

export interface AuthConfig {
  /** 认证类型: cookie | access_token | none */
  authType: AuthTypeEnum
  /** Cookie string used as a fallback when browser cookie injection is unavailable. */
  cookie?: string
  /** Access token used by token/access-token authentication. */
  accessToken?: string
  /** User ID used by cookie auth and compatible site headers. */
  userId?: number | string
  /** Sub2API refresh token, used by extension-managed sessions. */
  refreshToken?: string
  /** Sub2API access-token expiry timestamp in milliseconds since epoch. */
  tokenExpiresAt?: number
}

export const API_TRANSPORT_FETCH_CONTEXT_KINDS = {
  CURRENT_TAB: "current-tab",
  BROWSER_CONTEXT: "browser-context",
} as const

export const API_SERVICE_FETCH_CONTEXT_KINDS =
  API_TRANSPORT_FETCH_CONTEXT_KINDS

export type ApiTransportFetchContextKind =
  (typeof API_TRANSPORT_FETCH_CONTEXT_KINDS)[keyof typeof API_TRANSPORT_FETCH_CONTEXT_KINDS]

type ApiTransportBrowserFetchContext = {
  incognito?: boolean
  cookieStoreId?: string
}

export type ApiTransportFetchContext =
  | (ApiTransportBrowserFetchContext & {
      kind: typeof API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB
      tabId: number
      origin: string
    })
  | (ApiTransportBrowserFetchContext & {
      kind: typeof API_TRANSPORT_FETCH_CONTEXT_KINDS.BROWSER_CONTEXT
    })

export type ApiServiceFetchContextKind = ApiTransportFetchContextKind
export type ApiServiceFetchContext = ApiTransportFetchContext

export function summarizeApiTransportFetchContext(
  fetchContext: ApiTransportFetchContext | undefined,
) {
  if (!fetchContext) return undefined

  return {
    kind: fetchContext.kind,
    incognito: fetchContext.incognito === true,
    hasCookieStoreId: Boolean(fetchContext.cookieStoreId),
    ...(fetchContext.kind === API_TRANSPORT_FETCH_CONTEXT_KINDS.CURRENT_TAB
      ? {
          tabId: fetchContext.tabId,
          origin: fetchContext.origin,
        }
      : {}),
  }
}

export const summarizeApiServiceFetchContext =
  summarizeApiTransportFetchContext

export interface ApiTransportRequest {
  auth: AuthConfig
  baseUrl: string
  data?: Record<string, any>
  accountId?: string
  fetchContext?: ApiTransportFetchContext
}

export type ApiServiceRequest = ApiTransportRequest

export interface FetchApiOptions {
  endpoint: string
  options?: RequestInit
  responseType?: TempWindowResponseType
  tempWindowFallback?: TempWindowFallbackAllowlist
  currentTabTransport?: "prefer" | "disabled"
}

export interface OpenAIAuthParams {
  baseUrl: string
  apiKey: string
  abortSignal?: AbortSignal
}

export type UpstreamModelItem = {
  id: string
  object: "model"
  created: number
  owned_by: string
}

export type UpstreamModelList = UpstreamModelItem[]
```

- [ ] **Step 4: Replace neutral definitions in account-site common type with imports and aliases**

In `src/services/apiService/common/type.ts`, delete the existing definitions for these names:

```ts
ApiResponse
AuthConfig
API_SERVICE_FETCH_CONTEXT_KINDS
ApiServiceFetchContextKind
ApiServiceFetchContext
summarizeApiServiceFetchContext
ApiServiceRequest
FetchApiOptions
OpenAIAuthParams
UpstreamModelItem
UpstreamModelList
```

Then add this import/export block near the top after existing imports:

```ts
export {
  API_SERVICE_FETCH_CONTEXT_KINDS,
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  summarizeApiServiceFetchContext,
  summarizeApiTransportFetchContext,
  type ApiResponse,
  type ApiServiceFetchContext,
  type ApiServiceFetchContextKind,
  type ApiServiceRequest,
  type ApiTransportFetchContext,
  type ApiTransportFetchContextKind,
  type ApiTransportRequest,
  type AuthConfig,
  type FetchApiOptions,
  type OpenAIAuthParams,
  type UpstreamModelItem,
  type UpstreamModelList,
} from "~/services/apiTransport/type"
```

- [ ] **Step 5: Update moved primitive imports inside transport files**

In `src/services/apiTransport/compatHeaders.ts`, keep this import because it is not an `apiService` dependency:

```ts
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
```

In `src/services/apiTransport/errors.ts`, keep this import:

```ts
import { TEMP_WINDOW_HEALTH_STATUS_CODES } from "~/types"
```

No `src/services/apiTransport/*.ts` file should import from `~/services/apiService/**`.

- [ ] **Step 6: Move primitive tests to the transport test directory**

Run:

```powershell
New-Item -ItemType Directory -Force tests\services\apiTransport
git mv tests\services\apiService\common\errors.test.ts tests\services\apiTransport\errors.test.ts
git mv tests\services\apiService\common\compatHeaders.test.ts tests\services\apiTransport\compatHeaders.test.ts
git mv tests\services\apiService\common\minIntervalLimiter.test.ts tests\services\apiTransport\minIntervalLimiter.test.ts
git mv tests\services\apiService\common\siteRequestLimiter.test.ts tests\services\apiTransport\siteRequestLimiter.test.ts
```

Update imports in moved tests:

```ts
// errors.test.ts
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

// compatHeaders.test.ts
import {
  COMPAT_USER_ID_ERROR_HEADER_TO_SITE_TYPE,
  buildCompatUserIdHeaders,
} from "~/services/apiTransport/compatHeaders"

// minIntervalLimiter.test.ts
import { createMinIntervalLimiter } from "~/services/apiTransport/minIntervalLimiter"

// siteRequestLimiter.test.ts
import {
  createSiteRequestLimiter,
  withSiteApiRequestLimit,
} from "~/services/apiTransport/siteRequestLimiter"
```

- [ ] **Step 7: Run primitive tests**

Run:

```powershell
pnpm exec vitest --run tests/services/apiTransport/errors.test.ts tests/services/apiTransport/compatHeaders.test.ts tests/services/apiTransport/minIntervalLimiter.test.ts tests/services/apiTransport/siteRequestLimiter.test.ts
```

Expected: all moved primitive tests pass.

- [ ] **Step 8: Commit transport primitives**

Run:

```powershell
git status --porcelain
git add src/services/apiTransport/errors.ts src/services/apiTransport/type.ts src/services/apiTransport/constant.ts src/services/apiTransport/compatHeaders.ts src/services/apiTransport/minIntervalLimiter.ts src/services/apiTransport/siteRequestLimiter.ts
git add src/services/apiService/common/errors.ts src/services/apiService/common/type.ts src/services/apiService/common/constant.ts src/services/apiService/common/compatHeaders.ts src/services/apiService/common/minIntervalLimiter.ts src/services/apiService/common/siteRequestLimiter.ts
git add tests/services/apiTransport/errors.test.ts tests/services/apiTransport/compatHeaders.test.ts tests/services/apiTransport/minIntervalLimiter.test.ts tests/services/apiTransport/siteRequestLimiter.test.ts
git commit -m "refactor(api): extract transport primitives"
```

Expected: commit succeeds with only transport primitive files and moved tests.

---

### Task 2: Extract the Shared Request Transport

**Files:**
- Create: `src/services/apiTransport/request.ts`
- Modify: `src/services/apiService/common/utils.ts`
- Modify: `src/types/tempWindowFetch.ts`
- Modify: `src/utils/browser/tempWindowFetch.ts`
- Test: `tests/services/apiTransport/request.test.ts`
- Test: `tests/services/apiService/common/utils.test.ts`

- [ ] **Step 1: Move the fetch helper test to the transport test directory**

Run:

```powershell
git mv tests\services\apiService\common\fetchApi.test.ts tests\services\apiTransport\request.test.ts
```

Update the moved test imports and import-actual paths:

```ts
import { API_TRANSPORT_FETCH_CONTEXT_KINDS } from "~/services/apiTransport/type"

let fetchApiData: typeof import("~/services/apiTransport/request").fetchApiData
let fetchApi: typeof import("~/services/apiTransport/request").fetchApi
let extractDataFromApiResponseBody: typeof import("~/services/apiTransport/request").extractDataFromApiResponseBody
let isHttpUrl: typeof import("~/services/apiTransport/request").isHttpUrl
let ApiError: typeof import("~/services/apiTransport/errors").ApiError
let ApiErrorCodes: typeof import("~/services/apiTransport/errors").API_ERROR_CODES

vi.mock("~/services/apiTransport/minIntervalLimiter", () => ({
  createMinIntervalLimiter: mockCreateMinIntervalLimiter,
}))

vi.mock("~/services/apiTransport/siteRequestLimiter", () => ({
  SITE_API_REQUEST_LIMITS: {
    maxConcurrentPerSite: 2,
    requestsPerMinute: 18,
    burst: 4,
  },
  createSiteRequestLimiter: vi.fn(),
  withSiteApiRequestLimit: mockWithSiteApiRequestLimit,
}))
```

Inside `beforeEach`, update `vi.importActual` calls:

```ts
const request = await vi.importActual<
  typeof import("~/services/apiTransport/request")
>("~/services/apiTransport/request")
fetchApiData = request.fetchApiData
fetchApi = request.fetchApi
extractDataFromApiResponseBody = request.extractDataFromApiResponseBody
isHttpUrl = request.isHttpUrl

const errors = await vi.importActual<
  typeof import("~/services/apiTransport/errors")
>("~/services/apiTransport/errors")
ApiError = errors.ApiError
ApiErrorCodes = errors.API_ERROR_CODES
```

Replace references to `API_SERVICE_FETCH_CONTEXT_KINDS` in the moved test with `API_TRANSPORT_FETCH_CONTEXT_KINDS`.

- [ ] **Step 2: Move `common/utils.ts` into `apiTransport/request.ts`**

Run:

```powershell
git mv src\services\apiService\common\utils.ts src\services\apiTransport\request.ts
```

In `src/services/apiTransport/request.ts`, replace the import block with:

```ts
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { buildCompatUserIdHeaders } from "~/services/apiTransport/compatHeaders"
import { REQUEST_CONFIG } from "~/services/apiTransport/constant"
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import { createMinIntervalLimiter } from "~/services/apiTransport/minIntervalLimiter"
import { withSiteApiRequestLimit } from "~/services/apiTransport/siteRequestLimiter"
import type {
  ApiResponse,
  ApiTransportFetchContext,
  ApiTransportRequest,
  AuthConfig,
  FetchApiOptions,
} from "~/services/apiTransport/type"
import {
  API_TRANSPORT_FETCH_CONTEXT_KINDS,
  summarizeApiTransportFetchContext,
} from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import type { TempWindowResponseType } from "~/types/tempWindowFetch"
import { sendTabMessageWithRetry } from "~/utils/browser/browserApi"
import {
  addAuthMethodHeader,
  addExtensionHeader,
  AUTH_MODE,
  COOKIE_AUTH_HEADER_NAME,
  COOKIE_SESSION_OVERRIDE_HEADER_NAME,
} from "~/utils/browser/cookieHelper"
import { executeWithTempWindowFallback } from "~/utils/browser/tempWindowFetch"
import { getErrorMessage } from "~/utils/core/error"
import { safeRandomUUID } from "~/utils/core/identifier"
import { createLogger } from "~/utils/core/logger"
import { joinUrl } from "~/utils/core/url"
import { normalizeUrlForOriginKey } from "~/utils/core/urlParsing"
import { t } from "~/utils/i18n/core"
```

Then make these symbol replacements in `request.ts`:

```text
ApiServiceRequest -> ApiTransportRequest
ApiServiceFetchContext -> ApiTransportFetchContext
API_SERVICE_FETCH_CONTEXT_KINDS -> API_TRANSPORT_FETCH_CONTEXT_KINDS
summarizeApiServiceFetchContext -> summarizeApiTransportFetchContext
```

Delete these account-site utility exports from `request.ts`; they will be recreated in `apiService/common/utils.ts`:

```ts
export const getTodayTimestampRange = (): { start: number; end: number } => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const start = Math.floor(today.getTime() / 1000)
  today.setHours(23, 59, 59, 999)
  const end = Math.floor(today.getTime() / 1000)
  return { start, end }
}

export const aggregateUsageData = (
  items: LogItem[],
): Omit<TodayUsageData, "today_requests_count"> => {
  return items.reduce(
    (acc, item) => ({
      today_quota_consumption: acc.today_quota_consumption + (item.quota || 0),
      today_prompt_tokens: acc.today_prompt_tokens + (item.prompt_tokens || 0),
      today_completion_tokens:
        acc.today_completion_tokens + (item.completion_tokens || 0),
    }),
    {
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
    },
  )
}

export function extractAmount(
  text: string,
  exchangeRate: number,
): { currencySymbol: string; amount: number } | null {
  const regex = /([\p{Sc}])\s*([\d,]+(?:\.\d+)?)/u
  const match = text.match(regex)
  if (!match) return null
  const currencySymbol = match[1]
  let amount = parseFloat(match[2].replace(/,/g, ""))
  if (currencySymbol === "¥") {
    amount = amount / exchangeRate
  }
  return { currencySymbol, amount }
}
```

- [ ] **Step 3: Recreate `apiService/common/utils.ts` as account-site utilities plus request re-exports**

Create `src/services/apiService/common/utils.ts`:

```ts
import type { LogItem, TodayUsageData } from "~/services/apiService/common/type"

export {
  extractDataFromApiResponseBody,
  fetchApi,
  fetchApiData,
  isHttpUrl,
} from "~/services/apiTransport/request"

/**
 * Compute today's start/end unix timestamps (seconds).
 * @returns Object with start and end seconds for the current day.
 */
export const getTodayTimestampRange = (): { start: number; end: number } => {
  const today = new Date()

  today.setHours(0, 0, 0, 0)
  const start = Math.floor(today.getTime() / 1000)

  today.setHours(23, 59, 59, 999)
  const end = Math.floor(today.getTime() / 1000)

  return { start, end }
}

/**
 * Aggregate usage data over log items (quota + tokens).
 * @param items Log records to sum.
 * @returns Totals for quota and token counts.
 */
export const aggregateUsageData = (
  items: LogItem[],
): Omit<TodayUsageData, "today_requests_count"> => {
  return items.reduce(
    (acc, item) => ({
      today_quota_consumption: acc.today_quota_consumption + (item.quota || 0),
      today_prompt_tokens: acc.today_prompt_tokens + (item.prompt_tokens || 0),
      today_completion_tokens:
        acc.today_completion_tokens + (item.completion_tokens || 0),
    }),
    {
      today_quota_consumption: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
    },
  )
}

/**
 * Extract currency symbol and numeric amount from a free-form string.
 * @param text Input text containing currency and amount.
 * @param exchangeRate CNY per USD exchange rate for ¥ normalization.
 * @returns Symbol and USD amount when detected; otherwise null.
 */
export function extractAmount(
  text: string,
  exchangeRate: number,
): { currencySymbol: string; amount: number } | null {
  const regex = /([\p{Sc}])\s*([\d,]+(?:\.\d+)?)/u
  const match = text.match(regex)

  if (!match) return null

  const currencySymbol = match[1]
  let amount = parseFloat(match[2].replace(/,/g, ""))

  if (currencySymbol === "¥") {
    amount = amount / exchangeRate
  }

  return { currencySymbol, amount }
}
```

- [ ] **Step 4: Update temp-window types and fallback imports to the neutral transport layer**

In `src/types/tempWindowFetch.ts`, replace:

```ts
import { ApiErrorCode } from "~/services/apiService/common/errors"
```

with:

```ts
import type { ApiErrorCode } from "~/services/apiTransport/errors"
```

In `src/utils/browser/tempWindowFetch.ts`, replace the error/type/request imports with:

```ts
import {
  API_ERROR_CODES,
  ApiError,
  type ApiErrorCode,
} from "~/services/apiTransport/errors"
import type { ApiResponse } from "~/services/apiTransport/type"
import {
  extractDataFromApiResponseBody,
  isHttpUrl,
} from "~/services/apiTransport/request"
```

- [ ] **Step 5: Verify no transport file imports from apiService**

Run:

```powershell
rg "services/apiService|~/services/apiService" src/services/apiTransport
```

Expected: no output.

- [ ] **Step 6: Run request and account utility tests**

Run:

```powershell
pnpm exec vitest --run tests/services/apiTransport/request.test.ts tests/services/apiService/common/utils.test.ts
```

Expected: both test files pass.

- [ ] **Step 7: Commit request transport extraction**

Run:

```powershell
git status --porcelain
git add src/services/apiTransport/request.ts src/services/apiService/common/utils.ts src/services/apiService/common/type.ts src/types/tempWindowFetch.ts src/utils/browser/tempWindowFetch.ts tests/services/apiTransport/request.test.ts tests/services/apiService/common/utils.test.ts
git commit -m "refactor(api): extract shared request transport"
```

Expected: commit succeeds with request transport extraction and affected tests.

---

### Task 3: Move AI API Protocol Helpers

**Files:**
- Create: `src/services/aiApi/openaiCompatible/index.ts`
- Create: `src/services/aiApi/anthropic/index.ts`
- Create: `src/services/aiApi/google/index.ts`
- Delete: `src/services/apiService/openaiCompatible/index.ts`
- Delete: `src/services/apiService/anthropic/index.ts`
- Delete: `src/services/apiService/google/index.ts`
- Test: `tests/services/aiApi/openaiCompatible.index.test.ts`
- Test: `tests/services/aiApi/modelFetchers.test.ts`

- [ ] **Step 1: Move AI API source directories**

Run:

```powershell
New-Item -ItemType Directory -Force src\services\aiApi
git mv src\services\apiService\openaiCompatible src\services\aiApi\openaiCompatible
git mv src\services\apiService\anthropic src\services\aiApi\anthropic
git mv src\services\apiService\google src\services\aiApi\google
```

Expected: old AI helper directories under `src/services/apiService` are gone.

- [ ] **Step 2: Update OpenAI-compatible helper imports**

In `src/services/aiApi/openaiCompatible/index.ts`, replace the imports with:

```ts
import type {
  OpenAIAuthParams,
  UpstreamModelItem,
  UpstreamModelList,
} from "~/services/apiTransport/type"
import { fetchApiData } from "~/services/apiTransport/request"
import { AuthTypeEnum } from "~/types"
import { createLogger } from "~/utils/core/logger"
```

The rest of the file should keep the existing endpoint and exported functions:

```ts
const OPENAI_COMPATIBLE_MODELS_ENDPOINT = "/v1/models"

export const fetchOpenAICompatibleModels = async (params: OpenAIAuthParams) => {
  const request = {
    baseUrl: params.baseUrl,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: params.apiKey,
    },
  }
  try {
    return await fetchApiData<UpstreamModelList>(request, {
      endpoint: OPENAI_COMPATIBLE_MODELS_ENDPOINT,
      ...(params.abortSignal
        ? { options: { signal: params.abortSignal } }
        : {}),
    })
  } catch (error) {
    logger.error("Failed to fetch upstream model list", error)
    throw error
  }
}
```

- [ ] **Step 3: Update Anthropic and Google helper imports**

In `src/services/aiApi/anthropic/index.ts`, replace:

```ts
import { fetchApi } from "~/services/apiService/common/utils"
```

with:

```ts
import { fetchApi } from "~/services/apiTransport/request"
```

In `src/services/aiApi/google/index.ts`, replace:

```ts
import { fetchApi } from "~/services/apiService/common/utils"
```

with:

```ts
import { fetchApi } from "~/services/apiTransport/request"
```

- [ ] **Step 4: Move AI API tests**

Run:

```powershell
New-Item -ItemType Directory -Force tests\services\aiApi
git mv tests\services\apiService\openaiCompatible.index.test.ts tests\services\aiApi\openaiCompatible.index.test.ts
git mv tests\services\apiService.modelFetchers.test.ts tests\services\aiApi\modelFetchers.test.ts
```

- [ ] **Step 5: Update moved AI API tests to new paths**

In `tests/services/aiApi/openaiCompatible.index.test.ts`, replace imports and mocks:

```ts
import {
  fetchOpenAICompatibleModelIds,
  fetchOpenAICompatibleModels,
} from "~/services/aiApi/openaiCompatible"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiTransport/request", () => ({
  fetchApiData: mockFetchApiData,
}))
```

In `tests/services/aiApi/modelFetchers.test.ts`, replace:

```ts
vi.mock("~/services/apiService/common/utils", () => ({
  fetchApi: mocks.fetchApi,
}))
```

with:

```ts
vi.mock("~/services/apiTransport/request", () => ({
  fetchApi: mocks.fetchApi,
}))
```

Also replace dynamic imports:

```ts
await import("~/services/aiApi/anthropic")
await import("~/services/aiApi/google")
```

Rename the outer describe text from:

```ts
describe("apiService model fetchers", () => {
```

to:

```ts
describe("AI API model fetchers", () => {
```

- [ ] **Step 6: Run moved AI API tests**

Run:

```powershell
pnpm exec vitest --run tests/services/aiApi/openaiCompatible.index.test.ts tests/services/aiApi/modelFetchers.test.ts
```

Expected: OpenAI-compatible, Anthropic, and Google model-fetcher tests pass.

- [ ] **Step 7: Verify AI API modules have no apiService imports**

Run:

```powershell
rg "services/apiService|~/services/apiService" src/services/aiApi tests/services/aiApi
```

Expected: no output.

- [ ] **Step 8: Commit AI API helper move**

Run:

```powershell
git status --porcelain
git add src/services/aiApi/openaiCompatible/index.ts src/services/aiApi/anthropic/index.ts src/services/aiApi/google/index.ts
git add tests/services/aiApi/openaiCompatible.index.test.ts tests/services/aiApi/modelFetchers.test.ts
git add -u src/services/apiService/openaiCompatible src/services/apiService/anthropic src/services/apiService/google tests/services/apiService/openaiCompatible.index.test.ts tests/services/apiService.modelFetchers.test.ts
git commit -m "refactor(ai-api): move protocol helpers out of api service"
```

Expected: commit succeeds and no old AI helper directories remain.

---

### Task 4: Migrate Production Imports and Test Mocks to `services/aiApi`

**Files:**
- Modify: `src/components/CCSwitchExportDialog.tsx`
- Modify: `src/components/ClaudeCodeRouterImportDialog.tsx`
- Modify: `src/components/CliProxyExportDialog.tsx`
- Modify: `src/components/KiloCodeExportDialog.tsx`
- Modify: `src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx`
- Modify: `src/services/apiCredentialProfiles/modelCatalog.ts`
- Modify: `src/services/managedSites/utils/fetchTokenScopedModels.ts`
- Modify: `src/services/verification/aiApiVerification/probes/modelsProbe.ts`
- Modify: `src/services/verification/webAiApiCheck/background.ts`
- Modify: AI API mock paths in related tests listed in the File Structure section.

- [ ] **Step 1: Update production imports**

Run these search checks before editing:

```powershell
rg -n "~/services/apiService/(openaiCompatible|anthropic|google)" src
```

Replace imports exactly:

```ts
// before
import { fetchOpenAICompatibleModelIds } from "~/services/apiService/openaiCompatible"
import { fetchOpenAICompatibleModels } from "~/services/apiService/openaiCompatible"
import { fetchAnthropicModelIds } from "~/services/apiService/anthropic"
import { fetchGoogleModelIds } from "~/services/apiService/google"

// after
import { fetchOpenAICompatibleModelIds } from "~/services/aiApi/openaiCompatible"
import { fetchOpenAICompatibleModels } from "~/services/aiApi/openaiCompatible"
import { fetchAnthropicModelIds } from "~/services/aiApi/anthropic"
import { fetchGoogleModelIds } from "~/services/aiApi/google"
```

Expected production files with changed imports:

```text
src/components/CCSwitchExportDialog.tsx
src/components/ClaudeCodeRouterImportDialog.tsx
src/components/CliProxyExportDialog.tsx
src/components/KiloCodeExportDialog.tsx
src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx
src/services/apiCredentialProfiles/modelCatalog.ts
src/services/managedSites/utils/fetchTokenScopedModels.ts
src/services/verification/aiApiVerification/probes/modelsProbe.ts
src/services/verification/webAiApiCheck/background.ts
```

- [ ] **Step 2: Update test mocks and typed dynamic imports**

Run:

```powershell
rg -n "~/services/apiService/(openaiCompatible|anthropic|google)" tests
```

Replace mock paths exactly:

```ts
// before
vi.mock("~/services/apiService/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: mockFetchOpenAICompatibleModelIds,
}))
vi.mock("~/services/apiService/anthropic", () => ({
  fetchAnthropicModelIds: mockFetchAnthropicModelIds,
}))
vi.mock("~/services/apiService/google", () => ({
  fetchGoogleModelIds: mockFetchGoogleModelIds,
}))

// after
vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: mockFetchOpenAICompatibleModelIds,
}))
vi.mock("~/services/aiApi/anthropic", () => ({
  fetchAnthropicModelIds: mockFetchAnthropicModelIds,
}))
vi.mock("~/services/aiApi/google", () => ({
  fetchGoogleModelIds: mockFetchGoogleModelIds,
}))
```

Replace typed imports:

```ts
typeof import("~/services/apiService/openaiCompatible")
```

with:

```ts
typeof import("~/services/aiApi/openaiCompatible")
```

Replace dynamic imports in `tests/services/webAiApiCheck/background.test.ts`:

```ts
await import("~/services/aiApi/openaiCompatible")
await import("~/services/aiApi/anthropic")
await import("~/services/aiApi/google")
```

- [ ] **Step 3: Run targeted affected tests**

Run:

```powershell
pnpm exec vitest --run tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/services/aiApiVerification/apiVerificationService.test.ts tests/services/aiApiVerification/probes.additional.test.ts tests/services/webAiApiCheck/background.test.ts tests/services/managedSites/fetchTokenScopedModels.test.ts tests/services/managedSites/fetchManagedSiteAvailableModels.test.ts
```

Expected: all targeted service tests pass.

- [ ] **Step 4: Run targeted component tests for import-mocked dialogs**

Run:

```powershell
pnpm exec vitest --run tests/components/CCSwitchExportDialog.test.tsx tests/components/ClaudeCodeRouterImportDialog.test.tsx tests/components/CliProxyExportDialog.test.tsx tests/components/KiloCodeExportDialog.test.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx
```

Expected: all targeted component tests pass.

- [ ] **Step 5: Verify old AI API import paths are gone**

Run:

```powershell
rg "~/services/apiService/(openaiCompatible|anthropic|google)" src tests
rg "services/apiService model fetchers|apiService/openaiCompatible|apiService/anthropic|apiService/google" src tests
```

Expected: no output. If output remains, update the shown import, mock, dynamic import, or stale describe text.

- [ ] **Step 6: Commit import migration**

Run:

```powershell
git status --porcelain
git add src/components/CCSwitchExportDialog.tsx src/components/ClaudeCodeRouterImportDialog.tsx src/components/CliProxyExportDialog.tsx src/components/KiloCodeExportDialog.tsx
git add src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx
git add src/services/apiCredentialProfiles/modelCatalog.ts src/services/managedSites/utils/fetchTokenScopedModels.ts src/services/verification/aiApiVerification/probes/modelsProbe.ts src/services/verification/webAiApiCheck/background.ts
git add tests/components/CCSwitchExportDialog.test.tsx tests/components/ClaudeCodeRouterImportDialog.test.tsx tests/components/CliProxyExportDialog.test.tsx tests/components/KiloCodeExportDialog.test.tsx
git add tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx
git add tests/services/aiApiVerification/apiVerificationService.test.ts tests/services/aiApiVerification/probes.additional.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts
git add tests/services/managedSites/fetchManagedSiteAvailableModels.test.ts tests/services/managedSites/fetchTokenScopedModels.test.ts tests/services/newApiService/newApiService.test.ts tests/services/veloeraService/veloeraService.test.ts tests/services/webAiApiCheck/background.test.ts
git commit -m "refactor(ai-api): update protocol helper imports"
```

Expected: commit succeeds with production imports and tests updated.

---

### Task 5: Add ESLint Dependency-Direction Guard

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Add the AI API import boundary rule**

In `eslint.config.js`, add this config block after the existing options-page `no-restricted-imports` block and before the final `{ rules }` block:

```js
  // Guardrails: AI API protocol modules must not depend on account-site apiService internals.
  {
    files: ["src/services/aiApi/**/*.{js,cjs,mjs,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "~/services/apiService/**",
                "../apiService/**",
                "../../apiService/**",
                "../../../apiService/**",
              ],
              message:
                "AI API protocol modules must not depend on the account-site apiService layer. Use ~/services/apiTransport/** for shared transport code.",
            },
          ],
        },
      ],
    },
  },
```

- [ ] **Step 2: Run ESLint on the AI API directory and config**

Run:

```powershell
pnpm exec eslint src/services/aiApi eslint.config.js
```

Expected: ESLint exits 0.

- [ ] **Step 3: Confirm the guard is active through lint output if a violation appears**

If Step 2 fails, the error must name `no-restricted-imports` and a file under `src/services/aiApi`. Fix the import by routing through `~/services/apiTransport/**`, then rerun:

```powershell
pnpm exec eslint src/services/aiApi eslint.config.js
```

Expected after the fix: ESLint exits 0.

- [ ] **Step 4: Commit lint guard**

Run:

```powershell
git status --porcelain
git add eslint.config.js
git commit -m "chore(eslint): guard ai api service boundary"
```

Expected: commit succeeds with only `eslint.config.js` changed.

---

### Task 6: Final Compile, Cleanup Checks, and Staged Validation

**Files:**
- Validate all task-scoped files from prior tasks.
- No new source files should be added in this task.

- [ ] **Step 1: Run import-boundary cleanup checks**

Run:

```powershell
rg "~/services/apiService/(openaiCompatible|anthropic|google)" src tests
rg "services/apiService model fetchers|apiService/openaiCompatible|apiService/anthropic|apiService/google" src tests
rg "services/apiService|~/services/apiService" src/services/aiApi src/services/apiTransport
```

Expected: all three commands produce no output.

- [ ] **Step 2: Run TypeScript compile**

Run:

```powershell
pnpm compile
```

Expected: `tsc --noEmit` exits 0.

- [ ] **Step 3: Run full lint if compile passes**

Run:

```powershell
pnpm lint
```

Expected: ESLint exits 0.

- [ ] **Step 4: Run Knip because files were moved and old entrypoints were deleted**

Run:

```powershell
pnpm knip
```

Expected: Knip exits 0 with no unused moved files, exports, or dependencies introduced by the migration.

- [ ] **Step 5: Stage only task-scoped files and run staged validation**

Run:

```powershell
git status --porcelain
git add eslint.config.js
git add src/services/apiTransport/errors.ts src/services/apiTransport/type.ts src/services/apiTransport/constant.ts src/services/apiTransport/compatHeaders.ts src/services/apiTransport/minIntervalLimiter.ts src/services/apiTransport/siteRequestLimiter.ts src/services/apiTransport/request.ts
git add src/services/aiApi/openaiCompatible/index.ts src/services/aiApi/anthropic/index.ts src/services/aiApi/google/index.ts
git add src/services/apiService/common/errors.ts src/services/apiService/common/type.ts src/services/apiService/common/constant.ts src/services/apiService/common/compatHeaders.ts src/services/apiService/common/minIntervalLimiter.ts src/services/apiService/common/siteRequestLimiter.ts src/services/apiService/common/utils.ts
git add -u src/services/apiService/openaiCompatible src/services/apiService/anthropic src/services/apiService/google
git add src/types/tempWindowFetch.ts src/utils/browser/tempWindowFetch.ts
git add src/components/CCSwitchExportDialog.tsx src/components/ClaudeCodeRouterImportDialog.tsx src/components/CliProxyExportDialog.tsx src/components/KiloCodeExportDialog.tsx src/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.tsx
git add src/services/apiCredentialProfiles/modelCatalog.ts src/services/managedSites/utils/fetchTokenScopedModels.ts src/services/verification/aiApiVerification/probes/modelsProbe.ts src/services/verification/webAiApiCheck/background.ts
git add tests/services/apiTransport/errors.test.ts tests/services/apiTransport/compatHeaders.test.ts tests/services/apiTransport/minIntervalLimiter.test.ts tests/services/apiTransport/siteRequestLimiter.test.ts tests/services/apiTransport/request.test.ts
git add tests/services/aiApi/openaiCompatible.index.test.ts tests/services/aiApi/modelFetchers.test.ts
git add -u tests/services/apiService/openaiCompatible.index.test.ts tests/services/apiService.modelFetchers.test.ts tests/services/apiService/common/errors.test.ts tests/services/apiService/common/compatHeaders.test.ts tests/services/apiService/common/minIntervalLimiter.test.ts tests/services/apiService/common/siteRequestLimiter.test.ts tests/services/apiService/common/fetchApi.test.ts
git add tests/components/CCSwitchExportDialog.test.tsx tests/components/ClaudeCodeRouterImportDialog.test.tsx tests/components/CliProxyExportDialog.test.tsx tests/components/KiloCodeExportDialog.test.tsx tests/features/ApiCredentialProfiles/components/KiloCodeProfileExportDialog.test.tsx
git add tests/entrypoints/options/pages/ApiCredentialProfiles/ApiCredentialProfiles.test.tsx tests/entrypoints/options/pages/ApiCredentialProfiles/VerifyApiCredentialProfileDialog.test.tsx
git add tests/services/aiApiVerification/apiVerificationService.test.ts tests/services/aiApiVerification/probes.additional.test.ts tests/services/apiCredentialProfiles/modelCatalog.test.ts tests/services/managedSites/fetchManagedSiteAvailableModels.test.ts tests/services/managedSites/fetchTokenScopedModels.test.ts tests/services/newApiService/newApiService.test.ts tests/services/veloeraService/veloeraService.test.ts tests/services/webAiApiCheck/background.test.ts tests/services/apiService/common/utils.test.ts
pnpm run validate:staged
```

Expected: staged validation exits 0. If lint-staged formats files, inspect the diff before committing.

- [ ] **Step 6: Inspect final diff**

Run:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

Expected:

```text
new files under src/services/apiTransport
new files under src/services/aiApi
deleted old AI API helper directories under src/services/apiService
moved or updated tests under tests/services/apiTransport and tests/services/aiApi
updated imports in affected production and test call sites
updated eslint.config.js
```

No unrelated files should appear. If unrelated files appear, do not unstage them unless they were staged in this task; report the conflict.

- [ ] **Step 7: Commit final integration if staged changes remain**

If prior task commits left no staged files, skip this step. If Step 5 staged final formatting or cleanup changes, run:

```powershell
git commit -m "refactor(ai-api): finalize service boundary migration"
```

Expected: commit succeeds.

- [ ] **Step 8: Record final status**

Run:

```powershell
git status --porcelain
git log --oneline -5
```

Expected: worktree is clean or only unrelated pre-existing files are listed. The recent log includes the implementation commits from this plan.

---

## Self-Review Notes

- Spec coverage: Tasks 1 and 2 implement the neutral transport layer; Task 3 moves AI API helpers; Task 4 updates production imports and test mocks; Task 5 enforces dependency direction with ESLint; Task 6 covers compile, lint, knip, staged validation, and old-path cleanup.
- Placeholder scan: this plan contains concrete file paths, commands, expected outputs, and code snippets for each code-changing step.
- Type consistency: neutral names are `ApiTransportRequest`, `ApiTransportFetchContext`, and `API_TRANSPORT_FETCH_CONTEXT_KINDS`; legacy account-site aliases keep `ApiServiceRequest`, `ApiServiceFetchContext`, and `API_SERVICE_FETCH_CONTEXT_KINDS` available through `apiService/common/type.ts`.
