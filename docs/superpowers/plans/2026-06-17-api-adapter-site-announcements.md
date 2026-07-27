# API Adapter Site Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-17-api-adapter-site-announcements-design.md`

**Goal:** Establish the first narrow `apiAdapters` Seam for site announcements, then migrate the existing `siteAnnouncements` provider Module away from Sub2API-specific helpers on the flat `apiService/common` Interface.

**Architecture:** Add a small `src/services/apiAdapters/` Module with explicit capability objects for `siteNotice` and `siteAnnouncements`. Keep `apiService` as the old compatibility facade, keep product-level normalization in `src/services/siteAnnouncements/providers.ts`, and remove the Sub2API announcement placeholder helpers from `common` only after the provider no longer needs them.

**Tech Stack:** TypeScript, Vitest, existing `apiService` helpers, existing `siteAnnouncements` provider tests, `pnpm run validate:staged`.

---

## File Structure

- Create `src/services/apiAdapters/contracts/siteNotice.ts`
  - Defines the common-compatible site notice capability.
- Create `src/services/apiAdapters/contracts/siteAnnouncements.ts`
  - Defines the account-scoped announcement list and mark-read capability.
- Create `src/services/apiAdapters/contracts/siteAdapter.ts`
  - Defines the minimal first-slice `SiteAdapter` Interface.
- Create `src/services/apiAdapters/newApi/siteNotice.ts`
  - Wraps existing `common.fetchSiteNotice`.
- Create `src/services/apiAdapters/newApi/index.ts`
  - Exposes the New API family Adapter.
- Create `src/services/apiAdapters/sub2api/siteAnnouncements.ts`
  - Wraps existing Sub2API announcement helpers.
- Create `src/services/apiAdapters/sub2api/index.ts`
  - Exposes the Sub2API Adapter.
- Create `src/services/apiAdapters/registry.ts`
  - Maps `AccountSiteType` values to the right Adapter.
- Create `tests/services/apiAdapters/newApi/siteNotice.test.ts`
  - Verifies the New API family Adapter delegates to `fetchSiteNotice`.
- Create `tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts`
  - Verifies the Sub2API Adapter delegates fetch and mark-read calls.
- Create `tests/services/apiAdapters/registry.test.ts`
  - Verifies registry capability selection and fallback behavior.
- Modify `src/services/siteAnnouncements/providers.ts`
  - Consume `getSiteAdapter(...)` instead of `getApiService(...)` for announcement capabilities.
  - Preserve provider keys, timestamp parsing, text normalization, fingerprinting, partial failure handling, and status mapping.
- Modify `tests/services/siteAnnouncements/providers.test.ts`
  - Mock `~/services/apiAdapters/registry` instead of `~/services/apiService`.
  - Keep existing normalization and mark-read coverage.
- Modify `src/services/apiService/common/index.ts`
  - Remove the Sub2API announcement placeholder helpers and their now-unused import.

---

## Task 1: Add Adapter Contracts And Registry

**Files:**
- Create: `src/services/apiAdapters/contracts/siteNotice.ts`
- Create: `src/services/apiAdapters/contracts/siteAnnouncements.ts`
- Create: `src/services/apiAdapters/contracts/siteAdapter.ts`
- Create: `src/services/apiAdapters/newApi/siteNotice.ts`
- Create: `src/services/apiAdapters/newApi/index.ts`
- Create: `src/services/apiAdapters/sub2api/siteAnnouncements.ts`
- Create: `src/services/apiAdapters/sub2api/index.ts`
- Create: `src/services/apiAdapters/registry.ts`
- Create: `tests/services/apiAdapters/newApi/siteNotice.test.ts`
- Create: `tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts`
- Create: `tests/services/apiAdapters/registry.test.ts`

- [ ] **Step 1: Write the failing New API site notice Adapter test**

Create `tests/services/apiAdapters/newApi/siteNotice.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import { newApiSiteNotice } from "~/services/apiAdapters/newApi/siteNotice"
import { AuthTypeEnum } from "~/types"

const { fetchSiteNoticeMock } = vi.hoisted(() => ({
  fetchSiteNoticeMock: vi.fn(),
}))

vi.mock("~/services/apiService/common", () => ({
  fetchSiteNotice: fetchSiteNoticeMock,
}))

describe("newApiSiteNotice", () => {
  it("delegates notice fetches to the existing common fetchSiteNotice helper", async () => {
    fetchSiteNoticeMock.mockResolvedValueOnce("Notice body")

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
      },
    }

    await expect(newApiSiteNotice.fetch(request)).resolves.toBe("Notice body")
    expect(fetchSiteNoticeMock).toHaveBeenCalledWith(request)
  })
})
```

- [ ] **Step 2: Write the failing Sub2API site announcements Adapter test**

Create `tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest"

import { sub2ApiSiteAnnouncements } from "~/services/apiAdapters/sub2api/siteAnnouncements"
import { AuthTypeEnum } from "~/types"

const { fetchSub2ApiAnnouncementsMock, markSub2ApiAnnouncementReadMock } =
  vi.hoisted(() => ({
    fetchSub2ApiAnnouncementsMock: vi.fn(),
    markSub2ApiAnnouncementReadMock: vi.fn(),
  }))

vi.mock("~/services/apiService/sub2api", () => ({
  fetchSub2ApiAnnouncements: fetchSub2ApiAnnouncementsMock,
  markSub2ApiAnnouncementRead: markSub2ApiAnnouncementReadMock,
}))

const request = {
  baseUrl: "https://sub2.example.com",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "jwt-token",
  },
}

describe("sub2ApiSiteAnnouncements", () => {
  it("delegates unread-only fetches to the existing Sub2API helper", async () => {
    fetchSub2ApiAnnouncementsMock.mockResolvedValueOnce([
      {
        id: 12,
        title: "Deploy",
        content: "Maintenance",
      },
    ])

    await expect(
      sub2ApiSiteAnnouncements.fetch(request, { unreadOnly: true }),
    ).resolves.toEqual([
      {
        id: 12,
        title: "Deploy",
        content: "Maintenance",
      },
    ])

    expect(fetchSub2ApiAnnouncementsMock).toHaveBeenCalledWith(request, {
      unreadOnly: true,
    })
  })

  it("delegates mark-read requests to the existing Sub2API helper", async () => {
    markSub2ApiAnnouncementReadMock.mockResolvedValueOnce(true)

    await expect(
      sub2ApiSiteAnnouncements.markRead({
        request,
        id: "12",
      }),
    ).resolves.toBe(true)

    expect(markSub2ApiAnnouncementReadMock).toHaveBeenCalledWith(request, "12")
  })
})
```

- [ ] **Step 3: Write the failing registry test**

Create `tests/services/apiAdapters/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getSiteAdapter } from "~/services/apiAdapters/registry"

describe("apiAdapters registry", () => {
  it("returns a Sub2API Adapter with account-scoped siteAnnouncements", () => {
    const adapter = getSiteAdapter(SITE_TYPES.SUB2API)

    expect(adapter).toMatchObject({
      siteType: SITE_TYPES.SUB2API,
      family: "sub2api",
    })
    expect(adapter.siteAnnouncements).toEqual({
      fetch: expect.any(Function),
      markRead: expect.any(Function),
    })
    expect(adapter.siteNotice).toBeUndefined()
  })

  it("returns New API family Adapters with siteNotice for compatible account sites", () => {
    for (const siteType of [
      SITE_TYPES.ONE_API,
      SITE_TYPES.NEW_API,
      SITE_TYPES.ANYROUTER,
      SITE_TYPES.VELOERA,
      SITE_TYPES.ONE_HUB,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.V_API,
      SITE_TYPES.VO_API,
      SITE_TYPES.SUPER_API,
      SITE_TYPES.RIX_API,
      SITE_TYPES.NEO_API,
      SITE_TYPES.WONG_GONGYI,
      SITE_TYPES.UNKNOWN,
    ]) {
      const adapter = getSiteAdapter(siteType)

      expect(adapter).toMatchObject({
        siteType,
        family: "newApiFamily",
      })
      expect(adapter.siteNotice).toEqual({
        fetch: expect.any(Function),
      })
      expect(adapter.siteAnnouncements).toBeUndefined()
    }
  })

  it("keeps AIHubMix unsupported for siteNotice in the first slice", () => {
    const adapter = getSiteAdapter(SITE_TYPES.AIHUBMIX)

    expect(adapter).toMatchObject({
      siteType: SITE_TYPES.AIHUBMIX,
    })
    expect(adapter.siteNotice).toBeUndefined()
    expect(adapter.siteAnnouncements).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run the failing Adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/newApi/siteNotice.test.ts tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: FAIL because `src/services/apiAdapters/**` does not exist yet.

- [ ] **Step 5: Add the capability contracts**

Create `src/services/apiAdapters/contracts/siteNotice.ts`:

```ts
import type { ApiServiceRequest } from "~/services/apiService/common/type"

export type SiteNoticeCapability = {
  fetch(request: ApiServiceRequest): Promise<string | null>
}
```

Create `src/services/apiAdapters/contracts/siteAnnouncements.ts`:

```ts
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import type { Sub2ApiAnnouncementData } from "~/services/apiService/sub2api/type"

export type SiteAnnouncementsFetchOptions = {
  unreadOnly?: boolean
}

export type MarkSiteAnnouncementReadRequest = {
  request: ApiServiceRequest
  id: string | number
}

export type SiteAnnouncementsCapability = {
  fetch(
    request: ApiServiceRequest,
    options?: SiteAnnouncementsFetchOptions,
  ): Promise<Sub2ApiAnnouncementData[]>
  markRead(request: MarkSiteAnnouncementReadRequest): Promise<boolean>
}
```

Create `src/services/apiAdapters/contracts/siteAdapter.ts`:

```ts
import type { AccountSiteType } from "~/constants/siteType"

import type { SiteAnnouncementsCapability } from "./siteAnnouncements"
import type { SiteNoticeCapability } from "./siteNotice"

export type SiteBackendFamily = "newApiFamily" | "sub2api"

export type SiteAdapter = {
  siteType: AccountSiteType
  family?: SiteBackendFamily
  siteNotice?: SiteNoticeCapability
  siteAnnouncements?: SiteAnnouncementsCapability
}
```

- [ ] **Step 6: Add the concrete Adapter Implementations**

Create `src/services/apiAdapters/newApi/siteNotice.ts`:

```ts
import { fetchSiteNotice } from "~/services/apiService/common"

import type { SiteNoticeCapability } from "../contracts/siteNotice"

export const newApiSiteNotice: SiteNoticeCapability = {
  fetch: fetchSiteNotice,
}
```

Create `src/services/apiAdapters/newApi/index.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { newApiSiteNotice } from "./siteNotice"

export const newApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.NEW_API,
  family: "newApiFamily",
  siteNotice: newApiSiteNotice,
}
```

Create `src/services/apiAdapters/sub2api/siteAnnouncements.ts`:

```ts
import {
  fetchSub2ApiAnnouncements,
  markSub2ApiAnnouncementRead,
} from "~/services/apiService/sub2api"

import type { SiteAnnouncementsCapability } from "../contracts/siteAnnouncements"

export const sub2ApiSiteAnnouncements: SiteAnnouncementsCapability = {
  fetch: fetchSub2ApiAnnouncements,
  markRead: ({ request, id }) => markSub2ApiAnnouncementRead(request, id),
}
```

Create `src/services/apiAdapters/sub2api/index.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"

import type { SiteAdapter } from "../contracts/siteAdapter"
import { sub2ApiSiteAnnouncements } from "./siteAnnouncements"

export const sub2ApiAdapter: SiteAdapter = {
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api",
  siteAnnouncements: sub2ApiSiteAnnouncements,
}
```

- [ ] **Step 7: Add the registry**

Create `src/services/apiAdapters/registry.ts`:

```ts
import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"

import type { SiteAdapter } from "./contracts/siteAdapter"
import { newApiAdapter } from "./newApi"
import { sub2ApiAdapter } from "./sub2api"

const newApiFamilySiteTypes = new Set<AccountSiteType>([
  SITE_TYPES.ONE_API,
  SITE_TYPES.NEW_API,
  SITE_TYPES.ANYROUTER,
  SITE_TYPES.VELOERA,
  SITE_TYPES.ONE_HUB,
  SITE_TYPES.DONE_HUB,
  SITE_TYPES.V_API,
  SITE_TYPES.VO_API,
  SITE_TYPES.SUPER_API,
  SITE_TYPES.RIX_API,
  SITE_TYPES.NEO_API,
  SITE_TYPES.WONG_GONGYI,
  SITE_TYPES.UNKNOWN,
])

const createNewApiFamilyAdapter = (siteType: AccountSiteType): SiteAdapter => ({
  ...newApiAdapter,
  siteType,
})

const createUnsupportedAdapter = (siteType: AccountSiteType): SiteAdapter => ({
  siteType,
})

export function getSiteAdapter(siteType: AccountSiteType): SiteAdapter {
  if (siteType === SITE_TYPES.SUB2API) {
    return sub2ApiAdapter
  }

  if (newApiFamilySiteTypes.has(siteType)) {
    return createNewApiFamilyAdapter(siteType)
  }

  return createUnsupportedAdapter(siteType)
}
```

This intentionally keeps AIHubMix unsupported for `siteNotice` because the current flat `getApiService(SITE_TYPES.AIHUBMIX).fetchSiteNotice(...)` path is strict and would be caught as unsupported by the common provider.

- [ ] **Step 8: Run the Adapter tests**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/newApi/siteNotice.test.ts tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts tests/services/apiAdapters/registry.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```powershell
git status --porcelain
git add src/services/apiAdapters tests/services/apiAdapters
pnpm run validate:staged
git commit -m "refactor(api-adapters): add site announcement registry"
```

Expected: `validate:staged` exits 0, then one focused commit is created containing only the new Adapter contracts, Implementations, registry, and tests.

---

## Task 2: Migrate Site Announcement Providers To The Adapter Seam

**Files:**
- Modify: `src/services/siteAnnouncements/providers.ts`
- Modify: `tests/services/siteAnnouncements/providers.test.ts`

- [ ] **Step 1: Replace the provider test mock with the Adapter registry mock**

In `tests/services/siteAnnouncements/providers.test.ts`, replace:

```ts
const { getApiServiceMock } = vi.hoisted(() => ({
  getApiServiceMock: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: getApiServiceMock,
}))
```

with:

```ts
const { getSiteAdapterMock } = vi.hoisted(() => ({
  getSiteAdapterMock: vi.fn(),
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: getSiteAdapterMock,
}))
```

Add these helpers below `baseRequest`:

```ts
const createNoticeAdapter = (
  fetch = vi.fn().mockResolvedValue(null),
) => ({
  siteType: SITE_TYPES.NEW_API,
  family: "newApiFamily" as const,
  siteNotice: {
    fetch,
  },
})

const createSub2ApiAdapter = (overrides?: {
  fetch?: ReturnType<typeof vi.fn>
  markRead?: ReturnType<typeof vi.fn>
}) => ({
  siteType: SITE_TYPES.SUB2API,
  family: "sub2api" as const,
  siteAnnouncements: {
    fetch: overrides?.fetch ?? vi.fn().mockResolvedValue([]),
    markRead: overrides?.markRead ?? vi.fn().mockResolvedValue(true),
  },
})
```

- [ ] **Step 2: Update the common provider tests to use `siteNotice.fetch`**

Replace the first common-provider setup:

```ts
getApiServiceMock.mockReturnValueOnce({
  fetchSiteNotice: vi.fn().mockResolvedValue(" **Hello** <b>world</b> "),
})
```

with:

```ts
getSiteAdapterMock.mockReturnValueOnce(
  createNoticeAdapter(vi.fn().mockResolvedValue(" **Hello** <b>world</b> ")),
)
```

Replace the blank notice setup:

```ts
getApiServiceMock.mockReturnValueOnce({
  fetchSiteNotice: vi.fn().mockResolvedValue("   "),
})
```

with:

```ts
getSiteAdapterMock.mockReturnValueOnce(
  createNoticeAdapter(vi.fn().mockResolvedValue("   ")),
)
```

Replace the rejected notice setup:

```ts
getApiServiceMock.mockReturnValueOnce({
  fetchSiteNotice: vi.fn().mockRejectedValue(new Error("not supported")),
})
```

with:

```ts
getSiteAdapterMock.mockReturnValueOnce(
  createNoticeAdapter(vi.fn().mockRejectedValue(new Error("not supported"))),
)
```

Add this new missing-capability test after the rejected notice test:

```ts
it("marks common provider missing siteNotice capability as unsupported", async () => {
  getSiteAdapterMock.mockReturnValueOnce({
    siteType: SITE_TYPES.AIHUBMIX,
  })

  const result = await commonSiteAnnouncementProvider.fetch({
    ...baseRequest,
    siteType: SITE_TYPES.AIHUBMIX,
  })

  expect(result).toMatchObject({
    status: SITE_ANNOUNCEMENT_STATUS.Unsupported,
    announcements: [],
    error: "siteNotice is not implemented for AIHubMix",
  })
})
```

- [ ] **Step 3: Update the Sub2API provider tests to use `siteAnnouncements`**

In `"normalizes Sub2API unread announcement lists and marks ids as read"`, replace the setup with:

```ts
const markRead = vi.fn().mockResolvedValue(true)
const fetch = vi.fn().mockResolvedValue([
  {
    id: 12,
    title: "Deploy",
    content: "Maintenance",
    created_at: "2026-05-07T00:00:00Z",
    read_at: "2026-05-07T01:00:00Z",
  },
])
getSiteAdapterMock.mockReturnValue(createSub2ApiAdapter({ fetch, markRead }))
```

Change the mark-read assertion from:

```ts
expect(markRead).toHaveBeenCalledWith(request.apiRequest, "12")
```

to:

```ts
expect(fetch).toHaveBeenCalledWith(request.apiRequest, { unreadOnly: true })
expect(markRead).toHaveBeenCalledWith({
  request: request.apiRequest,
  id: "12",
})
```

For each remaining Sub2API fetch test, replace:

```ts
getApiServiceMock.mockReturnValue({
  fetchSub2ApiAnnouncements: vi.fn().mockResolvedValue([
    // records
  ]),
})
```

with:

```ts
getSiteAdapterMock.mockReturnValue(
  createSub2ApiAdapter({
    fetch: vi.fn().mockResolvedValue([
      // keep the same records
    ]),
  }),
)
```

For the rejected Sub2API fetch test, replace:

```ts
getApiServiceMock.mockReturnValue({
  fetchSub2ApiAnnouncements: vi.fn().mockRejectedValue(new Error("denied")),
})
```

with:

```ts
getSiteAdapterMock.mockReturnValue(
  createSub2ApiAdapter({
    fetch: vi.fn().mockRejectedValue(new Error("denied")),
  }),
)
```

Add this new missing-capability test after the rejected fetch test:

```ts
it("returns an error result when Sub2API siteAnnouncements capability is missing", async () => {
  getSiteAdapterMock.mockReturnValue({
    siteType: SITE_TYPES.SUB2API,
  })

  const request = {
    ...baseRequest,
    siteType: SITE_TYPES.SUB2API,
    providerId: "sub2api" as const,
  }
  const result = await sub2ApiSiteAnnouncementProvider.fetch(request)

  expect(result).toMatchObject({
    status: SITE_ANNOUNCEMENT_STATUS.Error,
    announcements: [],
    error: "siteAnnouncements is not implemented for sub2api",
  })
})
```

For mark-read tests, replace setups like:

```ts
getApiServiceMock.mockReturnValue({
  markSub2ApiAnnouncementRead: markRead,
})
```

with:

```ts
getSiteAdapterMock.mockReturnValue(createSub2ApiAdapter({ markRead }))
```

For mark-read assertions, expect the new object request shape:

```ts
expect(markRead).toHaveBeenCalledWith({
  request: request.apiRequest,
  id: "1",
})
```

Keep the existing result assertions for partial failure, full failure, no-id skip, non-error wrapping, title-only records, and provider selection.

- [ ] **Step 4: Run the provider tests to verify they fail before implementation**

Run:

```powershell
pnpm vitest run tests/services/siteAnnouncements/providers.test.ts
```

Expected: FAIL because `providers.ts` still imports `getApiService` and calls flat helper names.

- [ ] **Step 5: Update the provider Module imports**

In `src/services/siteAnnouncements/providers.ts`, replace:

```ts
import { getApiService } from "~/services/apiService"
```

with:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
```

Keep the existing `Sub2ApiAnnouncementData` type import from `~/services/apiService/sub2api/type` because product-level normalization still consumes the Sub2API backend payload shape in this first slice.

- [ ] **Step 6: Add local missing-capability errors**

Add these helpers below `const logger = createLogger("SiteAnnouncementProviders")`:

```ts
const createMissingSiteNoticeCapabilityError = (siteType: AccountSiteType) =>
  new Error(`siteNotice is not implemented for ${siteType}`)

const createMissingSiteAnnouncementsCapabilityError = (
  siteType: AccountSiteType,
) => new Error(`siteAnnouncements is not implemented for ${siteType}`)
```

- [ ] **Step 7: Route common notice fetch through `getSiteAdapter`**

Replace:

```ts
const notice = await getApiService(request.siteType).fetchSiteNotice(
  request.apiRequest,
)
```

with:

```ts
const adapter = getSiteAdapter(request.siteType)
if (!adapter.siteNotice) {
  throw createMissingSiteNoticeCapabilityError(request.siteType)
}

const notice = await adapter.siteNotice.fetch(request.apiRequest)
```

Do not change the success or catch return shape.

- [ ] **Step 8: Route Sub2API fetch through `siteAnnouncements.fetch`**

Replace:

```ts
const announcements = await getApiService(SITE_TYPES.SUB2API)
  .fetchSub2ApiAnnouncements(request.apiRequest, { unreadOnly: true })
  .then((items) =>
    items
      .map(normalizeSub2ApiAnnouncement)
      .filter((item): item is SiteAnnouncement => Boolean(item)),
  )
```

with:

```ts
const adapter = getSiteAdapter(SITE_TYPES.SUB2API)
if (!adapter.siteAnnouncements) {
  throw createMissingSiteAnnouncementsCapabilityError(SITE_TYPES.SUB2API)
}

const announcements = await adapter.siteAnnouncements
  .fetch(request.apiRequest, { unreadOnly: true })
  .then((items) =>
    items
      .map(normalizeSub2ApiAnnouncement)
      .filter((item): item is SiteAnnouncement => Boolean(item)),
  )
```

Do not change the success or catch return shape.

- [ ] **Step 9: Route Sub2API mark-read through `siteAnnouncements.markRead`**

Replace:

```ts
const service = getApiService(SITE_TYPES.SUB2API)
const ids = announcements
  .map((announcement) => announcement.id)
  .filter((id): id is string => Boolean(id))

const results = await Promise.allSettled(
  ids.map((id) =>
    service.markSub2ApiAnnouncementRead(request.apiRequest, id),
  ),
)
```

with:

```ts
const ids = announcements
  .map((announcement) => announcement.id)
  .filter((id): id is string => Boolean(id))

if (ids.length === 0) {
  return
}

const adapter = getSiteAdapter(SITE_TYPES.SUB2API)
if (!adapter.siteAnnouncements) {
  throw createMissingSiteAnnouncementsCapabilityError(SITE_TYPES.SUB2API)
}

const results = await Promise.allSettled(
  ids.map((id) =>
    adapter.siteAnnouncements!.markRead({
      request: request.apiRequest,
      id,
    }),
  ),
)
```

Keep the existing failure collection, logging, and full-batch throw behavior after this block.

- [ ] **Step 10: Run the provider tests**

Run:

```powershell
pnpm vitest run tests/services/siteAnnouncements/providers.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit Task 2**

Run:

```powershell
git status --porcelain
git add src/services/siteAnnouncements/providers.ts tests/services/siteAnnouncements/providers.test.ts
pnpm run validate:staged
git commit -m "refactor(site-announcements): use api adapter capabilities"
```

Expected: `validate:staged` exits 0, then one focused commit is created containing only provider migration and provider tests.

---

## Task 3: Remove Sub2API Announcement Placeholders From Common

**Files:**
- Modify: `src/services/apiService/common/index.ts`
- Validate: `src/services/apiService/index.ts`
- Validate: `tests/services/apiService/index.test.ts`
- Validate: `tests/services/apiService/common/index.test.ts`
- Validate: `tests/services/apiService/sub2api/index.test.ts`

- [ ] **Step 1: Confirm no production caller still uses the old flat helper names**

Run:

```powershell
rg -n "fetchSub2ApiAnnouncements|markSub2ApiAnnouncementRead" src tests
```

Expected before removal: matches remain only in:

```text
src/services/apiAdapters/sub2api/siteAnnouncements.ts
src/services/apiService/common/index.ts
src/services/apiService/sub2api/index.ts
tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts
tests/services/apiService/sub2api/index.test.ts
```

If `src/services/siteAnnouncements/providers.ts` still matches, stop and finish Task 2 first.

- [ ] **Step 2: Remove the now-unused Sub2API announcement type import from common**

In `src/services/apiService/common/index.ts`, delete:

```ts
import type { Sub2ApiAnnouncementData } from "~/services/apiService/sub2api/type"
```

- [ ] **Step 3: Remove the common placeholder helpers**

In `src/services/apiService/common/index.ts`, delete:

```ts
/**
 * Placeholder for site-specific Sub2API override. Common-compatible sites do
 * not expose this endpoint.
 */
export async function fetchSub2ApiAnnouncements(
  _request: ApiServiceRequest,
  _options?: { unreadOnly?: boolean },
): Promise<Sub2ApiAnnouncementData[]> {
  return []
}

/**
 * Placeholder for site-specific Sub2API override. Common-compatible sites do
 * not expose this endpoint.
 */
export async function markSub2ApiAnnouncementRead(
  _request: ApiServiceRequest,
  _id: string | number,
): Promise<boolean> {
  return false
}
```

Do not remove `fetchSiteNotice`.

- [ ] **Step 4: Run focused apiService tests**

Run:

```powershell
pnpm vitest run tests/services/apiService/common/index.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/index.test.ts
```

Expected: PASS. These tests should prove common notice behavior remains intact, real Sub2API announcement behavior remains intact, and the old `getApiService` wrapper still works for the helpers it owns.

- [ ] **Step 5: Re-run the old-helper search**

Run:

```powershell
rg -n "fetchSub2ApiAnnouncements|markSub2ApiAnnouncementRead" src tests
```

Expected after removal: matches remain only in:

```text
src/services/apiAdapters/sub2api/siteAnnouncements.ts
src/services/apiService/sub2api/index.ts
tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts
tests/services/apiService/sub2api/index.test.ts
```

- [ ] **Step 6: Commit Task 3**

Run:

```powershell
git status --porcelain
git add src/services/apiService/common/index.ts
pnpm run validate:staged
git commit -m "refactor(api-service): remove sub2api announcement placeholders"
```

Expected: `validate:staged` exits 0, then one focused commit is created containing only the common cleanup.

---

## Task 4: Final Focused Validation And Diff Audit

**Files:**
- Validate: `src/services/apiAdapters/**`
- Validate: `src/services/siteAnnouncements/providers.ts`
- Validate: `src/services/apiService/common/index.ts`
- Validate: `tests/services/apiAdapters/**`
- Validate: `tests/services/siteAnnouncements/providers.test.ts`
- Validate: `tests/services/apiService/**`

- [ ] **Step 1: Run the focused validation set from the spec**

Run:

```powershell
pnpm vitest run tests/services/apiAdapters/newApi/siteNotice.test.ts tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts tests/services/apiAdapters/registry.test.ts tests/services/siteAnnouncements/providers.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/common/index.test.ts tests/services/apiService/index.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run related validation for changed source files**

Run:

```powershell
pnpm vitest related --run src/services/apiAdapters/registry.ts src/services/siteAnnouncements/providers.ts src/services/apiService/common/index.ts
```

Expected: PASS. If `vitest related` reports no related tests or cannot resolve the newly-created file before staging, classify it as tooling and keep the focused test suite as the main evidence.

- [ ] **Step 3: Stage only task-scoped files and run the commit gate**

If Tasks 1-3 were committed individually, there may be no staged files. If the implementation was done as one batch, stage only these task-scoped files:

```powershell
git add src/services/apiAdapters tests/services/apiAdapters
git add src/services/siteAnnouncements/providers.ts tests/services/siteAnnouncements/providers.test.ts
git add src/services/apiService/common/index.ts
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 4: Inspect the final diff or recent commits**

If changes are staged, run:

```powershell
git diff --cached --stat
git diff --cached --name-status
```

Expected staged files:

```text
A src/services/apiAdapters/contracts/siteNotice.ts
A src/services/apiAdapters/contracts/siteAnnouncements.ts
A src/services/apiAdapters/contracts/siteAdapter.ts
A src/services/apiAdapters/newApi/siteNotice.ts
A src/services/apiAdapters/newApi/index.ts
A src/services/apiAdapters/sub2api/siteAnnouncements.ts
A src/services/apiAdapters/sub2api/index.ts
A src/services/apiAdapters/registry.ts
A tests/services/apiAdapters/newApi/siteNotice.test.ts
A tests/services/apiAdapters/sub2api/siteAnnouncements.test.ts
A tests/services/apiAdapters/registry.test.ts
M src/services/siteAnnouncements/providers.ts
M tests/services/siteAnnouncements/providers.test.ts
M src/services/apiService/common/index.ts
```

If Tasks 1-3 were committed individually, run:

```powershell
git log --oneline -5
git show --stat --oneline HEAD~3..HEAD
```

Expected recent commits include:

```text
refactor(api-adapters): add site announcement registry
refactor(site-announcements): use api adapter capabilities
refactor(api-service): remove sub2api announcement placeholders
```

- [ ] **Step 5: Confirm no out-of-scope migration leaked in**

Run:

```powershell
git diff --name-only HEAD~3..HEAD
```

Expected: no files under these areas unless a focused test import needed a mechanical update:

```text
src/features/ModelList/
src/services/redemption/
src/services/accounts/
src/services/managedSites/
src/entrypoints/
src/locales/
```

Also confirm:

- no `modelCatalog`, `modelPricing`, `redemption`, `account`, or `keyManagement` Adapter capability was added
- no new user-facing copy or locale key was added
- `src/services/apiService/index.ts` was not modified for this slice
- `src/services/apiService/sub2api/index.ts` still owns the real announcement endpoint behavior

- [ ] **Step 6: Final commit if the implementation was not committed per task**

If Tasks 1-3 were not committed individually, commit the final staged task-scoped diff:

```powershell
git commit -m "refactor(api-adapters): migrate site announcements"
```

If Tasks 1-3 were committed individually, skip this step and report the commit hashes.

- [ ] **Step 7: Record final status**

Run:

```powershell
git status --porcelain
```

Expected: only unrelated pre-existing files remain untracked or modified.

---

## Out Of Scope

- Do not migrate Model List, redemption, account identity, key management, managed-site, or token-resolution behavior.
- Do not add broad `SiteAdapter` capability fields beyond `siteNotice` and `siteAnnouncements`.
- Do not add an Adapter wrapper that dynamically enumerates `commonAPI`.
- Do not direct-import Sub2API helpers from `src/services/siteAnnouncements/providers.ts`.
- Do not create a second announcement feature or alter scheduler/storage/UI behavior.
- Do not change the Sub2API announcement HTTP endpoints or auth recovery behavior.
- Do not add locale files, settings search entries, telemetry, or Playwright E2E for this slice.

## Self-Review Notes

- Spec coverage: Task 1 creates the minimal `apiAdapters` Seam and capability objects. Task 2 migrates the existing `siteAnnouncements` provider Module to the new Seam while preserving product-level normalization and statuses. Task 3 removes the old `common` placeholders only after callers have moved. Task 4 covers focused tests, related validation, commit gate, and scope audit.
- Placeholder scan: All steps include concrete paths, code snippets, commands, and expected outcomes. No ambiguous fill-in steps are required.
- Type consistency: The plan uses `SiteNoticeCapability.fetch(request)`, `SiteAnnouncementsCapability.fetch(request, options)`, and `SiteAnnouncementsCapability.markRead({ request, id })` consistently across contracts, Adapters, provider code, and tests.
