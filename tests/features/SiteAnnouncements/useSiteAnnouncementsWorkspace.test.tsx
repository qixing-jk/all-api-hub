import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, expect, it, vi } from "vitest"

import { useSiteAnnouncementsWorkspace } from "~/features/SiteAnnouncements/useSiteAnnouncementsWorkspace"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { SiteAnnouncementRecordView } from "~/types/siteAnnouncements"

const mocks = vi.hoisted(() => ({ send: vi.fn() }))
beforeEach(() => mocks.send.mockReset())
vi.mock("~/features/DevPanel", () => ({ useRegisterDevPanelSection: vi.fn() }))
vi.mock("~/features/SiteAnnouncements/useSiteAnnouncementsDevSection", () => ({
  useSiteAnnouncementsDevSection: vi.fn(),
}))
vi.mock("~/services/accounts/accountStorage/accountQueries", () => ({
  accountQueries: { getAllAccounts: async () => [] },
}))
vi.mock("~/services/siteAnnouncements/messaging", () => ({
  sendSiteAnnouncementsMessage: mocks.send,
}))
vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete: vi.fn() }),
}))

it("marks a newly expanded unread message when another expansion update is pending", async () => {
  const records = ["first", "second"].map((id) => ({
    id,
    title: id,
    siteKey: "site",
    siteType: "sub2api",
    siteName: "Site",
    baseUrl: "https://example.com",
    accountId: "account",
    sourceScope: "account",
    content: "Message",
    fingerprint: id,
    firstSeenAt: 1,
    lastSeenAt: 1,
    read: false,
    canSyncRead: id === "second",
  })) as SiteAnnouncementRecordView[]
  mocks.send.mockImplementation(async (type: string) => ({
    success: true,
    data: type === SiteAnnouncementsMessageTypes.ListRecords ? records : [],
  }))
  const { result } = renderHook(() =>
    useSiteAnnouncementsWorkspace({ pollingEnabled: false }),
  )
  await waitFor(() => expect(result.current.records).toHaveLength(2))
  await act(async () => {
    result.current.toggleExpanded(records[0]!)
    result.current.toggleExpanded(records[1]!)
  })
  expect(result.current.expandedIds.has("second")).toBe(true)
  expect(mocks.send).toHaveBeenCalledWith(
    SiteAnnouncementsMessageTypes.MarkRead,
    { recordId: "second" },
  )
})

it("reports a rejected mark-read operation without changing cached read state", async () => {
  const record = {
    id: "unread",
    siteKey: "site",
    title: "Title",
    content: "Message",
    siteName: "Site",
    baseUrl: "https://example.com",
    read: false,
    firstSeenAt: 1,
    lastSeenAt: 1,
  } as SiteAnnouncementRecordView
  mocks.send.mockImplementation(async (type: string) => {
    if (type === SiteAnnouncementsMessageTypes.MarkRead)
      throw new Error("offline")
    return {
      success: true,
      data: type === SiteAnnouncementsMessageTypes.ListRecords ? [record] : [],
    }
  })
  const { result } = renderHook(() =>
    useSiteAnnouncementsWorkspace({ pollingEnabled: false }),
  )
  await waitFor(() => expect(result.current.records).toHaveLength(1))
  await act(async () => {
    await result.current.handleMarkRead("unread")
  })
  expect(result.current.records[0]?.read).toBe(false)
})

it("accepts legacy mark-all replies without numeric counts and reloads records", async () => {
  mocks.send.mockImplementation(async (type: string) => ({
    success: true,
    data: type === SiteAnnouncementsMessageTypes.MarkAllRead ? undefined : [],
  }))
  const { result } = renderHook(() =>
    useSiteAnnouncementsWorkspace({ pollingEnabled: false }),
  )
  await waitFor(() => expect(result.current.isLoading).toBe(false))
  await act(async () => {
    await result.current.handleMarkAllRead()
  })
  expect(mocks.send).toHaveBeenCalledWith(
    SiteAnnouncementsMessageTypes.MarkAllRead,
    { siteKey: undefined },
  )
  expect(
    mocks.send.mock.calls.filter(
      ([type]) => type === SiteAnnouncementsMessageTypes.ListRecords,
    ),
  ).toHaveLength(2)
})
