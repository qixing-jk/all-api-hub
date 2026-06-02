import { defineExtensionMessaging, type Logger } from "@webext-core/messaging"

import type { RedemptionAssistPreferences } from "~/services/preferences/userPreferences"
import { createLogger } from "~/utils/core/logger"

import type {
  RedemptionAssistAutoRedeemByUrlRequest,
  RedemptionAssistAutoRedeemRequest,
  RedemptionAssistMutationResponse,
  RedemptionAssistRedeemResponse,
  RedemptionAssistShouldPromptRequest,
  RedemptionAssistShouldPromptResponse,
} from "./redemptionAssist"

export const RedemptionAssistMessageTypes = {
  UpdateSettings: "redemptionAssist:updateSettings",
  ShouldPrompt: "redemptionAssist:shouldPrompt",
  AutoRedeem: "redemptionAssist:autoRedeem",
  AutoRedeemByUrl: "redemptionAssist:autoRedeemByUrl",
} as const

export interface RedemptionAssistUpdateSettingsRequest {
  settings: Partial<RedemptionAssistPreferences>
}

/**
 * Creates a messaging logger that avoids forwarding payload details because
 * redemption assist messages can carry user-selected redemption codes.
 */
function createRedemptionAssistMessagingLogger(): Logger {
  const logger = createLogger("RedemptionAssistMessaging")
  const toMessage = (value: unknown) =>
    typeof value === "string" ? value : String(value)

  return {
    debug: (message: unknown) => logger.debug(toMessage(message)),
    log: (message: unknown) => logger.info(toMessage(message)),
    warn: (message: unknown) => logger.warn(toMessage(message)),
    error: (message: unknown) => logger.error(toMessage(message)),
  }
}

interface RedemptionAssistProtocolMap {
  [RedemptionAssistMessageTypes.UpdateSettings](
    data: RedemptionAssistUpdateSettingsRequest,
  ): RedemptionAssistMutationResponse
  [RedemptionAssistMessageTypes.ShouldPrompt](
    data: RedemptionAssistShouldPromptRequest,
  ): RedemptionAssistShouldPromptResponse
  [RedemptionAssistMessageTypes.AutoRedeem](
    data: RedemptionAssistAutoRedeemRequest,
  ): RedemptionAssistRedeemResponse
  [RedemptionAssistMessageTypes.AutoRedeemByUrl](
    data: RedemptionAssistAutoRedeemByUrlRequest,
  ): RedemptionAssistRedeemResponse
}

export const {
  sendMessage: sendRedemptionAssistMessage,
  onMessage: onRedemptionAssistMessage,
} = defineExtensionMessaging<RedemptionAssistProtocolMap>({
  logger: createRedemptionAssistMessagingLogger(),
})
