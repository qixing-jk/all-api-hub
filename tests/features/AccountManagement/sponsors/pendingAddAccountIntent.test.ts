import { beforeEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { Storage } from "@plasmohq/storage"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getAndClearPendingSponsorAddAccountPrefill,
  isSponsorAddAccountPrefill,
  setPendingSponsorAddAccountPrefill,
  watchPendingSponsorAddAccountPrefill,
} from "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import { AuthTypeEnum } from "~/types"

describe("pending sponsor add-account intent", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    vi.restoreAllMocks()
    await storage.remove(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL)
  })

  it("stores and consumes sponsor add-account prefill once", async () => {
    const prefill = {
      source: "sponsor" as const,
      sponsorId: "supported-provider",
      siteType: SITE_TYPES.NEW_API,
      siteUrl: "https://supported.example.test",
      authType: AuthTypeEnum.Cookie,
    }

    await setPendingSponsorAddAccountPrefill(prefill)

    await expect(getAndClearPendingSponsorAddAccountPrefill()).resolves.toEqual(
      prefill,
    )
    await expect(
      getAndClearPendingSponsorAddAccountPrefill(),
    ).resolves.toBeNull()
  })

  it("rejects malformed sponsor prefill values before opening or persisting them", () => {
    expect(isSponsorAddAccountPrefill(null)).toBe(false)
    expect(
      isSponsorAddAccountPrefill({
        source: "bookmark",
        sponsorId: "supported-provider",
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://supported.example.test",
      }),
    ).toBe(false)
    expect(
      isSponsorAddAccountPrefill({
        source: "sponsor",
        sponsorId: "supported-provider",
        siteType: SITE_TYPES.UNKNOWN,
        siteUrl: "https://supported.example.test",
      }),
    ).toBe(false)
    expect(
      isSponsorAddAccountPrefill({
        source: "sponsor",
        sponsorId: "supported-provider",
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://[invalid",
      }),
    ).toBe(false)
  })

  it("clears malformed pending prefill without opening the add-account flow", async () => {
    await storage.set(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL, {
      source: "sponsor",
      sponsorId: "supported-provider",
      siteType: SITE_TYPES.NEW_API,
      siteUrl: "javascript:alert(1)",
    })

    await expect(
      getAndClearPendingSponsorAddAccountPrefill(),
    ).resolves.toBeNull()
    await expect(
      storage.get(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL),
    ).resolves.toBeUndefined()
  })

  it("clears pending sponsor prefill with unsupported auth type", async () => {
    await storage.set(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL, {
      createdAt: Date.now(),
      prefill: {
        source: "sponsor",
        sponsorId: "supported-provider",
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://supported.example.test",
        authType: "session-header",
      },
    })

    await expect(
      getAndClearPendingSponsorAddAccountPrefill(),
    ).resolves.toBeNull()
    await expect(
      storage.get(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL),
    ).resolves.toBeUndefined()
  })

  it("stores and consumes blank auth type as the profile default auth type", async () => {
    await setPendingSponsorAddAccountPrefill({
      source: "sponsor",
      sponsorId: "supported-provider",
      siteType: SITE_TYPES.NEW_API,
      siteUrl: "https://supported.example.test",
      authType: "" as AuthTypeEnum,
    })

    await expect(getAndClearPendingSponsorAddAccountPrefill()).resolves.toEqual(
      {
        source: "sponsor",
        sponsorId: "supported-provider",
        siteType: SITE_TYPES.NEW_API,
        siteUrl: "https://supported.example.test",
        authType: AuthTypeEnum.AccessToken,
      },
    )
  })

  it("fills omitted sponsor prefill auth type from profile defaults", async () => {
    await setPendingSponsorAddAccountPrefill({
      source: "sponsor",
      sponsorId: "supported-provider",
      siteType: SITE_TYPES.ANYROUTER,
      siteUrl: "https://anyrouter.top",
    })

    await expect(getAndClearPendingSponsorAddAccountPrefill()).resolves.toEqual(
      {
        source: "sponsor",
        sponsorId: "supported-provider",
        siteType: SITE_TYPES.ANYROUTER,
        siteUrl: "https://anyrouter.top",
        authType: AuthTypeEnum.Cookie,
      },
    )
  })

  it("clears legacy raw sponsor prefill without opening the add-account flow", async () => {
    await storage.set(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL, {
      source: "sponsor",
      sponsorId: "supported-provider",
      siteType: SITE_TYPES.NEW_API,
      siteUrl: "https://supported.example.test",
    })

    await expect(
      getAndClearPendingSponsorAddAccountPrefill(),
    ).resolves.toBeNull()
    await expect(
      storage.get(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL),
    ).resolves.toBeUndefined()
  })

  it("clears expired pending prefill without opening the add-account flow", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000)
    await setPendingSponsorAddAccountPrefill({
      source: "sponsor",
      sponsorId: "supported-provider",
      siteType: SITE_TYPES.NEW_API,
      siteUrl: "https://supported.example.test",
    })

    vi.spyOn(Date, "now").mockReturnValue(100_000 + 5 * 60 * 1000 + 1)

    await expect(
      getAndClearPendingSponsorAddAccountPrefill(),
    ).resolves.toBeNull()
    await expect(
      storage.get(STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL),
    ).resolves.toBeUndefined()
  })

  it("notifies mounted side panels only when a new pending prefill is written", async () => {
    const onPendingPrefill = vi.fn()

    const stopWatching = watchPendingSponsorAddAccountPrefill(onPendingPrefill)

    await fakeBrowser.storage.onChanged.trigger(
      {
        [STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL]: {
          newValue: JSON.stringify({
            createdAt: Date.now(),
            prefill: {
              source: "sponsor",
              sponsorId: "supported-provider",
              siteType: SITE_TYPES.NEW_API,
              siteUrl: "https://supported.example.test",
            },
          }),
        },
      },
      "local",
    )
    await fakeBrowser.storage.onChanged.trigger(
      {
        [STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL]: {
          oldValue: JSON.stringify({}),
        },
      },
      "local",
    )

    expect(onPendingPrefill).toHaveBeenCalledTimes(1)

    stopWatching()

    await fakeBrowser.storage.onChanged.trigger(
      {
        [STORAGE_KEYS.SPONSOR_ADD_ACCOUNT_PENDING_PREFILL]: {
          newValue: JSON.stringify({
            createdAt: Date.now(),
            prefill: {
              source: "sponsor",
              sponsorId: "supported-provider",
              siteType: SITE_TYPES.NEW_API,
              siteUrl: "https://supported.example.test",
            },
          }),
        },
      },
      "local",
    )

    expect(onPendingPrefill).toHaveBeenCalledTimes(1)
  })
})
