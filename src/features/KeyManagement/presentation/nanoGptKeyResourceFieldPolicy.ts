import type { TFunction } from "i18next"

import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import type { ResourceFieldPresentation } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { RESOURCE_FIELD_TYPES } from "~/services/apiAdapters/contracts/resourceNative"
import { NANOGPT_KEY_POLICIES as policies } from "~/services/apiService/nanogpt/constants"
import {
  NANOGPT_KEY_LIMIT_FIELDS,
  type NanoGptLimitField,
} from "~/services/apiService/nanogpt/management"

export const nanoGptKeyFieldLabels: Readonly<
  Record<NanoGptLimitField | "zdr_policy", (t: TFunction) => string>
> = {
  daily_rpd_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.dailyRequests"),
  daily_input_token_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.dailyTokens"),
  daily_usd_limit: (t) => t("keyManagement:native.editor.nanogpt.dailySpend"),
  weekly_usd_limit: (t) => t("keyManagement:native.editor.nanogpt.weeklySpend"),
  monthly_usd_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.monthlySpend"),
  weekly_request_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.weeklyRequests"),
  monthly_request_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.monthlyRequests"),
  weekly_input_token_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.weeklyTokens"),
  monthly_input_token_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.monthlyTokens"),
  daily_subscription_input_token_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.dailySubscriptionTokens"),
  weekly_subscription_input_token_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.weeklySubscriptionTokens"),
  monthly_subscription_input_token_limit: (t) =>
    t("keyManagement:native.editor.nanogpt.monthlySubscriptionTokens"),
  zdr_policy: (t) => t("keyManagement:native.editor.nanogpt.zdrPolicy"),
}

/** Maps documented NanoGPT key fields to the existing native editor sections. */
export function buildNanoGptKeyFields(
  name: ResourceFieldPresentation,
  expiry: ResourceFieldPresentation,
) {
  return {
    automaticName: { kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed } as const,
    fields: [
      name,
      expiry,
      ...NANOGPT_KEY_LIMIT_FIELDS.map(
        (fieldId, order): ResourceFieldPresentation => ({
          fieldId,
          section: "limits",
          order,
          renderer: RESOURCE_FIELD_TYPES.Number,
          resolveLabel: nanoGptKeyFieldLabels[fieldId],
          resolveHelp: (t) =>
            t("keyManagement:native.editor.nanogpt.limitHelp"),
          issueLabelResolvers: name.issueLabelResolvers,
        }),
      ),
      {
        fieldId: "zdr_policy",
        section: "advanced",
        order: 0,
        renderer: RESOURCE_FIELD_TYPES.Select,
        resolveLabel: nanoGptKeyFieldLabels.zdr_policy,
        optionLabelResolvers: {
          [policies.ZeroDataRetention]: (t: TFunction) =>
            t("keyManagement:native.editor.nanogpt.zdr"),
          [policies.Off]: (t: TFunction) =>
            t("keyManagement:native.editor.nanogpt.anonymized"),
          [policies.Unset]: (t: TFunction) =>
            t("keyManagement:native.editor.nanogpt.legacyPolicy"),
        },
        issueLabelResolvers: name.issueLabelResolvers,
      } satisfies ResourceFieldPresentation,
    ],
  }
}
