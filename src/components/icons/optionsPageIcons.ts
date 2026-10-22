import {
  BarChart3,
  Bookmark,
  Cloud,
  Compass,
  Cpu,
  Info,
  Layers,
  LayoutDashboard,
  LineChart,
  Megaphone,
  Palette,
  Settings,
  Star,
  Terminal,
  type LucideIcon,
} from "lucide-react"

import {
  AccountKeyIcon,
  AccountManagementIcon,
  ApiCredentialLibraryIcon,
  AutoCheckinIcon,
  ImportExportIcon,
  ManagedSiteModelSyncIcon,
} from "~/components/icons/productIcons"
import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import type { DevOptionsMenuItemId } from "~/constants/devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  type OptionsMenuItemId,
} from "~/constants/optionsMenuIds"

export const OPTIONS_MENU_ITEM_ICONS = {
  [MENU_ITEM_IDS.OVERVIEW]: LayoutDashboard,
  [MENU_ITEM_IDS.BASIC]: Settings,
  [MENU_ITEM_IDS.ACCOUNT]: AccountManagementIcon,
  [MENU_ITEM_IDS.API_CREDENTIAL_PROFILES]: ApiCredentialLibraryIcon,
  [MENU_ITEM_IDS.BOOKMARK]: Bookmark,
  [MENU_ITEM_IDS.MODELS]: Cpu,
  [MENU_ITEM_IDS.KEYS]: AccountKeyIcon,
  [MENU_ITEM_IDS.AUTO_CHECKIN]: AutoCheckinIcon,
  [MENU_ITEM_IDS.SITE_ANNOUNCEMENTS]: Megaphone,
  [MENU_ITEM_IDS.BALANCE_HISTORY]: LineChart,
  [MENU_ITEM_IDS.USAGE_ANALYTICS]: BarChart3,
  [MENU_ITEM_IDS.MANAGED_SITE_CHANNELS]: Layers,
  [MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC]: ManagedSiteModelSyncIcon,
  [MENU_ITEM_IDS.IMPORT_EXPORT]: ImportExportIcon,
  [MENU_ITEM_IDS.ABOUT]: Info,
} satisfies Record<OptionsMenuItemId, LucideIcon>

export const DEV_OPTIONS_MENU_ITEM_ICONS = {
  [DEV_MENU_ITEM_IDS.BROWSER_API_LAB]: Terminal,
  [DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB]: Palette,
  [DEV_MENU_ITEM_IDS.UNIFIED_API_GUIDANCE_PREVIEW]: Compass,
  [DEV_MENU_ITEM_IDS.STAR_PROMOTION_PREVIEW]: Star,
} satisfies Record<DevOptionsMenuItemId, LucideIcon>

export const OPTIONS_CAPABILITY_ICONS = {
  autoCheckin: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.AUTO_CHECKIN],
  siteAnnouncements: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.SITE_ANNOUNCEMENTS],
  managedSiteModelSync:
    OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC],
  webdavSync: Cloud,
} as const
