import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { handleGetUserFromLocalStorage } from "~/entrypoints/content/messageHandlers/handlers/storage"
import { readAccountBrowserIdentityFromTab } from "~/services/accountBrowserSession/identityReader"
import { verifyAccountBrowserIdentity } from "~/services/accountBrowserSession/identityVerification"

vi.mock("~/services/accountBrowserSession/identityVerification", () => ({
  verifyAccountBrowserIdentity: vi.fn(async () => "2"),
}))

const request = {
  tabId: 501,
  baseUrl: "https://identity.example.com",
  siteType: SITE_TYPES.NEW_API,
  candidateUserIds: ["2"],
}

describe("content identity browsing-context fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(verifyAccountBrowserIdentity).mockClear()
    vi.spyOn(browser.tabs, "sendMessage").mockImplementation(
      async (_tabId, message) =>
        new Promise((resolve) =>
          handleGetUserFromLocalStorage(message, resolve),
        ),
    )
  })

  it.each([
    { success: true, pageContext: "internal" },
    { success: false, pageContext: "unknown" },
    undefined,
  ])(
    "does not select an account when content cannot confirm ordinary browsing: %j",
    async (response) => {
      vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue(response)
      // Deliberately bypass the caller's initial tab filter: this is the fallback.
      expect(await readAccountBrowserIdentityFromTab(request)).toBeNull()
      expect(verifyAccountBrowserIdentity).not.toHaveBeenCalled()
    },
  )

  it("accepts a server-verified account from an ordinary page", async () => {
    vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue({
      success: true,
      pageContext: "ordinary",
    })
    expect(await readAccountBrowserIdentityFromTab(request)).toBe("2")
    expect(verifyAccountBrowserIdentity).toHaveBeenCalledTimes(1)
  })

  it.each(["ordinary", "internal", "unknown"])(
    "includes confirmed page context in the content response: %s",
    async (pageContext) => {
      vi.spyOn(browser.runtime, "sendMessage").mockResolvedValue({
        success: pageContext !== "unknown",
        pageContext,
      })
      const response = await new Promise((resolve) =>
        handleGetUserFromLocalStorage(
          {
            url: request.baseUrl,
            siteType: request.siteType,
            verifyIdentity: true,
            forBrowsingContext: true,
          },
          resolve,
        ),
      )
      expect(response).toEqual(
        pageContext === "ordinary"
          ? {
              success: true,
              pageContext,
              data: { userId: "2", identityVerified: true },
            }
          : { success: false, pageContext },
      )
    },
  )

  it("treats an unreachable background as unknown without reading account identity", async () => {
    vi.spyOn(browser.runtime, "sendMessage").mockRejectedValue(
      new Error("unavailable"),
    )
    expect(await readAccountBrowserIdentityFromTab(request)).toBeNull()
    expect(verifyAccountBrowserIdentity).not.toHaveBeenCalled()
  })

  it.each([undefined, "internal", "unknown"])(
    "requires ordinary context even when the response claims a verified identity: %s",
    async (pageContext) => {
      vi.mocked(browser.tabs.sendMessage).mockResolvedValue({
        success: true,
        pageContext,
        data: { userId: "2", identityVerified: true },
      })
      expect(await readAccountBrowserIdentityFromTab(request)).toBeNull()
    },
  )

  it("preserves explicit identity tasks in temporary pages", async () => {
    const runtime = vi
      .spyOn(browser.runtime, "sendMessage")
      .mockResolvedValue({ success: true, pageContext: "internal" })
    const response = await new Promise((resolve) =>
      handleGetUserFromLocalStorage(
        {
          url: request.baseUrl,
          siteType: request.siteType,
          verifyIdentity: true,
        },
        resolve,
      ),
    )
    expect(response).toEqual({
      success: true,
      data: { userId: "2", identityVerified: true },
    })
    expect(runtime).not.toHaveBeenCalled()
  })
})
