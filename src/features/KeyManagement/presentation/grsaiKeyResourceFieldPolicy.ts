import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import { expiry, name, quotaField } from "./nativeKeyResourceFieldPrimitives"

/**
 * Grsai keys are a name, a remaining credit budget and an optional expiry; the
 * console prices everything in its own credits rather than in currency.
 */
export const buildGrsaiFields = (): AccountKeyResourceFieldConfiguration => ({
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
  fields: [
    name,
    ...quotaField(
      "credits",
      "unlimited_credits",
      (t) => t("keyManagement:native.editor.quotaCredits"),
      (t) => t("keyManagement:native.editor.quotaCreditsHelp"),
      (t) => t("keyManagement:native.editor.quotaCredits"),
    ),
    expiry,
  ],
})
