import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import type { SiteTypeCapabilities } from "~/services/apiAdapters/contracts/siteTypeCapabilities"
import { getAnnouncementSourceHandlers } from "~/services/siteAnnouncements/sourceHandlers"
import { AuthTypeEnum } from "~/types"
import {
  ANNOUNCEMENT_SOURCE_SCOPES,
  SITE_ANNOUNCEMENT_STATUS,
  type AnnouncementSourceHandlerRequest,
} from "~/types/siteAnnouncements"

const { getSiteTypeCapabilitiesMock } = vi.hoisted(() => ({
  getSiteTypeCapabilitiesMock: vi.fn(),
}))
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: getSiteTypeCapabilitiesMock,
}))

const request: AnnouncementSourceHandlerRequest = {
  accountId: "a",
  siteName: "Example",
  siteType: SITE_TYPES.NEW_API,
  baseUrl: "https://Example.com/",
  sourceScope: ANNOUNCEMENT_SOURCE_SCOPES.Site,
  apiRequest: {
    baseUrl: "https://Example.com/",
    accountId: "a",
    auth: { authType: AuthTypeEnum.None },
  },
}

/** Exercises the same capability resolution seam as the announcement sources. */
function handlers(
  capabilities: Partial<SiteTypeCapabilities>,
  siteType = request.siteType,
) {
  getSiteTypeCapabilitiesMock.mockReturnValue({ siteType, ...capabilities })
  return getAnnouncementSourceHandlers(siteType)
}

describe("capability-bound announcement source handlers", () => {
  beforeEach(() => vi.resetAllMocks())

  it("binds a source's registered capability before execution and acknowledgement", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue([{ id: "1", content: "Bound message" }])
    const markRead = vi.fn().mockResolvedValue(true)
    const [source] = handlers({
      account: { announcements: { fetch, markRead } },
    })
    getSiteTypeCapabilitiesMock.mockReturnValue({ siteType: request.siteType })

    await expect(source!.fetch(request)).resolves.toMatchObject({
      status: "success",
      announcements: [{ id: "1", content: "Bound message" }],
    })
    await source!.markRead!(request, [{ id: "1" }])
    expect(fetch).toHaveBeenCalledWith(request.apiRequest)
    expect(markRead).toHaveBeenCalledWith({
      request: request.apiRequest,
      id: "1",
    })
    expect(getSiteTypeCapabilitiesMock).toHaveBeenCalledTimes(1)
  })

  it.each([SITE_TYPES.NEW_API, SITE_TYPES.LAOZHANG, SITE_TYPES.SUB2API])(
    "uses identical account operations for matching capabilities on %s",
    async (siteType) => {
      const fetch = vi
        .fn()
        .mockResolvedValue([{ id: "11", content: "Ready", read: true }])
      const markRead = vi.fn().mockResolvedValue(true)
      const [source] = handlers(
        { account: { announcements: { fetch, markRead } } },
        siteType,
      )
      const context = { ...request, siteType }
      expect((await source!.fetch(context)).announcements).toMatchObject([
        { id: "11", content: "Ready", read: true, fingerprint: "11" },
      ])
      await source!.markRead!(context, [{ id: "11" }])
      expect(markRead).toHaveBeenCalledWith({
        request: request.apiRequest,
        id: "11",
      })
    },
  )

  it("keeps account scope independent of upstream read acknowledgement", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue([{ content: "Read-only account message" }])
    const [source] = handlers({ account: { announcements: { fetch } } })
    expect(source!.createSiteKey(request)).toBe(
      "account:new-api:a:https://example.com",
    )
    expect(source!.markRead).toBeUndefined()
    expect((await source!.fetch(request)).announcements).toMatchObject([
      { content: "Read-only account message" },
    ])
  })

  it("uses uniform site and account source identities", () => {
    const [publicSource] = handlers({ site: { notice: { fetch: vi.fn() } } })
    expect(publicSource!.scope).toBe("site")
    expect(publicSource!.createSiteKey(request)).toBe(
      "site:new-api:https://example.com",
    )
    expect(publicSource!.createSiteKey({ ...request, accountId: "b" })).toBe(
      publicSource!.createSiteKey(request),
    )
    const [accountSource] = handlers(
      { account: { announcements: { fetch: vi.fn() } } },
      SITE_TYPES.SUB2API,
    )
    expect(accountSource!.scope).toBe("account")
    expect(accountSource!.createSiteKey(request)).toBe(
      "account:sub2api:a:https://example.com",
    )
    expect(
      accountSource!.createSiteKey({ ...request, accountId: "b" }),
    ).not.toBe(accountSource!.createSiteKey(request))
  })

  it("retains independent public results when account authentication fails", async () => {
    const [publicSource, accountSource] = handlers(
      {
        site: { notice: { fetch: vi.fn().mockResolvedValue("Public notice") } },
        account: {
          announcements: {
            fetch: vi.fn().mockRejectedValue(new Error("sign in required")),
          },
        },
      },
      SITE_TYPES.LAOZHANG,
    )
    const context = { ...request, siteType: SITE_TYPES.LAOZHANG }
    expect((await publicSource!.fetch(context)).announcements).toEqual([
      { content: "Public notice", fingerprint: "13:Public notice" },
    ])
    expect(await accountSource!.fetch(context)).toMatchObject({
      status: "error",
      announcements: [],
      error: "sign in required",
    })
  })

  it.each(["", "   ", null])(
    "returns a successful empty result for a blank notice: %s",
    async (notice) => {
      const [source] = handlers({
        site: { notice: { fetch: vi.fn().mockResolvedValue(notice) } },
      })
      expect(await source!.fetch(request)).toMatchObject({
        status: "success",
        announcements: [],
      })
    },
  )

  it("normalizes notice text and uses content identity without site metadata", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(" **Hello** <b>world</b> ")
      .mockResolvedValueOnce("**Hello** <b>world</b>")
      .mockResolvedValueOnce("Edited notice")
    const [source] = handlers(
      { site: { notice: { fetch } } },
      SITE_TYPES.LAOZHANG,
    )
    const first = (await source!.fetch(request)).announcements[0]!
    expect(first).toEqual({
      content: "**Hello** <b>world</b>",
      fingerprint: "22:**Hello** <b>world</b>",
    })
    expect((await source!.fetch(request)).announcements[0]!.fingerprint).toBe(
      first.fingerprint,
    )
    expect(
      (await source!.fetch(request)).announcements[0]!.fingerprint,
    ).not.toBe(first.fingerprint)
  })

  it("combines canonical public announcements and notices without interpreting upstream fields", async () => {
    const [source] = handlers({
      site: {
        announcements: {
          fetch: vi.fn().mockResolvedValue([
            {
              id: "7",
              content: "Maintenance\n\nBrief interruption",
              createdAt: 1782907200000,
              fingerprint: "existing-identity",
            },
            { content: "" },
          ]),
        },
        notice: { fetch: vi.fn().mockResolvedValue(" Site notice ") },
      },
    })
    expect((await source!.fetch(request)).announcements).toMatchObject([
      {
        id: "7",
        content: "Maintenance\n\nBrief interruption",
        createdAt: 1782907200000,
        fingerprint: "existing-identity",
      },
      { content: "Site notice", fingerprint: "11:Site notice" },
    ])
  })

  it("keeps canonical public announcements when notice fetch fails", async () => {
    const [source] = handlers({
      site: {
        announcements: {
          fetch: vi
            .fn()
            .mockResolvedValue([
              { content: "Structured", fingerprint: "stable" },
            ]),
        },
        notice: {
          fetch: vi.fn().mockRejectedValue(new Error("notice unavailable")),
        },
      },
    })
    expect(await source!.fetch(request)).toMatchObject({
      status: "error",
      error: "notice unavailable",
      announcements: [{ content: "Structured", fingerprint: "stable" }],
    })
  })

  it("returns an error when a notice-only source fails", async () => {
    const [source] = handlers({
      site: {
        notice: { fetch: vi.fn().mockRejectedValue(new Error("unavailable")) },
      },
    })
    expect(await source!.fetch(request)).toMatchObject({
      status: "error",
      announcements: [],
      error: "unavailable",
    })
  })

  it("exposes unsupported state when no announcement capabilities are registered", async () => {
    const [source] = handlers({}, SITE_TYPES.AIHUBMIX)
    expect(await source!.fetch(request)).toMatchObject({
      status: SITE_ANNOUNCEMENT_STATUS.Unsupported,
      announcements: [],
      error: "site announcement capabilities are not implemented for AIHubMix",
    })
    expect(source!.markRead).toBeUndefined()
  })

  it("normalizes canonical content, retains upstream read facts and drops empty items", async () => {
    const [source] = handlers({
      account: {
        announcements: {
          fetch: vi.fn().mockResolvedValue([
            {
              id: "1",
              title: " Title ",
              content: " Body ",
              createdAt: 1000,
              updatedAt: 2000,
              read: true,
              readAt: 3000,
            },
            { title: "Title only" },
            { title: " ", content: "" },
            { content: "No id", createdAt: 1000 },
          ]),
        },
      },
    })
    const result = await source!.fetch(request)
    expect(result.announcements).toHaveLength(3)
    expect(result.announcements[0]).toEqual({
      id: "1",
      title: "Title",
      content: "Body",
      createdAt: 1000,
      updatedAt: 2000,
      read: true,
      readAt: 3000,
      fingerprint: "1",
    })
    expect(result.announcements[1]).toMatchObject({
      title: "Title only",
      content: "",
    })
    expect(result.announcements[2]!.fingerprint).toBe("0:|5:No id|4:1000|0:")
  })

  it("acknowledges partial success without failing the complete batch", async () => {
    const markRead = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce(true)
    const [source] = handlers({
      account: { announcements: { fetch: vi.fn(), markRead } },
    })
    await expect(
      source!.markRead!(request, [{ id: "1" }, { id: "2" }]),
    ).resolves.toBeUndefined()
    expect(markRead).toHaveBeenCalledTimes(2)
  })

  it.each([new Error("failed"), "failed"])(
    "rejects when every acknowledgement fails (%s)",
    async (reason) => {
      const markRead = vi.fn().mockRejectedValue(reason)
      const [source] = handlers({
        account: { announcements: { fetch: vi.fn(), markRead } },
      })
      await expect(
        source!.markRead!(request, [{ id: "1" }, { id: "2" }]),
      ).rejects.toThrow("failed")
    },
  )

  it("treats a false acknowledgement as a failure", async () => {
    const [source] = handlers({
      account: {
        announcements: {
          fetch: vi.fn(),
          markRead: vi.fn().mockResolvedValue(false),
        },
      },
    })
    await expect(source!.markRead!(request, [{ id: "1" }])).rejects.toThrow(
      "Failed to mark announcement read",
    )
  })

  it("does not acknowledge items without upstream ids", async () => {
    const markRead = vi.fn()
    const [source] = handlers({
      account: { announcements: { fetch: vi.fn(), markRead } },
    })
    await source!.markRead!(request, [{ content: "Local notice" }])
    expect(markRead).not.toHaveBeenCalled()
  })
})
