/**
 * Message types for communication between content script and background
 */

import type {
  RedemptionAccountCandidate,
  RedemptionAction,
  RedemptionResult
} from "./redemptionAssist"

export type {
  RedemptionAccountCandidate,
  RedemptionAction,
  RedemptionResult
} from "./redemptionAssist"

/**
 * Message to check if redemption assist is enabled
 * Sent from content script to background
 */
export interface RedemptionCheckEnabledMessage {
  type: "REDEMPTION_CHECK_ENABLED"
}

/**
 * Message for reporting detected redemption code
 * Sent from content script to background
 */
export interface RedemptionCodeDetectedMessage {
  type: "REDEMPTION_CODE_DETECTED"
  url: string
  code: string
}

/**
 * Message for suppressing further prompts for a code within TTL
 * Sent from content script to background
 */
export interface RedemptionSuppressMessage {
  type: "REDEMPTION_SUPPRESS"
  url: string
  code: string
}

/**
 * Message type for prompting user about a detected redemption code
 * Sent from background to content script
 */
export interface RedemptionPromptMessage {
  type: "REDEMPTION_PROMPT"
  payload: {
    promptId: string
    code: string
    accountCandidates: RedemptionAccountCandidate[]
  }
}

/**
 * Message type for user's decision on a redemption prompt
 * Sent from content script to background
 */
export interface RedemptionDecisionMessage {
  type: "REDEMPTION_DECISION"
  payload: {
    promptId: string
    action: RedemptionAction
    accountId?: string // Required for "auto" and "manual" actions
  }
}

/**
 * Message type for redemption operation result
 * Sent from background to content script
 */
export interface RedemptionResultMessage {
  type: "REDEMPTION_RESULT"
  payload: {
    promptId: string
    result: RedemptionResult
  }
}

/**
 * Union of all redemption-related messages
 */
export type RedemptionMessage =
  | RedemptionCheckEnabledMessage
  | RedemptionCodeDetectedMessage
  | RedemptionSuppressMessage
  | RedemptionPromptMessage
  | RedemptionDecisionMessage
  | RedemptionResultMessage
