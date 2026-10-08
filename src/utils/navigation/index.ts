import {
  BASIC_SETTINGS_TAB_IDS,
  type BasicSettingsTabId,
} from "~/constants/basicSettingsTabs"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { SETTINGS_ANCHORS } from "~/constants/settingsAnchors"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { OPTIONS_PAGE_URL } from "~/utils/browser/extensionPageUrls"
import { openRuntimeOptionsPage } from "~/utils/browser/runtime"
import { createTab as createTabApi } from "~/utils/browser/tabs"
import {
  buildSearchString,
  isOnOptionsPage,
  openOrFocusOptionsMenuItem,
  openOrFocusOptionsPage,
  openTargetedOptionsPage,
  pushWithinOptionsPage,
  replaceWithinOptionsPage,
} from "~/utils/navigation/optionsPage"
import { closeIfPopup, withPopupClose } from "~/utils/navigation/popup"

/**
 * Normalized hash used by account manager navigations to keep routing consistent.
 */
const getAccountHash = () => `#${MENU_ITEM_IDS.ACCOUNT}`

/**
 * Normalized hash used by bookmark manager navigations to keep routing consistent.
 */
const getBookmarkHash = () => `#${MENU_ITEM_IDS.BOOKMARK}`

/**
 * Canonical hash for the default settings landing page, reused across helpers.
 */
const getBasicSettingsHash = () => `#${MENU_ITEM_IDS.BASIC}`

/**
 * Hash fragment pointing to API credential profiles inside options.html.
 */
const getApiCredentialProfilesHash = () =>
  `#${MENU_ITEM_IDS.API_CREDENTIAL_PROFILES}`

/**
 * Hash fragment pointing to Managed Site channel management inside options.html.
 */
const getManagedSiteChannelsHash = () =>
  `#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`

/**
 * Hash fragment pointing to Managed Site model sync inside options.html.
 */
const getManagedSiteModelSyncHash = () =>
  `#${MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC}`

interface BookmarkCreationNavigationParams {
  name: string
  url: string
}

interface ApiCredentialProfileCreationNavigationParams {
  name: string
  baseUrl: string
  apiKeyCreateUrl?: string
  apiKeyCreateHint?: string
}

interface BookmarkManagerNavigationParams {
  search?: string
  create?: BookmarkCreationNavigationParams
}

interface ApiCredentialProfilesNavigationParams {
  create?: ApiCredentialProfileCreationNavigationParams
  profileId?: string
}

/**
 * Target descriptor for Key Management deep links.
 * Passing a string keeps the legacy account-only helper contract working.
 */
type KeyManagementNavigationTarget =
  | string
  | {
      accountId?: string
      associationId?: string
    }

/**
 * Opens or focuses the account manager page, preferring in-page navigation when already on options.html.
 * @param params Optional query parameters to prefilter accounts.
 * @param params.search Search keyword applied to the manager list.
 * @param options Optional in-page navigation behavior tweaks.
 * @param options.preserveHistory When true and already inside options.html,
 * push a new history entry so users can return to the originating context.
 */
const _openFullManagerPage = (
  params?: { search?: string },
  options?: { preserveHistory?: boolean },
) => {
  const targetHash = getAccountHash()
  const searchParams = params?.search ? { search: params.search } : undefined

  if (isOnOptionsPage()) {
    if (options?.preserveHistory) {
      pushWithinOptionsPage(targetHash, searchParams)
      return
    }

    replaceWithinOptionsPage(targetHash, searchParams)
    return
  }

  return openOrFocusOptionsPage(targetHash, searchParams)
}

/**
 * Opens or focuses the bookmark manager page, preferring in-page navigation when already on options.html.
 * @param params Optional query parameters to prefilter bookmarks.
 * @param params.search Search keyword applied to the bookmark list.
 */
const _openFullBookmarkManagerPage = (
  params?: BookmarkManagerNavigationParams,
) => {
  const targetHash = getBookmarkHash()
  const searchParams = params?.create
    ? {
        action: "add",
        name: params.create.name,
        url: params.create.url,
      }
    : params?.search
      ? { search: params.search }
      : undefined

  if (isOnOptionsPage()) {
    replaceWithinOptionsPage(targetHash, searchParams)
    return
  }

  return openOrFocusOptionsPage(targetHash, searchParams)
}

/**
 * Navigates to the basic settings area, optionally focusing a sub-tab.
 * @param tabId Optional tab ID within settings.
 * @param options Optional in-page navigation behavior tweaks.
 * @param options.anchor Optional element anchor within the selected settings tab.
 * @param options.preserveHistory When true and already inside options.html,
 * push a new history entry so users can return to the originating context.
 */
const navigateToBasicSettings = (
  tabId?: string,
  options?: { preserveHistory?: boolean; anchor?: string },
) => {
  const targetHash = getBasicSettingsHash()
  const searchParams =
    tabId || options?.anchor
      ? { tab: tabId, anchor: options?.anchor }
      : undefined

  if (isOnOptionsPage()) {
    if (options?.preserveHistory) {
      pushWithinOptionsPage(targetHash, searchParams)
      return
    }

    replaceWithinOptionsPage(targetHash, searchParams)
    return
  }

  return openOrFocusOptionsPage(targetHash, searchParams)
}

/**
 * Opens Managed Site channel management with a resource reference or search filter.
 */
const _openManagedSiteChannelsPage = (params?: {
  resourceRef?: ManagedResourceRef
  search?: string
}) => {
  const targetHash = getManagedSiteChannelsHash()
  const searchParams: Record<string, string | undefined> = {}

  if (params?.search) {
    searchParams.search = params.search
  }

  if (params?.resourceRef)
    searchParams.resourceRef = JSON.stringify(params.resourceRef)

  const resolvedParams = Object.keys(searchParams).length ? searchParams : {}

  if (isOnOptionsPage()) {
    pushWithinOptionsPage(targetHash, resolvedParams)
    return
  }

  return openOrFocusOptionsPage(targetHash, resolvedParams)
}

type ManagedSiteModelSyncTab = "history" | "manual"

/**
 * Opens Managed Site model sync dashboard, optionally focusing a channel and tab.
 */
const _openManagedSiteModelSyncPage = (params?: {
  resourceRef?: ManagedResourceRef
  tab?: ManagedSiteModelSyncTab
}) => {
  const targetHash = getManagedSiteModelSyncHash()
  const searchParams: Record<string, string | undefined> = {}

  if (params?.resourceRef) {
    searchParams.resourceRef = JSON.stringify(params.resourceRef)
  }

  if (params?.tab) {
    searchParams.tab = params.tab
  }

  const resolvedParams = Object.keys(searchParams).length ? searchParams : {}

  if (isOnOptionsPage()) {
    replaceWithinOptionsPage(targetHash, resolvedParams)
    return
  }

  return openOrFocusOptionsPage(targetHash, resolvedParams)
}

/**
 * Jump to the default settings page hash, reusing the current options tab when
 * possible to minimize flicker and redundant windows.
 */
const _openSettingsPage = () => {
  return navigateToBasicSettings()
}

/**
 * Opens the optional-permissions onboarding dialog through the Overview URL.
 */
const _openPermissionsOnboardingPage = (params?: { reason?: string }) => {
  const searchParams = {
    onboarding: "permissions",
    reason: params?.reason,
  }
  const targetHash = `#${MENU_ITEM_IDS.OVERVIEW}`

  if (isOnOptionsPage()) {
    replaceWithinOptionsPage(targetHash, searchParams)
    return
  }

  return openOrFocusOptionsPage(targetHash, searchParams)
}

/**
 * Navigates directly to a named settings tab.
 * @param tabId Unique identifier for the tab to activate.
 */
const _openSettingsTab = (
  tabId: BasicSettingsTabId,
  options?: { preserveHistory?: boolean; anchor?: string },
) => {
  return navigateToBasicSettings(tabId, options)
}

interface OpenSettingsTabInNewTabOptions {
  anchor?: string
  /**
   * Leaves the current window as it is: the settings tab opens in the
   * background and the popup is not closed, so an in-progress form there keeps
   * its focus. A page-action popup is dismissed as soon as focus moves, so
   * activating the tab would unmount that form. Defaults to closing the popup,
   * matching the flows that move the user out of it for good.
   */
  keepCurrentWindow?: boolean
}

/**
 * Opens a settings target in a fresh tab so the current workflow stays mounted.
 */
const _openSettingsTabInNewTab = async (
  tabId: BasicSettingsTabId,
  options?: OpenSettingsTabInNewTabOptions,
) => {
  const searchString = buildSearchString({
    tab: tabId,
    anchor: options?.anchor,
  })
  const url = `${OPTIONS_PAGE_URL}${searchString}${getBasicSettingsHash()}`

  if (options?.keepCurrentWindow) {
    await createTabApi(url, false)
    return
  }

  await createTabApi(url, true)
}

/**
 * Opens the API credential profiles section, preferring in-page navigation when already on options.html.
 */
const _openApiCredentialProfilesPage = (
  params?: ApiCredentialProfilesNavigationParams,
) => {
  const targetHash = getApiCredentialProfilesHash()
  const profileId = params?.profileId?.trim()
  const searchParams = profileId
    ? { profileId }
    : params?.create
      ? {
          action: "add",
          name: params.create.name,
          baseUrl: params.create.baseUrl,
          apiKeyCreateUrl: params.create.apiKeyCreateUrl,
          apiKeyCreateHint: params.create.apiKeyCreateHint,
        }
      : undefined

  if (isOnOptionsPage()) {
    if (profileId) {
      pushWithinOptionsPage(targetHash, searchParams)
    } else {
      replaceWithinOptionsPage(targetHash, searchParams)
    }
    return
  }

  return openOrFocusOptionsPage(targetHash, searchParams)
}

/**
 * Opens the Keys page, optionally targeting an account or explicit association.
 * @param target Optional account id or structured target descriptor.
 */
const _openKeysPage = async (target?: KeyManagementNavigationTarget) => {
  const targetHash = `#${MENU_ITEM_IDS.KEYS}`
  const searchParams =
    typeof target === "string"
      ? { accountId: target }
      : target
        ? {
            accountId: target.accountId,
            associationId: target.associationId,
          }
        : undefined

  return openTargetedOptionsPage({
    targetHash,
    inPageSearchParams: searchParams,
    newTabSearchParams: searchParams
      ? {
          accountId: searchParams.accountId || undefined,
          associationId: searchParams.associationId || undefined,
        }
      : undefined,
  })
}

/**
 * Target descriptor for Model Management deep links.
 * Passing a string keeps the legacy account-only helper contract working.
 */
type ModelManagementNavigationTarget =
  | string
  | {
      accountId?: string
      profileId?: string
    }

/**
 * Opens the Models page, optionally pre-selecting an account or stored profile.
 */
const _openModelsPage = async (target?: ModelManagementNavigationTarget) => {
  const targetHash = `#${MENU_ITEM_IDS.MODELS}`
  const searchParams =
    typeof target === "string"
      ? { accountId: target }
      : target
        ? {
            accountId: target.accountId,
            profileId: target.profileId,
          }
        : undefined

  return openTargetedOptionsPage({
    targetHash,
    inPageSearchParams: searchParams,
    newTabSearchParams:
      typeof target === "string"
        ? { accountId: target }
        : searchParams
          ? {
              accountId: searchParams.accountId || undefined,
              profileId: searchParams.profileId || undefined,
            }
          : undefined,
  })
}

// 导出带自动关闭的版本
/**
 * Launch the account manager root view, auto-closing the popup when invoked
 * from popup.html to prevent duplicate UI shells.
 */
export const openFullAccountManagerPage = withPopupClose(() =>
  _openFullManagerPage(),
)

/**
 * Open the account manager filtered by the provided search string before
 * closing the popup, keeping the flow consistent with popup interactions.
 */
export const openAccountManagerWithSearch = withPopupClose((search: string) =>
  _openFullManagerPage({ search }, { preserveHistory: true }),
)

/**
 * Launch the bookmark manager root view, auto-closing the popup when invoked
 * from popup.html to prevent duplicate UI shells.
 */
export const openFullBookmarkManagerPage = withPopupClose(
  (params?: BookmarkManagerNavigationParams) =>
    _openFullBookmarkManagerPage(params),
)

/**
 * Navigate to the default settings landing section and close the popup if
 * applicable, so the user ends up in the options page only.
 */
export const openSettingsPage = withPopupClose(_openSettingsPage)

/**
 * Open the extension's standard options page and close the popup if applicable.
 */
export const openOptionsPage = withPopupClose(openRuntimeOptionsPage)

/**
 * Open the optional-permissions onboarding flow for manual review/debugging.
 */
export const openPermissionsOnboardingPage = withPopupClose(
  _openPermissionsOnboardingPage,
)

/**
 * Open a specific settings tab while ensuring popup teardown happens after
 * dispatching the navigation request.
 */
export const openSettingsTab = withPopupClose(_openSettingsTab)

export const openSettingsTabInNewTab = async (
  tabId: BasicSettingsTabId,
  options?: OpenSettingsTabInNewTabOptions,
) => {
  await _openSettingsTabInNewTab(tabId, options)
  if (!options?.keepCurrentWindow) {
    closeIfPopup()
  }
}

/** Opens local shield diagnostics, preserving the originating options workflow. */
export const openProtectionBypassHistory = () =>
  openSettingsTab(BASIC_SETTINGS_TAB_IDS.Refresh, {
    anchor: SETTINGS_ANCHORS.SHIELD_HISTORY,
    preserveHistory: true,
  })

export const openAutoCheckinPage = withPopupClose(
  (searchParams?: Record<string, string | undefined>) =>
    openOrFocusOptionsMenuItem(MENU_ITEM_IDS.AUTO_CHECKIN, searchParams),
)

/**
 * Open the API credential profiles page and close the popup afterward when applicable.
 */
export const openApiCredentialProfilesPage = withPopupClose(
  (params?: ApiCredentialProfilesNavigationParams) =>
    _openApiCredentialProfilesPage(params),
)

/**
 * Open the Keys management page, forwarding optional account focus, then close
 * the popup to free screen real estate.
 */
export const openKeysPage = withPopupClose(_openKeysPage)

/**
 * Open the Models management page for the given account context and close the
 * popup afterwards.
 */
export const openModelsPage = withPopupClose(_openModelsPage)

/**
 * Open Managed Site channel management and close the popup afterwards.
 */
export const openManagedSiteChannelsPage = withPopupClose(
  _openManagedSiteChannelsPage,
)

/**
 * Open Managed Site model sync dashboard focused on a single channel.
 */
export const openManagedSiteModelSyncForChannel = withPopupClose(
  (resourceRef: ManagedResourceRef) =>
    _openManagedSiteModelSyncPage({ resourceRef, tab: "manual" }),
)
