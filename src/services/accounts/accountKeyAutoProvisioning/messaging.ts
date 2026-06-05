import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"

export const AccountKeyRepairMessageTypes = {
  Start: "accountKeyRepair:start",
  GetProgress: "accountKeyRepair:getProgress",
} as const

interface AccountKeyRepairProtocolMap {
  [AccountKeyRepairMessageTypes.Start](): RuntimeMessageResponse<AccountKeyRepairProgress>
  [AccountKeyRepairMessageTypes.GetProgress](): RuntimeMessageResponse<AccountKeyRepairProgress>
}

export const {
  sendMessage: sendAccountKeyRepairMessage,
  onMessage: onAccountKeyRepairMessage,
} = defineExtensionMessaging<AccountKeyRepairProtocolMap>({
  logger: createRuntimeMessagingLogger("AccountKeyRepairMessaging"),
})
