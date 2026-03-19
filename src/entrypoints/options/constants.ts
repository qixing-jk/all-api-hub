import {
  ArrowLeftRight,
  BarChart3,
  Bookmark,
  CalendarCheck2,
  Cpu,
  Info,
  KeyRound,
  Layers,
  LineChart,
  Palette,
  RefreshCcw,
  Settings,
  UserRound,
  UserRoundKey,
} from "lucide-react"
import { createElement, lazy, Suspense, type ComponentType } from "react"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import {
  MENU_ITEM_IDS,
  type OptionsPageMenuItemId,
} from "~/constants/optionsMenuIds"

import BasicSettings from "./pages/BasicSettings"

/**
 * Wrap a lazily imported options page so the menu config can treat it like a normal component.
 */
function createLazyMenuComponent(
  loader: () => Promise<{ default: ComponentType<any> }>,
): ComponentType<any> {
  const LazyPage = lazy(loader)

  const LazyMenuComponent: ComponentType<any> = (props) =>
    createElement(LazyPage, props)

  return LazyMenuComponent
}

const About = createLazyMenuComponent(() => import("./pages/About"))
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
export interface MenuItem {
  id: OptionsPageMenuItemId
  name: string
  icon: ComponentType<{ className?: string }>
  component: ComponentType<any>
}

// 菜单配置
const BASE_MENU_ITEMS: MenuItem[] = [
  {
    id: MENU_ITEM_IDS.BASIC,
    name: "基本设置",
    icon: Settings,
    component: BasicSettings,
  },
  {
    id: MENU_ITEM_IDS.ACCOUNT,
    name: "账户管理",
    icon: UserRound,
    component: AccountManagement,
  },
  {
    id: MENU_ITEM_IDS.BOOKMARK,
    name: "书签",
    icon: Bookmark,
    component: BookmarkManagement,
  },
  {
    id: MENU_ITEM_IDS.AUTO_CHECKIN,
    name: "自动签到",
    icon: CalendarCheck2,
    component: AutoCheckin,
  },
  {
    id: MENU_ITEM_IDS.MODELS,
    name: "模型列表",
    icon: Cpu,
    component: ModelList,
  },
  {
    id: MENU_ITEM_IDS.KEYS,
    name: "密钥管理",
    icon: UserRoundKey,
    component: KeyManagement,
  },
  {
    id: MENU_ITEM_IDS.API_CREDENTIAL_PROFILES,
    name: "API 凭证",
    icon: KeyRound,
    component: ApiCredentialProfiles,
  },
  {
    id: MENU_ITEM_IDS.BALANCE_HISTORY,
    name: "余额历史",
    icon: LineChart,
    component: BalanceHistory,
  },
  {
    id: MENU_ITEM_IDS.USAGE_ANALYTICS,
    name: "用量分析",
    icon: BarChart3,
    component: UsageAnalytics,
  },
  {
    id: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
    name: "渠道管理",
    icon: Layers,
    component: ManagedSiteChannels,
  },
  {
    id: MENU_ITEM_IDS.MANAGED_SITE_MODEL_SYNC,
    name: "模型同步",
    icon: RefreshCcw,
    component: ManagedSiteModelSync,
  },
  {
    id: MENU_ITEM_IDS.IMPORT_EXPORT,
    name: "导入/导出",
    icon: ArrowLeftRight,
    component: ImportExport,
  },
  {
    id: MENU_ITEM_IDS.ABOUT,
    name: "关于",
    icon: Info,
    component: About,
  },
]

const DEV_MENU_ITEMS: MenuItem[] = []

if (import.meta.env.MODE === "development") {
  const MeshGradientLab = lazy(() => import("./pages/MeshGradientLab"))

  const MeshGradientLabComponent: ComponentType<any> = (props) =>
    createElement(
      Suspense,
      { fallback: null },
      createElement(MeshGradientLab, props),
    )

  DEV_MENU_ITEMS.push({
    id: DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB,
    name: "Mesh Gradient Lab (Dev)",
    icon: Palette,
    component: MeshGradientLabComponent,
  })
}

export const menuItems: MenuItem[] = [...BASE_MENU_ITEMS, ...DEV_MENU_ITEMS]
