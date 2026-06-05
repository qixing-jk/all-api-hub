import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"

export const PreferencesMessageTypes = {
  UpdateActionClickBehavior: "preferences:updateActionClickBehavior",
  RefreshContextMenus: "preferences:refreshContextMenus",
} as const

export interface PreferencesUpdateActionClickBehaviorRequest {
  behavior: "popup" | "sidepanel"
}

interface PreferencesProtocolMap {
  [PreferencesMessageTypes.UpdateActionClickBehavior](
    data: PreferencesUpdateActionClickBehaviorRequest,
  ): RuntimeMessageResponse<undefined>
  [PreferencesMessageTypes.RefreshContextMenus](): RuntimeMessageResponse<undefined>
}

export const {
  sendMessage: sendPreferencesMessage,
  onMessage: onPreferencesMessage,
} = defineExtensionMessaging<PreferencesProtocolMap>({
  logger: createRuntimeMessagingLogger("PreferencesMessaging"),
})
