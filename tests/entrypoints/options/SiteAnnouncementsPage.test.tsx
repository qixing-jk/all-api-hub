import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import SiteAnnouncementsPage from "~/entrypoints/options/pages/SiteAnnouncements"
import { accountStorage } from "~/services/accounts/accountStorage"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { SiteAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { sendSiteAnnouncementsMessage } from "~/services/siteAnnouncements/messaging"
import type {
  SiteAnnouncementRecord,
  SiteAnnouncementSiteState,
} from "~/types/siteAnnouncements"
import { deepOverride } from "~/utils"
import { showResultToast } from "~/utils/core/toastHelpers"
import { openSettingsTab } from "~/utils/navigation"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const {
  sendSiteAnnouncementsMessageMock,
  startProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
  completeProductAnalyticsActionMock,
  pushWithinOptionsPageMock,
} = vi.hoisted(() => ({
  sendSiteAnnouncementsMessageMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  pushWithinOptionsPageMock: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
  }
})

vi.mock("~/services/siteAnnouncements/messaging", () => ({
  sendSiteAnnouncementsMessage: sendSiteAnnouncementsMessageMock,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: vi.fn(),
  },
}))

vi.mock("~/utils/core/toastHelpers", () => ({
  showResultToast: vi.fn(),
}))

vi.mock("~/utils/navigation", () => ({
  openSettingsTab: vi.fn(),
  pushWithinOptionsPage: pushWithinOptionsPageMock,
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
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue(
      structuredClone(DEFAULT_PREFERENCES),
    )
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([
      {
        id: "account-1",
        disabled: false,
      },
    ] as any)
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    completeProductAnalyticsActionMock.mockResolvedValue(undefined)
    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          case SiteAnnouncementsMessageTypes.CheckNow:
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
      },
    )
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

  it("renders overview, notification summary, and route-expanded announcement card", async () => {
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
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.pollingSettings",
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Full maintenance window",
      }),
    ).toBeInTheDocument()
  })

  it("routes the empty announcement setup state to account management when no account exists", async () => {
    const user = userEvent.setup()
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)
    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: [] }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: [] }
          default:
            return { success: true }
        }
      },
    )

    render(<SiteAnnouncementsPage />)

    expect(
      await screen.findByText("siteAnnouncements:empty.noAccounts"),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:empty.addAccount",
      }),
    )

    expect(pushWithinOptionsPageMock).toHaveBeenCalledWith(
      `#${MENU_ITEM_IDS.ACCOUNT}`,
    )
  })

  it("does not block announcement records when account setup lookup fails", async () => {
    vi.mocked(accountStorage.getAllAccounts).mockRejectedValue(
      new Error("account storage unavailable"),
    )

    render(<SiteAnnouncementsPage />)

    expect(await screen.findByText("Alpha API")).toBeInTheDocument()
    expect(
      screen.queryByText("siteAnnouncements:messages.loadFailed"),
    ).not.toBeInTheDocument()
  })

  it("links the disabled page description to announcement polling settings", async () => {
    const user = userEvent.setup()

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    expect(
      screen.getByText("siteAnnouncements:description.disabledSummary"),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:description.pollingSettingsLink",
      }),
    )

    expect(openSettingsTab).toHaveBeenCalledWith("general", {
      anchor: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      preserveHistory: true,
    })
  })

  it("shows the configured automatic polling interval when polling is enabled", async () => {
    vi.mocked(userPreferences.getPreferences).mockResolvedValueOnce(
      deepOverride(structuredClone(DEFAULT_PREFERENCES), {
        siteAnnouncementNotifications: {
          enabled: true,
          intervalMinutes: 45,
        },
      }),
    )

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    expect(
      screen.getByText("siteAnnouncements:description.enabledSummary"),
    ).toBeInTheDocument()
    expect(
      screen.getByText("siteAnnouncements:description.enabledInterval"),
    ).toBeInTheDocument()
  })

  it("marks unread Sub2API announcements as read only when expanding details", async () => {
    const user = userEvent.setup()
    const unreadSub2ApiRecord = {
      ...records[1]!,
      id: "announcement-3",
      read: false,
    }

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: [unreadSub2ApiRecord] }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: [] }
          default:
            return { success: true }
        }
      },
    )

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
      expect(sendSiteAnnouncementsMessage).toHaveBeenCalledWith(
        SiteAnnouncementsMessageTypes.MarkRead,
        { recordId: "announcement-3" },
      )
      expect(
        sendSiteAnnouncementsMessageMock.mock.calls.filter(
          ([type]) => type === SiteAnnouncementsMessageTypes.MarkRead,
        ),
      ).toHaveLength(1)
    })
  })

  it("completes single-record mark-read analytics as success when the runtime succeeds", async () => {
    const user = userEvent.setup()
    let currentRecords = records
    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: currentRecords }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          case SiteAnnouncementsMessageTypes.MarkRead:
            currentRecords = currentRecords.map((record) =>
              record.id === "announcement-1"
                ? { ...record, read: true }
                : record,
            )
            return { success: true }
          default:
            return { success: true }
        }
      },
    )

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
      expect(sendSiteAnnouncementsMessage).toHaveBeenCalledWith(
        SiteAnnouncementsMessageTypes.MarkRead,
        { recordId: "announcement-1" },
      )
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

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          case SiteAnnouncementsMessageTypes.MarkRead:
            return { success: false, error: "mark rejected" }
          default:
            return { success: true }
        }
      },
    )

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
    sendSiteAnnouncementsMessageMock.mockRejectedValueOnce(
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

  it("shows a toast when the typed announcement list response is unsuccessful", async () => {
    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: false, error: "list rejected" }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          default:
            return { success: true }
        }
      },
    )

    render(<SiteAnnouncementsPage />)

    await waitFor(() => {
      expect(showResultToast).toHaveBeenCalledWith({
        success: false,
        message: "list rejected",
        errorFallback: "siteAnnouncements:messages.loadFailed",
      })
    })
    expect(
      await screen.findByText("siteAnnouncements:messages.loadFailed"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("siteAnnouncements:empty.title"),
    ).not.toBeInTheDocument()
  })

  it("shows the load-error state when the typed announcement status response is unsuccessful", async () => {
    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: false, error: "status rejected" }
          default:
            return { success: true }
        }
      },
    )

    render(<SiteAnnouncementsPage />)

    await waitFor(() => {
      expect(showResultToast).toHaveBeenCalledWith({
        success: false,
        message: "status rejected",
        errorFallback: "siteAnnouncements:messages.loadFailed",
      })
    })
    expect(
      await screen.findByText("siteAnnouncements:messages.loadFailed"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("Full maintenance window"),
    ).not.toBeInTheDocument()
  })

  it("disables manual checks while announcements are loading", async () => {
    let resolveRecords!: (response: {
      success: true
      data: typeof records
    }) => void
    let resolveStatus!: (response: {
      success: true
      data: typeof status
    }) => void
    sendSiteAnnouncementsMessageMock.mockImplementation((type: string) => {
      switch (type) {
        case SiteAnnouncementsMessageTypes.ListRecords:
          return new Promise((resolve) => {
            resolveRecords = resolve
          })
        case SiteAnnouncementsMessageTypes.GetStatus:
          return new Promise((resolve) => {
            resolveStatus = resolve
          })
        default:
          return Promise.resolve({ success: true })
      }
    })

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    const manualCheckButton = await screen.findByRole("button", {
      name: "siteAnnouncements:actions.checkNow",
    })
    await waitFor(() => {
      expect(manualCheckButton).toBeDisabled()
    })

    resolveRecords({ success: true, data: records })
    resolveStatus({ success: true, data: status })
    await waitFor(() => {
      expect(manualCheckButton).toBeEnabled()
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
      sendSiteAnnouncementsMessageMock.mock.calls.filter(
        ([type]) => type === SiteAnnouncementsMessageTypes.ListRecords,
      ),
    ).toHaveLength(2)
  })

  it("checks all visible site accounts when no filters are selected", async () => {
    const user = userEvent.setup()

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.checkNow",
      }),
    )

    await waitFor(() => {
      const checkNowMessages = sendSiteAnnouncementsMessageMock.mock.calls
        .filter(([type]) => type === SiteAnnouncementsMessageTypes.CheckNow)
        .map(([, data]) => data)

      expect(checkNowMessages.at(-1)).toEqual({
        accountIds: ["account-1", "account-2"],
      })
    })
  })

  it("checks the selected site scope when manually checking filtered announcements", async () => {
    const user = userEvent.setup()

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("combobox", {
        name: "siteAnnouncements:filters.site",
      }),
    )
    await user.click(screen.getByRole("option", { name: "Alpha API" }))
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.checkNow",
      }),
    )

    await waitFor(() => {
      expect(sendSiteAnnouncementsMessage).toHaveBeenCalledWith(
        SiteAnnouncementsMessageTypes.CheckNow,
        { accountIds: ["account-1"] },
      )
    })
  })

  it("checks the visible site scope when display filters are selected", async () => {
    const user = userEvent.setup()

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(screen.getAllByRole("combobox")[1]!)
    await user.click(screen.getByRole("option", { name: "sub2api" }))
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.checkNow",
      }),
    )

    await waitFor(() => {
      const checkNowMessages = sendSiteAnnouncementsMessageMock.mock.calls
        .filter(([type]) => type === SiteAnnouncementsMessageTypes.CheckNow)
        .map(([, data]) => data)

      expect(checkNowMessages.at(-1)).toEqual({
        accountIds: ["account-2"],
      })
    })
  })

  it("disables manual checks when filters leave no visible announcements", async () => {
    const user = userEvent.setup()

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return {
              success: true,
              data: [
                ...status,
                {
                  siteKey: "site-3",
                  siteName: "Gamma API",
                  siteType: "new-api",
                  baseUrl: "https://gamma.example.com",
                  accountId: "account-3",
                  providerId: "common",
                  status: "success",
                  records: [],
                },
              ],
            }
          default:
            return { success: true }
        }
      },
    )

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("combobox", {
        name: "siteAnnouncements:filters.site",
      }),
    )
    await user.click(screen.getByRole("option", { name: "Gamma API" }))

    await waitFor(() => {
      for (const button of screen.getAllByRole("button", {
        name: "siteAnnouncements:actions.checkNow",
      })) {
        expect(button).toBeDisabled()
      }
    })

    expect(
      sendSiteAnnouncementsMessageMock.mock.calls.some(
        ([type]) => type === SiteAnnouncementsMessageTypes.CheckNow,
      ),
    ).toBe(false)
  })

  it("keeps filtered empty copy when cached records exist without enabled accounts", async () => {
    const user = userEvent.setup()
    vi.mocked(accountStorage.getAllAccounts).mockResolvedValue([] as any)

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return {
              success: true,
              data: [
                ...status,
                {
                  siteKey: "site-3",
                  siteName: "Gamma API",
                  siteType: "new-api",
                  baseUrl: "https://gamma.example.com",
                  accountId: "account-3",
                  providerId: "common",
                  status: "success",
                  records: [],
                },
              ],
            }
          default:
            return { success: true }
        }
      },
    )

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("combobox", {
        name: "siteAnnouncements:filters.site",
      }),
    )
    await user.click(screen.getByRole("option", { name: "Gamma API" }))

    expect(
      await screen.findByText("siteAnnouncements:empty.filtered"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("siteAnnouncements:empty.noAccounts"),
    ).not.toBeInTheDocument()
  })

  it("shows failure feedback when the manual check throws", async () => {
    const user = userEvent.setup()

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          case SiteAnnouncementsMessageTypes.CheckNow:
            throw new Error("check failed")
          default:
            return { success: true }
        }
      },
    )

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

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          case SiteAnnouncementsMessageTypes.CheckNow:
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
      },
    )

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
        },
      )
      expect(showResultToast).toHaveBeenCalledWith({
        success: false,
        message: "check rejected",
        successFallback: "siteAnnouncements:messages.checkCompleted",
        errorFallback: "siteAnnouncements:messages.checkFailed",
      })
    })
  })

  it("uses local failure fallback copy when the manual check runtime error is blank", async () => {
    const user = userEvent.setup()

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          case SiteAnnouncementsMessageTypes.CheckNow:
            return { success: false, error: "" }
          default:
            return { success: true }
        }
      },
    )

    render(<SiteAnnouncementsPage />)

    await screen.findByText("siteAnnouncements:title")
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:actions.checkNow",
      }),
    )

    await waitFor(() => {
      expect(showResultToast).toHaveBeenCalledWith({
        success: false,
        message: undefined,
        successFallback: "siteAnnouncements:messages.checkCompleted",
        errorFallback: "siteAnnouncements:messages.checkFailed",
      })
    })
  })

  it("marks all records read for the current filter scope", async () => {
    const user = userEvent.setup()
    let currentRecords = records
    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: currentRecords }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          case SiteAnnouncementsMessageTypes.MarkAllRead:
            currentRecords = currentRecords.map((record) => ({
              ...record,
              read: true,
            }))
            return { success: true, data: 1 }
          default:
            return { success: true }
        }
      },
    )

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
      expect(sendSiteAnnouncementsMessage).toHaveBeenCalledWith(
        SiteAnnouncementsMessageTypes.MarkAllRead,
        { siteKey: undefined },
      )
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

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          case SiteAnnouncementsMessageTypes.MarkAllRead:
            return { success: false, error: "mark rejected" }
          default:
            return { success: true }
        }
      },
    )

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

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: records }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: status }
          case SiteAnnouncementsMessageTypes.MarkAllRead:
            throw new Error("mark failed")
          default:
            return { success: true }
        }
      },
    )

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

    sendSiteAnnouncementsMessageMock.mockImplementation(
      async (type: string) => {
        switch (type) {
          case SiteAnnouncementsMessageTypes.ListRecords:
            return { success: true, data: [] }
          case SiteAnnouncementsMessageTypes.GetStatus:
            return { success: true, data: [] }
          default:
            return { success: true }
        }
      },
    )

    render(<SiteAnnouncementsPage />)

    expect(
      await screen.findByText("siteAnnouncements:empty.title"),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        "siteAnnouncements:empty.descriptionWhenPollingDisabled",
      ),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", {
        name: "siteAnnouncements:empty.pollingSettingsLink",
      }),
    )
    expect(openSettingsTab).toHaveBeenCalledWith("general", {
      anchor: SETTINGS_ANCHORS.SITE_ANNOUNCEMENT_NOTIFICATIONS_ENABLED,
      preserveHistory: true,
    })

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
      expect(sendSiteAnnouncementsMessage).toHaveBeenCalledWith(
        SiteAnnouncementsMessageTypes.CheckNow,
        undefined,
      )
    })
  })
})
