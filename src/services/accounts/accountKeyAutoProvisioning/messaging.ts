import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"
import type {
  AccountKeyRepairDeleteInvalidResourcesRequest,
  AccountKeyRepairDeleteInvalidResourcesResult,
  AccountKeyRepairProgress,
  AccountKeyRepairRecordManagedSiteImportResultsRequest,
  AccountKeyRepairStartOptions,
} from "~/types/accountKeyAutoProvisioning"

export const AccountKeyRepairMessageTypes = {
  Start: "accountKeyRepair:start",
  Cancel: "accountKeyRepair:cancel",
  GetProgress: "accountKeyRepair:getProgress",
  DeleteInvalidResources: "accountKeyRepair:deleteInvalidResources",
  RecordManagedSiteImportResults:
    "accountKeyRepair:recordManagedSiteImportResults",
} as const

interface AccountKeyRepairProtocolMap {
  [AccountKeyRepairMessageTypes.Start](
    options?: AccountKeyRepairStartOptions,
  ): RuntimeMessageResponse<AccountKeyRepairProgress>
  [AccountKeyRepairMessageTypes.Cancel](): RuntimeMessageResponse<AccountKeyRepairProgress>
  [AccountKeyRepairMessageTypes.GetProgress](): RuntimeMessageResponse<AccountKeyRepairProgress>
  [AccountKeyRepairMessageTypes.DeleteInvalidResources](
    request: AccountKeyRepairDeleteInvalidResourcesRequest,
  ): RuntimeMessageResponse<AccountKeyRepairDeleteInvalidResourcesResult>
  [AccountKeyRepairMessageTypes.RecordManagedSiteImportResults](
    request: AccountKeyRepairRecordManagedSiteImportResultsRequest,
  ): RuntimeMessageResponse<AccountKeyRepairProgress>
}

export const {
  sendMessage: sendAccountKeyRepairMessage,
  onMessage: onAccountKeyRepairMessage,
} = defineExtensionMessaging<AccountKeyRepairProtocolMap>({
  logger: createRuntimeMessagingLogger("AccountKeyRepairMessaging"),
})
