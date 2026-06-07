import { defineExtensionMessaging } from "~/services/runtimeMessaging/extensionMessaging"
import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import { ProductAnnouncementsMessageTypes } from "~/services/runtimeMessaging/messageTypes"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"

import type { ProductAnnouncementRuntimeState } from "./service"

export interface ProductAnnouncementsGetStateRequest {
  locale: string
  currentVersion?: string
  now?: number
}

export interface ProductAnnouncementsMarkSeenRequest {
  ids: string[]
  now?: number
}

export interface ProductAnnouncementsDismissRequest {
  id: string
  revision: number
}

export interface ProductAnnouncementsRestoreRequest {
  id: string
}

interface ProductAnnouncementsProtocolMap {
  [ProductAnnouncementsMessageTypes.GetState](
    data: ProductAnnouncementsGetStateRequest,
  ): RuntimeMessageResponse<ProductAnnouncementRuntimeState>
  [ProductAnnouncementsMessageTypes.Refresh](): RuntimeMessageResponse<boolean>
  [ProductAnnouncementsMessageTypes.MarkSeen](
    data: ProductAnnouncementsMarkSeenRequest,
  ): RuntimeMessageResponse<undefined>
  [ProductAnnouncementsMessageTypes.Dismiss](
    data: ProductAnnouncementsDismissRequest,
  ): RuntimeMessageResponse<undefined>
  [ProductAnnouncementsMessageTypes.Restore](
    data: ProductAnnouncementsRestoreRequest,
  ): RuntimeMessageResponse<undefined>
}

export const {
  sendMessage: sendProductAnnouncementsMessage,
  onMessage: onProductAnnouncementsMessage,
} = defineExtensionMessaging<ProductAnnouncementsProtocolMap>({
  logger: createRuntimeMessagingLogger("ProductAnnouncementsMessaging"),
})
