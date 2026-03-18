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
