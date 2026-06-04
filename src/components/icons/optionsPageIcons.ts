import {
  ArrowLeftRight,
  BarChart3,
  Bookmark,
  CalendarCheck2,
  Cloud,
  Cpu,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Palette,
  RefreshCcw,
  Settings,
  UserRound,
  UserRoundKey,
  type LucideIcon,
} from "lucide-react"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import type { DevOptionsMenuItemId } from "~/constants/devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  type OptionsMenuItemId,
} from "~/constants/optionsMenuIds"

export const OPTIONS_MENU_ITEM_ICONS = {
  [MENU_ITEM_IDS.OVERVIEW]: LayoutDashboard,
  [MENU_ITEM_IDS.BASIC]: Settings,
  [MENU_ITEM_IDS.ACCOUNT]: UserRound,
  [MENU_ITEM_IDS.API_CREDENTIAL_PROFILES]: KeyRound,
  [MENU_ITEM_IDS.BOOKMARK]: Bookmark,
  [MENU_ITEM_IDS.MODELS]: Cpu,
  [MENU_ITEM_IDS.KEYS]: UserRoundKey,
  [MENU_ITEM_IDS.AUTO_CHECKIN]: CalendarCheck2,
  [MENU_ITEM_IDS.SITE_ANNOUNCEMENTS]: Megaphone,
  [MENU_ITEM_IDS.BALANCE_HISTORY]: LineChart,
  [MENU_ITEM_IDS.USAGE_ANALYTICS]: BarChart3,
  [MENU_ITEM_IDS.MANAGED_SITE_CHANNELS]: Layers,
  [MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC]: RefreshCcw,
  [MENU_ITEM_IDS.IMPORT_EXPORT]: ArrowLeftRight,
  [MENU_ITEM_IDS.ABOUT]: Info,
} satisfies Record<OptionsMenuItemId, LucideIcon>

export const DEV_OPTIONS_MENU_ITEM_ICONS = {
  [DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB]: Palette,
} satisfies Record<DevOptionsMenuItemId, LucideIcon>

export const OPTIONS_CAPABILITY_ICONS = {
  autoCheckin: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.AUTO_CHECKIN],
  siteAnnouncements: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.SITE_ANNOUNCEMENTS],
  managedSiteModelSync:
    OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC],
  webdavSync: Cloud,
} as const
