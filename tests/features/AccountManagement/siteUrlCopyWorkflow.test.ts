import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  runSiteUrlCopyWorkflow,
  SITE_URL_COPY_RESULTS,
} from "~/features/AccountManagement/siteUrlCopyWorkflow"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const { clipboardWriteTextMock } = vi.hoisted(() => ({
  clipboardWriteTextMock: vi.fn(),
}))

describe("runSiteUrlCopyWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clipboardWriteTextMock.mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({ writeText: clipboardWriteTextMock }),
    })
  })

  it("copies one address per selected account in selection order", async () => {
    const result = await runSiteUrlCopyWorkflow({
      accounts: [
        buildDisplaySiteData({
          id: "one",
          baseUrl: "https://one.example.invalid",
        }),
        buildDisplaySiteData({
          id: "two",
          baseUrl: "https://two.example.invalid",
        }),
      ],
    })

    expect(result).toEqual({
      result: SITE_URL_COPY_RESULTS.Success,
      payload: "https://one.example.invalid\nhttps://two.example.invalid",
      selectedCount: 2,
      itemCount: 2,
      successCount: 2,
      failureCount: 0,
      skippedCount: 0,
    })
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "https://one.example.invalid\nhttps://two.example.invalid",
    )
  })

  it("copies addresses of disabled accounts because they are stored locally", async () => {
    const result = await runSiteUrlCopyWorkflow({
      accounts: [
        buildDisplaySiteData({
          id: "disabled",
          disabled: true,
          baseUrl: "https://disabled.example.invalid",
        }),
      ],
    })

    expect(result.result).toBe(SITE_URL_COPY_RESULTS.Success)
    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "https://disabled.example.invalid",
    )
  })

  it("skips accounts without a usable stored address", async () => {
    const result = await runSiteUrlCopyWorkflow({
      accounts: [
        buildDisplaySiteData({ id: "empty", baseUrl: "   " }),
        buildDisplaySiteData({
          id: "kept",
          baseUrl: "  https://kept.example.invalid  ",
        }),
      ],
    })

    expect(result).toEqual({
      result: SITE_URL_COPY_RESULTS.Success,
      payload: "https://kept.example.invalid",
      selectedCount: 2,
      itemCount: 1,
      successCount: 1,
      failureCount: 0,
      skippedCount: 1,
    })
  })

  it("keeps the payload when the clipboard write is blocked", async () => {
    clipboardWriteTextMock.mockRejectedValue(new Error("clipboard blocked"))

    const result = await runSiteUrlCopyWorkflow({
      accounts: [
        buildDisplaySiteData({
          id: "blocked",
          baseUrl: "https://blocked.example.invalid",
        }),
      ],
    })

    expect(result).toEqual({
      result: SITE_URL_COPY_RESULTS.ClipboardFailure,
      payload: "https://blocked.example.invalid",
      selectedCount: 1,
      itemCount: 1,
      successCount: 0,
      failureCount: 1,
      skippedCount: 0,
    })
  })

  it("returns NoCopyableUrls without overwriting clipboard when nothing is copyable", async () => {
    const result = await runSiteUrlCopyWorkflow({
      accounts: [
        buildDisplaySiteData({ id: "blank-1", baseUrl: "" }),
        buildDisplaySiteData({ id: "blank-2", baseUrl: "   " }),
      ],
    })

    expect(result).toEqual({
      result: SITE_URL_COPY_RESULTS.NoCopyableUrls,
      payload: "",
      selectedCount: 2,
      itemCount: 0,
      successCount: 0,
      failureCount: 0,
      skippedCount: 2,
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })

  it("returns NoCopyableUrls without overwriting clipboard when accounts list is empty", async () => {
    const result = await runSiteUrlCopyWorkflow({ accounts: [] })

    expect(result).toEqual({
      result: SITE_URL_COPY_RESULTS.NoCopyableUrls,
      payload: "",
      selectedCount: 0,
      itemCount: 0,
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
    })
    expect(clipboardWriteTextMock).not.toHaveBeenCalled()
  })
})
