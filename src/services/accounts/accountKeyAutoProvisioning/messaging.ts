import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type {
  AccountKeyRepairDeleteInvalidTokensRequest,
  AccountKeyRepairDeleteInvalidTokensResult,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"

export const AccountKeyRepairMessageTypes = {
  Start: "accountKeyRepair:start",
  Cancel: "accountKeyRepair:cancel",
  GetProgress: "accountKeyRepair:getProgress",
  DeleteInvalidTokens: "accountKeyRepair:deleteInvalidTokens",
} as const

interface AccountKeyRepairProtocolMap {
  [AccountKeyRepairMessageTypes.Start](): RuntimeMessageResponse<AccountKeyRepairProgress>
  [AccountKeyRepairMessageTypes.Cancel](): RuntimeMessageResponse<AccountKeyRepairProgress>
  [AccountKeyRepairMessageTypes.GetProgress](): RuntimeMessageResponse<AccountKeyRepairProgress>
  [AccountKeyRepairMessageTypes.DeleteInvalidTokens](
    request: AccountKeyRepairDeleteInvalidTokensRequest,
  ): RuntimeMessageResponse<AccountKeyRepairDeleteInvalidTokensResult>
}

export const {
  sendMessage: sendAccountKeyRepairMessage,
  onMessage: onAccountKeyRepairMessage,
} = defineExtensionMessaging<AccountKeyRepairProtocolMap>({
  logger: createRuntimeMessagingLogger("AccountKeyRepairMessaging"),
})
