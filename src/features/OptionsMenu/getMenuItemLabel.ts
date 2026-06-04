import type { TFunction } from "i18next"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  OPTIONS_MENU_CATEGORY_IDS,
  type OptionsMenuCategoryId,
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
    case MENU_ITEM_IDS.OVERVIEW:
      return t("ui:navigation.overview")
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
    case MENU_ITEM_IDS.SITE_ANNOUNCEMENTS:
      return t("ui:navigation.siteAnnouncements")
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

/**
 * Returns the localized label for an options menu category.
 */
export function getMenuCategoryLabel(
  t: TFunction,
  categoryId: OptionsMenuCategoryId,
): string {
  switch (categoryId) {
    case OPTIONS_MENU_CATEGORY_IDS.GENERAL:
      return t("ui:navigation.categories.general")
    case OPTIONS_MENU_CATEGORY_IDS.API:
      return t("ui:navigation.categories.api")
    case OPTIONS_MENU_CATEGORY_IDS.AUTOMATION:
      return t("ui:navigation.categories.automation")
    case OPTIONS_MENU_CATEGORY_IDS.INSIGHTS:
      return t("ui:navigation.categories.insights")
    case OPTIONS_MENU_CATEGORY_IDS.SITE_MANAGEMENT:
      return t("ui:navigation.categories.siteManagement")
    case OPTIONS_MENU_CATEGORY_IDS.SYSTEM:
      return t("ui:navigation.categories.system")
    default:
      return assertNever(
        categoryId,
        `Unexpected menu category id: ${categoryId}`,
      )
  }
}
