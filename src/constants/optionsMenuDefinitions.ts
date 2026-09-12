import { isDevelopmentMode } from "~/utils/core/environment"

import { DEV_MENU_ITEM_IDS } from "./devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  OPTIONS_MENU_CATEGORY_IDS,
  type OptionsPageMenuItemId,
} from "./optionsMenuIds"

/** Shared sidebar and search order, independent of options-page components. */
export const BASE_OPTIONS_MENU_DEFINITIONS = [
  { id: MENU_ITEM_IDS.OVERVIEW, category: OPTIONS_MENU_CATEGORY_IDS.GENERAL },
  { id: MENU_ITEM_IDS.ACCOUNT, category: OPTIONS_MENU_CATEGORY_IDS.GENERAL },
  {
    id: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
    category: OPTIONS_MENU_CATEGORY_IDS.GENERAL,
  },
  { id: MENU_ITEM_IDS.BOOKMARK, category: OPTIONS_MENU_CATEGORY_IDS.GENERAL },
  { id: MENU_ITEM_IDS.MODELS, category: OPTIONS_MENU_CATEGORY_IDS.API },
  { id: MENU_ITEM_IDS.KEYS, category: OPTIONS_MENU_CATEGORY_IDS.API },
  {
    id: MENU_ITEM_IDS.AUTO_CHECKIN,
    category: OPTIONS_MENU_CATEGORY_IDS.AUTOMATION,
  },
  {
    id: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
    category: OPTIONS_MENU_CATEGORY_IDS.AUTOMATION,
  },
  {
    id: MENU_ITEM_IDS.BALANCE_HISTORY,
    category: OPTIONS_MENU_CATEGORY_IDS.INSIGHTS,
  },
  {
    id: MENU_ITEM_IDS.USAGE_ANALYTICS,
    category: OPTIONS_MENU_CATEGORY_IDS.INSIGHTS,
  },
  {
    id: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
    category: OPTIONS_MENU_CATEGORY_IDS.SITE_MANAGEMENT,
  },
  {
    id: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC,
    category: OPTIONS_MENU_CATEGORY_IDS.SITE_MANAGEMENT,
  },
  { id: MENU_ITEM_IDS.BASIC, category: OPTIONS_MENU_CATEGORY_IDS.SYSTEM },
  {
    id: MENU_ITEM_IDS.IMPORT_EXPORT,
    category: OPTIONS_MENU_CATEGORY_IDS.SYSTEM,
  },
  { id: MENU_ITEM_IDS.ABOUT, category: OPTIONS_MENU_CATEGORY_IDS.SYSTEM },
] as const

/** Include the developer routes only in development, in sidebar order. */
export function getOptionsPageMenuIds(): OptionsPageMenuItemId[] {
  return [
    ...BASE_OPTIONS_MENU_DEFINITIONS.map((item) => item.id),
    ...(isDevelopmentMode() ? Object.values(DEV_MENU_ITEM_IDS) : []),
  ]
}
