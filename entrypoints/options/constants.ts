import {
  ArrowLeftRight,
  CalendarCheck2,
  Cpu,
  Info,
  KeyRound,
  Layers,
  RefreshCcw,
  Settings,
  UserRound,
} from "lucide-react"

import About from "./pages/About"
import AccountManagement from "./pages/AccountManagement"
import AutoCheckin from "./pages/AutoCheckin"
import BasicSettings from "./pages/BasicSettings"
import ImportExport from "./pages/ImportExport"
import KeyManagement from "./pages/KeyManagement"
import ModelList from "./pages/ModelList"
import NewApiChannels from "./pages/NewApiChannels"
import NewApiModelSync from "./pages/NewApiModelSync"

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
    id: "basic",
    name: "基本设置",
    icon: Settings,
    component: BasicSettings,
  },
  {
    id: "account",
    name: "账户管理",
    icon: UserRound,
    component: AccountManagement,
  },
  {
    id: "autoCheckin",
    name: "自动签到",
    icon: CalendarCheck2,
    component: AutoCheckin,
  },
  {
    id: "models",
    name: "模型列表",
    icon: Cpu,
    component: ModelList,
  },
  {
    id: "keys",
    name: "密钥管理",
    icon: KeyRound,
    component: KeyManagement,
  },
  {
    id: "newApiChannels",
    name: "渠道管理",
    icon: Layers,
    component: NewApiChannels,
  },
  {
    id: "newApiModelSync",
    name: "模型同步",
    icon: RefreshCcw,
    component: NewApiModelSync,
  },
  {
    id: "importExport",
    name: "导入/导出",
    icon: ArrowLeftRight,
    component: ImportExport,
  },
  {
    id: "about",
    name: "关于",
    icon: Info,
    component: About,
  },
]
