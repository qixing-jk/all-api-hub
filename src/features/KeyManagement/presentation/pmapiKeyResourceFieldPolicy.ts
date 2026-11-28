import type { TFunction } from "i18next"

import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import { PMAPI_KEY_EDITOR_FIELDS as pmFields } from "~/services/apiAdapters/pmapi/keyResourceFields"

import type { AccountKeyResourceFieldConfiguration } from "./accountKeyResourceEditorPresentation"
import {
  expiryField,
  group,
  ips,
  issues,
  models,
  name,
  quota,
} from "./nativeKeyResourceFieldPrimitives"

// PM-API tokens cap spending in the console quota unit and expose group/IP settings.
export const buildPmapiFields = (): AccountKeyResourceFieldConfiguration => ({
  requireFreshOptions: true,
  automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
  fields: [
    name,
    group(pmFields.Group, false, true),
    ...quota(pmFields.Quota, pmFields.Unlimited, true),
    {
      fieldId: pmFields.Rpm,
      section: "spending",
      order: 20,
      renderer: RESOURCE_FIELD_TYPES.Number,
      resolveLabel: (t: TFunction) =>
        t("keyManagement:native.editor.pmapi.rpm"),
      resolveHelp: (t: TFunction) =>
        t("keyManagement:native.editor.pmapi.rpmHelp"),
      issueLabelResolvers: issues,
    },
    expiryField(pmFields.ExpiresAt),
    // Lifecycle is a row action (rotate / enable / disable); the dialog
    // mirrors the console edit form, which never carries a status field.
    models(pmFields.Models),
    ips(pmFields.Subnet),
  ],
})
