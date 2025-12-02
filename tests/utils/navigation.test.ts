import { beforeEach, describe, expect, it, vi } from "vitest"

import { getSiteApiRouter } from "~/constants/siteType"
import { isExtensionPopup } from "~/utils/browser"
import { createTab as createTabApi, getExtensionURL } from "~/utils/browserApi"
import {
  openCheckInAndRedeem,
  openKeysPage,
  openModelsPage,
  openMultiplePages,
  openUsagePage
} from "~/utils/navigation"
import { joinUrl } from "~/utils/url"

vi.mock("~/utils/browser", () => ({
  isExtensionPopup: vi.fn().mockReturnValue(false),
  OPTIONS_PAGE_URL: "chrome-extension://options.html"
}))

vi.mock("~/utils/browserApi", () => {
  const createTab = vi.fn()
  const focusTab = vi.fn()
  const getExtensionURL = vi.fn((path: string) => `ext://${path}`)
  const openSidePanel = vi.fn()

  return {
    createTab,
    focusTab,
    getExtensionURL,
    openSidePanel,
    __esModule: true
  }
})

vi.mock("~/constants/siteType", () => ({
  getSiteApiRouter: vi.fn(() => ({
    usagePath: "/usage",
    checkInPath: "/checkin",
    redeemPath: "/redeem"
  }))
}))

vi.mock("~/utils/url", () => ({
  joinUrl: vi.fn((base: string, path: string) => `${base}${path}`)
}))

const mockedIsExtensionPopup = vi.mocked(isExtensionPopup)
const mockedCreateTab = vi.mocked(createTabApi)
const mockedGetExtensionURL = vi.mocked(getExtensionURL)
const mockedGetSiteApiRouter = vi.mocked(getSiteApiRouter)
const mockedJoinUrl = vi.mocked(joinUrl)

describe("navigation utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedIsExtensionPopup.mockReturnValue(false)
  })

  it("openKeysPage should open keys page without accountId", async () => {
    const closeSpy = vi.spyOn(window, "close").mockImplementation(() => {})

    await openKeysPage()

    expect(mockedGetExtensionURL).toHaveBeenCalledWith("options.html")
    const baseUrl = mockedGetExtensionURL.mock.results[0].value
    expect(mockedCreateTab).toHaveBeenCalledWith(`${baseUrl}#keys`, true)
    expect(closeSpy).not.toHaveBeenCalled()

    closeSpy.mockRestore()
  })

  it("openKeysPage should include accountId when provided", async () => {
    await openKeysPage("123")

    expect(mockedGetExtensionURL).toHaveBeenCalledWith("options.html")
    const baseUrl = mockedGetExtensionURL.mock.results[0].value
    expect(mockedCreateTab).toHaveBeenCalledWith(
      `${baseUrl}?accountId=123#keys`,
      true
    )
  })

  it("openUsagePage should open usage URL built from site router", async () => {
    const account = {
      baseUrl: "https://example.com",
      siteType: "one-api"
    } as any

    await openUsagePage(account)

    expect(mockedGetSiteApiRouter).toHaveBeenCalledWith("one-api")
    expect(mockedJoinUrl).toHaveBeenCalledWith("https://example.com", "/usage")
    const url = mockedJoinUrl.mock.results[0].value
    expect(mockedCreateTab).toHaveBeenCalledWith(url, true)
  })

  it("openModelsPage should open models page with optional accountId", async () => {
    await openModelsPage()
    await openModelsPage("42")

    expect(mockedGetExtensionURL).toHaveBeenCalledTimes(2)
    expect(mockedGetExtensionURL).toHaveBeenCalledWith("options.html")
    const baseUrl = mockedGetExtensionURL.mock.results[0].value
    const baseUrl2 = mockedGetExtensionURL.mock.results[1].value
    expect(baseUrl2).toBe(baseUrl)
    expect(mockedCreateTab).toHaveBeenCalledWith(`${baseUrl}#models`, true)
    expect(mockedCreateTab).toHaveBeenCalledWith(
      `${baseUrl}?accountId=42#models`,
      true
    )
  })

  it("openMultiplePages should execute all operations and not close popup when isExtensionPopup is false", async () => {
    const op1 = vi.fn()
    const op2 = vi.fn()
    const closeSpy = vi.spyOn(window, "close").mockImplementation(() => {})

    await openMultiplePages([op1, op2])

    expect(op1).toHaveBeenCalled()
    expect(op2).toHaveBeenCalled()
    expect(closeSpy).not.toHaveBeenCalled()

    closeSpy.mockRestore()
  })

  it("openMultiplePages should close popup when isExtensionPopup is true", async () => {
    const op = vi.fn()
    const closeSpy = vi.spyOn(window, "close").mockImplementation(() => {})
    mockedIsExtensionPopup.mockReturnValue(true)

    await openMultiplePages([op])

    expect(op).toHaveBeenCalled()
    expect(closeSpy).toHaveBeenCalled()

    closeSpy.mockRestore()
  })

  it("openCheckInAndRedeem should open redeem and custom check-in URLs", async () => {
    const account = {
      baseUrl: "https://example.com",
      siteType: "one-api",
      checkIn: {
        customCheckInUrl: "https://checkin.custom",
        customRedeemUrl: "https://redeem.custom"
      }
    } as any

    await openCheckInAndRedeem(account)

    // openMultiplePages wraps two operations; ensure both tabs were opened
    const calls = mockedCreateTab.mock.calls.map((call) => call[0] as string)
    expect(calls).toContain("https://redeem.custom")
    expect(calls).toContain("https://checkin.custom")
  })
})
