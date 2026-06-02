import { defineExtensionMessaging } from "@webext-core/messaging"

import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"

import type { ReleaseUpdateStatus } from "./releaseUpdateStatus"

export type ReleaseUpdateRuntimeResponse =
  RuntimeMessageResponse<ReleaseUpdateStatus>

export const ReleaseUpdateMessageTypes = {
  GetStatus: "releaseUpdate:getStatus",
  CheckNow: "releaseUpdate:checkNow",
} as const

interface ReleaseUpdateProtocolMap {
  [ReleaseUpdateMessageTypes.GetStatus](): ReleaseUpdateRuntimeResponse
  [ReleaseUpdateMessageTypes.CheckNow](): ReleaseUpdateRuntimeResponse
}

export const {
  sendMessage: sendReleaseUpdateMessage,
  onMessage: onReleaseUpdateMessage,
} = defineExtensionMessaging<ReleaseUpdateProtocolMap>({
  logger: createRuntimeMessagingLogger("ReleaseUpdateMessaging"),
})
