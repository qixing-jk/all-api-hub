import type { TFunction } from "i18next"

import { assertNever } from "~/utils/core/assert"

import type { CliToolId } from "./types"

/**
 * Returns the localized label for a supported CLI simulation tool.
 */
export function getCliSupportToolLabel(
  t: TFunction,
  toolId: CliToolId,
): string {
  switch (toolId) {
    case "claude":
      return t("cliSupportVerification:verifyDialog.tools.claude")
    case "codex":
      return t("cliSupportVerification:verifyDialog.tools.codex")
    case "gemini":
      return t("cliSupportVerification:verifyDialog.tools.gemini")
    default:
      return assertNever(toolId, `Unexpected CLI tool id: ${toolId}`)
  }
}

/**
 * Returns the localized summary text for a known CLI support summary key.
 */
export function translateCliSupportSummary(
  t: TFunction,
  summaryKey: string,
  summaryParams?: Record<string, unknown>,
): string | undefined {
  switch (summaryKey) {
    case "verifyDialog.summaries.supported":
      return t(
        "cliSupportVerification:verifyDialog.summaries.supported",
        summaryParams,
      )
    case "verifyDialog.summaries.supportedStreaming":
      return t(
        "cliSupportVerification:verifyDialog.summaries.supportedStreaming",
        summaryParams,
      )
    case "verifyDialog.summaries.noToolCallDetected":
      return t(
        "cliSupportVerification:verifyDialog.summaries.noToolCallDetected",
        summaryParams,
      )
    case "verifyDialog.summaries.stopped":
      return t(
        "cliSupportVerification:verifyDialog.summaries.stopped",
        summaryParams,
      )
    case "verifyDialog.summaries.toolCallSucceeded":
      return t(
        "cliSupportVerification:verifyDialog.summaries.toolCallSucceeded",
        summaryParams,
      )
    case "verifyDialog.summaries.unauthorized":
      return t(
        "cliSupportVerification:verifyDialog.summaries.unauthorized",
        summaryParams,
      )
    case "verifyDialog.summaries.forbidden":
      return t(
        "cliSupportVerification:verifyDialog.summaries.forbidden",
        summaryParams,
      )
    case "verifyDialog.summaries.endpointNotFound":
      return t(
        "cliSupportVerification:verifyDialog.summaries.endpointNotFound",
        summaryParams,
      )
    case "verifyDialog.summaries.httpError":
      return t(
        "cliSupportVerification:verifyDialog.summaries.httpError",
        summaryParams,
      )
    case "verifyDialog.summaries.invalidResponse":
      return t(
        "cliSupportVerification:verifyDialog.summaries.invalidResponse",
        summaryParams,
      )
    case "verifyDialog.summaries.networkError":
      return t(
        "cliSupportVerification:verifyDialog.summaries.networkError",
        summaryParams,
      )
    case "verifyDialog.summaries.unexpectedError":
      return t(
        "cliSupportVerification:verifyDialog.summaries.unexpectedError",
        summaryParams,
      )
    case "verifyDialog.summaries.noModelIdProvided":
      return t(
        "cliSupportVerification:verifyDialog.summaries.noModelIdProvided",
        summaryParams,
      )
    case "verifyDialog.summaries.unsupportedForApiType":
      return t(
        "cliSupportVerification:verifyDialog.summaries.unsupportedForApiType",
        summaryParams,
      )
    default:
      return undefined
  }
}
