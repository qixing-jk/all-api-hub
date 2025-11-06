import {
  ArrowPathIcon,
  ArrowPathRoundedSquareIcon,
  CheckBadgeIcon,
  CogIcon,
  CpuChipIcon,
  InformationCircleIcon,
  KeyIcon,
  UserIcon
} from "@heroicons/react/24/outline"

import About from "./pages/About"
import AccountManagement from "./pages/AccountManagement"
import AutoCheckin from "./pages/AutoCheckin"
import BasicSettings from "./pages/BasicSettings"
import ImportExport from "./pages/ImportExport"
import KeyManagement from "./pages/KeyManagement"
import ModelList from "./pages/ModelList"
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
    icon: CogIcon,
    component: BasicSettings
  },
  {
    id: "account",
    name: "账户管理",
    icon: UserIcon,
    component: AccountManagement
  },
  {
    id: "autoCheckin",
    name: "自动签到",
    icon: CheckBadgeIcon,
    component: AutoCheckin
  },
  {
    id: "models",
    name: "模型列表",
    icon: CpuChipIcon,
    component: ModelList
  },
  {
    id: "keys",
    name: "密钥管理",
    icon: KeyIcon,
    component: KeyManagement
  },
  {
    id: "newApiModelSync",
    name: "模型同步",
    icon: ArrowPathRoundedSquareIcon,
    component: NewApiModelSync
  },
  {
    id: "importExport",
    name: "导入/导出",
    icon: ArrowPathIcon,
    component: ImportExport
  },
  {
    id: "about",
    name: "关于",
    icon: InformationCircleIcon,
    component: About
  }
]
