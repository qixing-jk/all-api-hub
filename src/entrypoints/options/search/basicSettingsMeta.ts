import { OPTIONAL_PERMISSIONS } from "~/services/permissions/permissionManager"

import type { BasicSettingsTabId } from "./types"

export const hasOptionalPermissions = OPTIONAL_PERMISSIONS.length > 0

export const BASIC_SETTINGS_TAB_ORDER: BasicSettingsTabId[] = [
  "general",
  "accountManagement",
  "refresh",
  "checkinRedeem",
  "balanceHistory",
  "accountUsage",
  "webAiApiCheck",
  "managedSite",
  "cliProxy",
  "claudeCodeRouter",
  ...(hasOptionalPermissions ? (["permissions"] as const) : []),
  "dataBackup",
]
