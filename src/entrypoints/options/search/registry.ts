import type { TFunction } from "i18next"

import { type OptionsPageMenuItemId } from "~/constants/optionsMenuIds"
import {
  accountManagementSearchControls,
  accountManagementSearchSections,
} from "~/features/BasicSettings/components/tabs/AccountManagement/AccountManagement.search"
import {
  balanceHistorySearchControls,
  balanceHistorySearchSections,
} from "~/features/BasicSettings/components/tabs/BalanceHistory/BalanceHistory.search"
import {
  checkinRedeemSearchControls,
  checkinRedeemSearchSections,
} from "~/features/BasicSettings/components/tabs/CheckinRedeem/CheckinRedeem.search"
import {
  claudeCodeRouterSearchControls,
  claudeCodeRouterSearchSections,
} from "~/features/BasicSettings/components/tabs/ClaudeCodeRouter/ClaudeCodeRouter.search"
import {
  cliProxySearchControls,
  cliProxySearchSections,
} from "~/features/BasicSettings/components/tabs/CliProxy/CliProxy.search"
import {
  generalSearchControls,
  generalSearchSections,
} from "~/features/BasicSettings/components/tabs/General/General.search"
import {
  managedSiteSearchControls,
  managedSiteSearchSections,
} from "~/features/BasicSettings/components/tabs/ManagedSite/ManagedSite.search"
import {
  notificationsSearchControls,
  notificationsSearchSections,
} from "~/features/BasicSettings/components/tabs/Notifications/Notifications.search"
import {
  permissionsSearchControls,
  permissionsSearchSections,
} from "~/features/BasicSettings/components/tabs/Permissions/Permissions.search"
import {
  refreshSearchControls,
  refreshSearchSections,
} from "~/features/BasicSettings/components/tabs/Refresh/Refresh.search"
import {
  usageHistorySyncSearchControls,
  usageHistorySyncSearchSections,
} from "~/features/BasicSettings/components/tabs/UsageHistorySync/UsageHistorySync.search"
import {
  webAiApiCheckSearchControls,
  webAiApiCheckSearchSections,
} from "~/features/BasicSettings/components/tabs/WebAiApiCheck/WebAiApiCheck.search"
import {
  importExportSearchControls,
  importExportSearchSections,
} from "~/features/ImportExport/ImportExport.search"
import { getMenuItemLabel } from "~/features/OptionsMenu/getMenuItemLabel"

import { PAGE_DEFINITIONS, TAB_DEFINITIONS } from "./registryPages"

export const OPTIONS_SEARCH_REGISTRY = [
  ...PAGE_DEFINITIONS,
  ...TAB_DEFINITIONS,
  ...generalSearchSections,
  ...notificationsSearchSections,
  ...accountManagementSearchSections,
  ...refreshSearchSections,
  ...checkinRedeemSearchSections,
  ...balanceHistorySearchSections,
  ...usageHistorySyncSearchSections,
  ...webAiApiCheckSearchSections,
  ...managedSiteSearchSections,
  ...cliProxySearchSections,
  ...claudeCodeRouterSearchSections,
  ...permissionsSearchSections,
  ...importExportSearchSections,
  ...generalSearchControls,
  ...notificationsSearchControls,
  ...accountManagementSearchControls,
  ...refreshSearchControls,
  ...checkinRedeemSearchControls,
  ...balanceHistorySearchControls,
  ...usageHistorySyncSearchControls,
  ...webAiApiCheckSearchControls,
  ...managedSiteSearchControls,
  ...cliProxySearchControls,
  ...claudeCodeRouterSearchControls,
  ...permissionsSearchControls,
  ...importExportSearchControls,
]

/**
 * Resolves synthetic page title tokens into translated menu labels.
 */
export function resolveSyntheticPageTitle(titleKey: string, t: TFunction) {
  if (!titleKey.startsWith("__page:")) {
    return t(titleKey)
  }

  const pageId = titleKey.slice("__page:".length)
  return getMenuItemLabel(t, pageId as OptionsPageMenuItemId)
}
