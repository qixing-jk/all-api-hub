# Account Dialog Site Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Account Dialog site-specific UI/workflow rules into a feature-local policy module so adding the next account site type does not require scattered `SITE_TYPES.X` branches in `useAccountDialog.ts`.

**Architecture:** Keep `useAccountDialog.ts` as the React/browser/toast/analytics orchestrator, but route draft normalization, cookie-import eligibility, Sub2API refresh-token persistence, and post-save prompt decisions through `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`. Do not move UI policy onto backend `SiteAdapter`.

**Tech Stack:** TypeScript, React hooks, Vitest, Testing Library, existing Account Dialog hook tests, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-20-account-dialog-site-policy-design.md`

---

## File Structure

Create:

- `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`
  - Own the Account Dialog site policy table and pure helpers.
- `tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts`
  - Cover policy defaults and site-specific draft normalization without React.

Modify:

- `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
  - Replace inline Sub2API/AIHubMix policy decisions with policy helper calls.
- `tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx`
  - Keep Sub2API constraint and stored-account hydration coverage green.
- `tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx`
  - Keep auto-detect merge, Sub2API, AIHubMix, and cookie auto-import coverage green.
- `tests/features/AccountManagement/hooks/useAccountDialog.importCookies.test.tsx`
  - Add or preserve coverage that cookie import behavior remains browser-side and policy-gated.
- `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`
  - Keep Sub2API refresh-token payload, Sub2API post-save dialog, and AIHubMix deferred success coverage green.
- `tests/features/AccountManagement/hooks/useAccountDialog.authDefaults.test.tsx`
  - Keep default auth behavior coverage green if policy changes affect initial draft/auth flows.

Do not modify:

- `src/services/apiAdapters/**`
- `src/services/accountSiteOnboarding/**`
- `src/services/managedSites/**`
- `src/constants/siteType.ts`
- `src/locales/**`
- telemetry schema or analytics payload types
- Playwright E2E tests, unless implementation exposes a browser-only regression that unit/hook tests cannot cover

---

## Implementation Notes

This is a refactor-only slice. Preserve existing user-visible behavior:

- Sub2API Account Dialog state is access-token-only, clears saved cookie session data, and disables built-in check-in detection.
- Leaving Sub2API clears Sub2API refresh-token draft state.
- Stored Sub2API accounts hydrate refresh-token mode only for Sub2API-compatible stored accounts.
- Sub2API detected refresh-token data is captured but refresh-token mode remains opt-in.
- Sub2API save includes `sub2apiAuth` only when refresh-token mode is enabled and a nonblank refresh token exists.
- Sub2API post-save token creation dialog still opens for normal add saves with display data, and still skips during auto-config.
- AIHubMix detected browser-session accounts save as access-token accounts and clear saved cookie session data.
- AIHubMix post-save foreground key prompt and deferred success behavior remain unchanged.
- Compatible cookie-auth accounts still auto-import cookies after successful auto-detect when cookie auth is selected and no session cookie has already been captured.

Keep side effects in the hook:

- browser permission checks
- runtime messages
- cookie import
- Sub2API session import
- toasts
- analytics
- post-save dialogs and callbacks

The policy module must stay pure. It should not import React, browser APIs, storage, analytics, logger, toast, or runtime messaging.

Telemetry decision: reuse existing. No new user action or analytics field is introduced.

Settings search decision: none. This slice does not add, move, rename, or delete settings UI.

E2E decision: no new Playwright E2E by default. The risk is policy mapping and hook state transitions, covered by pure unit tests plus existing hook tests.

---

### Task 1: Add The Pure Account Dialog Site Policy Module

**Files:**

- Create `tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts`
- Create `src/features/AccountManagement/components/AccountDialog/sitePolicy.ts`

- [ ] **Step 1: Write failing policy tests**

Add a focused test file with placeholder data only:

```ts
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createEmptyAccountDialogDraft,
  type AccountDialogDraft,
} from "~/features/AccountManagement/components/AccountDialog/models"
import {
  buildSub2ApiAuthFromAccountDialogDraft,
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
  shouldAutoImportCookieAuthForAccountDialogSite,
  shouldDeferAccountSaveSuccessForAccountDialogSite,
  shouldOpenSub2ApiTokenDialogForAccountDialogSite,
} from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { AuthTypeEnum } from "~/types"

function createDraft(
  overrides: Partial<AccountDialogDraft> = {},
): AccountDialogDraft {
  return {
    ...createEmptyAccountDialogDraft(),
    siteName: "Example",
    username: "user@example.invalid",
    accessToken: "access-token",
    userId: "user-id",
    siteType: SITE_TYPES.UNKNOWN,
    authType: AuthTypeEnum.Cookie,
    cookieAuthSessionCookie: "session=example",
    checkIn: {
      ...createEmptyAccountDialogDraft().checkIn,
      enableDetection: true,
      autoCheckInEnabled: true,
    },
    sub2apiUseRefreshToken: true,
    sub2apiRefreshToken: " refresh-token ",
    sub2apiTokenExpiresAt: 123456,
    ...overrides,
  }
}

describe("Account Dialog site policy", () => {
  it("keeps compatible site behavior as the default policy", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.UNKNOWN)
    const draft = createDraft()

    const normalized = normalizeAccountDialogDraftForSitePolicy({
      draft,
      policy,
    })

    expect(normalized.authType).toBe(AuthTypeEnum.Cookie)
    expect(normalized.cookieAuthSessionCookie).toBe("session=example")
    expect(normalized.checkIn.enableDetection).toBe(true)
    expect(normalized.checkIn.autoCheckInEnabled).toBe(true)
    expect(normalized.sub2apiUseRefreshToken).toBe(false)
    expect(normalized.sub2apiRefreshToken).toBe("")
    expect(normalized.sub2apiTokenExpiresAt).toBeNull()
    expect(
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "",
        url: "https://example.invalid",
      }),
    ).toBe(true)
  })

  it("normalizes Sub2API dialogs to access-token auth and inactive built-in check-in", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.SUB2API)
    const normalized = normalizeAccountDialogDraftForSitePolicy({
      draft: createDraft({ siteType: SITE_TYPES.SUB2API }),
      policy,
    })

    expect(normalized.authType).toBe(AuthTypeEnum.AccessToken)
    expect(normalized.cookieAuthSessionCookie).toBe("")
    expect(normalized.checkIn.enableDetection).toBe(false)
    expect(normalized.checkIn.autoCheckInEnabled).toBe(false)
    expect(normalized.sub2apiUseRefreshToken).toBe(true)
    expect(normalized.sub2apiRefreshToken).toBe(" refresh-token ")
    expect(normalized.sub2apiTokenExpiresAt).toBe(123456)
    expect(
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "",
        url: "https://example.invalid",
      }),
    ).toBe(false)
  })

  it("normalizes AIHubMix detected browser sessions to saved access-token accounts", () => {
    const policy = getAccountDialogSitePolicy(SITE_TYPES.AIHUBMIX)
    const normalized = normalizeAccountDialogDraftForSitePolicy({
      draft: createDraft({ siteType: SITE_TYPES.AIHUBMIX }),
      policy,
    })

    expect(normalized.authType).toBe(AuthTypeEnum.AccessToken)
    expect(normalized.cookieAuthSessionCookie).toBe("")
    expect(normalized.checkIn.enableDetection).toBe(true)
    expect(normalized.sub2apiUseRefreshToken).toBe(false)
    expect(normalized.sub2apiRefreshToken).toBe("")
    expect(normalized.sub2apiTokenExpiresAt).toBeNull()
    expect(
      shouldAutoImportCookieAuthForAccountDialogSite({
        policy,
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "",
        url: "https://example.invalid",
      }),
    ).toBe(false)
  })

  it("builds Sub2API refresh-token payloads only when the policy and draft enable them", () => {
    const sub2apiPolicy = getAccountDialogSitePolicy(SITE_TYPES.SUB2API)
    const defaultPolicy = getAccountDialogSitePolicy(SITE_TYPES.UNKNOWN)

    expect(
      buildSub2ApiAuthFromAccountDialogDraft({
        draft: createDraft({ siteType: SITE_TYPES.SUB2API }),
        policy: sub2apiPolicy,
      }),
    ).toEqual({
      refreshToken: "refresh-token",
      tokenExpiresAt: 123456,
    })

    expect(
      buildSub2ApiAuthFromAccountDialogDraft({
        draft: createDraft({ siteType: SITE_TYPES.SUB2API }),
        policy: defaultPolicy,
      }),
    ).toBeUndefined()

    expect(
      buildSub2ApiAuthFromAccountDialogDraft({
        draft: createDraft({
          siteType: SITE_TYPES.SUB2API,
          sub2apiUseRefreshToken: false,
        }),
        policy: sub2apiPolicy,
      }),
    ).toBeUndefined()
  })

  it("keeps post-save decisions policy-driven", () => {
    expect(
      shouldOpenSub2ApiTokenDialogForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.SUB2API),
        skipSub2ApiKeyPrompt: false,
        hasDisplayData: true,
      }),
    ).toBe(true)

    expect(
      shouldOpenSub2ApiTokenDialogForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.SUB2API),
        skipSub2ApiKeyPrompt: true,
        hasDisplayData: true,
      }),
    ).toBe(false)

    expect(
      shouldDeferAccountSaveSuccessForAccountDialogSite({
        policy: getAccountDialogSitePolicy(SITE_TYPES.AIHUBMIX),
        isAddMode: true,
        autoProvisionKeyOnAccountAdd: true,
        skipAutoProvisionKeyOnAccountAdd: false,
      }),
    ).toBe(true)
  })
})
```

- [ ] **Step 2: Implement `sitePolicy.ts`**

Start with a small table and pure helpers. Keep the table local and explicit:

```ts
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { AuthTypeEnum, type Sub2ApiAuthConfig } from "~/types"

export type AccountDialogSitePolicy = {
  siteType: AccountSiteType
  forceAccessTokenAuth: boolean
  allowCookieAuthSession: boolean
  allowCookieAutoImport: boolean
  allowBuiltInCheckInDetection: boolean
  sub2apiRefreshToken: {
    enabled: boolean
  }
  postSave: {
    openSub2ApiTokenDialog: boolean
    deferSuccessForAihubmixOneTimeKey: boolean
  }
}

const DEFAULT_ACCOUNT_DIALOG_SITE_POLICY: AccountDialogSitePolicy = {
  siteType: SITE_TYPES.UNKNOWN,
  forceAccessTokenAuth: false,
  allowCookieAuthSession: true,
  allowCookieAutoImport: true,
  allowBuiltInCheckInDetection: true,
  sub2apiRefreshToken: {
    enabled: false,
  },
  postSave: {
    openSub2ApiTokenDialog: false,
    deferSuccessForAihubmixOneTimeKey: false,
  },
}

const ACCOUNT_DIALOG_SITE_POLICY_OVERRIDES: Partial<
  Record<AccountSiteType, Partial<AccountDialogSitePolicy>>
> = {
  [SITE_TYPES.SUB2API]: {
    siteType: SITE_TYPES.SUB2API,
    forceAccessTokenAuth: true,
    allowCookieAuthSession: false,
    allowCookieAutoImport: false,
    allowBuiltInCheckInDetection: false,
    sub2apiRefreshToken: {
      enabled: true,
    },
    postSave: {
      openSub2ApiTokenDialog: true,
      deferSuccessForAihubmixOneTimeKey: false,
    },
  },
  [SITE_TYPES.AIHUBMIX]: {
    siteType: SITE_TYPES.AIHUBMIX,
    forceAccessTokenAuth: true,
    allowCookieAuthSession: false,
    allowCookieAutoImport: false,
    postSave: {
      openSub2ApiTokenDialog: false,
      deferSuccessForAihubmixOneTimeKey: true,
    },
  },
}

export function getAccountDialogSitePolicy(
  siteType: AccountSiteType,
): AccountDialogSitePolicy {
  const override = ACCOUNT_DIALOG_SITE_POLICY_OVERRIDES[siteType]

  return {
    ...DEFAULT_ACCOUNT_DIALOG_SITE_POLICY,
    ...override,
    siteType,
    sub2apiRefreshToken: {
      ...DEFAULT_ACCOUNT_DIALOG_SITE_POLICY.sub2apiRefreshToken,
      ...override?.sub2apiRefreshToken,
    },
    postSave: {
      ...DEFAULT_ACCOUNT_DIALOG_SITE_POLICY.postSave,
      ...override?.postSave,
    },
  }
}

export function normalizeAccountDialogDraftForSitePolicy(params: {
  draft: AccountDialogDraft
  policy: AccountDialogSitePolicy
}): AccountDialogDraft {
  const { draft, policy } = params
  const nextDraft: AccountDialogDraft = {
    ...draft,
    authType: policy.forceAccessTokenAuth
      ? AuthTypeEnum.AccessToken
      : draft.authType,
    cookieAuthSessionCookie: policy.allowCookieAuthSession
      ? draft.cookieAuthSessionCookie
      : "",
    checkIn: policy.allowBuiltInCheckInDetection
      ? draft.checkIn
      : {
          ...draft.checkIn,
          enableDetection: false,
          autoCheckInEnabled: false,
        },
    sub2apiUseRefreshToken: policy.sub2apiRefreshToken.enabled
      ? draft.sub2apiUseRefreshToken
      : false,
    sub2apiRefreshToken: policy.sub2apiRefreshToken.enabled
      ? draft.sub2apiRefreshToken
      : "",
    sub2apiTokenExpiresAt: policy.sub2apiRefreshToken.enabled
      ? draft.sub2apiTokenExpiresAt
      : null,
  }

  return arePolicyDraftFieldsEquivalent(draft, nextDraft) ? draft : nextDraft
}

export function shouldAutoImportCookieAuthForAccountDialogSite(params: {
  policy: AccountDialogSitePolicy
  authType: AuthTypeEnum
  cookieAuthSessionCookie: string
  url: string
}): boolean {
  return (
    params.policy.allowCookieAutoImport &&
    params.authType === AuthTypeEnum.Cookie &&
    !params.cookieAuthSessionCookie.trim() &&
    Boolean(params.url.trim())
  )
}

export function buildSub2ApiAuthFromAccountDialogDraft(params: {
  draft: AccountDialogDraft
  policy: AccountDialogSitePolicy
}): Sub2ApiAuthConfig | undefined {
  const refreshToken = params.draft.sub2apiRefreshToken.trim()

  if (
    !params.policy.sub2apiRefreshToken.enabled ||
    !params.draft.sub2apiUseRefreshToken ||
    !refreshToken
  ) {
    return undefined
  }

  return {
    refreshToken,
    ...(typeof params.draft.sub2apiTokenExpiresAt === "number"
      ? { tokenExpiresAt: params.draft.sub2apiTokenExpiresAt }
      : {}),
  }
}

export function shouldOpenSub2ApiTokenDialogForAccountDialogSite(params: {
  policy: AccountDialogSitePolicy
  skipSub2ApiKeyPrompt: boolean
  hasDisplayData: boolean
}): boolean {
  return (
    params.policy.postSave.openSub2ApiTokenDialog &&
    !params.skipSub2ApiKeyPrompt &&
    params.hasDisplayData
  )
}

export function shouldDeferAccountSaveSuccessForAccountDialogSite(params: {
  policy: AccountDialogSitePolicy
  isAddMode: boolean
  autoProvisionKeyOnAccountAdd: boolean
  skipAutoProvisionKeyOnAccountAdd: boolean
}): boolean {
  return (
    params.policy.postSave.deferSuccessForAihubmixOneTimeKey &&
    params.isAddMode &&
    params.autoProvisionKeyOnAccountAdd &&
    !params.skipAutoProvisionKeyOnAccountAdd
  )
}

function arePolicyDraftFieldsEquivalent(
  left: AccountDialogDraft,
  right: AccountDialogDraft,
): boolean {
  return (
    left.authType === right.authType &&
    left.cookieAuthSessionCookie === right.cookieAuthSessionCookie &&
    left.checkIn.enableDetection === right.checkIn.enableDetection &&
    left.checkIn.autoCheckInEnabled === right.checkIn.autoCheckInEnabled &&
    left.sub2apiUseRefreshToken === right.sub2apiUseRefreshToken &&
    left.sub2apiRefreshToken === right.sub2apiRefreshToken &&
    left.sub2apiTokenExpiresAt === right.sub2apiTokenExpiresAt
  )
}
```

Adjust exact helper names if implementation reveals a clearer local convention, but keep the exported surface small and pure.

- [ ] **Step 3: Run the new focused test**

```text
pnpm vitest run tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts
```

- [ ] **Step 4: Commit this task**

```text
git add src/features/AccountManagement/components/AccountDialog/sitePolicy.ts tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts
git commit -m "refactor(account): add dialog site policy"
```

---

### Task 2: Route Draft Normalization And Stored Account Hydration Through Policy

**Files:**

- Modify `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify `tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx`

- [ ] **Step 1: Import policy helpers**

Add imports near the Account Dialog model imports:

```ts
import {
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
} from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
```

- [ ] **Step 2: Replace the two site-type effects with one policy normalization effect**

Replace the Sub2API-specific effects:

```ts
// Enforce Sub2API constraints: JWT-only (access token), no built-in check-in.
useEffect(() => {
  if (siteType !== SITE_TYPES.SUB2API) return

  updateDraft((prev) => applySub2ApiDraftConstraints(prev))
}, [siteType, updateDraft])

useEffect(() => {
  if (siteType === SITE_TYPES.SUB2API) return

  updateDraft((prev) => clearSub2ApiRefreshTokenState(prev))
}, [siteType, updateDraft])
```

With:

```ts
useEffect(() => {
  const policy = getAccountDialogSitePolicy(siteType)

  updateDraft((prev) =>
    normalizeAccountDialogDraftForSitePolicy({
      draft: prev,
      policy,
    }),
  )
}, [siteType, updateDraft])
```

This keeps the hook responsible for the timing of normalization and moves the rules out of the hook.

- [ ] **Step 3: Normalize prefilled draft state**

In `resetForm(...)`, normalize the draft created from sponsor/current-site prefill:

```ts
const nextSiteType = nextPrefill?.siteType ?? SITE_TYPES.UNKNOWN
const policy = getAccountDialogSitePolicy(nextSiteType)

setDraft(
  normalizeAccountDialogDraftForSitePolicy({
    draft: {
      ...createEmptyAccountDialogDraft(),
      siteType: nextSiteType,
      authType: normalizedPrefillAuthType || AuthTypeEnum.AccessToken,
    },
    policy,
  }),
)
```

Keep `hasExplicitAuthTypeRef.current` unchanged so explicit prefill auth decisions still behave the same before policy normalization.

- [ ] **Step 4: Normalize edit-mode stored account hydration**

In `loadAccountData(...)`, compute policy after resolving stored site type:

```ts
const normalizedSiteType = resolveStoredSiteType(
  siteAccount.site_type,
  Boolean(siteAccount.sub2apiAuth),
)
const policy = getAccountDialogSitePolicy(normalizedSiteType)
const hasActiveSub2ApiRefreshToken =
  policy.sub2apiRefreshToken.enabled && Boolean(refreshToken.trim())
```

Build the draft with policy-aware refresh-token fields:

```ts
const nextDraft = normalizeAccountDialogDraftForSitePolicy({
  draft: {
    siteName: siteAccount.site_name,
    username: siteAccount.account_info.username,
    accessToken: siteAccount.account_info.access_token,
    userId: normalizeAccountIdentity(siteAccount.account_info.id) ?? "",
    exchangeRate: siteAccount.exchange_rate.toString(),
    manualBalanceUsd: siteAccount.manualBalanceUsd ?? "",
    notes: siteAccount.notes || "",
    tagIds: siteAccount.tagIds || [],
    excludeFromTotalBalance: siteAccount.excludeFromTotalBalance === true,
    excludeFromTodayIncome: siteAccount.excludeFromTodayIncome === true,
    checkIn: {
      enableDetection: siteAccount.checkIn?.enableDetection ?? false,
      autoCheckInEnabled: siteAccount.checkIn?.autoCheckInEnabled ?? true,
      siteStatus: {
        isCheckedInToday:
          siteAccount.checkIn?.siteStatus?.isCheckedInToday ?? false,
        lastCheckInDate: siteAccount.checkIn?.siteStatus?.lastCheckInDate,
      },
      customCheckIn: {
        url: siteAccount.checkIn?.customCheckIn?.url ?? "",
        turnstilePreTrigger:
          siteAccount.checkIn?.customCheckIn?.turnstilePreTrigger,
        redeemUrl: siteAccount.checkIn?.customCheckIn?.redeemUrl ?? "",
        openRedeemWithCheckIn:
          siteAccount.checkIn?.customCheckIn?.openRedeemWithCheckIn ?? true,
        isCheckedInToday:
          siteAccount.checkIn?.customCheckIn?.isCheckedInToday ?? false,
        lastCheckInDate:
          siteAccount.checkIn?.customCheckIn?.lastCheckInDate,
      },
    },
    siteType: normalizedSiteType,
    authType: siteAccount.authType || AuthTypeEnum.AccessToken,
    cookieAuthSessionCookie: siteAccount.cookieAuth?.sessionCookie || "",
    sub2apiUseRefreshToken: hasActiveSub2ApiRefreshToken,
    sub2apiRefreshToken: hasActiveSub2ApiRefreshToken ? refreshToken : "",
    sub2apiTokenExpiresAt: hasActiveSub2ApiRefreshToken
      ? siteAccount.sub2apiAuth?.tokenExpiresAt ?? null
      : null,
  },
  policy,
})

setDraft(nextDraft)
```

Keep `resolveStoredSiteType(...)` local to the hook for now. It is legacy hydration compatibility, not general dialog policy.

- [ ] **Step 5: Remove only now-unused local helpers**

After the hook compiles, delete:

- `applySub2ApiDraftConstraints(...)`
- `clearSub2ApiRefreshTokenState(...)`

Do not delete `areDraftsEquivalent(...)` yet if `buildDraftFromAutoDetectResult(...)` still uses it. If it becomes unused, remove it in the task where the final caller disappears.

- [ ] **Step 6: Run focused tests**

```text
pnpm vitest run tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx
```

- [ ] **Step 7: Commit this task**

```text
git add src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx
git commit -m "refactor(account): apply dialog site policy to drafts"
```

---

### Task 3: Route Auto-Detect Merge And Cookie Auto-Import Through Policy

**Files:**

- Modify `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify `tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx`
- Modify `tests/features/AccountManagement/hooks/useAccountDialog.importCookies.test.tsx`

- [ ] **Step 1: Import cookie policy helper**

Extend the policy import:

```ts
import {
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
  shouldAutoImportCookieAuthForAccountDialogSite,
} from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
```

- [ ] **Step 2: Make `buildDraftFromAutoDetectResult(...)` policy-aware**

Change the helper signature:

```ts
function buildDraftFromAutoDetectResult(params: {
  draft: AccountDialogDraft
  resultData: NonNullable<Awaited<ReturnType<typeof autoDetectAccount>>["data"]>
  nextSiteType: AccountSiteType
  nextCheckIn: CheckInConfig
  preserveExistingCheckIn: boolean
  mode: DialogMode
  policy: AccountDialogSitePolicy
}): AccountDialogDraft
```

Use policy instead of hard-coded Sub2API/AIHubMix auth and cookie decisions:

```ts
const nextDraft: AccountDialogDraft = {
  ...draft,
  username: resultData.username,
  accessToken: resultData.accessToken,
  userId: resultData.userId,
  siteName: resultData.siteName,
  exchangeRate: resultData.exchangeRate
    ? resultData.exchangeRate.toString()
    : mode === DIALOG_MODES.ADD
      ? ""
      : draft.exchangeRate,
  siteType: nextSiteType,
  authType:
    resultData.authType ??
    (policy.forceAccessTokenAuth ? AuthTypeEnum.AccessToken : draft.authType),
  cookieAuthSessionCookie: policy.allowCookieAuthSession
    ? draft.cookieAuthSessionCookie
    : "",
  checkIn: preserveExistingCheckIn
    ? deepOverride(nextCheckIn, draft.checkIn)
    : nextCheckIn,
  sub2apiRefreshToken:
    policy.sub2apiRefreshToken.enabled && resultData.sub2apiAuth
      ? resultData.sub2apiAuth.refreshToken
      : draft.sub2apiRefreshToken,
  sub2apiTokenExpiresAt:
    policy.sub2apiRefreshToken.enabled && resultData.sub2apiAuth
      ? resultData.sub2apiAuth.tokenExpiresAt ?? null
      : draft.sub2apiTokenExpiresAt,
}

return normalizeAccountDialogDraftForSitePolicy({
  draft: nextDraft,
  policy,
})
```

Remove the inline comment that mentions AIHubMix inside the hook. The policy table is now the place that documents the saved access-token rule.

- [ ] **Step 3: Replace inline Sub2API check-in override**

In `handleAutoDetect`, compute policy immediately after `nextSiteType`:

```ts
const nextSiteType = isAccountSiteType(resultData.siteType)
  ? resultData.siteType
  : siteType
const policy = getAccountDialogSitePolicy(nextSiteType)
```

Then pass the raw detected check-in into `buildDraftFromAutoDetectResult(...)`:

```ts
setDraft((prev) =>
  buildDraftFromAutoDetectResult({
    draft: prev,
    resultData,
    nextSiteType,
    nextCheckIn: detectedCheckIn,
    preserveExistingCheckIn,
    mode,
    policy,
  }),
)
```

`normalizeAccountDialogDraftForSitePolicy(...)` should disable built-in check-in for Sub2API.

- [ ] **Step 4: Replace inline cookie auto-import skip branches**

Replace:

```ts
if (
  authType === AuthTypeEnum.Cookie &&
  resultData.siteType !== SITE_TYPES.SUB2API &&
  resultData.siteType !== SITE_TYPES.AIHUBMIX &&
  !cookieAuthSessionCookie.trim() &&
  url.trim()
) {
```

With:

```ts
if (
  shouldAutoImportCookieAuthForAccountDialogSite({
    policy,
    authType,
    cookieAuthSessionCookie,
    url,
  })
) {
```

Keep the runtime message body, warning toast, and logger unchanged.

- [ ] **Step 5: Update hook-level assertions only if needed**

Existing tests already cover the important behavior:

- Sub2API detected accounts are access-token-only, cookie-cleared, and check-in-disabled.
- AIHubMix detected accounts are access-token-only and skip cookie import.
- Compatible cookie-auth detected accounts still auto-import cookies.

If assertions depend on branch location, update them to assert visible state/runtime messages instead of implementation detail.

- [ ] **Step 6: Run focused tests**

```text
pnpm vitest run tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.importCookies.test.tsx
```

- [ ] **Step 7: Commit this task**

```text
git add src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.importCookies.test.tsx
git commit -m "refactor(account): route auto-detect through dialog site policy"
```

---

### Task 4: Route Save Payload And Post-Save Decisions Through Policy

**Files:**

- Modify `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`

- [ ] **Step 1: Import save/post-save policy helpers**

Extend the policy import:

```ts
import {
  buildSub2ApiAuthFromAccountDialogDraft,
  getAccountDialogSitePolicy,
  normalizeAccountDialogDraftForSitePolicy,
  shouldAutoImportCookieAuthForAccountDialogSite,
  shouldDeferAccountSaveSuccessForAccountDialogSite,
  shouldOpenSub2ApiTokenDialogForAccountDialogSite,
} from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
```

- [ ] **Step 2: Replace `isAihubmixNormalSaveForegroundKeyFlow(...)`**

Remove the helper that directly checks `siteType === SITE_TYPES.AIHUBMIX`.

In `handleSaveAccount(...)`, compute once near the top of the `try` block:

```ts
const policy = getAccountDialogSitePolicy(siteType)
const shouldDeferSuccessForSitePolicy =
  shouldDeferAccountSaveSuccessForAccountDialogSite({
    policy,
    isAddMode: mode === DIALOG_MODES.ADD,
    autoProvisionKeyOnAccountAdd,
    skipAutoProvisionKeyOnAccountAdd:
      options?.skipAutoProvisionKeyOnAccountAdd === true,
  })
```

Use that value in the `validateAndSaveAccount(...)` options:

```ts
skipAutoProvisionKeyOnAccountAdd:
  options?.skipAutoProvisionKeyOnAccountAdd === true ||
  shouldDeferSuccessForSitePolicy,
```

- [ ] **Step 3: Replace inline `sub2apiAuth` assembly**

Replace:

```ts
const sub2apiAuth: Sub2ApiAuthConfig | undefined =
  siteType === SITE_TYPES.SUB2API &&
  sub2apiUseRefreshToken &&
  sub2apiRefreshToken.trim()
    ? {
        refreshToken: sub2apiRefreshToken.trim(),
        ...(typeof sub2apiTokenExpiresAt === "number"
          ? { tokenExpiresAt: sub2apiTokenExpiresAt }
          : {}),
      }
    : undefined
```

With:

```ts
const sub2apiAuth = buildSub2ApiAuthFromAccountDialogDraft({
  draft,
  policy,
})
```

If `draft` is not already directly available in this scope, either use the existing state object if present or build the minimal object from current state through a small local helper. Prefer reusing the existing `draft` state variable over duplicating field reads.

- [ ] **Step 4: Replace deferred success branch**

Replace direct calls to `shouldDeferAccountSaveSuccess(options)` in the success path with the policy-derived `shouldDeferSuccessForSitePolicy`.

Keep `pendingAihubmixPostSaveSuccessRef`, `handleAihubmixNormalSaveForegroundKeyFlow(...)`, and `openAihubmixPostSaveKeyPrompt(...)` names for now. They describe a concrete existing post-save workflow, not a reusable policy abstraction.

- [ ] **Step 5: Replace Sub2API post-save dialog branch**

Replace:

```ts
siteType === SITE_TYPES.SUB2API &&
options?.skipSub2ApiKeyPrompt !== true &&
savedDisplayData
```

With:

```ts
shouldOpenSub2ApiTokenDialogForAccountDialogSite({
  policy,
  skipSub2ApiKeyPrompt: options?.skipSub2ApiKeyPrompt === true,
  hasDisplayData: Boolean(savedDisplayData),
})
```

Keep the dialog opening, allowed-group loading, and failure handling unchanged.

- [ ] **Step 6: Update tests only where assertions depend on implementation**

Keep these visible behaviors covered:

- `validateAndSaveAccount(...)` receives trimmed `sub2apiAuth` only for Sub2API refresh-token mode.
- Sub2API refresh token is not persisted until the mode is explicitly enabled.
- Sub2API post-save dialog still opens on normal save and still skips during auto-config.
- AIHubMix foreground key prompt still opens, defers `onSuccess`, completes/cancels correctly, and respects `skipAutoProvisionKeyOnAccountAdd`.

- [ ] **Step 7: Run focused tests**

```text
pnpm vitest run tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
```

- [ ] **Step 8: Commit this task**

```text
git add src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
git commit -m "refactor(account): route save decisions through dialog site policy"
```

---

### Task 5: Remove Stale Inline Policy Branches And Verify Residual Site-Type Checks

**Files:**

- Modify `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify tests only if stale implementation-specific expectations remain

- [ ] **Step 1: Search for remaining raw site policy branches**

Run:

```text
rg -n "SITE_TYPES\\.(SUB2API|AIHUBMIX)|siteType ===|siteType !==|nextSiteType ===|resultData\\.siteType" src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts
```

Classify each remaining hit as one of:

- acceptable non-policy orchestration;
- legacy compatibility normalization;
- stale policy branch that should move into `sitePolicy.ts`.

- [ ] **Step 2: Keep these residual branches acceptable**

These can remain in `useAccountDialog.ts` after this slice:

- `RuntimeActionIds.ContentGetUserFromLocalStorage` payload with `siteType: SITE_TYPES.SUB2API` inside the specifically named Sub2API session import flow.
- `resolveStoredSiteType(...)` fallback from legacy persisted `sub2apiAuth` to `SITE_TYPES.SUB2API`.
- AIHubMix concrete workflow names and display fallback text in the AIHubMix foreground key prompt flow.
- Test data and expected user-facing site labels.

Do not force every concrete site name out of the hook. The goal is to remove Account Dialog policy decisions from scattered branches, not to hide all existing concrete workflow names.

- [ ] **Step 3: Move any stale branch into policy**

If the search still finds one of these decisions inline, move it behind a policy helper:

- auth mode forcing
- saved cookie session clearing
- cookie auto-import eligibility
- built-in check-in disabling
- Sub2API refresh-token payload eligibility
- Sub2API post-save dialog eligibility
- AIHubMix deferred success eligibility

- [ ] **Step 4: Remove unused imports and helpers**

Remove unused imports:

- `Sub2ApiAuthConfig` from `useAccountDialog.ts` if only the policy helper builds it.
- `SITE_TYPES.SUB2API` / `SITE_TYPES.AIHUBMIX` uses only if they became dead in the hook.

Remove local helper functions if unused:

- `areDraftsEquivalent(...)`
- `shouldDeferAccountSaveSuccess(...)`

Keep helpers that still own hook-local workflow compatibility, such as `resolveStoredSiteType(...)`.

- [ ] **Step 5: Run the complete focused Account Dialog policy regression set**

```text
pnpm vitest run tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.authDefaults.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.importCookies.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
```

- [ ] **Step 6: Commit this task if it produced additional code/test cleanup**

```text
git add src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.authDefaults.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.importCookies.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
git commit -m "refactor(account): remove inline dialog site policy branches"
```

If this task only verifies the previous commits and produces no diff, do not create an empty commit.

---

### Task 6: Final Validation And Handoff

**Files:**

- No new files expected.

- [ ] **Step 1: Run TypeScript validation**

```text
pnpm compile
```

- [ ] **Step 2: Run staged validation before the final commit or handoff**

Stage only task-scoped files, then run:

```text
pnpm run validate:staged
```

- [ ] **Step 3: Run push-gate validation before publishing**

Because this refactor touches a large hook, a new exported module, and several tests, run the pre-push-equivalent gate before pushing or opening/updating a PR:

```text
pnpm run validate:push
```

- [ ] **Step 4: Inspect the final diff**

```text
git diff --stat HEAD
git diff HEAD -- src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/features/AccountManagement/components/AccountDialog/sitePolicy.ts tests/features/AccountManagement/components/AccountDialog/sitePolicy.test.ts tests/features/AccountManagement/hooks/useAccountDialog.sub2apiConstraints.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.authDefaults.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.redetectPreservesCustomData.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.importCookies.test.tsx tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
```

Confirm:

- no adapter, onboarding, managed-site, locale, telemetry schema, or E2E files changed;
- no new user-facing copy was introduced;
- the policy module has no side effects;
- raw Account Dialog policy decisions are no longer scattered across the hook;
- residual concrete Sub2API/AIHubMix references are only workflow names, legacy compatibility, message payloads, or tests.

- [ ] **Step 5: Final handoff summary**

Report:

- the commits created;
- focused tests run;
- `pnpm compile`, `pnpm run validate:staged`, and `pnpm run validate:push` results;
- E2E decision: not added, because the risk is covered by pure policy and hook tests;
- telemetry decision: reused existing, no schema changes;
- any residual raw site-type checks that intentionally remain in `useAccountDialog.ts`.
