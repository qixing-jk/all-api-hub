import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { sub2ApiManagedSiteCapabilities } from "~/services/apiAdapters/managedSites/sub2api"
import { userPreferences } from "~/services/preferences/userPreferences"
import { buildUserPreferences } from "~~/tests/test-utils/factories"

vi.mock("~/services/managedSites/providers/sub2api", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/managedSites/providers/sub2api")
    >()
  return {
    ...actual,
    createSub2ApiApiKeyAccount: vi.fn(),
    deleteSub2ApiApiKeyAccount: vi.fn(),
    getSub2ApiApiKeyAccount: vi.fn(),
    listSub2ApiApiKeyAccounts: vi.fn(),
    revealSub2ApiApiKey: vi.fn(),
    searchSub2ApiApiKeyAccounts: vi.fn(),
    updateSub2ApiApiKeyAccount: vi.fn(),
  }
})

const config = {
  baseUrl: "https://sub2api.example.invalid",
  adminToken: "admin-key",
}

describe("Sub2API managed-site adapter", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("checks persisted Sub2API runtime configuration defensively", async () => {
    const getPreferences = vi.spyOn(userPreferences, "getPreferences")
    getPreferences.mockResolvedValueOnce(
      buildUserPreferences({ sub2apiManagedSite: config }),
    )
    await expect(
      sub2ApiManagedSiteCapabilities.config.checkValid(),
    ).resolves.toBe(true)

    getPreferences.mockResolvedValueOnce(
      buildUserPreferences({
        sub2apiManagedSite: { baseUrl: "", adminToken: "" },
      }),
    )
    await expect(
      sub2ApiManagedSiteCapabilities.config.checkValid(),
    ).resolves.toBe(false)

    getPreferences.mockRejectedValueOnce(new Error("storage unavailable"))
    await expect(
      sub2ApiManagedSiteCapabilities.config.checkValid(),
    ).resolves.toBe(false)
  })
})
