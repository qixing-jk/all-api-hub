import {
  ArrowLeftRight,
  BarChart3,
  Bookmark,
  CalendarCheck2,
  Cpu,
  Info,
  KeyRound,
  Layers,
  RefreshCcw,
  Settings,
  UserRound,
} from "lucide-react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"

import About from "./pages/About"
import AccountManagement from "./pages/AccountManagement"
import AutoCheckin from "./pages/AutoCheckin"
import BasicSettings from "./pages/BasicSettings"
import BookmarkManagement from "./pages/BookmarkManagement"
import ImportExport from "./pages/ImportExport"
import KeyManagement from "./pages/KeyManagement"
import managedSiteChannels from "./pages/ManagedSiteChannels"
import ManagedSiteModelSync from "./pages/ManagedSiteModelSync"
import ModelList from "./pages/ModelList"
import UsageAnalytics from "./pages/UsageAnalytics"

// 菜单项类型定义
export interface MenuItem {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  component: React.ComponentType<any>
}

// 菜单配置
export const menuItems: MenuItem[] = [
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
    id: MENU_ITEM_IDS.USAGE_ANALYTICS,
    name: "用量分析",
    icon: BarChart3,
    component: UsageAnalytics,
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
    icon: KeyRound,
    component: KeyManagement,
  },
  {
    id: MENU_ITEM_IDS.MANAGED_SITE_CHANNELS,
    name: "渠道管理",
    icon: Layers,
    component: managedSiteChannels,
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
