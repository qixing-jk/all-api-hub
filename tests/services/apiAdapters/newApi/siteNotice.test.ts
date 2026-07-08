import { describe, expect, it, vi } from "vitest"

import { newApiSiteNotice } from "~/services/apiAdapters/newApi/siteNotice"
import { newApiSiteStructuredAnnouncements } from "~/services/apiAdapters/newApi/siteStructuredAnnouncements"
import { AuthTypeEnum } from "~/types"

const {
  newApiFamilyFetchSiteAnnouncementsMock,
  newApiFamilyFetchSiteNoticeMock,
} = vi.hoisted(() => ({
  newApiFamilyFetchSiteAnnouncementsMock: vi.fn(),
  newApiFamilyFetchSiteNoticeMock: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/siteAnnouncements", () => ({
  fetchSiteAnnouncements: newApiFamilyFetchSiteAnnouncementsMock,
}))

vi.mock("~/services/apiService/newApiFamily/default/siteNotice", () => ({
  fetchSiteNotice: newApiFamilyFetchSiteNoticeMock,
}))

describe("newApiSiteNotice", () => {
  it("delegates notice fetches through the New API-family implementation", async () => {
    newApiFamilyFetchSiteNoticeMock.mockResolvedValueOnce("Notice body")

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
      },
    }

    await expect(newApiSiteNotice.fetch(request)).resolves.toBe("Notice body")
    expect(newApiFamilyFetchSiteNoticeMock).toHaveBeenCalledWith(request)
  })
})

describe("newApiSiteStructuredAnnouncements", () => {
  it("delegates structured announcement fetches through the New API-family implementation", async () => {
    newApiFamilyFetchSiteAnnouncementsMock.mockResolvedValueOnce([
      {
        content: "Maintenance",
        publishDate: "2026-07-01T12:00:00Z",
        type: "warning",
      },
    ])

    const request = {
      baseUrl: "https://example.invalid",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
      },
    }

    await expect(
      newApiSiteStructuredAnnouncements.fetch(request),
    ).resolves.toEqual([
      {
        content: "Maintenance",
        publishDate: "2026-07-01T12:00:00Z",
        type: "warning",
      },
    ])
    expect(newApiFamilyFetchSiteAnnouncementsMock).toHaveBeenCalledWith(request)
  })
})
