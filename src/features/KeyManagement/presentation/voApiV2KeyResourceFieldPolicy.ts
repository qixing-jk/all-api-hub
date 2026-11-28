import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  enabled,
  expiry,
  group,
  groupNamePolicy,
  issues,
  name,
  quota,
} from "./nativeKeyResourceFieldPrimitives"

export const buildVoApiV2Fields = (): AccountKeyResourceFieldConfiguration => ({
  automaticName: groupNamePolicy("groups", true),
  fields: [
    name,
    group("groups", true),
    ...quota("amount", "boundlessAmount"),
    expiry,
    enabled("enable"),
    {
      fieldId: "note",
      section: "advanced",
      order: 30,
      renderer: RESOURCE_FIELD_TYPES.Textarea,
      resolveLabel: (t) => t("keyManagement:keyDetails.note"),
      issueLabelResolvers: issues,
    },
  ],
})
