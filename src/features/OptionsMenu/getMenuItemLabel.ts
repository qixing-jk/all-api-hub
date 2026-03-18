import type { TFunction } from "i18next"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  type OptionsPageMenuItemId,
} from "~/constants/optionsMenuIds"
import { assertNever } from "~/utils/core/assert"

/**
 * Returns the localized label for a given options menu item id.
 */
export function getMenuItemLabel(
  t: TFunction,
  itemId: OptionsPageMenuItemId,
): string {
  switch (itemId) {
    case MENU_ITEM_IDS.BASIC:
      return t("ui:navigation.basic")
    case MENU_ITEM_IDS.ACCOUNT:
      return t("ui:navigation.account")
    case MENU_ITEM_IDS.BOOKMARK:
      return t("ui:navigation.bookmark")
    case MENU_ITEM_IDS.AUTO_CHECKIN:
      return t("ui:navigation.autoCheckin")
    case MENU_ITEM_IDS.USAGE_ANALYTICS:
      return t("ui:navigation.usageAnalytics")
    case MENU_ITEM_IDS.BALANCE_HISTORY:
      return t("ui:navigation.balanceHistory")
    case MENU_ITEM_IDS.MODELS:
      return t("ui:navigation.models")
    case MENU_ITEM_IDS.KEYS:
      return t("ui:navigation.keys")
    case MENU_ITEM_IDS.API_CREDENTIAL_PROFILES:
      return t("ui:navigation.apiCredentialProfiles")
    case MENU_ITEM_IDS.MANAGED_SITE_CHANNELS:
      return t("ui:navigation.managedSiteChannels")
    case MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC:
      return t("ui:navigation.managedSiteModelSync")
    case MENU_ITEM_IDS.IMPORT_EXPORT:
      return t("ui:navigation.importExport")
    case MENU_ITEM_IDS.ABOUT:
      return t("ui:navigation.about")
    case DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB:
      return t("ui:navigation.meshGradientLab")
    default:
      return assertNever(itemId, `Unexpected menu item id: ${itemId}`)
  }
}
