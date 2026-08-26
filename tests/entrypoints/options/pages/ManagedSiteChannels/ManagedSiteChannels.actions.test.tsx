import "./managedSiteChannelsMocks"

import userEvent from "@testing-library/user-event"
import toast from "react-hot-toast"
import { describe, expect, it, vi } from "vitest"

import { ChannelDialogContainer } from "~/components/dialogs/ChannelDialog"
import { CLAUDE_CODE_HUB_PROVIDER_TYPE } from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import ManagedSiteChannels from "~/features/ManagedSiteChannels/ManagedSiteChannels"
import { fetchChannelFilters } from "~/features/ManagedSiteChannels/utils/channelFilters"
import { getManagedSiteService } from "~/services/managedSites/managedSiteService"
import type { ManagedSiteVoidMutationResult } from "~/services/managedSites/mutations/contracts"
import { fetchNewApiChannelKey } from "~/services/managedSites/providers/newApiSession"
import { sendModelSyncMessage } from "~/services/models/modelSync/messaging"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MANAGED_SITE_TYPES,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { createManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"
import { createTab } from "~/utils/browser/browserApi"
import { navigateWithinOptionsPage } from "~/utils/navigation"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "~~/tests/test-utils/render"

import {
  mockCompleteProductAnalyticsAction,
  mockResolveManagedUpstreamResourceCapabilities,
  mockTrackProductAnalyticsActionStarted,
  mockWithProtectionBypassUserCommand,
} from "./managedSiteChannelsMocks"
import {
  buildChannelListData,
  buildCompleteChannelRow,
  buildPreferences,
  createDeferred,
  expectManagedSiteChannelActionSpanStarted,
  expectManagedSiteChannelActionTracked,
  markGatewayGuidanceOnboardingCompletedMock,
  mockChannels,
  openRowActionsMenu,
  setupManagedSiteChannelsTest,
  succeededChannelDelete,
  waitForChannelsRefreshIdle,
  waitForRowText,
} from "./managedSiteChannelsTestSupport"

describe("ManagedSiteChannels", () => {
  setupManagedSiteChannelsTest()

  it("does not expose console actions for an invalid managed-site base URL", async () => {
    mockChannels([])
    const preferences = buildPreferences({
      managedSiteType: SITE_TYPES.NEW_API,
    })
    preferences.newApi.baseUrl = "/relative/path"
    vi.mocked(useUserPreferencesContext).mockReturnValue({
      preferences,
      managedSiteType: SITE_TYPES.NEW_API,
      newApiBaseUrl: preferences.newApi.baseUrl,
      newApiUserId: preferences.newApi.userId,
      newApiUsername: preferences.newApi.username,
      newApiPassword: preferences.newApi.password,
      newApiTotpSecret: preferences.newApi.totpSecret,
      markGatewayGuidanceOnboardingCompleted:
        markGatewayGuidanceOnboardingCompletedMock,
    } as any)

    render(<ManagedSiteChannels />)

    await screen.findByText("managedSiteChannels:gatewayGuidance.empty.title")

    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.openChannelConsole",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("link", {
        name: "managedSiteChannels:gatewayGuidance.openTokenConsole",
      }),
    ).not.toBeInTheDocument()
    expect(createTab).not.toHaveBeenCalled()
  })

  it("shows a load error alert when fetching channels fails", async () => {
    const service = mockChannels([])
    service.listChannels.mockRejectedValue(new Error("Runtime request failed"))

    render(<ManagedSiteChannels />)

    await waitFor(
      () => {
        expect(
          screen.getByText("managedSiteChannels:alerts.loadError.title"),
        ).toBeInTheDocument()
      },
      { timeout: 3000 },
    )
    expect(
      screen.queryByText("settings:messages.runtimeRequestFailed"),
    ).not.toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith(
      "managedSiteChannels:alerts.loadError.description",
    )
    expect(sendModelSyncMessage).not.toHaveBeenCalledWith(
      "modelSync:listChannels",
    )
    expect(
      screen.queryByText("managedSiteChannels:gatewayGuidance.empty.title"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromAccountKey",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:gatewayGuidance.empty.importFromApiKeyLibrary",
      }),
    ).not.toBeInTheDocument()
  })

  it("renders base_url as a clickable link", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://click.me" }])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const link = screen.getByRole("link", { name: "https://click.me" })
    expect(link.getAttribute("href")).toMatch(/^https:\/\/click\.me\/?$/)
  })

  it("updates the options URL search param when the search input changes", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://example.com" }])

    render(
      <ManagedSiteChannels
        routeParams={{ channelId: "1", nativeView: "compact" }}
      />,
    )

    await waitForRowText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "foo" } })

    await waitFor(() => {
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        "#managedSiteChannels",
        { nativeView: "compact", search: "foo" },
      )
    })
  })

  it("does not push a duplicate search navigation when the route param already matches", async () => {
    mockChannels([{ id: 1, name: "Alpha", base_url: "https://example.com" }])

    render(<ManagedSiteChannels routeParams={{ search: "Alpha" }} />)

    await waitForRowText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    fireEvent.change(input, { target: { value: "Alpha" } })

    expect(navigateWithinOptionsPage).not.toHaveBeenCalled()
  })

  it("clears the search input from the dedicated clear button", async () => {
    const user = userEvent.setup()

    mockChannels([{ id: 1, name: "Alpha", base_url: "https://example.com" }])

    render(<ManagedSiteChannels routeParams={{ search: "Alpha" }} />)

    await waitForRowText("Alpha")

    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("Alpha")

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.clearSearch",
      }),
    )

    await waitFor(() => {
      expect(input.value).toBe("")
      expect(navigateWithinOptionsPage).toHaveBeenCalledWith(
        "#managedSiteChannels",
        {},
      )
    })
  })

  it("filters rows by status from the toolbar and shows the active filter count", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", status: 1 },
      { id: 2, name: "Beta", base_url: "https://beta.example", status: 2 },
    ])

    render(<ManagedSiteChannels />)

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
    })

    expect(screen.getByText("Beta")).toBeInTheDocument()
    expect(statusButton).toHaveTextContent("(1)")
  })

  it("clears the last active status filter when the same option is unchecked", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", status: 1 },
      { id: 2, name: "Beta", base_url: "https://beta.example", status: 2 },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const statusButton = screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.status",
    })

    await user.click(statusButton)

    const manualPauseCheckbox = await screen.findByRole("checkbox", {
      name: "managedSiteChannels:statusLabels.manualPause",
    })

    await user.click(manualPauseCheckbox)

    await waitFor(() => {
      expect(screen.queryByText("Alpha")).not.toBeInTheDocument()
      expect(screen.getByText("Beta")).toBeInTheDocument()
    })
    expect(statusButton).toHaveTextContent("(1)")

    await user.click(manualPauseCheckbox)

    await waitFor(() => {
      expect(screen.getByText("Alpha")).toBeInTheDocument()
      expect(screen.getByText("Beta")).toBeInTheDocument()
    })
    expect(statusButton).not.toHaveTextContent("(1)")
  })

  it("uses Octopus-specific column visibility and type labels", async () => {
    mockChannels(
      [
        {
          id: 1,
          name: "Alpha",
          base_url: "https://octopus.example",
          type: 1,
          models: "gpt-4o,gpt-4o-mini",
          group: "default",
          status: 1,
          priority: 8,
          weight: 5,
        },
      ],
      { managedSiteType: SITE_TYPES.OCTOPUS },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    const row = screen.getByText("Alpha").closest("tr")

    expect(row).toBeTruthy()

    expect(
      screen.queryByText("managedSiteChannels:table.columns.group"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.columns.priority"),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText("managedSiteChannels:table.columns.weight"),
    ).not.toBeInTheDocument()
    expect(screen.getByText("OpenAI Response")).toBeInTheDocument()
    expect(within(row!).getByText("2")).toBeInTheDocument()
  })

  it("toggles hideable columns from the toolbar menu without closing the menu", async () => {
    const user = userEvent.setup()

    mockChannels([
      {
        id: 1,
        name: "Alpha",
        base_url: "https://alpha.example",
        status: 1,
      },
    ])

    const { container } = render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.columns",
      }),
    )

    const statusToggle = await screen.findByRole("menuitemcheckbox", {
      name: "managedSiteChannels:table.columns.status",
    })
    expect(statusToggle).toHaveAttribute("data-state", "checked")

    await user.click(statusToggle)

    await waitFor(() => {
      const table = container.querySelector("table")
      expect(table).toBeTruthy()
      expect(
        within(table as HTMLTableElement).queryByText(
          "managedSiteChannels:table.columns.status",
        ),
      ).not.toBeInTheDocument()
    })

    expect(
      screen.getByRole("menuitemcheckbox", {
        name: "managedSiteChannels:table.columns.status",
      }),
    ).toBeInTheDocument()
  })

  it("sends a targeted sync request from row actions and reports backend failures", async () => {
    const user = userEvent.setup()
    const channels = [
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ]

    mockChannels(channels)
    vi.mocked(sendModelSyncMessage).mockImplementation(async (type: string) => {
      if (type === "modelSync:triggerSelected") {
        return {
          success: false,
          error: "Runtime request failed",
        } as any
      }

      return { success: true } as any
    })

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.sync",
      }),
    )

    expectManagedSiteChannelActionSpanStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.SyncManagedSiteChannel,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
    )
    await waitFor(() => {
      expect(sendModelSyncMessage).toHaveBeenCalledWith(
        "modelSync:triggerSelected",
        {
          channelIds: [1],
          protectionBypassExecution: userCommandExecution(
            PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
          ),
        },
      )
    })
    expect(mockWithProtectionBypassUserCommand).toHaveBeenCalledWith(
      "sync_managed_site_models",
      "options",
      expect.any(Function),
    )

    expect(toast.error).toHaveBeenCalledWith(
      "managedSiteChannels:toasts.syncFailed",
    )
    expect(toast.error).not.toHaveBeenCalledWith(
      expect.stringContaining("settings:messages.runtimeRequestFailed"),
    )
    expect(mockTrackProductAnalyticsActionStarted).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncManagedSiteChannel,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          itemCount: 1,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          selectedCount: 1,
        },
      },
    )
    expect(mockCompleteProductAnalyticsAction).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        error: expect.anything(),
      }),
    )
    expect(mockCompleteProductAnalyticsAction).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: expect.anything(),
      }),
    )
  })

  it("completes row sync analytics as skipped when no eligible channel id is available", async () => {
    const user = userEvent.setup()
    const channels = [
      { id: 0, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ]

    mockChannels(channels)
    vi.mocked(sendModelSyncMessage).mockImplementation(async () => {
      return { success: true } as any
    })

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.sync",
      }),
    )

    expectManagedSiteChannelActionSpanStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.SyncManagedSiteChannel,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
    )
    expect(sendModelSyncMessage).not.toHaveBeenCalledWith(
      "modelSync:triggerSelected",
      { channelIds: [0] },
    )
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      {
        insights: {
          itemCount: 0,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          selectedCount: 1,
        },
      },
    )
  })

  it("opens the filter dialog from row actions and loads channel-specific filters", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.filters",
      }),
    )

    expectManagedSiteChannelActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelFilters,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
    )
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:filters.title"),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchChannelFilters).toHaveBeenCalledWith({
        channelId: 1,
        resourceRef: createManagedUpstreamResourceRef({
          managedSiteType: SITE_TYPES.NEW_API,
          scopeKey: "https://admin.example",
          resourceId: 1,
        }),
      })
    })
  })

  it("opens the row-action delete flow for a single channel", async () => {
    const user = userEvent.setup()
    const deleteChannel = vi.fn().mockResolvedValue(succeededChannelDelete(1))

    const service = mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ])
    service.deleteChannel = deleteChannel

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.delete",
      }),
    )

    expect(mockTrackProductAnalyticsActionStarted).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteManagedSiteChannel,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:dialog.deleteTitle"),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:dialog.confirm",
      }),
    )

    await waitFor(() => {
      expect(deleteChannel).toHaveBeenCalledWith(
        {
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        },
        1,
      )
    })

    await waitFor(() => {
      expect(
        within(screen.getByRole("table")).queryByText("Alpha"),
      ).not.toBeInTheDocument()
    })

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:toasts.channelDeleted",
    )
    expectManagedSiteChannelActionSpanStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.DeleteManagedSiteChannel,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
    )
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          failureCount: 0,
          itemCount: 1,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          selectedCount: 1,
          successCount: 1,
        },
      },
    )
  })

  it("removes successfully deleted channels and reports partial delete failures", async () => {
    const user = userEvent.setup()

    const service = mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
      { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
    ])

    const deleteChannel = vi
      .fn()
      .mockImplementation((_config: unknown, channelId: number) =>
        channelId === 1
          ? Promise.resolve(succeededChannelDelete(1))
          : Promise.resolve({
              outcome: "rejected",
              diagnostic: { message: "provider refusal" },
            }),
      )

    service.deleteChannel = deleteChannel

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const alphaRow = screen.getByText("Alpha").closest("tr")
    const betaRow = screen.getByText("Beta").closest("tr")
    expect(alphaRow).toBeTruthy()
    expect(betaRow).toBeTruthy()

    await user.click(
      within(alphaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )
    await user.click(
      within(betaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.deleteSelected",
      }),
    )

    expect(mockTrackProductAnalyticsActionStarted).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteSelectedManagedSiteChannels,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:dialog.deleteTitlePlural"),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:dialog.confirm",
      }),
    )

    await waitFor(() => {
      expect(deleteChannel).toHaveBeenCalledTimes(2)
    })

    await waitFor(() => {
      expect(
        within(screen.getByRole("table")).queryByText("Alpha"),
      ).not.toBeInTheDocument()
    })

    expect(
      within(screen.getByRole("table")).getByText("Beta"),
    ).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:toasts.channelDeleted",
    )
    expect(toast.error).toHaveBeenCalledWith("provider refusal")
    expectManagedSiteChannelActionSpanStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.DeleteSelectedManagedSiteChannels,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          failureCount: 1,
          itemCount: 2,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          selectedCount: 2,
          successCount: 1,
        },
      },
    )
  })

  it("runs ordered bulk deletes with limit four, reconciles ambiguous rows, and blocks replay until recovery", async () => {
    const user = userEvent.setup()
    const channels = [
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
      { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
      { id: 3, name: "Gamma", base_url: "https://gamma.example", key: "c" },
      { id: 4, name: "Delta", base_url: "https://delta.example", key: "d" },
      {
        id: 5,
        name: "Epsilon",
        base_url: "https://epsilon.example",
        key: "e",
      },
      { id: 6, name: "Zeta", base_url: "https://zeta.example", key: "f" },
    ]
    const service = mockChannels(channels)
    service.listChannels
      .mockResolvedValueOnce(buildChannelListData(channels))
      .mockRejectedValueOnce(new Error("post-delete refresh failed"))
      .mockResolvedValueOnce(
        buildChannelListData(
          channels.filter((channel) => ![1, 4].includes(channel.id)),
        ),
      )

    const deleteDeferreds = new Map<
      number,
      ReturnType<typeof createDeferred<ManagedSiteVoidMutationResult>>
    >()
    service.deleteChannel = vi.fn((_config: unknown, channelId: number) => {
      const deferred = createDeferred<ManagedSiteVoidMutationResult>()
      deleteDeferreds.set(channelId, deferred)
      return deferred.promise
    })

    render(<ManagedSiteChannels />)

    await waitForRowText("Zeta")
    await waitForChannelsRefreshIdle()
    await user.click(
      screen.getByRole("checkbox", {
        name: "managedSiteChannels:table.selectAll",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.deleteSelected",
      }),
    )
    const confirmDialog = await screen.findByRole("dialog")
    await user.click(
      within(confirmDialog).getByRole("button", {
        name: "managedSiteChannels:dialog.confirm",
      }),
    )

    await waitFor(() => expect(service.deleteChannel).toHaveBeenCalledTimes(4))
    expect(Array.from(deleteDeferreds.keys())).toEqual([1, 2, 3, 4])

    await act(async () => {
      deleteDeferreds.get(4)?.resolve(succeededChannelDelete(4))
    })
    await waitFor(() => expect(service.deleteChannel).toHaveBeenCalledTimes(5))
    await act(async () => {
      deleteDeferreds.get(1)?.resolve(succeededChannelDelete(1))
    })
    await waitFor(() => expect(service.deleteChannel).toHaveBeenCalledTimes(6))

    await act(async () => {
      deleteDeferreds.get(2)?.resolve({
        outcome: "rejected",
        diagnostic: { message: "backend rejected" },
      })
      deleteDeferreds.get(3)?.resolve({
        outcome: "uncertain",
        diagnostic: { message: "Failed to fetch" },
      })
      deleteDeferreds.get(5)?.resolve({
        outcome: "uncertain",
        diagnostic: { message: "Aborted" },
      })
      deleteDeferreds.get(6)?.resolve({
        outcome: "rejected",
        diagnostic: { message: "validation failed" },
      })
    })

    const resultRegion = await screen.findByRole("status", {
      name: "managedSiteChannels:dialog.deleteResultsTitle",
    })
    expect(
      within(resultRegion)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "AlphamanagedSiteChannels:dialog.deleteResultStatus.success",
      "BetamanagedSiteChannels:dialog.deleteResultStatus.failed",
      "GammamanagedSiteChannels:dialog.deleteResultStatus.uncertain",
      "DeltamanagedSiteChannels:dialog.deleteResultStatus.success",
      "EpsilonmanagedSiteChannels:dialog.deleteResultStatus.uncertain",
      "ZetamanagedSiteChannels:dialog.deleteResultStatus.failed",
    ])
    expect(service.listChannels).toHaveBeenCalledTimes(2)
    expect(
      within(resultRegion).getByText(
        "managedSiteChannels:dialog.deleteRefreshRequired",
      ),
    ).toBeVisible()

    const betaRow = within(screen.getByRole("table"))
      .getByText("Beta")
      .closest("tr")
    expect(betaRow).toBeTruthy()
    await openRowActionsMenu(betaRow!, user)
    expect(
      screen.queryByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.delete",
      }),
    ).toBeNull()
    await user.keyboard("{Escape}")

    await user.click(
      within(resultRegion).getByRole("button", {
        name: "managedSiteChannels:dialog.deleteRefreshAction",
      }),
    )
    await waitFor(() => expect(service.listChannels).toHaveBeenCalledTimes(3))
    await waitForChannelsRefreshIdle()
    expect(
      screen.queryByText("managedSiteChannels:dialog.deleteRefreshRequired"),
    ).toBeNull()

    const recoveredBetaRow = within(screen.getByRole("table"))
      .getByText("Beta")
      .closest("tr")
    expect(recoveredBetaRow).toBeTruthy()
    await openRowActionsMenu(recoveredBetaRow!, user)
    expect(
      screen.getByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.delete",
      }),
    ).toBeVisible()
  })

  it("does not let an old delete execution refresh or update a newly selected site", async () => {
    const user = userEvent.setup()
    let currentManagedSiteType: ManagedSiteType = SITE_TYPES.NEW_API
    let currentPreferences = buildPreferences({
      managedSiteType: currentManagedSiteType,
      withMigrationTarget: true,
    })
    const deletion = createDeferred<ManagedSiteVoidMutationResult>()
    const oldService = {
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        adminToken: "token",
        userId: "1",
      }),
      listChannels: vi.fn().mockResolvedValue(
        buildChannelListData([
          {
            id: 1,
            name: "Alpha",
            base_url: "https://alpha.example.invalid",
          },
        ]),
      ),
      deleteChannel: vi.fn().mockReturnValue(deletion.promise),
    } as any
    const newService = {
      siteType: SITE_TYPES.DONE_HUB,
      messagesKey: "donehub",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://donehub.example",
        adminToken: "token",
        userId: "9",
      }),
      listChannels: vi.fn().mockResolvedValue(
        buildChannelListData([
          {
            id: 2,
            name: "Beta",
            base_url: "https://beta.example.invalid",
          },
        ]),
      ),
    } as any

    vi.mocked(useUserPreferencesContext).mockImplementation(
      () =>
        ({
          preferences: currentPreferences,
          managedSiteType: currentManagedSiteType,
          newApiBaseUrl: currentPreferences.newApi.baseUrl,
          newApiUserId: currentPreferences.newApi.userId,
          newApiUsername: currentPreferences.newApi.username,
          newApiPassword: currentPreferences.newApi.password,
          newApiTotpSecret: currentPreferences.newApi.totpSecret,
          markGatewayGuidanceOnboardingCompleted:
            markGatewayGuidanceOnboardingCompletedMock,
          updateManagedSiteType: vi.fn().mockResolvedValue(true),
        }) as any,
    )
    vi.mocked(getManagedSiteService).mockImplementation(async () =>
      currentManagedSiteType === SITE_TYPES.DONE_HUB ? newService : oldService,
    )

    const { rerender } = render(<ManagedSiteChannels />)
    await waitForRowText("Alpha")
    const alphaRow = screen.getByText("Alpha").closest("tr")
    expect(alphaRow).toBeTruthy()
    await openRowActionsMenu(alphaRow!, user)
    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.delete",
      }),
    )
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "managedSiteChannels:dialog.confirm",
      }),
    )
    await waitFor(() => expect(oldService.deleteChannel).toHaveBeenCalled())

    currentManagedSiteType = SITE_TYPES.DONE_HUB
    currentPreferences = buildPreferences({
      managedSiteType: currentManagedSiteType,
      withMigrationTarget: true,
    })
    rerender(<ManagedSiteChannels />)
    await waitForRowText("Beta")

    await act(async () => {
      deletion.resolve(succeededChannelDelete(1))
      await deletion.promise
    })

    await waitFor(() => {
      expect(oldService.listChannels).toHaveBeenCalledTimes(1)
      expect(newService.listChannels).toHaveBeenCalledTimes(1)
      expect(screen.getByText("Beta")).toBeInTheDocument()
    })
    expect(toast.success).not.toHaveBeenCalledWith(
      "managedSiteChannels:toasts.channelDeleted",
    )
  })

  it("does not refresh or publish delete results after unmount", async () => {
    const user = userEvent.setup()
    const deletion = createDeferred<ManagedSiteVoidMutationResult>()
    const service = mockChannels([
      {
        id: 1,
        name: "Alpha",
        base_url: "https://alpha.example.invalid",
      },
    ])
    service.deleteChannel = vi.fn().mockReturnValue(deletion.promise)

    const { unmount } = render(<ManagedSiteChannels />)
    await waitForRowText("Alpha")
    const alphaRow = screen.getByText("Alpha").closest("tr")
    expect(alphaRow).toBeTruthy()
    await openRowActionsMenu(alphaRow!, user)
    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.delete",
      }),
    )
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "managedSiteChannels:dialog.confirm",
      }),
    )
    await waitFor(() => expect(service.deleteChannel).toHaveBeenCalled())

    unmount()
    await act(async () => {
      deletion.resolve(succeededChannelDelete(1))
      await deletion.promise
    })

    expect(service.listChannels).toHaveBeenCalledTimes(1)
    expect(toast.success).not.toHaveBeenCalledWith(
      "managedSiteChannels:toasts.channelDeleted",
    )
  })

  it("syncs the selected rows from the toolbar", async () => {
    const user = userEvent.setup()
    const initialChannels = [
      {
        id: 1,
        name: "Alpha",
        base_url: "https://alpha.example",
        key: "a",
        models: "gpt-3.5",
      },
      { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
    ]

    mockChannels(initialChannels)
    vi.mocked(sendModelSyncMessage).mockImplementation(async (type: string) => {
      if (type === "modelSync:triggerSelected") {
        return {
          success: true,
          data: {
            items: [
              {
                channelId: 1,
                channelName: "Alpha",
                ok: true,
                attempts: 1,
                finishedAt: 1_700_000_001_000,
                oldModels: ["gpt-3.5"],
                newModels: ["gpt-4o", "gpt-4.1"],
              },
              {
                channelId: 2,
                channelName: "Beta",
                ok: false,
                attempts: 1,
                finishedAt: 1_700_000_001_500,
                oldModels: [],
                message: "sync failed",
              },
            ],
            statistics: {
              successCount: 1,
            },
          },
        } as any
      }

      return { success: true } as any
    })

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const alphaRow = screen.getByText("Alpha").closest("tr")
    const betaRow = screen.getByText("Beta").closest("tr")
    expect(alphaRow).toBeTruthy()
    expect(betaRow).toBeTruthy()

    await user.click(
      within(alphaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )
    await user.click(
      within(betaRow!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.syncSelected",
      }),
    )

    expectManagedSiteChannelActionSpanStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteChannels,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    await waitFor(() => {
      expect(sendModelSyncMessage).toHaveBeenCalledWith(
        "modelSync:triggerSelected",
        {
          channelIds: [1, 2],
          protectionBypassExecution: userCommandExecution(
            PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
          ),
        },
      )
    })
    expect(mockWithProtectionBypassUserCommand).toHaveBeenCalledWith(
      "sync_managed_site_models",
      "options",
      expect.any(Function),
    )

    expect(toast.success).toHaveBeenCalledWith(
      "managedSiteChannels:toasts.syncCompleted",
    )
    expect(screen.getByText("Beta")).toBeInTheDocument()
    await waitFor(() => {
      const currentAlphaRow = screen.getByText("Alpha").closest("tr")
      const currentBetaRow = screen.getByText("Beta").closest("tr")
      expect(currentAlphaRow).toBeTruthy()
      expect(currentBetaRow).toBeTruthy()
      expect(within(currentAlphaRow!).getByText("2")).toBeInTheDocument()
      expect(within(currentBetaRow!).getByText("0")).toBeInTheDocument()
    })
    expect(mockTrackProductAnalyticsActionStarted).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SyncSelectedManagedSiteChannels,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(mockCompleteProductAnalyticsAction).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          failureCount: 1,
          itemCount: 2,
          managedSiteType: PRODUCT_ANALYTICS_MANAGED_SITE_TYPES.NewApi,
          selectedCount: 2,
          successCount: 1,
          warningCount: 0,
        },
      },
    )
    expect(mockCompleteProductAnalyticsAction).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        insights: expect.objectContaining({
          message: expect.anything(),
        }),
      }),
    )
  })

  it("uses the select-all checkbox to open a migration preview for the whole page", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
        { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
      ],
      { withMigrationTarget: true },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )

    expectManagedSiteChannelActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.ToggleManagedSiteChannelMigrationMode,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    await user.click(
      screen.getByRole("checkbox", {
        name: "managedSiteChannels:table.selectAll",
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    )

    expectManagedSiteChannelActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenSelectedManagedSiteChannelMigration,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:migration.title"),
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Alpha")).toBeInTheDocument()
    expect(within(dialog).getByText("Beta")).toBeInTheDocument()
  })

  it("ignores stale real-key responses after reopening the dialog for another channel", async () => {
    const user = userEvent.setup()
    let resolveFirstRealKey: ((key: string) => void) | undefined

    mockChannels([
      {
        id: 208,
        name: "Alpha",
        base_url: "https://example.com/alpha",
        type: 1,
        models: "gpt-4o",
        group: "default",
        status: 1,
        priority: 0,
        weight: 0,
        key: "",
      },
      {
        id: 209,
        name: "Beta",
        base_url: "https://example.com/beta",
        type: 1,
        models: "gpt-4o-mini",
        group: "default",
        status: 1,
        priority: 0,
        weight: 0,
        key: "",
      },
    ])

    vi.mocked(fetchNewApiChannelKey).mockImplementation(({ channelId }) => {
      if (channelId === 208) {
        return new Promise((resolve) => {
          resolveFirstRealKey = resolve
        })
      }

      return Promise.resolve("sk-beta-channel-key")
    })

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    const alphaRow = screen.getByText("Alpha").closest("tr")
    expect(alphaRow).toBeTruthy()
    await openRowActionsMenu(alphaRow!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    )

    await waitFor(() => {
      expect(fetchNewApiChannelKey).toHaveBeenCalledWith({
        baseUrl: "https://admin.example",
        userId: "1",
        username: "admin",
        password: "secret-password",
        totpSecret: "JBSWY3DPEHPK3PXP",
        channelId: 208,
        protectionBypassExecution: userCommandExecution(
          PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
        ),
      })
    })

    await user.click(
      screen.getByRole("button", {
        name: "common:actions.cancel",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    const betaRow = screen.getByText("Beta").closest("tr")
    expect(betaRow).toBeTruthy()
    await openRowActionsMenu(betaRow!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    resolveFirstRealKey?.("sk-stale-alpha-key")

    const keyInput = await screen.findByPlaceholderText(
      "channelDialog:fields.key.placeholder",
    )

    await waitFor(() => {
      expect(keyInput).toHaveValue("")
      expect(
        screen.queryByDisplayValue("sk-stale-alpha-key"),
      ).not.toBeInTheDocument()
    })
  })

  it("loads the real channel key from the edit dialog for non-New API managed sites", async () => {
    const user = userEvent.setup()
    const fetchChannelSecretKey = vi
      .fn()
      .mockResolvedValue("sk-real-channel-key")

    mockChannels(
      [
        {
          id: 308,
          name: "Alpha",
          base_url: "https://example.com",
          type: 1,
          models: "gpt-4o",
          group: "default",
          status: 1,
          priority: 0,
          weight: 0,
          key: "",
        },
      ],
      {
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        messagesKey: "claudecodehub",
        fetchChannelSecretKey,
      },
    )

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Alpha")

    const row = screen.getByText("Alpha").closest("tr")
    expect(row).toBeTruthy()
    await openRowActionsMenu(row!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    )

    await waitFor(() => {
      expect(fetchChannelSecretKey).toHaveBeenCalledWith(
        {
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        },
        308,
      )
    })

    await waitFor(() => {
      expect(
        screen.getByDisplayValue("sk-real-channel-key"),
      ).toBeInTheDocument()
    })
  })

  it("loads the real Claude Code Hub provider key through resource reveal support", async () => {
    const user = userEvent.setup()
    const row = buildCompleteChannelRow({
      id: 408,
      name: "Claude Provider",
      base_url: "https://cch-source.example",
      type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
      models: "claude-3-5-sonnet",
      group: "vip",
      status: 1,
      priority: 2,
      weight: 5,
      key: "sk-********",
    })
    const detail = {
      summary: {
        ref: {
          managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
          scopeKey: "https://admin.example",
          resourceId: "408",
        },
        displayName: "Claude Provider",
        nativeKind: "provider",
        status: "enabled",
        secretState: "masked",
        capabilities: { canUpdate: true, canRevealSecret: true },
      },
      native: {
        id: 408,
        name: "Claude Provider",
        url: "https://cch-source.example",
        maskedKey: "sk-********",
        providerType: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
        allowedModels: [{ matchType: "exact", pattern: "claude-3-5-sonnet" }],
        groupTag: "vip",
        isEnabled: true,
        priority: 2,
        weight: 5,
      },
    } as const
    const getDetail = vi.fn().mockResolvedValue(detail)
    const revealSecret = vi.fn().mockResolvedValue({
      status: "available",
      secret: "sk-resource-real-provider-key",
    })
    mockChannels([row], {
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      messagesKey: "claudecodehub",
    })
    mockResolveManagedUpstreamResourceCapabilities.mockReturnValue({
      supported: true,
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      capabilities: {
        items: {
          getDetail,
          update: vi.fn(),
        },
        drafts: {
          prepareEditDraft: vi.fn(() => ({
            name: "Claude Provider",
            type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
            key: "sk-********",
            base_url: "https://cch-source.example",
            models: ["claude-3-5-sonnet"],
            groups: ["vip"],
            priority: 2,
            weight: 5,
            status: 1,
          })),
          describeFields: vi.fn(() => [
            { name: "key", label: "API key", type: "secret" },
          ]),
          validateDraft: vi.fn(() => ({ valid: true, errors: [] })),
        },
        secrets: {
          revealSecret,
        },
      },
    })

    render(
      <>
        <ManagedSiteChannels />
        <ChannelDialogContainer />
      </>,
    )

    await waitForRowText("Claude Provider")
    const rowElement = screen.getByText("Claude Provider").closest("tr")
    expect(rowElement).toBeTruthy()
    await openRowActionsMenu(rowElement!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.edit",
      }),
    )

    await screen.findByText("channelDialog:title.edit")
    await user.click(
      await screen.findByRole("button", {
        name: "channelDialog:actions.loadRealKey",
      }),
    )

    await waitFor(() => {
      expect(revealSecret).toHaveBeenCalledWith(
        {
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        },
        detail.summary.ref,
      )
    })
    await waitFor(() => {
      expect(
        screen.getByDisplayValue("sk-resource-real-provider-key"),
      ).toBeInTheDocument()
    })
  })

  it("hides the migration entry when no target is configured", async () => {
    mockChannels(
      [{ id: 1, name: "Alpha", base_url: "https://example.com", key: "k" }],
      { withMigrationTarget: false },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")

    expect(
      screen.queryByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    ).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalledWith(
      "managedSiteChannels:migration.alerts.noTargets.description",
    )
  })

  it("keeps the migration exit action available when targets disappear", async () => {
    const user = userEvent.setup()
    let currentPreferences = buildPreferences({
      managedSiteType: SITE_TYPES.NEW_API,
      withMigrationTarget: true,
    })

    vi.mocked(useUserPreferencesContext).mockImplementation(
      () =>
        ({
          preferences: currentPreferences,
          managedSiteType: SITE_TYPES.NEW_API,
          newApiBaseUrl: currentPreferences.newApi.baseUrl,
          newApiUserId: currentPreferences.newApi.userId,
          newApiUsername: currentPreferences.newApi.username,
          newApiPassword: currentPreferences.newApi.password,
          newApiTotpSecret: currentPreferences.newApi.totpSecret,
          markGatewayGuidanceOnboardingCompleted:
            markGatewayGuidanceOnboardingCompletedMock,
        }) as any,
    )

    vi.mocked(getManagedSiteService).mockResolvedValue({
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
            base_url: "https://example.com",
            key: "k",
          },
        ]),
      ),
    } as any)

    const { rerender } = render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )

    expectManagedSiteChannelActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.ToggleManagedSiteChannelMigrationMode,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    expect(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.exitMigrationMode/,
      }),
    ).toBeInTheDocument()

    currentPreferences = buildPreferences({
      managedSiteType: SITE_TYPES.NEW_API,
      withMigrationTarget: false,
    })
    rerender(<ManagedSiteChannels />)

    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.exitMigrationMode/,
      }),
    )

    expect(
      screen.queryByRole("button", {
        name: /managedSiteChannels:toolbar.exitMigrationMode/,
      }),
    ).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalledWith(
      "managedSiteChannels:migration.alerts.noTargets.description",
    )
  })

  it("shows Claude Code Hub provider labels, migration entry, and compatible toolbar actions", async () => {
    mockChannels(
      [
        {
          id: 101,
          name: "Claude Provider",
          base_url: "https://cch-source.example",
          key: "sk-********",
          type: CLAUDE_CODE_HUB_PROVIDER_TYPE.CLAUDE,
          models: "claude-3-5-sonnet",
          status: 1,
          weight: 1,
        },
      ],
      {
        managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
        messagesKey: "claudecodehub",
        withMigrationTarget: true,
      },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Claude Provider")

    expect(
      screen.getByText("Claude (Anthropic Messages API)"),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:toolbar.syncSelected",
      }),
    ).not.toBeInTheDocument()
  })

  it("keeps refresh and migration row actions available in migration mode", async () => {
    const user = userEvent.setup()

    const service = mockChannels(
      [
        { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
        { id: 2, name: "Beta", base_url: "https://beta.example", key: "b" },
      ],
      { withMigrationTarget: true },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")
    const initialRequestCount = service.listChannels.mock.calls.length

    expect(
      screen.queryByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.refresh",
      }),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )

    expect(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.exitMigrationMode/,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateSelected",
      }),
    ).toBeInTheDocument()
    const refreshButton = screen.getByRole("button", {
      name: "managedSiteChannels:toolbar.refresh",
    })
    expect(refreshButton).toBeInTheDocument()

    await user.click(refreshButton)

    expectManagedSiteChannelActionSpanStarted(
      PRODUCT_ANALYTICS_ACTION_IDS.RefreshManagedSiteChannels,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    await waitFor(() => {
      expect(service.listChannels).toHaveBeenCalledTimes(
        initialRequestCount + 1,
      )
    })

    const betaRow = screen.getByText("Beta").closest("tr")
    expect(betaRow).toBeTruthy()

    await openRowActionsMenu(betaRow!, user)

    await user.click(
      await screen.findByRole("menuitem", {
        name: "managedSiteChannels:table.rowActions.migrate",
      }),
    )

    expectManagedSiteChannelActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenManagedSiteChannelMigration,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsRowActions,
    )
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:migration.title"),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText("managedSiteChannels:migration.betaBadge"),
    ).toBeInTheDocument()
    expect(within(dialog).getByText("Beta")).toBeInTheDocument()
  })

  it("uses filtered rows for migrate filtered", async () => {
    const user = userEvent.setup()

    mockChannels(
      [
        {
          id: 1,
          name: "Alpha",
          base_url: "https://site-a.example",
          key: "alpha-key",
          type: 1,
          models: "gpt-4o",
          group: "default",
          status: 1,
          priority: 0,
          weight: 0,
        },
        {
          id: 2,
          name: "Beta",
          base_url: "https://site-b.example",
          key: "beta-key",
          type: 1,
          models: "gpt-4o-mini",
          group: "default",
          status: 1,
          priority: 0,
          weight: 0,
        },
      ],
      { withMigrationTarget: true },
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForRowText("Beta")

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "site-a" },
    })

    await waitFor(() => {
      expect(screen.queryByText("Beta")).not.toBeInTheDocument()
    })

    await user.click(
      screen.getByRole("button", {
        name: /managedSiteChannels:toolbar.enterMigrationMode/,
      }),
    )

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.migrateFiltered",
      }),
    )

    expectManagedSiteChannelActionTracked(
      PRODUCT_ANALYTICS_ACTION_IDS.OpenFilteredManagedSiteChannelMigration,
      PRODUCT_ANALYTICS_SURFACE_IDS.OptionsManagedSiteChannelsToolbar,
    )
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Alpha")).toBeInTheDocument()
    expect(within(dialog).queryByText("Beta")).not.toBeInTheDocument()
  })

  it("updates pagination controls when the rows-per-page size changes", async () => {
    const user = userEvent.setup()

    mockChannels(
      Array.from({ length: 30 }, (_, index) => ({
        id: index + 1,
        name: `Channel ${index + 1}`,
        base_url: `https://site-${index + 1}.example`,
      })),
    )

    render(<ManagedSiteChannels />)

    await waitForRowText("Channel 30")
    expect(screen.queryByText("Channel 12")).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("combobox", {
        name: "managedSiteChannels:table.rowsPerPage",
      }),
    )
    await user.click(screen.getByRole("option", { name: "25" }))

    await waitFor(() => {
      expect(screen.getByText("Channel 12")).toBeInTheDocument()
      expect(screen.queryByText("Channel 5")).not.toBeInTheDocument()
    })

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:table.paginationNext",
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("Channel 5")).toBeInTheDocument()
      expect(screen.queryByText("Channel 12")).not.toBeInTheDocument()
    })

    await user.click(
      screen.getByRole("button", {
        name: "managedSiteChannels:table.paginationPrev",
      }),
    )

    await waitFor(() => {
      expect(screen.getByText("Channel 12")).toBeInTheDocument()
      expect(screen.queryByText("Channel 5")).not.toBeInTheDocument()
    })
  })

  it("lets the user cancel the delete dialog before deletion starts", async () => {
    const user = userEvent.setup()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForChannelsRefreshIdle()

    const getAlphaRow = () => screen.getByText("Alpha").closest("tr")

    await waitFor(() => {
      expect(getAlphaRow()).toBeTruthy()
    })

    await user.click(
      within(getAlphaRow()!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await waitFor(() => {
      expect(
        within(getAlphaRow()!).getByRole("checkbox", {
          name: "managedSiteChannels:table.selectRow",
        }),
      ).toBeChecked()
    })

    const getDeleteSelectedButton = () =>
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.deleteSelected",
      })

    await waitFor(() => {
      expect(getDeleteSelectedButton()).toBeEnabled()
    })

    await user.click(getDeleteSelectedButton())

    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByText("managedSiteChannels:dialog.deleteTitle"),
    ).toBeInTheDocument()

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:dialog.cancel",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })

    expect(screen.getByText("Alpha")).toBeInTheDocument()
  })

  it("reports a config-missing error when deletion is confirmed after config becomes unavailable", async () => {
    const user = userEvent.setup()
    const deleteChannel = vi.fn()

    mockChannels([
      { id: 1, name: "Alpha", base_url: "https://alpha.example", key: "a" },
    ])

    render(<ManagedSiteChannels />)

    await waitForRowText("Alpha")
    await waitForChannelsRefreshIdle()

    const getAlphaRow = () => screen.getByText("Alpha").closest("tr")

    await waitFor(() => {
      expect(getAlphaRow()).toBeTruthy()
    })

    await user.click(
      within(getAlphaRow()!).getByRole("checkbox", {
        name: "managedSiteChannels:table.selectRow",
      }),
    )

    await waitFor(() => {
      expect(
        within(getAlphaRow()!).getByRole("checkbox", {
          name: "managedSiteChannels:table.selectRow",
        }),
      ).toBeChecked()
    })

    const getDeleteSelectedButton = () =>
      screen.getByRole("button", {
        name: "managedSiteChannels:toolbar.deleteSelected",
      })

    await waitFor(() => {
      expect(getDeleteSelectedButton()).toBeEnabled()
    })

    await user.click(getDeleteSelectedButton())

    const dialog = await screen.findByRole("dialog")

    vi.mocked(getManagedSiteService).mockResolvedValue({
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue(null),
      listChannels: vi.fn().mockResolvedValue(buildChannelListData([])),
      deleteChannel,
    } as any)

    await user.click(
      within(dialog).getByRole("button", {
        name: "managedSiteChannels:dialog.confirm",
      }),
    )

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("messages:newapi.configMissing")
    })
    expect(deleteChannel).not.toHaveBeenCalled()
    expect(
      within(screen.getByRole("table")).getByText("Alpha"),
    ).toBeInTheDocument()
  })
})
