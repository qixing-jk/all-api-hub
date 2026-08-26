import "./managedSiteChannelsMocks"

import userEvent from "@testing-library/user-event"
import toast from "react-hot-toast"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES, type ManagedSiteType } from "~/constants/siteType"
import ManagedSiteChannels from "~/features/ManagedSiteChannels/ManagedSiteChannels"
import {
  MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE,
  MANAGED_SITE_CHANNELS_REFRESH_STATES,
  MANAGED_SITE_CHANNELS_TEST_IDS,
} from "~/features/ManagedSiteChannels/testIds"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

import { mockCompleteProductAnalyticsAction } from "./managedSiteChannelsMocks"
import {
  buildChannelListData,
  buildPreferences,
  expectManagedSiteChannelActionSpanStarted,
  mockChannels,
  mockMutablePreferencesContext,
  setupManagedSiteChannelsTest,
  setupStaleChannelResponseAfterSiteSwitch,
  waitForChannelsRefreshIdle,
  waitForRowText,
} from "./managedSiteChannelsTestSupport"

describe("ManagedSiteChannels", () => {
  setupManagedSiteChannelsTest()

  it("ignores a fulfilled request from the previous managed site after switching types", async () => {
    const harness = await setupStaleChannelResponseAfterSiteSwitch()
    harness.staleResponse.resolve(
      buildChannelListData([
        {
          id: 3,
          name: "Old Alpha response",
          base_url: "https://old-site.example",
        },
      ]),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
        {
          insights: {
            failureReason:
              PRODUCT_ANALYTICS_FAILURE_REASONS.StaleResponseIgnored,
            managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          },
        },
      )
    })
    expect(screen.getByText("Beta")).toBeInTheDocument()
    expect(screen.queryByText("Old Alpha response")).not.toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:alerts.loadError.title"),
    ).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("clears stale status filters when the managed site type changes", async () => {
    const user = userEvent.setup()
    let currentManagedSiteType: ManagedSiteType = SITE_TYPES.NEW_API
    let currentPreferences = buildPreferences({
      managedSiteType: currentManagedSiteType,
      withMigrationTarget: true,
    })
    const newApiService = {
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        adminToken: "t",
        userId: "1",
      }),
      listChannels: vi.fn().mockResolvedValue(
        buildChannelListData([
          {
            id: 1,
            name: "Alpha",
            base_url: "https://site-a.example",
            status: 1,
          },
          {
            id: 2,
            name: "Beta",
            base_url: "https://site-b.example",
            status: 2,
          },
        ]),
      ),
    } as any
    const doneHubService = {
      siteType: SITE_TYPES.DONE_HUB,
      messagesKey: "donehub",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://donehub.example",
        adminToken: "donehub-token",
        userId: "9",
      }),
      listChannels: vi.fn().mockResolvedValue(buildChannelListData([])),
    } as any

    mockMutablePreferencesContext(() => ({
      preferences: currentPreferences,
      managedSiteType: currentManagedSiteType,
    }))
    vi.mocked(getManagedSiteService).mockImplementation(async () =>
      currentManagedSiteType === SITE_TYPES.DONE_HUB
        ? doneHubService
        : newApiService,
    )

    const { rerender } = render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const statusButton = screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.status",
    })

    await user.click(statusButton)
    await user.click(
      await screen.findByRole("checkbox", {
        name: "managedSiteChannels:statusLabels.manualPause",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
      expect(screen.getByText("Beta")).toBeInTheDocument()
    })

    currentManagedSiteType = SITE_TYPES.DONE_HUB
    currentPreferences = buildPreferences({
      managedSiteType: currentManagedSiteType,
      withMigrationTarget: true,
    })
    rerender(<ManagedSiteChannels />)

    await waitForChannelsRefreshIdle()

    expect(
      screen.getByText("managedSiteChannels:gatewayGuidance.empty.title"),
    ).toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.emptyFiltered"),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
      }),
    ).toBeInTheDocument()
    expect(statusButton).not.toHaveTextContent("(1)")
  })

  it("reloads the channel list when refreshKey changes to a truthy value", async () => {
    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha", base_url: "https://alpha.example" },
        ]),
      )
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 2, name: "Beta", base_url: "https://beta.example" },
        ]),
      )

    const { rerender } = render(<ManagedSiteChannels refreshKey={0} />)

    await waitForRowText("Alpha")

    rerender(<ManagedSiteChannels refreshKey={1} />)

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument()
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
    })

    expect(service.listChannels).toHaveBeenCalledTimes(2)
  })

  it("keeps the current channel rows visible while a manual refresh is loading", async () => {
    const user = userEvent.setup()
    let resolveRefresh: ((value: { items: any[] }) => void) | undefined

    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha", base_url: "https://alpha.example" },
        ]),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve as typeof resolveRefresh
          }) as any,
      )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )

    expectManagedSiteChannelActionSpanStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteChannels,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    await waitFor(() => {
      expect(service.listChannels).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByText("Alpha")).toBeInTheDocument()

    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton),
    ).toBeEnabled()
    expect(
      screen.getByTestId(MANAGED_SITE_CHANNELS_TEST_IDS.refreshButton),
    ).toHaveAttribute(
      MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE,
      MANAGED_SITE_CHANNELS_REFRESH_STATES.Loading,
    )

    resolveRefresh?.({
      items: [{ id: 2, name: "Beta", base_url: "https://beta.example" }],
    })

    await waitFor(() => {
      expect(screen.getByText("Beta")).toBeInTheDocument()
    })
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
  })

  it("allows the user to cancel the current channel list loading request", async () => {
    const user = userEvent.setup()
    let signal: AbortSignal | undefined
    const service = mockChannels([])
    service.listChannels.mockImplementationOnce(
      (_config: unknown, options?: RequestInit) => {
        signal = options?.signal ?? undefined
        return new Promise(() => {})
      },
    )

    render(<ManagedSiteChannels />)

    await waitFor(() => {
      expect(service.listChannels).toHaveBeenCalledTimes(1)
    })

    const cancelRefreshButton = screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.cancelRefresh",
    })
    expect(cancelRefreshButton).toBeEnabled()
    expect(cancelRefreshButton).toHaveAttribute("aria-busy", "true")
    expect(
      within(cancelRefreshButton).getByRole("status", { hidden: true }),
    ).toHaveAttribute("aria-hidden", "true")
    expect(within(cancelRefreshButton).queryByRole("status")).toBeNull()

    await user.click(cancelRefreshButton)

    expect(signal?.aborted).toBe(true)
    expect(service.listChannels).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      const refreshButton = screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      })
      expect(refreshButton).toBeEnabled()
      expect(refreshButton).toHaveAttribute(
        MANAGED_SITE_CHANNELS_REFRESH_STATE_ATTRIBUTE,
        MANAGED_SITE_CHANNELS_REFRESH_STATES.Idle,
      )
    })
  })

  it("reports the configured site message when refresh starts without config", async () => {
    const service = mockChannels([])
    service.getConfig.mockResolvedValueOnce(null)

    render(<ManagedSiteChannels />)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "managedSiteChannels:alerts.loadError.description",
      )
    })
  })

  it("aborts the previous local channel listing request when an external refresh replaces it", async () => {
    let firstSignal: AbortSignal | undefined
    let resolveSecondRefresh: ((value: { items: any[] }) => void) | undefined
    const service = mockChannels([])
    service.listChannels
      .mockImplementationOnce((_config: unknown, options?: RequestInit) => {
        firstSignal = options?.signal ?? undefined
        return new Promise(() => {})
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondRefresh = resolve as typeof resolveSecondRefresh
          }),
      )

    const { rerender } = render(<ManagedSiteChannels refreshKey={0} />)

    await waitFor(() => {
      expect(service.listChannels).toHaveBeenCalledTimes(1)
    })
    expect(firstSignal?.aborted).toBe(false)

    rerender(<ManagedSiteChannels refreshKey={1} />)

    await waitFor(() => {
      expect(firstSignal?.aborted).toBe(true)
      expect(service.listChannels).toHaveBeenCalledTimes(2)
    })

    resolveSecondRefresh?.({
      items: [{ id: 2, name: "Beta", base_url: "https://beta.example" }],
    })

    await waitForRowText("Beta")
  })

  it("ignores a late fulfilled manual refresh after a newer refresh supersedes it", async () => {
    const user = userEvent.setup()
    let firstRefreshSignal: AbortSignal | undefined
    let resolveFirstRefresh: ((value: { items: any[] }) => void) | undefined
    let resolveSecondRefresh: ((value: { items: any[] }) => void) | undefined

    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha", base_url: "https://alpha.example" },
        ]),
      )
      .mockImplementationOnce((_config: unknown, options?: RequestInit) => {
        firstRefreshSignal = options?.signal ?? undefined
        return new Promise((resolve) => {
          resolveFirstRefresh = resolve as typeof resolveFirstRefresh
        })
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondRefresh = resolve as typeof resolveSecondRefresh
          }),
      )

    const { rerender } = render(<ManagedSiteChannels refreshKey={0} />)

    await waitForRowText("Alpha")
    await user.click(
      screen.getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )

    await waitFor(() => {
      expect(service.listChannels).toHaveBeenCalledTimes(2)
    })

    rerender(<ManagedSiteChannels refreshKey={1} />)

    await waitFor(() => {
      expect(firstRefreshSignal?.aborted).toBe(true)
      expect(service.listChannels).toHaveBeenCalledTimes(3)
    })

    resolveSecondRefresh?.({
      items: [
        {
          id: 1,
          name: "Alpha current",
          base_url: "https://alpha.example",
        },
      ],
    })

    await waitForRowText("Alpha current")

    resolveFirstRefresh?.({
      items: [{ id: 2, name: "Beta", base_url: "https://beta.example" }],
    })

    await waitFor(() => {
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
      expect(screen.getByText("Alpha current")).toBeInTheDocument()
      expect(
        screen.getByRole("checkbox", {
          name: "managedSiteChannels:table.selectRow",
        }),
      ).toBeChecked()
    })
    expect(mockCompleteProductAnalyticsAction).not.toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          itemCount: 1,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        },
      },
    )
  })

  it("classifies an aborted superseded refresh rejection as stale", async () => {
    const user = userEvent.setup()
    let firstRefreshSignal: AbortSignal | undefined
    let rejectFirstRefresh: ((reason?: unknown) => void) | undefined
    let resolveSecondRefresh: ((value: { items: any[] }) => void) | undefined

    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha", base_url: "https://alpha.example" },
        ]),
      )
      .mockImplementationOnce((_config: unknown, options?: RequestInit) => {
        firstRefreshSignal = options?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          rejectFirstRefresh = reject
        })
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondRefresh = resolve as typeof resolveSecondRefresh
          }),
      )

    const { rerender } = render(<ManagedSiteChannels refreshKey={0} />)

    await waitForRowText("Alpha")

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )
    await waitFor(() => {
      expect(service.listChannels).toHaveBeenCalledTimes(2)
    })

    rerender(<ManagedSiteChannels refreshKey={1} />)

    await waitFor(() => {
      expect(firstRefreshSignal?.aborted).toBe(true)
      expect(service.listChannels).toHaveBeenCalledTimes(3)
    })
    rejectFirstRefresh?.(new DOMException("aborted", "AbortError"))
    resolveSecondRefresh?.({
      items: [{ id: 3, name: "Gamma", base_url: "https://gamma.example" }],
    })

    await waitForRowText("Gamma")
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      {
        insights: {
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.StaleResponseIgnored,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
        },
      },
    )
  })

  it("classifies a stopped manual refresh rejection as user cancellation", async () => {
    const user = userEvent.setup()
    let manualRefreshSignal: AbortSignal | undefined
    let rejectManualRefresh: ((reason?: unknown) => void) | undefined

    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha", base_url: "https://alpha.example" },
        ]),
      )
      .mockImplementationOnce((_config: unknown, options?: RequestInit) => {
        manualRefreshSignal = options?.signal ?? undefined
        return new Promise((_resolve, reject) => {
          rejectManualRefresh = reject
        })
      })

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const refreshButton = screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.refresh",
    })
    await user.click(refreshButton)

    await waitFor(() => {
      expect(service.listChannels).toHaveBeenCalledTimes(2)
    })
    await user.click(refreshButton)

    await waitFor(() => {
      expect(manualRefreshSignal?.aborted).toBe(true)
    })
    rejectManualRefresh?.(new DOMException("aborted", "AbortError"))

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
        {
          insights: {
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser,
            managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          },
        },
      )
    })
  })

  it("aborts the current refresh during cleanup", async () => {
    let signal: AbortSignal | undefined
    const service = mockChannels([])
    service.listChannels.mockImplementationOnce(
      (_config: unknown, options?: RequestInit) => {
        signal = options?.signal ?? undefined
        return new Promise(() => {})
      },
    )

    const { unmount } = render(<ManagedSiteChannels />)

    await waitFor(() => {
      expect(service.listChannels).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(signal?.aborted).toBe(true)
  })

  it("completes manual refresh analytics with the refreshed channel count", async () => {
    const user = userEvent.setup()

    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(buildChannelListData([]))
      .mockResolvedValueOnce(
        buildChannelListData([
          { id: 1, name: "Alpha", base_url: "https://alpha.example" },
          { id: 2, name: "Beta", base_url: "https://beta.example" },
        ]),
      )

    render(<ManagedSiteChannels />)

    await waitForChannelsRefreshIdle()

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )

    expectManagedSiteChannelActionSpanStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteChannels,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            itemCount: 2,
            managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          },
        },
      )
    })
  })

  it("tracks manual refresh analytics failure when channel loading fails", async () => {
    const user = userEvent.setup()

    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(buildChannelListData([]))
      .mockRejectedValueOnce(new Error("load failed"))

    render(<ManagedSiteChannels />)

    await waitForChannelsRefreshIdle()

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )

    expectManagedSiteChannelActionSpanStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteChannels,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          },
        },
      )
    })
  })

  it("completes manual refresh analytics as cancelled when the user stops loading", async () => {
    const user = userEvent.setup()
    const service = mockChannels([])
    service.listChannels
      .mockResolvedValueOnce(buildChannelListData([]))
      .mockImplementationOnce(() => new Promise(() => {}))

    render(<ManagedSiteChannels />)

    await waitForChannelsRefreshIdle()

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.cancelRefresh",
      }),
    )

    await waitFor(() => {
      expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
        {
          insights: {
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser,
            managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          },
        },
      )
    })
  })
})
