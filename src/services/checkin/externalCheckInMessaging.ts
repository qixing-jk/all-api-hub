import { defineExtensionMessaging } from "@webext-core/messaging"

import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"
import type { RuntimeMessageResponse } from "~/services/runtimeMessaging/result"

export const ExternalCheckInMessageTypes = {
  OpenAndMark: "externalCheckIn:openAndMark",
} as const

export interface ExternalCheckInOpenAndMarkRequest {
  accountIds: string[]
  openInNewWindow?: boolean
}

export type ExternalCheckInOpenResult = {
  accountId: string
  openedCheckIn: boolean
  openedRedeem: boolean | null
  markedCheckedIn: boolean
  error?: string
  redeemError?: string
}

export interface ExternalCheckInOpenAndMarkResult {
  results: ExternalCheckInOpenResult[]
  openedCount: number
  markedCount: number
  failedCount: number
  totalCount: number
}

export type ExternalCheckInOpenAndMarkResponse =
  RuntimeMessageResponse<ExternalCheckInOpenAndMarkResult>

interface ExternalCheckInProtocolMap {
  [ExternalCheckInMessageTypes.OpenAndMark](
    data: ExternalCheckInOpenAndMarkRequest,
  ): ExternalCheckInOpenAndMarkResponse
}

export const {
  sendMessage: sendExternalCheckInMessage,
  onMessage: onExternalCheckInMessage,
} = defineExtensionMessaging<ExternalCheckInProtocolMap>({
  logger: createRuntimeMessagingLogger("ExternalCheckInMessaging"),
})
