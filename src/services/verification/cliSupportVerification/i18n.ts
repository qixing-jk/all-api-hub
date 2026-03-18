import type { TFunction } from "i18next"

import type { CliToolId } from "./types"

/**
 * Returns the localized label for a supported CLI simulation tool.
 */
export function getCliSupportToolLabel(t: TFunction, toolId: CliToolId) {
  switch (toolId) {
    case "claude":
      return t("cliSupportVerification:verifyDialog.tools.claude")
    case "codex":
      return t("cliSupportVerification:verifyDialog.tools.codex")
    case "gemini":
      return t("cliSupportVerification:verifyDialog.tools.gemini")
  }
}
