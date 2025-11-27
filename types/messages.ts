/**
 * Message types for communication between content script and background
 */

import type {
  RedemptionAccountCandidate,
  RedemptionAction,
  RedemptionResult
} from "./redemptionAssist"

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
  | RedemptionPromptMessage
  | RedemptionDecisionMessage
  | RedemptionResultMessage
