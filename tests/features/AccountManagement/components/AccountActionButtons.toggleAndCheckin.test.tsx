import "./accountActionButtonsMocks"

import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  PRODUCT_ANALYTICS_TARGET_STATES,
} from "~/services/productAnalytics/contracts"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import { AutoCheckinMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { render } from "~~/tests/test-utils/render"

import {
  accountDataContextValue,
  completeProductAnalyticsActionMock,
  getCurrentTempWindowRequestSourceMock,
  loadAccountDataMock,
  mockHandleSetAccountDisabled,
  mockTogglePinAccount,
  resolveProductAnalyticsErrorCategoryFromErrorMock,
  sendRuntimeMessageMock,
  startProductAnalyticsActionMock,
  toastDismissMock,
  toastErrorMock,
  toastLoadingMock,
  toastSuccessMock,
  withProtectionBypassUserCommandMock,
} from "./accountActionButtonsMocks"
import {
  buildDisplaySiteData,
  createDeferred,
  createEnabledCheckIn,
  setupAccountActionButtonsTest,
} from "./accountActionButtonsTestSupport"

describe("AccountActionButtons", () => {
  setupAccountActionButtonsTest()

  it("tracks completion when toggling account disabled fails", async () => {
    mockHandleSetAccountDisabled.mockRejectedValueOnce(new Error("failed"))

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-disable-failure",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableButton = (
      await within(menu).findByText("account:actions.disableAccount")
    ).closest("button")
    expect(disableButton).not.toBeNull()

    await user.click(disableButton!)

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ToggleAccountDisabled,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            targetState: PRODUCT_ANALYTICS_TARGET_STATES.Disabled,
          },
        },
      )
    })
  })

  it("tracks failure when toggling account disabled is rejected by storage", async () => {
    mockHandleSetAccountDisabled.mockResolvedValueOnce(false)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-disable-storage-failure",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const disableButton = (
      await within(menu).findByText("account:actions.disableAccount")
    ).closest("button")
    expect(disableButton).not.toBeNull()

    await user.click(disableButton!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            targetState: PRODUCT_ANALYTICS_TARGET_STATES.Disabled,
          },
        },
      )
    })
  })

  it("tracks completion when toggling account pin succeeds", async () => {
    accountDataContextValue.isPinFeatureEnabled = true
    mockTogglePinAccount.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-pin-success",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const pinButton = (
      await within(menu).findByText("account:actions.pin")
    ).closest("button")
    expect(pinButton).not.toBeNull()

    await user.click(pinButton!)

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ToggleAccountPin,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })
  })

  it("captures the popup source for a targeted Quick check-in request", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-5": {
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              messageKey: "autoCheckin:providerFallback.checkinSuccessful",
            },
          },
        },
      })
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-5",
          disabled: false,
          name: "Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    expect(toastLoadingMock).toHaveBeenCalledWith(
      "autoCheckin:messages.loading.running",
    )
    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
        AutoCheckinMessageTypes.RunNow,
        {
          accountIds: ["acc-5"],
          protectionBypassExecution: {
            version: 2,
            kind: "user_command",
            command: PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
            surface: TEMP_WINDOW_REQUEST_SOURCES.Popup,
          },
        },
      )
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
        AutoCheckinMessageTypes.GetStatus,
        undefined,
      )
      expect(toastDismissMock).toHaveBeenCalledWith("toast-quick-checkin")
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "Site: autoCheckin:providerFallback.checkinSuccessful",
      )
      expect(loadAccountDataMock).toHaveBeenCalled()
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunQuickCheckin,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
          },
        },
      )
    })
    expect(getCurrentTempWindowRequestSourceMock).toHaveBeenCalledTimes(1)
    expect(withProtectionBypassUserCommandMock).toHaveBeenCalledWith(
      PROTECTION_BYPASS_USER_COMMANDS.ManualCheckin,
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
      expect.any(Function),
    )
    expect(
      sendRuntimeMessageMock.mock.calls.filter(
        ([type]) => type === AutoCheckinMessageTypes.RunNow,
      ),
    ).toHaveLength(1)
    expect(
      sendRuntimeMessageMock.mock.calls.filter(
        ([type]) => type === AutoCheckinMessageTypes.GetStatus,
      ),
    ).toHaveLength(1)
  })

  it("coalesces rapid targeted Quick check-in clicks into one user command", async () => {
    const run = createDeferred<{ success: boolean }>()
    sendRuntimeMessageMock.mockImplementation(async (type: string) => {
      if (type === AutoCheckinMessageTypes.RunNow) return await run.promise
      if (type === AutoCheckinMessageTypes.GetStatus) {
        return { success: true, data: { perAccount: {} } }
      }
      return { success: true }
    })

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-double-click",
          disabled: false,
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await userEvent.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    const quickCheckinButton = (
      await screen.findByText("account:actions.quickCheckin")
    ).closest("button")
    expect(quickCheckinButton).not.toBeNull()

    fireEvent.click(quickCheckinButton!)
    fireEvent.click(quickCheckinButton!)

    expect(withProtectionBypassUserCommandMock).toHaveBeenCalledTimes(1)
    expect(
      sendRuntimeMessageMock.mock.calls.filter(
        ([type]) => type === AutoCheckinMessageTypes.RunNow,
      ),
    ).toHaveLength(1)

    run.resolve({ success: true })
    await waitFor(() => {
      expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
        AutoCheckinMessageTypes.GetStatus,
        undefined,
      )
    })
  })

  it("shows a failure toast when quick check-in finishes without a per-account result", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-fallback")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: true, data: { perAccount: {} } })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-fallback",
          disabled: false,
          name: "Fallback Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith(
        "toast-quick-checkin-fallback",
      )
      expect(toastErrorMock).toHaveBeenCalledWith(
        "autoCheckin:messages.error.runFailed",
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        },
      )
    })
  })

  it("shows a failure toast when quick check-in status lookup fails", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-status-failed")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false, error: "status unavailable" })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-status-failed",
          disabled: false,
          name: "Status Failed Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith(
        "toast-quick-checkin-status-failed",
      )
      expect(toastErrorMock).toHaveBeenCalledWith(
        "autoCheckin:messages.error.runFailed",
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        },
      )
    })
  })

  it("shows a quick-checkin failure toast when the background run fails", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-error")
    sendRuntimeMessageMock.mockResolvedValueOnce({
      success: false,
      error: "background failed",
    })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-failed",
          disabled: false,
          name: "Failed Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith("toast-quick-checkin-error")
      expect(toastErrorMock).toHaveBeenCalledWith(
        "autoCheckin:messages.error.runFailed",
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
  })

  it("tracks quick-checkin failure analytics when the run request throws", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-throw")
    sendRuntimeMessageMock.mockRejectedValueOnce(
      new Error("background blew up"),
    )

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-throw",
          disabled: false,
          name: "Thrown Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(toastDismissMock).toHaveBeenCalledWith("toast-quick-checkin-throw")
      expect(toastErrorMock).toHaveBeenCalledWith(
        "autoCheckin:messages.error.runFailed",
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
      )
    })
    expect(loadAccountDataMock).not.toHaveBeenCalled()
  })

  it("tracks quick-checkin runtime failures with the shared safe error category", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-structured-error")
    const structuredError = { statusCode: 403, message: "private auth text" }
    sendRuntimeMessageMock.mockRejectedValueOnce(structuredError)
    resolveProductAnalyticsErrorCategoryFromErrorMock.mockReturnValueOnce(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
    )

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-structured-error",
          disabled: false,
          name: "Structured Error Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(
        resolveProductAnalyticsErrorCategoryFromErrorMock,
      ).toHaveBeenCalledWith(structuredError)
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth },
      )
    })
    expect(loadAccountDataMock).not.toHaveBeenCalled()
  })

  it("tracks skipped quick-checkin completion when the account result is skipped", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-skipped")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-quick-skipped": {
              status: CHECKIN_RESULT_STATUS.SKIPPED,
              messageKey: "autoCheckin:providerFallback.checkinSkipped",
            },
          },
        },
      })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-skipped",
          disabled: false,
          name: "Skipped Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        {
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Warning,
          },
        },
      )
    })
  })

  it("tracks failed quick-checkin completion with status kind context", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-failed-status")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-quick-failed-status": {
              status: CHECKIN_RESULT_STATUS.FAILED,
              messageKey: "autoCheckin:providerFallback.checkinFailed",
            },
          },
        },
      })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-failed-status",
          disabled: false,
          name: "Failed Status Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        },
      )
    })
  })

  it("tracks unsupported quick-checkin endpoint failures with a safe category", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin-unsupported")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-quick-unsupported": {
              status: CHECKIN_RESULT_STATUS.FAILED,
              messageKey: "autoCheckin:providerFallback.endpointNotSupported",
            },
          },
        },
      })

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-quick-unsupported",
          disabled: false,
          name: "Unsupported Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const label = await within(menu).findByText("account:actions.quickCheckin")
    const button = label.closest("button")
    expect(button).not.toBeNull()

    await user.click(button!)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unsupported,
          insights: {
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
          },
        },
      )
    })
  })

  it("shows a pin toggle when the feature is enabled and confirms successful pinning", async () => {
    accountDataContextValue.isPinFeatureEnabled = true
    accountDataContextValue.isAccountPinned.mockReturnValue(false)
    mockTogglePinAccount.mockResolvedValueOnce(true)

    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-pin",
          disabled: false,
          name: "Pinned Site",
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
      expect(mockTogglePinAccount).toHaveBeenCalledWith("acc-pin")
      expect(toastSuccessMock).toHaveBeenCalledWith(
        "messages:toast.success.accountPinned",
      )
    })
  })
})
