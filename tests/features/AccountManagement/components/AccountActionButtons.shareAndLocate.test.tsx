import "./accountActionButtonsMocks"

import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import type { ManagedUpstreamResourcesCapability } from "~/services/apiAdapters/contracts/managedUpstreamResources"
import { MANAGED_UPSTREAM_RESOURCE_FEATURES } from "~/services/managedSites/managedUpstreamResourceMigration"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import {
  MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS,
  MANAGED_UPSTREAM_RESOURCE_SECRET_STATES,
  MANAGED_UPSTREAM_RESOURCE_STATUSES,
  type ManagedUpstreamResourceSummary,
} from "~/types/managedUpstreamResource"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { render } from "~~/tests/test-utils/render"

import {
  accountDataContextValue,
  completeProductAnalyticsActionMock,
  exportShareSnapshotWithToastMock,
  fetchAccountTokensMock,
  getManagedSiteServiceMock,
  hasValidManagedSiteConfigMock,
  mockTogglePinAccount,
  openManagedSiteChannelsForChannelMock,
  openManagedSiteChannelsPageMock,
  resolveDisplayAccountRuntimeKeySecretMock,
  resolveManagedUpstreamResourceFeatureCapabilitiesMock,
  startProductAnalyticsActionMock,
  toastCustomMock,
  toastErrorMock,
  toastSuccessMock,
  trackStartedMock,
  userPreferencesContextValue,
  withProtectionBypassUserCommandMock,
} from "./accountActionButtonsMocks"
import {
  buildDisplaySiteData,
  setupAccountActionButtonsTest,
} from "./accountActionButtonsTestSupport"

describe("AccountActionButtons", () => {
  setupAccountActionButtonsTest()

  it("tracks an unknown failure when pinning does not change state", async () => {
    accountDataContextValue.isPinFeatureEnabled = true
    accountDataContextValue.isAccountPinned.mockReturnValue(false)
    mockTogglePinAccount.mockResolvedValueOnce(false)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-pin-false",
          disabled: false,
          name: "Pin Failure Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.pin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(mockTogglePinAccount).toHaveBeenCalledWith("acc-pin-false")
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalledWith(
      "messages:toast.success.accountPinned",
    )
  })

  it("shares a sanitized snapshot using only visible cashflow data", async () => {
    userPreferencesContextValue.showTodayCashflow = false
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-share",
          disabled: false,
          name: "Share Site",
          baseUrl: "https://api.example.com/v1/chat/completions",
          balance: { USD: 12, CNY: 0 },
          todayIncome: { USD: 8, CNY: 0 },
          todayConsumption: { USD: 4, CNY: 0 },
          last_sync_time: 0,
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "shareSnapshots:actions.shareAccountSnapshot",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(exportShareSnapshotWithToastMock).toHaveBeenCalledTimes(1)
    })

    const payload = exportShareSnapshotWithToastMock.mock.calls[0]?.[0]?.payload
    expect(payload).toEqual(
      expect.objectContaining({
        siteName: "Share Site",
        originUrl: "https://api.example.com",
        currencyType: "USD",
        balance: 12,
      }),
    )
    expect(payload).not.toHaveProperty("todayIncome")
    expect(payload).not.toHaveProperty("todayOutcome")
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ShareSnapshots,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShareAccountSnapshot,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(trackStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ShareSnapshots,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShareAccountSnapshot,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("includes the full cashflow bundle when the preference and both metrics are complete", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-share-complete",
          disabled: false,
          todayIncome: { USD: 8, CNY: 0 },
          todayConsumption: { USD: 4, CNY: 0 },
          todayStatsAvailability: buildCompleteTodayStatsAvailability(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    const menu = await screen.findByRole("menu")
    await user.click(
      within(menu)
        .getByText("shareSnapshots:actions.shareAccountSnapshot")
        .closest("button")!,
    )

    await waitFor(() => {
      expect(exportShareSnapshotWithToastMock).toHaveBeenCalledTimes(1)
    })
    expect(
      exportShareSnapshotWithToastMock.mock.calls[0]?.[0]?.payload,
    ).toEqual(
      expect.objectContaining({
        todayIncome: 8,
        todayOutcome: 4,
        todayNet: 4,
      }),
    )
  })

  it.each([
    {
      label: "partial consumption",
      availability: buildCompleteTodayStatsAvailability({
        consumption: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
          reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
        },
      }),
    },
    {
      label: "unavailable income",
      availability: buildCompleteTodayStatsAvailability({
        income: {
          status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
          reason: ACCOUNT_TODAY_METRIC_REASONS.Unsupported,
        },
      }),
    },
  ])(
    "falls back to a balance-only snapshot for $label",
    async ({ availability }) => {
      const user = userEvent.setup()

      render(
        <AccountActionButtons
          site={buildDisplaySiteData({
            id: "acc-share-incomplete",
            disabled: false,
            todayIncome: { USD: 8, CNY: 0 },
            todayConsumption: { USD: 4, CNY: 0 },
            todayStatsAvailability: availability,
          })}
          onCopyKey={vi.fn()}
          onDeleteAccount={vi.fn()}
        />,
      )

      await user.click(
        screen.getByRole("button", { name: "common:actions.more" }),
      )
      const menu = await screen.findByRole("menu")
      await user.click(
        within(menu)
          .getByText("shareSnapshots:actions.shareAccountSnapshot")
          .closest("button")!,
      )

      await waitFor(() => {
        expect(exportShareSnapshotWithToastMock).toHaveBeenCalledTimes(1)
      })
      const payload =
        exportShareSnapshotWithToastMock.mock.calls[0]?.[0]?.payload
      expect(payload).not.toHaveProperty("todayIncome")
      expect(payload).not.toHaveProperty("todayOutcome")
      expect(payload).not.toHaveProperty("todayNet")
    },
  )

  it("tracks share snapshot failures with an unknown error category", async () => {
    exportShareSnapshotWithToastMock.mockRejectedValueOnce(
      new Error("export failed"),
    )
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-share-failure",
          disabled: false,
          name: "Share Failure Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "shareSnapshots:actions.shareAccountSnapshot",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("navigates to managed site channels focused by channelId when an exact match is found", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-1",
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 123,
            name: "Managed Channel 123",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "sk-1",
          },
        ],
        total: 1,
        type_counts: {},
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsForChannelMock).toHaveBeenCalledWith(123)
    })
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
  })

  it("uses legacy channel search for account shortcut locate when token status resources are not feature-gated", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-legacy" }])

    const staleResourceSearch = vi
      .fn()
      .mockRejectedValue(new Error("stale duplicate-matching resource path"))
    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-legacy",
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 321,
            name: "Legacy Managed Channel",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "sk-legacy",
          },
        ],
        total: 1,
        type_counts: {},
      }),
      searchResourceDuplicateChannels: staleResourceSearch,
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6-legacy",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsForChannelMock).toHaveBeenCalledWith(321)
    })
    expect(staleResourceSearch).not.toHaveBeenCalled()
    expect(managedService.searchChannel).toHaveBeenCalledWith(
      expect.any(Object),
      "https://api.example.com",
    )
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
  })

  it("uses a scoped verification grant when account locate must recover a hidden New API key", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-hidden" }])
    const fetchChannelSecretKey = vi.fn().mockResolvedValue("sk-hidden")
    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-hidden",
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 322,
            name: "Hidden Managed Channel",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "sk-***",
          },
        ],
        total: 1,
        type_counts: {},
      }),
      fetchChannelSecretKey,
    }
    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6-hidden",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )
    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    const menu = await screen.findByRole("menu")
    await user.click(
      (
        await within(menu).findByText(
          "account:actions.locateManagedSiteChannel",
        )
      ).closest("button")!,
    )

    await waitFor(() => {
      expect(openManagedSiteChannelsForChannelMock).toHaveBeenCalledWith(322)
    })
    expect(withProtectionBypassUserCommandMock).toHaveBeenCalledWith(
      "manage_site_channels",
      "popup",
      expect.any(Function),
    )
    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.any(Object),
      322,
      expect.objectContaining({
        protectionBypassExecution: expect.objectContaining({
          kind: "user_command",
        }),
      }),
    )
  })

  it("uses resource-backed channel candidates for account shortcut locate when feature-gated", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-resource" }])

    const resourceSummary = buildResourceSummary({
      id: 654,
      name: "Resource Managed Channel",
      baseUrl: "https://api.example.com",
      models: ["gpt-4"],
    })
    const resources: ManagedUpstreamResourcesCapability = {
      items: {
        list: vi.fn(),
        search: vi.fn().mockResolvedValue({
          items: [resourceSummary],
          total: 1,
        }),
        getDetail: vi.fn().mockResolvedValue({
          summary: resourceSummary,
          native: {
            id: 654,
            name: "Resource Managed Channel",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "sk-resource",
          },
        }),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      drafts: {
        prepareImportDraft: vi.fn(),
        prepareEditDraft: vi.fn(),
        describeFields: vi.fn(),
        validateDraft: vi.fn(),
      },
    }
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockReturnValue({
      supported: true,
      siteType: SITE_TYPES.NEW_API,
      feature: MANAGED_UPSTREAM_RESOURCE_FEATURES.TokenChannelStatus,
      capabilities: resources,
    })
    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-resource",
      }),
      searchChannel: vi
        .fn()
        .mockRejectedValue(new Error("legacy search should not run")),
      searchResourceDuplicateChannels: vi
        .fn()
        .mockRejectedValue(new Error("stale duplicate-matching resource path")),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6-resource",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsForChannelMock).toHaveBeenCalledWith(654)
    })
    expect(
      managedService.searchResourceDuplicateChannels,
    ).not.toHaveBeenCalled()
    expect(managedService.searchChannel).not.toHaveBeenCalled()
    expect(resources.items.search).toHaveBeenCalledWith(
      expect.any(Object),
      "https://api.example.com",
    )
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
  })

  it("uses a secondary exact-model explanation when the account key is blank", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "",
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 456,
            name: "Managed Channel 456",
            base_url: "https://api.example.com",
            models: "gpt-4",
            key: "",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6b",
          disabled: false,
          name: "Site",
          baseUrl: "  https://api.example.com/v1/openai  ",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateSecondaryExactModels",
      )
    })

    expect(fetchAccountTokensMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.example.com/v1/openai",
      }),
    )
    expect(resolveDisplayAccountRuntimeKeySecretMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://api.example.com/v1/openai",
      }),
      expect.objectContaining({
        secret: "",
        token: expect.objectContaining({ key: "" }),
      }),
    )
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
  })

  it("falls back to a fuzzy URL-only explanation when no secondary match exists", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn().mockResolvedValue({
        base_url: "https://api.example.com",
        models: ["gpt-4"],
        key: "sk-1",
      }),
      searchChannel: vi.fn().mockResolvedValue({
        items: [
          {
            id: 456,
            name: "Managed Channel 456",
            base_url: "https://api.example.com",
            models: "claude-3",
            key: "",
          },
        ],
      }),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "account:actions.channelLocateFuzzyUrlOnly",
      )
    })
    expect(openManagedSiteChannelsForChannelMock).not.toHaveBeenCalled()
  })

  it("shows a no-key fallback when the account has no API tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn(),
      searchChannel: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-7b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastCustomMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 5000,
        }),
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("falls back to base URL search when multiple keys are present", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { key: "sk-1" },
      { key: "sk-2" },
    ])

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-8",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastCustomMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 5000,
        }),
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("shows an actionable locate action for providers with reliable base-url lookup", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-8b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()
    expect(button!).toBeEnabled()
    expect(
      within(menu).queryByText(
        "account:actions.locateManagedSiteChannelUnsupportedHint",
      ),
    ).toBeNull()
  })

  it.each([
    [
      "Veloera",
      {
        managedSiteType: SITE_TYPES.VELOERA,
        veloera: {
          baseUrl: "https://veloera-admin.example",
          adminToken: "veloera-admin-token",
          userId: "1",
        },
      },
      "Veloera Site",
    ],
  ])(
    "shows a disabled locate action with visible unsupported guidance for %s",
    async (_label, preferences, siteName) => {
      userPreferencesContextValue.preferences =
        preferences as Partial<UserPreferences>

      const user = userEvent.setup()

      render(
        <AccountActionButtons
          site={buildDisplaySiteData({
            id: "acc-8c",
            disabled: false,
            name: siteName,
            baseUrl: "https://api.example.com/v1/",
          })}
          onCopyKey={vi.fn()}
          onDeleteAccount={vi.fn()}
        />,
      )

      await user.click(
        screen.getByRole("button", { name: "common:actions.more" }),
      )

      const menu = await screen.findByRole("menu")
      const label = await within(menu).findByText(
        "account:actions.locateManagedSiteChannel",
      )
      const button = label.closest("button")
      expect(button).not.toBeNull()
      expect(button!).toBeDisabled()
      const hint = within(menu).getByText(
        "account:actions.locateManagedSiteChannelUnsupportedHint",
      )
      expect(hint).toBeInTheDocument()
      const description = within(menu).getByText(
        "account:actions.locateManagedSiteChannelUnsupported",
      )
      expect(button!).toHaveAttribute(
        "title",
        "account:actions.locateManagedSiteChannelUnsupported",
      )
      expect(button!).toHaveAttribute("aria-describedby", description.id)

      await user.click(button!)

      expect(getManagedSiteServiceMock).not.toHaveBeenCalled()
      expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalled()
    },
  )

  it("shows an actionable locate action for Claude Code Hub", async () => {
    userPreferencesContextValue.preferences = {
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
      claudeCodeHub: {
        baseUrl: "https://cch-admin.example",
        adminToken: "cch-admin-token",
      },
    } as Partial<UserPreferences>

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-8d",
          disabled: false,
          name: "Claude Code Hub Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()
    expect(button!).toBeEnabled()
    expect(
      within(menu).queryByText(
        "account:actions.locateManagedSiteChannelUnsupportedHint",
      ),
    ).toBeNull()
  })

  it("hides the locate action when managed site config is missing", async () => {
    hasValidManagedSiteConfigMock.mockReturnValue(false)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-9",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = within(menu).queryByText(
      "account:actions.locateManagedSiteChannel",
    )
    expect(label).toBeNull()
    expect(hasValidManagedSiteConfigMock).toHaveBeenCalledWith(
      userPreferencesContextValue.preferences,
    )
    expect(getManagedSiteServiceMock).not.toHaveBeenCalled()
  })

  it("shows the account-specific config-missing fallback when admin config disappears at click-time", async () => {
    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue(null),
      prepareChannelFormData: vi.fn(),
      searchChannel: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-9b",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
      expect(toastCustomMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          duration: 5000,
        }),
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })

  it("falls back to base URL search when token response is not an array", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce({} as any)

    const managedService = {
      messagesKey: "newapi",
      getConfig: vi.fn().mockResolvedValue({
        baseUrl: "https://admin.example",
        token: "t",
        userId: "1",
      }),
      prepareChannelFormData: vi.fn(),
    }

    getManagedSiteServiceMock.mockResolvedValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-10",
          disabled: false,
          name: "Site",
          baseUrl: "https://api.example.com/v1/",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText(
      "account:actions.locateManagedSiteChannel",
    )
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        "account:actions.channelLocateFailed",
      )
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        search: "https://api.example.com",
      })
    })
    expect(managedService.prepareChannelFormData).not.toHaveBeenCalled()
  })
})

const buildResourceSummary = ({
  id,
  name,
  baseUrl,
  models,
}: {
  id: number
  name: string
  baseUrl: string
  models: string[]
}): ManagedUpstreamResourceSummary => ({
  ref: {
    managedSiteType: SITE_TYPES.NEW_API,
    scopeKey: "https://admin.example",
    resourceId: String(id),
  },
  displayName: name,
  nativeKind: MANAGED_UPSTREAM_RESOURCE_NATIVE_KINDS.Channel,
  status: MANAGED_UPSTREAM_RESOURCE_STATUSES.Enabled,
  endpointLabel: baseUrl,
  modelPreview: models,
  secretState: MANAGED_UPSTREAM_RESOURCE_SECRET_STATES.Available,
  capabilities: {},
})
