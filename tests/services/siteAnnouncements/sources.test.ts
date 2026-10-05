import { afterEach, describe, expect, it, vi } from "vitest"

import * as registry from "~/services/apiAdapters/registry"
import {
  getAnnouncementRecordViews,
  resolveAnnouncementSource,
  resolveAnnouncementSources,
} from "~/services/siteAnnouncements/sources"
import type { SiteAccount } from "~/types"
import type { SiteAnnouncementRecord } from "~/types/siteAnnouncements"

describe("announcement source planning", () => {
  afterEach(() => vi.restoreAllMocks())

  it("projects available read actions independently of historical provider labels", () => {
    vi.spyOn(registry, "getSiteTypeCapabilities").mockReturnValue({
      siteType: "new-api",
      site: { notice: { fetch: vi.fn() } },
      account: { announcements: { fetch: vi.fn(), markRead: vi.fn() } },
    })
    const record = {
      accountId: "a",
      siteType: "new-api",
      baseUrl: "https://example.com",
      siteKey: "account:new-api:a:https://example.com",
      sourceScope: "site",
      upstreamId: "1",
    } as SiteAnnouncementRecord
    const [writable, publicRecord, withoutId] = getAnnouncementRecordViews([
      record,
      {
        ...record,
        siteKey: "site:new-api:https://example.com",
        sourceScope: "account",
      },
      { ...record, upstreamId: undefined },
    ])
    expect(writable!.canSyncRead).toBe(true)
    expect(publicRecord!.canSyncRead).toBe(false)
    expect(withoutId!.canSyncRead).toBe(false)
  })

  it("does not route an old record's read action to a changed account origin", () => {
    const account = {
      id: "a",
      site_type: "laozhang",
      site_url: "https://new.example.com",
    } as SiteAccount
    const record = {
      siteKey: "account:laozhang:a:https://old.example.com",
    } as SiteAnnouncementRecord
    expect(resolveAnnouncementSource(record, account)).toBeUndefined()
  })

  it("shares public polling but keeps each account's messages independent", () => {
    const accounts = ["a", "b"].map(
      (id) =>
        ({
          id,
          site_type: "laozhang",
          site_url: "https://api2.laozhang.ai",
        }) as SiteAccount,
    )
    const sources = resolveAnnouncementSources(accounts)
    expect(sources.map((source) => source.siteKey)).toEqual([
      "site:laozhang:https://api2.laozhang.ai",
      "account:laozhang:a:https://api2.laozhang.ai",
      "account:laozhang:b:https://api2.laozhang.ai",
    ])
  })
  it("preserves existing New API and Sub2API source identities", () => {
    const sources = resolveAnnouncementSources([
      { id: "a", site_type: "new-api", site_url: "https://example.com" },
      { id: "b", site_type: "new-api", site_url: "https://example.com" },
      { id: "s", site_type: "sub2api", site_url: "https://sub.example.com" },
    ] as SiteAccount[])
    expect(sources.map((source) => source.siteKey)).toEqual([
      "site:new-api:https://example.com",
      "account:sub2api:s:https://sub.example.com",
    ])
  })
})
