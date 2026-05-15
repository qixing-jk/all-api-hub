import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import SiteAnnouncementsPage from "~/entrypoints/options/pages/SiteAnnouncements"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import type {
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { showResultToast } from "~/utils/core/toastHelpers"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  startProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
  completeProductAnalyticsActionMock,
} = vi.hoisted(() => ({
  startProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: vi.fn(),
  }
})

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: any[]) =>
    startProductAnalyticsActionMock(...args),
  trackProductAnalyticsActionStarted: (...args: any[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

const records: SiteAnnouncementRecord[] = [
  {
    id: "announcement-1",
    siteKey: "site-1",
    siteName: "Alpha API",
    siteType: "new-api",
    baseUrl: "https://alpha.example.com",
    accountId: "account-1",
    providerId: "common",
    title: "",
    content: "## Full maintenance window\n\n- Second line",
    fingerprint: "fp-1",
    firstSeenAt: 1735689600000,
    lastSeenAt: 1735689600000,
    notifiedAt: 1735689700000,
    read: false,
  },
  {
    id: "announcement-2",
    siteKey: "site-2",
    siteName: "Beta API",
    siteType: "sub2api",
    baseUrl: "https://beta.example.com",
    accountId: "account-2",
    providerId: "sub2api",
    title: "Beta update",
    content: "**Beta full content**",
    fingerprint: "fp-2",
    firstSeenAt: 1735776000000,
    lastSeenAt: 1735776000000,
    createdAt: 1735775900000,
    read: true,
  },
]

const status: SiteAnnouncementSiteState[] = [
  {
    siteKey: "site-1",
    siteName: "Alpha API",
    siteType: "new-api",
    baseUrl: "https://alpha.example.com",
    accountId: "account-1",
    providerId: "common",
    status: "error",
    lastCheckedAt: 1735690000000,
    lastError: "timeout",
    records: [records[0]!],
  },
  {
    siteKey: "site-2",
    siteName: "Beta API",
    siteType: "sub2api",
    baseUrl: "https://beta.example.com",
    accountId: "account-2",
    providerId: "sub2api",
    status: "success",
    lastCheckedAt: 1735776200000,
    records: [records[1]!],
  },
]

describe("SiteAnnouncementsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    completeProductAnalyticsActionMock.mockResolvedValue(undefined)
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: records }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: status }
        case RuntimeActionIds.SiteAnnouncementsCheckNow:
          return {
            success: true,
            data: {
              checked: 3,
              created: 0,
              notified: 0,
              failed: 1,
              unsupported: 1,
              records: [],
            },
          }
        default:
          return { success: true }
      }
    })
  })

  const expectCheckNowAnalyticsStarted = (surfaceId: string) => {
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CheckSiteAnnouncementsNow,
      surfaceId,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CheckSiteAnnouncementsNow,
      surfaceId,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  }

  const expectMarkAllReadAnalyticsStarted = () => {
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MarkAllAnnouncementsRead,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MarkAllAnnouncementsRead,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  }

  const expectMarkReadAnalyticsStarted = () => {
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MarkAnnouncementRead,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementCard,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.SiteAnnouncements,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.MarkAnnouncementRead,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementCard,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  }

  it("renders overview, notification summary, and expandable announcement details", async () => {
    const user = userEvent.setup()

    render(
      <SiteAnnouncementsPage routeParams={{ recordId: "announcement-1" }} />,
    )

    expect(
      await screen.findByText("siteAnnouncements:title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("siteAnnouncements:summary.total"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("siteAnnouncements:summary.unread"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("siteAnnouncements:summary.sites"),
    ).toBeInTheDocument()
    expect(
      await screen.findByText("siteAnnouncements:summary.filtered"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("siteAnnouncements:summary.notified"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        level: 3,
        name: "Full maintenance window",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Full maintenance window",
      }),
    ).toBeInTheDocument()
    expect(screen.getByText("Second line")).toBeInTheDocument()
    expect(screen.getByText("Beta full content")).toBeInTheDocument()
    expect(
      screen.getAllByRole("link", {
        name: /siteAnnouncements:actions\.viewSource/,
      })[0],
    ).toHaveAttribute("href", "https://alpha.example.com/")

    await user.click(
      screen.getByRole("button", {
        name: /siteAnnouncements:actions\.collapse/,
      }),
    )
    await waitFor(() => {
      expect(screen.queryByText("Second line")).not.toBeInTheDocument()
    })
  })

  it("marks unread Sub2API announcements as read only when expanding details", async () => {
    const user = userEvent.setup()
    const unreadSub2ApiRecord = {
      ...records[1]!,
      id: "announcement-3",
      read: false,
    }

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: [unreadSub2ApiRecord] }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: [] }
        default:
          return { success: true }
      }
    })

    render(<SiteAnnouncementsPage />)

    await screen.findByText("Beta update")
    await user.click(
      screen.getByRole("button", {
        name: /siteAnnouncements:actions\.expand/,
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: /siteAnnouncements:actions\.collapse/,
      }),
    )

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.SiteAnnouncementsMarkRead,
        recordId: "announcement-3",
      })
      expect(
        vi
          .mocked(sendRuntimeMessage)
          .mock.calls.filter(
            (call) =>
              (call[0] as { action?: string }).action ===
              RuntimeActionIds.SiteAnnouncementsMarkRead,
          ),
      ).toHaveLength(1)
    })
  })

  it("completes single-record mark-read analytics as success when the runtime succeeds", async () => {
    const user = userEvent.setup()
    let currentRecords = records
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: currentRecords }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: status }
        case RuntimeActionIds.SiteAnnouncementsMarkRead:
          currentRecords = currentRecords.map((record) =>
            record.id === "announcement-1" ? { ...record, read: true } : record,
          )
          return { success: true }
        default:
          return { success: true }
      }
    })

    render(<SiteAnnouncementsPage />)

    await screen.findByRole("heading", {
      level: 3,
      name: "Full maintenance window",
    })
    await user.click(
      screen.getAllByRole("button", {
        name: "siteAnnouncements:actions.markRead",
      })[0]!,
    )
    expectMarkReadAnalyticsStarted()

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.SiteAnnouncementsMarkRead,
        recordId: "announcement-1",
      })
    })
    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "siteAnnouncements:actions.markRead",
        }),
      ).not.toBeInTheDocument()
    })
  })

  it("completes single-record mark-read analytics as failure when the runtime reports failure", async () => {
    const user = userEvent.setup()

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: records }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: status }
        case RuntimeActionIds.SiteAnnouncementsMarkRead:
          return { success: false, error: "mark rejected" }
        default:
          return { success: true }
      }
    })

    render(<SiteAnnouncementsPage />)

    await screen.findByRole("heading", {
      level: 3,
      name: "Full maintenance window",
    })
    await user.click(
      screen.getAllByRole("button", {
        name: "siteAnnouncements:actions.markRead",
      })[0]!,
    )
    expectMarkReadAnalyticsStarted()

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("shows a toast when the initial announcement load fails", async () => {
    vi.mocked(sendRuntimeMessage).mockRejectedValueOnce(
      new Error("network down"),
    )

    render(<SiteAnnouncementsPage />)

    await waitFor(() => {
      expect(showResultToast).toHaveBeenCalledWith({
        success: false,
        message: "network down",
        errorFallback: "siteAnnouncements:messages.loadFailed",
      })
    })
  })

  it("shows success feedback and reloads after a manual check", async () => {
    const user = userEvent.setup()

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.checkNow",
      }),
    )
    expectCheckNowAnalyticsStarted(
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsPage,
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 3,
            successCount: 1,
            failureCount: 1,
          },
        },
      )
      expect(showResultToast).toHaveBeenCalledWith({
        success: true,
        successFallback: "siteAnnouncements:messages.checkCompleted",
        errorFallback: "siteAnnouncements:messages.checkFailed",
      })
    })
    expect(
      vi
        .mocked(sendRuntimeMessage)
        .mock.calls.filter(
          (call) =>
            (call[0] as { action?: string }).action ===
            RuntimeActionIds.SiteAnnouncementsListRecords,
        ),
    ).toHaveLength(2)
  })

  it("shows failure feedback when the manual check throws", async () => {
    const user = userEvent.setup()

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: records }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: status }
        case RuntimeActionIds.SiteAnnouncementsCheckNow:
          throw new Error("check failed")
        default:
          return { success: true }
      }
    })

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.checkNow",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
      expect(showResultToast).toHaveBeenCalledWith({
        success: false,
        message: "check failed",
        errorFallback: "siteAnnouncements:messages.checkFailed",
      })
    })
  })

  it("completes manual check analytics as failure when the runtime reports failure", async () => {
    const user = userEvent.setup()

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: records }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: status }
        case RuntimeActionIds.SiteAnnouncementsCheckNow:
          return {
            success: false,
            error: "check rejected",
            data: {
              checked: 2,
              created: 0,
              notified: 0,
              failed: 2,
              unsupported: 0,
              records: [],
            },
          }
        default:
          return { success: true }
      }
    })

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.checkNow",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: 2,
            successCount: 0,
            failureCount: 2,
          },
        },
      )
      expect(showResultToast).toHaveBeenCalledWith({
        success: false,
        successFallback: "siteAnnouncements:messages.checkCompleted",
        errorFallback: "check rejected",
      })
    })
  })

  it("marks all records read for the current filter scope", async () => {
    const user = userEvent.setup()
    let currentRecords = records
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: currentRecords }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: status }
        case RuntimeActionIds.SiteAnnouncementsMarkAllRead:
          currentRecords = currentRecords.map((record) => ({
            ...record,
            read: true,
          }))
          return { success: true, data: 1 }
        default:
          return { success: true }
      }
    })

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.markAllRead",
      }),
    )
    expectMarkAllReadAnalyticsStarted()

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 1,
          },
        },
      )
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.SiteAnnouncementsMarkAllRead,
        siteKey: undefined,
      })
    })
    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "siteAnnouncements:actions.markAllRead",
        }),
      ).toBeDisabled()
    })
  })

  it("completes mark-all-read analytics as failure when the runtime reports failure", async () => {
    const user = userEvent.setup()

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: records }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: status }
        case RuntimeActionIds.SiteAnnouncementsMarkAllRead:
          return { success: false, error: "mark rejected" }
        default:
          return { success: true }
      }
    })

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.markAllRead",
      }),
    )
    expectMarkAllReadAnalyticsStarted()

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("completes mark-all-read analytics as failure when the runtime throws", async () => {
    const user = userEvent.setup()

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: records }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: status }
        case RuntimeActionIds.SiteAnnouncementsMarkAllRead:
          throw new Error("mark failed")
        default:
          return { success: true }
      }
    })

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.markAllRead",
      }),
    )
    expectMarkAllReadAnalyticsStarted()

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("renders the empty announcement state when no records are available", async () => {
    const user = userEvent.setup()

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      switch (message.action) {
        case RuntimeActionIds.SiteAnnouncementsListRecords:
          return { success: true, data: [] }
        case RuntimeActionIds.SiteAnnouncementsGetStatus:
          return { success: true, data: [] }
        default:
          return { success: true }
      }
    })

    render(<SiteAnnouncementsPage />)

    expect(
      await screen.findByText("siteAnnouncements:empty.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("siteAnnouncements:empty.description"),
    ).toBeInTheDocument()

    await user.click(
      screen.getAllByRole("button", {
        name: "siteAnnouncements:actions.checkNow",
      })[1]!,
    )
    expectCheckNowAnalyticsStarted(
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsSiteAnnouncementsEmptyState,
    )
    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.SiteAnnouncementsCheckNow,
      })
    })
  })
})
