import { createElement, lazy, Suspense, type ComponentType } from "react"

import {
  DEV_OPTIONS_MENU_ITEM_ICONS,
  OPTIONS_MENU_ITEM_ICONS,
} from "~/components/icons/optionsPageIcons"
import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  OPTIONS_MENU_CATEGORY_IDS,
  type OptionsMenuCategoryId,
  type OptionsPageMenuItemId,
} from "~/constants/optionsMenuIds"
import { isDevelopmentMode } from "~/utils/core/environment"

import BasicSettings from "./pages/BasicSettings"

/**
 * Wrap a lazily imported options page so the menu config can treat it like a normal component.
 */
function createLazyMenuComponent(
  loader: () => Promise<{ default: ComponentType<any> }>,
): ComponentType<any> {
  return lazy(loader) as ComponentType<any>
}

const About = createLazyMenuComponent(() => import("./pages/About"))
const OptionsOverview = createLazyMenuComponent(
  () => import("./pages/OptionsOverview"),
)
const AccountManagement = createLazyMenuComponent(
  () => import("./pages/AccountManagement"),
)
const ApiCredentialProfiles = createLazyMenuComponent(
  () => import("./pages/ApiCredentialProfiles"),
)
const AutoCheckin = createLazyMenuComponent(() => import("./pages/AutoCheckin"))
const BalanceHistory = createLazyMenuComponent(
  () => import("./pages/BalanceHistory"),
)
const SiteAnnouncements = createLazyMenuComponent(
  () => import("./pages/SiteAnnouncements"),
)
const BookmarkManagement = createLazyMenuComponent(
  () => import("./pages/BookmarkManagement"),
)
const ImportExport = createLazyMenuComponent(
  () => import("./pages/ImportExport"),
)
const KeyManagement = createLazyMenuComponent(
  () => import("./pages/KeyManagement"),
)
const ManagedSiteChannels = createLazyMenuComponent(
  () => import("./pages/ManagedSiteChannels"),
)
const ManagedSiteModelSync = createLazyMenuComponent(
  () => import("./pages/ManagedSiteModelSync"),
)
const ModelList = createLazyMenuComponent(() => import("./pages/ModelList"))
const UsageAnalytics = createLazyMenuComponent(
  () => import("./pages/UsageAnalytics"),
)

// 菜单项类型定义
interface MenuItem {
  id: OptionsPageMenuItemId
  icon: ComponentType<{ className?: string }>
  component: ComponentType<any>
  category?: OptionsMenuCategoryId
}

// 菜单配置
const BASE_MENU_ITEMS: MenuItem[] = [
  {
    id: MENU_ITEM_IDS.OVERVIEW,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.OVERVIEW],
    component: OptionsOverview,
    category: OPTIONS_MENU_CATEGORY_IDS.GENERAL,
  },
  {
    id: MENU_ITEM_IDS.ACCOUNT,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.ACCOUNT],
    component: AccountManagement,
    category: OPTIONS_MENU_CATEGORY_IDS.GENERAL,
  },
  {
    id: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.API_CREDENTIAL_PROFILES],
    component: ApiCredentialProfiles,
    category: OPTIONS_MENU_CATEGORY_IDS.GENERAL,
  },
  {
    id: MENU_ITEM_IDS.BOOKMARK,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.BOOKMARK],
    component: BookmarkManagement,
    category: OPTIONS_MENU_CATEGORY_IDS.GENERAL,
  },
  {
    id: MENU_ITEM_IDS.MODELS,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.MODELS],
    component: ModelList,
    category: OPTIONS_MENU_CATEGORY_IDS.API,
  },
  {
    id: MENU_ITEM_IDS.KEYS,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.KEYS],
    component: KeyManagement,
    category: OPTIONS_MENU_CATEGORY_IDS.API,
  },
  {
    id: MENU_ITEM_IDS.AUTO_CHECKIN,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.AUTO_CHECKIN],
    component: AutoCheckin,
    category: OPTIONS_MENU_CATEGORY_IDS.AUTOMATION,
  },
  {
    id: MENU_ITEM_IDS.SITE_ANNOUNCEMENTS,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.SITE_ANNOUNCEMENTS],
    component: SiteAnnouncements,
    category: OPTIONS_MENU_CATEGORY_IDS.AUTOMATION,
  },
  {
    id: MENU_ITEM_IDS.BALANCE_HISTORY,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.BALANCE_HISTORY],
    component: BalanceHistory,
    category: OPTIONS_MENU_CATEGORY_IDS.INSIGHTS,
  },
  {
    id: MENU_ITEM_IDS.USAGE_ANALYTICS,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.USAGE_ANALYTICS],
    component: UsageAnalytics,
    category: OPTIONS_MENU_CATEGORY_IDS.INSIGHTS,
  },
  {
    id: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.MANAGED_SITE_CHANNELS],
    component: ManagedSiteChannels,
    category: OPTIONS_MENU_CATEGORY_IDS.SITE_MANAGEMENT,
  },
  {
    id: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC],
    component: ManagedSiteModelSync,
    category: OPTIONS_MENU_CATEGORY_IDS.SITE_MANAGEMENT,
  },
  {
    id: MENU_ITEM_IDS.BASIC,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.BASIC],
    component: BasicSettings,
    category: OPTIONS_MENU_CATEGORY_IDS.SYSTEM,
  },
  {
    id: MENU_ITEM_IDS.IMPORT_EXPORT,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.IMPORT_EXPORT],
    component: ImportExport,
    category: OPTIONS_MENU_CATEGORY_IDS.SYSTEM,
  },
  {
    id: MENU_ITEM_IDS.ABOUT,
    icon: OPTIONS_MENU_ITEM_ICONS[MENU_ITEM_IDS.ABOUT],
    component: About,
    category: OPTIONS_MENU_CATEGORY_IDS.SYSTEM,
  },
]

const DEV_MENU_ITEMS: MenuItem[] = []

if (isDevelopmentMode()) {
  const MeshGradientLab = lazy(() => import("./pages/MeshGradientLab"))

  const MeshGradientLabComponent: ComponentType<any> = (props) =>
    createElement(
      Suspense,
      { fallback: null },
      createElement(MeshGradientLab, props),
    )

  DEV_MENU_ITEMS.push({
    id: DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB,
    icon: DEV_OPTIONS_MENU_ITEM_ICONS[DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB],
    component: MeshGradientLabComponent,
  })
}

export const menuItems: MenuItem[] = [...BASE_MENU_ITEMS, ...DEV_MENU_ITEMS]
