import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import { createCompatibilityCheckInConfig } from "~/services/checkin/autoCheckin/compatibilityConfig"
import type { UserPreferences } from "~/services/preferences/userPreferences"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/contracts"
import { TEMP_WINDOW_REQUEST_SOURCES } from "~/types/tempWindowFetch"
import { buildDisplaySiteData as buildDisplaySiteDataFixture } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

import {
  accountActionsContextValue,
  accountDataContextValue,
  canFetchDisplayAccountInviteLinkMock,
  clipboardWriteTextMock,
  completeProductAnalyticsActionMock,
  exportShareSnapshotWithToastMock,
  fetchDisplayAccountInviteLinkMock,
  getCurrentTempWindowRequestSourceMock,
  hasValidManagedSiteConfigMock,
  loadAccountDataMock,
  mockHandleRefreshAccount,
  mockTogglePinAccount,
  resolveDisplayAccountRuntimeKeySecretMock,
  resolveManagedUpstreamResourceFeatureCapabilitiesMock,
  resolveProductAnalyticsErrorCategoryFromErrorMock,
  startProductAnalyticsActionMock,
  trackStartedMock,
  userPreferencesContextValue,
} from "./accountActionButtonsMocks"

export const createEnabledCheckIn = () =>
  createCompatibilityCheckInConfig({
    siteType: SITE_TYPES.NEW_API,
    supported: true,
    automaticExecutionEnabled: true,
  })

export const buildDisplaySiteData: typeof buildDisplaySiteDataFixture = (
  overrides = {},
) =>
  buildDisplaySiteDataFixture({
    checkIn: createCompatibilityCheckInConfig({
      siteType: SITE_TYPES.UNKNOWN,
      supported: false,
      automaticExecutionEnabled: false,
    }),
    ...overrides,
  })

export const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

export const copyInviteLinkFromRowMenu = async (
  accountId: string,
  user = userEvent.setup(),
) => {
  render(
    <AccountActionButtons
      site={buildDisplaySiteData({
        id: accountId,
        disabled: false,
        siteType: SITE_TYPES.NEW_API,
      })}
      onCopyKey={vi.fn()}
      onDeleteAccount={vi.fn()}
    />,
  )

  await user.click(screen.getByRole("button", { name: "common:actions.more" }))
  await user.click(
    await screen.findByRole("menuitem", {
      name: "account:actions.copyInviteLink",
    }),
  )

  return user
}

/**
 * Registers the shared beforeEach/afterEach hooks; call inside each split
 * file's describe block.
 */
export const setupAccountActionButtonsTest = () => {
  beforeEach(() => {
    getCurrentTempWindowRequestSourceMock.mockReturnValue(
      TEMP_WINDOW_REQUEST_SOURCES.Popup,
    )
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteTextMock,
      },
    })

    mockTogglePinAccount.mockResolvedValue(true)
    accountDataContextValue.isAccountPinned.mockReturnValue(false)
    accountDataContextValue.togglePinAccount = mockTogglePinAccount
    accountDataContextValue.isPinFeatureEnabled = false
    accountDataContextValue.loadAccountData = loadAccountDataMock
    clipboardWriteTextMock.mockResolvedValue(undefined)
    canFetchDisplayAccountInviteLinkMock.mockReturnValue(true)
    fetchDisplayAccountInviteLinkMock.mockResolvedValue(
      "https://invite.example.invalid/register?aff=row",
    )
    trackStartedMock.mockResolvedValue(undefined)
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    resolveProductAnalyticsErrorCategoryFromErrorMock.mockReturnValue(
      PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    )
    completeProductAnalyticsActionMock.mockResolvedValue(undefined)
    resolveDisplayAccountRuntimeKeySecretMock.mockImplementation(
      async (_account: unknown, runtimeKey: unknown) => runtimeKey,
    )
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockImplementation(
      (siteType, feature) => ({
        supported: false,
        siteType,
        feature,
        reason: "feature-slice-disabled",
      }),
    )
    exportShareSnapshotWithToastMock.mockResolvedValue(undefined)
    mockHandleRefreshAccount.mockResolvedValue(undefined)
    accountActionsContextValue.refreshingAccountId = null
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    userPreferencesContextValue.preferences = {
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://admin.example",
        adminToken: "t",
        userId: "1",
      },
    } as Partial<UserPreferences>
    userPreferencesContextValue.showTodayCashflow = true
    hasValidManagedSiteConfigMock.mockReturnValue(true)
    resolveManagedUpstreamResourceFeatureCapabilitiesMock.mockReset()
    accountActionsContextValue.refreshingAccountId = null
  })
}
