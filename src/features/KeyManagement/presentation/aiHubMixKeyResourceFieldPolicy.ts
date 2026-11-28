import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  expiry,
  issues,
  models,
  name,
  quota,
} from "./nativeKeyResourceFieldPrimitives"

export const buildAiHubMixFields =
  (): AccountKeyResourceFieldConfiguration => ({
    automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed },
    fields: [
      name,
      ...quota("quotaUsd", "unlimited_quota"),
      expiry,
      models("models"),
      {
        fieldId: "subnet",
        section: "advanced",
        order: 20,
        renderer: RESOURCE_FIELD_TYPES.Textarea,
        resolveLabel: (t) => t("keyManagement:dialog.subnetLimits"),
        resolvePlaceholder: (t) => t("keyManagement:dialog.subnetPlaceholder"),
        issueLabelResolvers: issues,
      },
    ],
  })
