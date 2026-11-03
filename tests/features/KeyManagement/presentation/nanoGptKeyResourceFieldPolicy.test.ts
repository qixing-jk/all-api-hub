import type { TFunction } from "i18next"
import { expect, it } from "vitest"

import { ACCOUNT_KEY_RESOURCE_EDITOR_MODES as modes } from "~/features/KeyManagement/constants"
import { getNativeKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/nativeKeyResourceFieldPolicy"
import { resolveResourceFieldPolicy } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { nanoGptKeyEditor } from "~/services/apiAdapters/nanogpt/keyEditor"

it.each([modes.Create, modes.Edit])(
  "renders NanoGPT limits and privacy choices in %s",
  (mode) => {
    const editor = nanoGptKeyEditor()
    const presentation = getNativeKeyResourceEditorPresentation(
      "nanogpt",
      mode,
      { fields: editor.fields },
    )
    expect(() =>
      resolveResourceFieldPolicy(
        editor.fields,
        presentation.policy,
        presentation.sectionOrder,
      ),
    ).not.toThrow()
    const t = ((key: string) => key) as TFunction
    const limits = presentation.policy.fields.filter(
      (field) => field.section === "limits",
    )
    expect(limits).toHaveLength(12)
    expect(
      Object.fromEntries(
        limits.map((field) => [field.fieldId, field.resolveLabel(t)]),
      ),
    ).toEqual({
      daily_rpd_limit: "keyManagement:native.editor.nanogpt.dailyRequests",
      daily_input_token_limit:
        "keyManagement:native.editor.nanogpt.dailyTokens",
      daily_usd_limit: "keyManagement:native.editor.nanogpt.dailySpend",
      weekly_usd_limit: "keyManagement:native.editor.nanogpt.weeklySpend",
      monthly_usd_limit: "keyManagement:native.editor.nanogpt.monthlySpend",
      weekly_request_limit:
        "keyManagement:native.editor.nanogpt.weeklyRequests",
      monthly_request_limit:
        "keyManagement:native.editor.nanogpt.monthlyRequests",
      weekly_input_token_limit:
        "keyManagement:native.editor.nanogpt.weeklyTokens",
      monthly_input_token_limit:
        "keyManagement:native.editor.nanogpt.monthlyTokens",
      daily_subscription_input_token_limit:
        "keyManagement:native.editor.nanogpt.dailySubscriptionTokens",
      weekly_subscription_input_token_limit:
        "keyManagement:native.editor.nanogpt.weeklySubscriptionTokens",
      monthly_subscription_input_token_limit:
        "keyManagement:native.editor.nanogpt.monthlySubscriptionTokens",
    })
    for (const field of limits) {
      expect(field.resolveHelp?.(t)).toBe(
        "keyManagement:native.editor.nanogpt.limitHelp",
      )
    }
    const privacy = presentation.policy.fields.find(
      (field) => field.fieldId === "zdr_policy",
    )!
    expect(privacy.resolveLabel(t)).toBe(
      "keyManagement:native.editor.nanogpt.zdrPolicy",
    )
    expect(
      Object.values(privacy.optionLabelResolvers!).map((resolve) => resolve(t)),
    ).toEqual([
      "keyManagement:native.editor.nanogpt.zdr",
      "keyManagement:native.editor.nanogpt.anonymized",
      "keyManagement:native.editor.nanogpt.legacyPolicy",
    ])
  },
)
