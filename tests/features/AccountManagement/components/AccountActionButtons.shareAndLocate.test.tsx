import "./accountActionButtonsMocks"

import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import { buildServiceCredentialRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { newApiSecretVerification } from "~/services/apiAdapters/managedSites/newApiSecretVerification"
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
import type { ManagedSiteChannelDraftSource } from "~/types/managedSiteChannelDraft"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { matchingResourceRef } from "~~/tests/test-utils/managedResourceMatching"
import { render } from "~~/tests/test-utils/render"

import {
  accountDataContextValue,
  completeProductAnalyticsActionMock,
  exportShareSnapshotWithToastMock,
  fetchAccountTokensMock,
  getManagedSiteCapabilitiesMock,
  hasValidManagedSiteConfigMock,
  mockTogglePinAccount,
  openManagedSiteChannelsPageMock,
  resolveDisplayAccountRuntimeKeySecretMock,
  startProductAnalyticsActionMock,
  toastErrorMock,
  toastSuccessMock,
  toastWarningMock,
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

  it.each([
    {
      siteType: SITE_TYPES.NEW_API,
      resourceId: 123,
      config: {
        baseUrl: "https://admin.example",
        adminToken: "t",
        userId: "1",
      },
    },
    {
      siteType: SITE_TYPES.AXON_HUB,
      resourceId: "native/123+=",
      config: {
        baseUrl: "https://admin.example",
        email: "admin@example.com",
        password: "fixture-password",
      },
    },
  ])(
    "navigates to the stable $siteType channel identity for an exact match",
    async ({ siteType, resourceId, config }) => {
      fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

      const managedService = {
        siteType,
        config: {
          get: vi.fn().mockResolvedValue(config),
        },
        channelDrafts: {
          prepareFormData: vi.fn().mockResolvedValue({
            base_url: "https://api.example.com",
            models: ["gpt-4"],
            key: "sk-1",
          }),
        },
        matching: {
          search: vi.fn().mockResolvedValue({
            items: [
              {
                ref: matchingResourceRef(resourceId, {
                  siteType,
                  scopeKey: config.baseUrl,
                }),
                name: "Managed Channel 123",
                base_url: "https://api.example.com",
                models: "gpt-4",
                key: "sk-1",
              },
            ],
            total: 1,
            type_counts: {},
          }),
        },
      }

      getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)

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
        expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
          resourceRef: matchingResourceRef(resourceId, {
            siteType,
            scopeKey: config.baseUrl,
          }),
        })
      })
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledTimes(1)
    },
  )

  it("locates an account channel through the registered matching capability", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-matching" }])
    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        }),
      },
      channelDrafts: {
        prepareFormData: vi.fn().mockResolvedValue({
          base_url: "https://api.example.com",
          models: ["gpt-4"],
          key: "sk-matching",
        }),
      },
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(321, {
                scopeKey: "https://admin.example",
              }),
              name: "Matched Managed Channel",
              base_url: "https://api.example.com",
              models: "gpt-4",
              key: "sk-matching",
            },
          ],
          total: 1,
          type_counts: {},
        }),
      },
    }

    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-6-matching",
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
        resourceRef: matchingResourceRef(321, {
          scopeKey: "https://admin.example",
        }),
      })
    })
    expect(managedService.matching.search).toHaveBeenCalledWith(
      expect.any(Object),
      "https://api.example.com",
    )
    expect(openManagedSiteChannelsPageMock).toHaveBeenCalledTimes(1)
  })

  it("locates a service credential channel with its refreshed API endpoint and secret", async () => {
    const account = buildDisplaySiteData({
      id: "acc-service-locate",
      disabled: false,
      name: "SharedChat",
      siteType: SITE_TYPES.SHAREDCHAT,
      baseUrl: "https://dashboard.example.invalid",
    })
    const runtimeKey = buildServiceCredentialRuntimeKey(account, {
      kind: "singleton_service_key",
      service: "codex",
      label: "Codex API Key",
      key: "sk-stale-service-key",
      baseUrl: "https://old-runtime.example.invalid",
      isAuthenticated: true,
    })
    const resolvedRuntimeKey = buildServiceCredentialRuntimeKey(account, {
      ...runtimeKey.credential,
      key: "sk-current-service-key",
      baseUrl: "https://runtime.example.invalid",
    })
    fetchAccountTokensMock.mockResolvedValueOnce([runtimeKey])
    resolveDisplayAccountRuntimeKeySecretMock.mockResolvedValueOnce(
      resolvedRuntimeKey,
    )
    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        }),
      },
      channelDrafts: {
        prepareFormData: vi.fn(
          async (source: ManagedSiteChannelDraftSource) => ({
            base_url: source.baseUrl,
            models: ["gpt-4"],
            key: source.apiKey,
          }),
        ),
      },
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(789, {
                scopeKey: "https://admin.example",
              }),
              name: "Service Credential Channel",
              base_url: "https://runtime.example.invalid",
              models: "gpt-4",
              key: "sk-current-service-key",
            },
          ],
          total: 1,
          type_counts: {},
        }),
      },
    }
    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService)
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={account}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    await user.click(
      await screen.findByRole("menuitem", {
        name: "account:actions.locateManagedSiteChannel",
      }),
    )

    await waitFor(() =>
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        resourceRef: matchingResourceRef(789, {
          scopeKey: "https://admin.example",
        }),
      }),
    )
    expect(managedService.channelDrafts.prepareFormData).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://runtime.example.invalid",
        apiKey: "sk-current-service-key",
      }),
    )
    expect(managedService.matching.search).toHaveBeenCalledWith(
      expect.any(Object),
      "https://runtime.example.invalid",
    )
    expect(openManagedSiteChannelsPageMock).toHaveBeenCalledTimes(1)
  })

  it("uses a scoped verification grant when account locate must recover a hidden New API key", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-hidden" }])
    const fetchChannelSecretKey = vi.fn().mockResolvedValue("sk-hidden")
    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        }),
      },
      channelDrafts: {
        prepareFormData: vi.fn().mockResolvedValue({
          base_url: "https://api.example.com",
          models: ["gpt-4"],
          key: "sk-hidden",
        }),
      },
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(322, {
                scopeKey: "https://admin.example",
              }),
              name: "Hidden Managed Channel",
              base_url: "https://api.example.com",
              models: "gpt-4",
              key: "sk-***",
            },
          ],
          total: 1,
          type_counts: {},
        }),
        secretVerification: newApiSecretVerification,
        fetchSecretKey: fetchChannelSecretKey,
      },
    }
    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)
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
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        resourceRef: matchingResourceRef(322, {
          scopeKey: "https://admin.example",
        }),
      })
    })
    expect(withProtectionBypassUserCommandMock).toHaveBeenCalledWith(
      "manage_site_channels",
      "popup",
      expect.any(Function),
    )
    expect(fetchChannelSecretKey).toHaveBeenCalledWith(
      expect.any(Object),
      matchingResourceRef(322, { scopeKey: "https://admin.example" }),
      expect.objectContaining({
        protectionBypassExecution: expect.objectContaining({
          kind: "user_command",
        }),
      }),
    )
  })

  it("locates the account shortcut through registered native matching", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-resource" }])

    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        }),
      },
      channelDrafts: {
        prepareFormData: vi.fn().mockResolvedValue({
          base_url: "https://api.example.com",
          models: ["gpt-4"],
          key: "sk-resource",
        }),
      },
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(654, {
                scopeKey: "https://admin.example",
              }),
              name: "Resource Managed Channel",
              type: 1,
              base_url: "https://api.example.com",
              models: "gpt-4",
              key: "sk-resource",
            },
          ],
          total: 1,
          type_counts: {},
        }),
      },
    }

    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)

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
      expect(openManagedSiteChannelsPageMock).toHaveBeenCalledWith({
        resourceRef: matchingResourceRef(654, {
          scopeKey: "https://admin.example",
        }),
      })
    })
    expect(managedService.matching.search).toHaveBeenCalledWith(
      expect.any(Object),
      "https://api.example.com",
    )
    expect(openManagedSiteChannelsPageMock).toHaveBeenCalledTimes(1)
  })

  it("uses a secondary exact-model explanation when the account key is blank", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "" }])

    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        }),
      },
      channelDrafts: {
        prepareFormData: vi.fn().mockResolvedValue({
          base_url: "https://api.example.com",
          models: ["gpt-4"],
          key: "",
        }),
      },
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(456, {
                scopeKey: "https://admin.example",
              }),
              name: "Managed Channel 456",
              base_url: "https://api.example.com",
              models: "gpt-4",
              key: "",
            },
          ],
        }),
      },
    }

    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)

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
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ resourceRef: expect.anything() }),
    )
  })

  it("falls back to a fuzzy URL-only explanation when no secondary match exists", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-1" }])

    const managedService = {
      siteType: SITE_TYPES.NEW_API,
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        }),
      },
      channelDrafts: {
        prepareFormData: vi.fn().mockResolvedValue({
          base_url: "https://api.example.com",
          models: ["gpt-4"],
          key: "sk-1",
        }),
      },
      matching: {
        search: vi.fn().mockResolvedValue({
          items: [
            {
              ref: matchingResourceRef(456, {
                scopeKey: "https://admin.example",
              }),
              name: "Managed Channel 456",
              base_url: "https://api.example.com",
              models: "claude-3",
              key: "",
            },
          ],
        }),
      },
    }

    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)

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
    expect(openManagedSiteChannelsPageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ resourceRef: expect.anything() }),
    )
  })

  it("shows a no-key fallback when the account has no API tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    const managedService = {
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        }),
      },
      channelDrafts: { prepareFormData: vi.fn() },
      matching: { search: vi.fn() },
    }

    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)

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
      expect(toastWarningMock).toHaveBeenCalledWith(
        "account:actions.channelLocateNoKeyFallback",
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(managedService.channelDrafts.prepareFormData).not.toHaveBeenCalled()
  })

  it("falls back to base URL search when multiple keys are present", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([
      { key: "sk-1" },
      { key: "sk-2" },
    ])

    const managedService = {
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        }),
      },
      channelDrafts: { prepareFormData: vi.fn() },
    }

    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)

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
      expect(toastWarningMock).toHaveBeenCalledWith(
        "account:actions.channelLocateMultipleKeysFallback",
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(managedService.channelDrafts.prepareFormData).not.toHaveBeenCalled()
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
    "enables native inventory lookup for %s",
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
      expect(button!).not.toBeDisabled()
      expect(
        within(menu).queryByText(
          "account:actions.locateManagedSiteChannelUnsupportedHint",
        ),
      ).toBeNull()
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
    expect(getManagedSiteCapabilitiesMock).not.toHaveBeenCalled()
  })

  it("shows the account-specific config-missing fallback when admin config disappears at click-time", async () => {
    const managedService = {
      config: { get: vi.fn().mockResolvedValue(null) },
      channelDrafts: { prepareFormData: vi.fn() },
      matching: { search: vi.fn() },
    }

    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)

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
      expect(toastWarningMock).toHaveBeenCalledWith(
        "account:actions.channelLocateConfigMissing",
      )
    })
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(fetchAccountTokensMock).not.toHaveBeenCalled()
    expect(managedService.channelDrafts.prepareFormData).not.toHaveBeenCalled()
  })

  it("falls back to base URL search when token response is not an array", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce({} as any)

    const managedService = {
      config: {
        get: vi.fn().mockResolvedValue({
          baseUrl: "https://admin.example",
          adminToken: "t",
          userId: "1",
        }),
      },
      channelDrafts: { prepareFormData: vi.fn() },
    }

    getManagedSiteCapabilitiesMock.mockReturnValueOnce(managedService as any)

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
    expect(managedService.channelDrafts.prepareFormData).not.toHaveBeenCalled()
  })
})
