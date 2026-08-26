import "./accountActionButtonsMocks"

import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { CHECKIN_RESULT_STATUS } from "~/types/autoCheckin"
import { render } from "~~/tests/test-utils/render"

import {
  accountActionsContextValue,
  clipboardWriteTextMock,
  completeProductAnalyticsActionMock,
  fetchAccountTokensMock,
  mockHandleSetAccountDisabled,
  openKeysPageMock,
  openModelsPageMock,
  sendRuntimeMessageMock,
  startProductAnalyticsActionMock,
  toastErrorMock,
  toastLoadingMock,
  trackStartedMock,
  userPreferencesContextValue,
} from "./accountActionButtonsMocks"
import {
  buildDisplaySiteData,
  createEnabledCheckIn,
  setupAccountActionButtonsTest,
} from "./accountActionButtonsTestSupport"

describe("AccountActionButtons", () => {
  setupAccountActionButtonsTest()

  it("locks externally refreshed accounts without announcing local menu work", async () => {
    accountActionsContextValue.refreshingAccountId = "acc-external-refresh"
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-external-refresh",
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

    const refreshMenuItem = screen.getByRole("menuitem", {
      name: "account:actions.refresh",
    })
    expect(refreshMenuItem).toBeDisabled()
    expect(refreshMenuItem).not.toHaveAttribute("aria-busy")
  })

  it("tracks controlled analytics for primary account action buttons", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([{ key: "sk-single" }])
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-primary-actions",
          disabled: false,
          name: "Private Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyUrl" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )
    await user.click(
      screen.getByRole("button", { name: "account:actions.edit" }),
    )

    await waitFor(() => {
      expect(trackStartedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountSiteUrl,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.CopyApiKey,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(trackStartedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenUpdateAccountDialog,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(trackStartedMock).not.toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccount,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
    })
  })

  it("tracks controlled analytics for account action menu entries", async () => {
    toastLoadingMock.mockReturnValue("toast-quick-checkin")
    sendRuntimeMessageMock
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({
        success: true,
        data: {
          perAccount: {
            "acc-menu-actions": {
              status: CHECKIN_RESULT_STATUS.SUCCESS,
              messageKey: "autoCheckin:providerFallback.checkinSuccessful",
            },
          },
        },
      })
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-menu-actions",
          disabled: false,
          name: "Menu Site",
          siteType: SITE_TYPES.NEW_API,
          checkIn: createEnabledCheckIn(),
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={onDeleteAccount}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    let menu = await screen.findByRole("menu")
    expect(menu).toHaveAttribute("data-slot", "dropdown-menu-content")
    const redeemButton = (
      await within(menu).findByText("account:actions.redeemPage")
    ).closest("button")
    expect(redeemButton).not.toBeNull()
    await user.click(redeemButton!)

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    menu = await screen.findByRole("menu")
    const usageButton = (
      await within(menu).findByText("account:actions.usageLog")
    ).closest("button")
    expect(usageButton).not.toBeNull()
    await user.click(usageButton!)

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )
    menu = await screen.findByRole("menu")
    const quickCheckinButton = (
      await within(menu).findByText("account:actions.quickCheckin")
    ).closest("button")
    expect(quickCheckinButton).not.toBeNull()
    await user.click(quickCheckinButton!)

    await waitFor(() => {
      expect(trackStartedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenRedeemPage,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(trackStartedMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.UsageAnalytics,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAccountUsageLog,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AutoCheckin,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunQuickCheckin,
        surfaceId:
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
      })
    })
  })

  it.each([
    {
      testId: ACCOUNT_MANAGEMENT_TEST_IDS.rowKeyManagementMenuItem,
      getOpenPageMock: () => openKeysPageMock,
      destination: "key management",
    },
    {
      testId: ACCOUNT_MANAGEMENT_TEST_IDS.rowModelManagementMenuItem,
      getOpenPageMock: () => openModelsPageMock,
      destination: "model management",
    },
  ])(
    "closes the account action menu before starting $destination navigation",
    async ({ testId, getOpenPageMock }) => {
      const user = userEvent.setup()
      const site = buildDisplaySiteData({
        id: "acc-in-page-navigation",
        disabled: false,
        name: "In-page Navigation Site",
      })
      let menuExpandedWhenNavigationStarted: string | null = null

      render(
        <AccountActionButtons
          site={site}
          onCopyKey={vi.fn()}
          onDeleteAccount={vi.fn()}
        />,
      )

      const moreActionsButton = screen.getByRole("button", {
        name: "common:actions.more",
      })
      const openPageMock = getOpenPageMock()
      openPageMock.mockImplementation(() => {
        menuExpandedWhenNavigationStarted =
          moreActionsButton.getAttribute("aria-expanded")
      })

      await user.click(moreActionsButton)
      const menu = await screen.findByRole("menu")
      const navigationButton = within(menu).getByTestId(testId)

      await user.click(navigationButton)

      await waitFor(() => {
        expect(openPageMock).toHaveBeenCalledWith(site.id)
      })
      expect(menuExpandedWhenNavigationStarted).toBe("false")
    },
  )

  it("does not track analytics for disabled account action menu entries", async () => {
    userPreferencesContextValue.preferences = {
      managedSiteType: SITE_TYPES.VELOERA,
      veloera: {
        baseUrl: "https://veloera-admin.example",
        adminToken: "veloera-admin-token",
        userId: "1",
      },
    } as Partial<UserPreferences>
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-disabled-menu-action",
          disabled: false,
          name: "Disabled Menu Site",
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

    expect(trackStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.ManagedSiteChannels,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.LocateManagedSiteChannel,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("shows Enable and Delete actions when account is disabled", async () => {
    const user = userEvent.setup()
    const onDeleteAccount = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-1",
          disabled: true,
          name: "Site",
        })}
        onCopyKey={vi.fn()}
        onDeleteAccount={onDeleteAccount}
      />,
    )

    expect(
      screen.getByRole("button", { name: "account:actions.copyUrl" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "account:actions.edit" }),
    ).toBeDisabled()

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const menu = await screen.findByRole("menu")
    const enableLabel = await within(menu).findByText(
      "account:actions.enableAccount",
    )
    const deleteLabel = await within(menu).findByText("account:actions.delete")
    const enableButton = enableLabel.closest("button")
    const deleteButton = deleteLabel.closest("button")
    expect(enableButton).not.toBeNull()
    expect(deleteButton).not.toBeNull()

    expect(enableButton!).toBeInTheDocument()
    expect(enableButton!).toHaveClass("text-emerald-600")
    expect(deleteButton!).toBeInTheDocument()
    expect(deleteButton!).toHaveClass("text-red-600")
    expect(
      screen.queryByRole("button", { name: "account:actions.disableAccount" }),
    ).toBeNull()
    expect(Array.from(menu.querySelectorAll("button"))).toEqual([
      enableButton!,
      deleteButton!,
    ])

    await user.click(enableButton!)
    expect(mockHandleSetAccountDisabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
      false,
    )

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })

    await user.click(
      screen.getByRole("button", { name: "common:actions.more" }),
    )

    const reopenedMenu = await screen.findByRole("menu")
    const reopenedDeleteLabel = await within(reopenedMenu).findByText(
      "account:actions.delete",
    )
    const reopenedDeleteButton = reopenedDeleteLabel.closest("button")
    expect(reopenedDeleteButton).not.toBeNull()

    await user.click(reopenedDeleteButton!)
    expect(onDeleteAccount).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-1" }),
    )
    expect(trackStartedMock).not.toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteAccount,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
  })

  it("shows Disable action when account is enabled", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-2",
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
    const disableLabel = await within(menu).findByText(
      "account:actions.disableAccount",
    )
    const deleteLabel = await within(menu).findByText("account:actions.delete")
    const disableButton = disableLabel.closest("button")
    const deleteButton = deleteLabel.closest("button")
    expect(disableButton).not.toBeNull()
    expect(deleteButton).not.toBeNull()

    expect(disableButton!).toBeInTheDocument()
    expect(disableButton!).toHaveClass("text-amber-600")
    expect(deleteButton!).toBeInTheDocument()

    const menuButtons = Array.from(menu.querySelectorAll("button"))
    const disableIndex = menuButtons.indexOf(disableButton!)
    const deleteIndex = menuButtons.indexOf(deleteButton!)
    expect(deleteIndex - disableIndex).toBe(1)
    expect(
      screen.queryByRole("button", { name: "account:actions.enableAccount" }),
    ).toBeNull()
  })

  it("closes the menu after clicking Disable to avoid showing Enable immediately", async () => {
    const user = userEvent.setup()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-3",
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
    const disableLabel = await within(menu).findByText(
      "account:actions.disableAccount",
    )
    const disableButton = disableLabel.closest("button")
    expect(disableButton).not.toBeNull()

    await user.click(disableButton!)

    expect(mockHandleSetAccountDisabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acc-3" }),
      true,
    )

    await waitFor(() => {
      expect(screen.queryByRole("menu")).toBeNull()
    })
  })

  it("opens CopyKeyDialog when smart copy finds zero tokens", async () => {
    fetchAccountTokensMock.mockResolvedValueOnce([])

    const user = userEvent.setup()
    const onCopyKey = vi.fn()

    render(
      <AccountActionButtons
        site={buildDisplaySiteData({
          id: "acc-4",
          disabled: false,
          name: "Site",
        })}
        onCopyKey={onCopyKey}
        onDeleteAccount={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "account:actions.copyKey" }),
    )

    await waitFor(() => {
      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: "acc-4" }),
      )
    })

    expect(toastErrorMock).not.toHaveBeenCalledWith(
      "account:actions.noKeyFound",
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      {
        insights: {
          itemCount: 0,
        },
      },
    )
  })

  it.each([SITE_TYPES.OPENROUTER, SITE_TYPES.AIHUBMIX])(
    "labels %s as a key list and opens it without probing unavailable secrets",
    async (siteType) => {
      const user = userEvent.setup()
      const onCopyKey = vi.fn()

      render(
        <AccountActionButtons
          site={buildDisplaySiteData({
            id: `${siteType}-non-recoverable-keys`,
            disabled: false,
            name: "Non-recoverable keys",
            siteType,
          })}
          onCopyKey={onCopyKey}
          onDeleteAccount={vi.fn()}
        />,
      )

      expect(
        screen.queryByRole("button", { name: "account:actions.copyKey" }),
      ).not.toBeInTheDocument()
      await user.click(
        screen.getByRole("button", { name: "account:actions.keyList" }),
      )

      expect(onCopyKey).toHaveBeenCalledWith(
        expect.objectContaining({ id: `${siteType}-non-recoverable-keys` }),
      )
      expect(fetchAccountTokensMock).not.toHaveBeenCalled()
      expect(toastErrorMock).not.toHaveBeenCalled()
      expect(clipboardWriteTextMock).not.toHaveBeenCalled()
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
        expect.objectContaining({
          actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenKeyList,
        }),
      )
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    },
  )
})
