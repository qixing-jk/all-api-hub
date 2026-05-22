import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount,
  submitTokenCreationFromKeyManagementPage,
} from "~~/e2e/utils/accountLifecycle"
import {
  buildRealSiteTestTokenName,
  runRealSiteKeyLifecycleFromAccountRow,
} from "~~/e2e/utils/realSite/keyManagement"

const mocks = vi.hoisted(() => ({
  deleteTokenFromKeyManagementPage: vi.fn(),
  expectTokenCreatedInKeyManagementPage: vi.fn(),
  openKeyManagementForAccount: vi.fn(),
  submitTokenCreationFromKeyManagementPage: vi.fn(),
}))

vi.mock("~~/e2e/utils/accountLifecycle", () => ({
  deleteTokenFromKeyManagementPage: mocks.deleteTokenFromKeyManagementPage,
  expectTokenCreatedInKeyManagementPage:
    mocks.expectTokenCreatedInKeyManagementPage,
  openKeyManagementForAccount: mocks.openKeyManagementForAccount,
  submitTokenCreationFromKeyManagementPage:
    mocks.submitTokenCreationFromKeyManagementPage,
}))

describe("real-site key management E2E helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("builds names that are unique and easy to identify for cleanup", () => {
    const name = buildRealSiteTestTokenName({
      label: "New API",
      runId: "run-123",
    })

    expect(name).toBe("AAH E2E NewAPI run-123")
  })

  it("normalizes noisy labels and run ids before using them in live token names", () => {
    const name = buildRealSiteTestTokenName({
      label: "  Done/Hub! ",
      runId: "  2026:05:21 #1  ",
    })

    expect(name).toBe("AAH E2E DoneHub 2026-05-21-1")
  })

  it("keeps live token names below conservative compatible-backend limits", () => {
    const name = buildRealSiteTestTokenName({
      label: "Very Long Compatible Site",
      runId: "run-with-a-long-random-suffix",
    })

    expect(name.length).toBeLessThanOrEqual(30)
    expect(name).toBe("AAH E2E VeryLong run-with-a-l")
  })

  it("attempts UI cleanup when token creation fails after submitting a live token name", async () => {
    const page = {} as any
    const submittedPage = { page: "key-management" } as any
    const creationError = new Error("token row did not reload")

    vi.spyOn(Date, "now").mockReturnValue(1_773_600_000_000)
    vi.spyOn(Math, "random").mockReturnValue(0.123456789)
    vi.mocked(openKeyManagementForAccount).mockResolvedValue(submittedPage)
    vi.mocked(submitTokenCreationFromKeyManagementPage).mockResolvedValue(
      undefined,
    )
    vi.mocked(expectTokenCreatedInKeyManagementPage).mockRejectedValue(
      creationError,
    )
    vi.mocked(deleteTokenFromKeyManagementPage).mockResolvedValue(undefined)

    const expectedTokenName = buildRealSiteTestTokenName({
      label: "New API",
      runId: "s3naio4fzz",
    })

    await expect(
      runRealSiteKeyLifecycleFromAccountRow({
        page,
        extensionId: "extension-id",
        siteType: SITE_TYPES.NEW_API,
        baseUrl: "https://new-api.test",
        label: "New API",
      }),
    ).rejects.toThrow(creationError)

    expect(openKeyManagementForAccount).toHaveBeenCalledWith({
      page,
      extensionId: "extension-id",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://new-api.test",
      openFromAccountRow: true,
    })
    expect(submitTokenCreationFromKeyManagementPage).toHaveBeenCalledWith({
      page: submittedPage,
      tokenName: expectedTokenName,
    })
    expect(expectTokenCreatedInKeyManagementPage).toHaveBeenCalledWith({
      page: submittedPage,
      tokenName: expectedTokenName,
    })
    expect(deleteTokenFromKeyManagementPage).toHaveBeenCalledWith({
      page: submittedPage,
      token: expectedTokenName,
    })
  })
})
