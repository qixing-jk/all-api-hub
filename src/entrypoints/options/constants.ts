import { createElement, lazy, Suspense, type ComponentType } from "react"

import {
  DEV_OPTIONS_MENU_ITEM_ICONS,
  OPTIONS_MENU_ITEM_ICONS,
} from "~/components/icons/optionsPageIcons"
import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import { BASE_OPTIONS_MENU_DEFINITIONS } from "~/constants/optionsMenuDefinitions"
import {
  MENU_ITEM_IDS,
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
const BASE_MENU_COMPONENTS = {
  [MENU_ITEM_IDS.OVERVIEW]: OptionsOverview,
  [MENU_ITEM_IDS.ACCOUNT]: AccountManagement,
  [MENU_ITEM_IDS.API_CREDENTIAL_PROFILES]: ApiCredentialProfiles,
  [MENU_ITEM_IDS.BOOKMARK]: BookmarkManagement,
  [MENU_ITEM_IDS.MODELS]: ModelList,
  [MENU_ITEM_IDS.KEYS]: KeyManagement,
  [MENU_ITEM_IDS.AUTO_CHECKIN]: AutoCheckin,
  [MENU_ITEM_IDS.SITE_ANNOUNCEMENTS]: SiteAnnouncements,
  [MENU_ITEM_IDS.BALANCE_HISTORY]: BalanceHistory,
  [MENU_ITEM_IDS.USAGE_ANALYTICS]: UsageAnalytics,
  [MENU_ITEM_IDS.MANAGED_SITE_CHANNELS]: ManagedSiteChannels,
  [MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC]: ManagedSiteModelSync,
  [MENU_ITEM_IDS.BASIC]: BasicSettings,
  [MENU_ITEM_IDS.IMPORT_EXPORT]: ImportExport,
  [MENU_ITEM_IDS.ABOUT]: About,
}

const BASE_MENU_ITEMS: MenuItem[] = BASE_OPTIONS_MENU_DEFINITIONS.map(
  (item) => ({
    ...item,
    icon: OPTIONS_MENU_ITEM_ICONS[item.id],
    component: BASE_MENU_COMPONENTS[item.id],
  }),
)

const DEV_MENU_ITEMS: MenuItem[] = []

if (isDevelopmentMode()) {
  const MeshGradientLab = lazy(() => import("./pages/MeshGradientLab"))
  const UnifiedApiGuidanceDevPreview = lazy(
    () => import("./pages/UnifiedApiGuidanceDevPreview"),
  )

  const MeshGradientLabComponent: ComponentType<any> = (props) =>
    createElement(
      Suspense,
      { fallback: null },
      createElement(MeshGradientLab, props),
    )
  const UnifiedApiGuidanceDevPreviewComponent: ComponentType<any> = (props) =>
    createElement(
      Suspense,
      { fallback: null },
      createElement(UnifiedApiGuidanceDevPreview, props),
    )

  DEV_MENU_ITEMS.push({
    id: DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB,
    icon: DEV_OPTIONS_MENU_ITEM_ICONS[DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB],
    component: MeshGradientLabComponent,
  })
  DEV_MENU_ITEMS.push({
    id: DEV_MENU_ITEM_IDS.UNIFIED_API_GUIDANCE_PREVIEW,
    icon: DEV_OPTIONS_MENU_ITEM_ICONS[
      DEV_MENU_ITEM_IDS.UNIFIED_API_GUIDANCE_PREVIEW
    ],
    component: UnifiedApiGuidanceDevPreviewComponent,
  })
}

export const menuItems: MenuItem[] = [...BASE_MENU_ITEMS, ...DEV_MENU_ITEMS]
