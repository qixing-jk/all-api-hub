import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  createNewApiSiteNotice,
  newApiSiteNotice,
} from "~/services/apiAdapters/newApi/siteNotice"
import { newApiSiteStructuredAnnouncements } from "~/services/apiAdapters/newApi/siteStructuredAnnouncements"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { AuthTypeEnum } from "~/types"

const {
  newApiFamilyFetchSiteAnnouncementsMock,
  newApiFamilyFetchSiteNoticeMock,
  laoZhangFetchSiteNoticeMock,
} = vi.hoisted(() => ({
  newApiFamilyFetchSiteAnnouncementsMock: vi.fn(),
  newApiFamilyFetchSiteNoticeMock: vi.fn(),
  laoZhangFetchSiteNoticeMock: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/siteAnnouncements", () => ({
  fetchSiteAnnouncements: newApiFamilyFetchSiteAnnouncementsMock,
}))

vi.mock("~/services/apiService/newApiFamily/default/siteNotice", () => ({
  fetchSiteNotice: newApiFamilyFetchSiteNoticeMock,
}))

vi.mock(
  "~/services/apiService/newApiFamily/variants/laozhangSiteNotice",
  () => ({
    fetchLaoZhangSiteNotice: laoZhangFetchSiteNoticeMock,
  }),
)

describe("newApiSiteNotice", () => {
  it("uses the family default except for LaoZhang's explicit notice capability", async () => {
    expect(createNewApiSiteNotice(SITE_TYPES.NEW_API)).toBe(newApiSiteNotice)
    expect(createNewApiSiteNotice(SITE_TYPES.ONE_API)).toBe(newApiSiteNotice)
    const notice = "Notice"
    laoZhangFetchSiteNoticeMock.mockResolvedValueOnce(notice)
    const request = {
      baseUrl: "https://api2.laozhang.ai",
      auth: { authType: AuthTypeEnum.None },
    }
    await expect(
      getSiteTypeCapabilities(SITE_TYPES.LAOZHANG).site!.notice!.fetch(request),
    ).resolves.toBe(notice)
    expect(laoZhangFetchSiteNoticeMock).toHaveBeenCalledWith(request)
    expect(newApiFamilyFetchSiteNoticeMock).not.toHaveBeenCalled()
  })
  it("delegates notice fetches through the New API-family implementation", async () => {
    const notice = "Notice body"
    newApiFamilyFetchSiteNoticeMock.mockResolvedValueOnce(notice)

    const request = {
      baseUrl: "https://example.com",
      accountId: "account-1",
      auth: {
        authType: AuthTypeEnum.AccessToken,
        accessToken: "token",
      },
    }

    await expect(newApiSiteNotice.fetch(request)).resolves.toBe(notice)
    expect(newApiFamilyFetchSiteNoticeMock).toHaveBeenCalledWith(request)
  })
})

describe("newApiSiteStructuredAnnouncements", () => {
  it("keeps existing structured identities while normalizing ids, text and extra content", async () => {
    newApiFamilyFetchSiteAnnouncementsMock.mockResolvedValueOnce([
      {
        id: 7,
        content: " Maintenance ",
        publishDate: "2026-07-01T12:00:00Z",
        type: "warning",
        extra: " Brief interruption ",
      },
      { content: " " },
    ])
    await expect(
      newApiSiteStructuredAnnouncements.fetch({
        baseUrl: "https://example.invalid",
        auth: { authType: AuthTypeEnum.None },
      }),
    ).resolves.toEqual([
      {
        id: "7",
        content: "Maintenance\n\nBrief interruption",
        createdAt: 1782907200000,
        fingerprint:
          "1:7|7:warning|20:2026-07-01T12:00:00Z|11:Maintenance|18:Brief interruption",
      },
    ])
  })

  it.each(["1782907200", "1782907200000", "invalid"])(
    "normalizes timestamp %s without exposing its upstream format",
    async (publishDate) => {
      newApiFamilyFetchSiteAnnouncementsMock.mockResolvedValueOnce([
        { content: "Notice", publishDate },
      ])
      const [item] = await newApiSiteStructuredAnnouncements.fetch({
        baseUrl: "https://example.invalid",
        auth: { authType: AuthTypeEnum.None },
      })
      expect(item!.createdAt).toBe(
        publishDate === "invalid" ? undefined : 1782907200000,
      )
      expect(item).not.toHaveProperty("publishDate")
    },
  )

  it("projects structured announcements into the canonical model with stable identity", async () => {
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
        createdAt: Date.parse("2026-07-01T12:00:00Z"),
        fingerprint: "0:|7:warning|20:2026-07-01T12:00:00Z|11:Maintenance|0:",
      },
    ])
    expect(newApiFamilyFetchSiteAnnouncementsMock).toHaveBeenCalledWith(request)
  })
})
