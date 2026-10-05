import { createInstance, type TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getNativeKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/nativeKeyResourceFieldPolicy"
import keyManagement from "~/locales/en/keyManagement.json"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import {
  LAOZHANG_BILLING_TYPES as billing,
  LAOZHANG_AUTO_GROUP,
  LAOZHANG_KEY_FIELD_IDS as laoZhangFields,
  LAOZHANG_RETRY_BILLING_MODES as retryBilling,
} from "~/services/apiAdapters/newApi/laozhangKeyResourceFields"
import { defaultKeyManagementImplementation } from "~/services/apiService/newApiFamily/default/keyManagement"
import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { AuthTypeEnum } from "~/types"

const request = {
  baseUrl: "https://api2.laozhang.ai",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test" },
}
const transport = {
  ...defaultKeyManagementImplementation,
  fetchTokenById: vi.fn(),
  fetchUserGroups: vi.fn().mockResolvedValue({ primary: {}, backup: {} }),
  fetchAccountAvailableModels: vi.fn(),
}
const editor = () =>
  createNewApiKeyEditor(SITE_TYPES.LAOZHANG, request, transport)

describe("LaoZhang native key settings", () => {
  it("retains native settings and translation credentials when only the name changes", () => {
    const token = {
      name: "old",
      remain_quota: 0,
      expired_time: -1,
      unlimited_quota: true,
      model_limits: "gpt-test",
      model_limits_enabled: true,
      allow_ips: "203.0.113.1",
      group: "primary",
      [laoZhangFields.BillingType]: 5,
      [laoZhangFields.FallbackGroups]: "backup,second",
      [laoZhangFields.Remark]: "keep",
      [laoZhangFields.Subnet]: "preserved",
      [laoZhangFields.RateLimitDuration]: 60,
      [laoZhangFields.RateLimitNum]: 8,
      [laoZhangFields.RateLimitMessage]: "wait",
      [laoZhangFields.RetryBilling]: null,
      [laoZhangFields.ActivateOnFirstUse]: true,
      [laoZhangFields.ValidDuration]: 7,
      [laoZhangFields.DiscordProxyUrl]: "https://proxy.example",
      [laoZhangFields.TranslationEnabled]: true,
      [laoZhangFields.TranslationBaseUrl]: "https://translate.example",
      [laoZhangFields.TranslationModel]: "gpt-test",
      [laoZhangFields.TranslationApiKey]: "saved-translation-secret",
      [laoZhangFields.Advertisement]: "admin-owned",
      [laoZhangFields.AdPosition]: 2,
    } as unknown as NewApiToken
    const definition = createNewApiKeyEditor(
      SITE_TYPES.LAOZHANG,
      request,
      transport,
      token,
    )
    expect(definition.initialValues[laoZhangFields.TranslationApiKey]).toEqual({
      kind: "unchanged",
    })
    expect(JSON.stringify(definition.initialValues)).not.toContain(
      "saved-translation-secret",
    )
    expect(definition.validate(definition.initialValues)).toEqual({
      valid: true,
    })
    const command = definition.buildCommand({
      ...definition.initialValues,
      name: "renamed",
    })
    expect(command.values).toMatchObject({ ...token, name: "renamed" })
  })

  it("clears disabled limits and auto-group fallbacks, keeping MJ settings until explicitly cleared", () => {
    const definition = editor()
    const command = definition.buildCommand({
      ...definition.initialValues,
      group: LAOZHANG_AUTO_GROUP,
      [laoZhangFields.FallbackGroups]: ["backup"],
      [laoZhangFields.RateLimitEnabled]: false,
      [laoZhangFields.RateLimitDuration]: 60,
      [laoZhangFields.RateLimitNum]: 10,
      [laoZhangFields.RateLimitMessage]: "hidden",
      [laoZhangFields.TranslationApiKey]: { kind: "clear" },
    })
    expect(command.values).toMatchObject({
      [laoZhangFields.FallbackGroups]: "",
      [laoZhangFields.RateLimitDuration]: 0,
      [laoZhangFields.RateLimitNum]: 0,
      [laoZhangFields.RateLimitMessage]: "",
      [laoZhangFields.TranslationApiKey]: "",
    })
  })

  it("rejects invalid native selections, ranges and incomplete MJ configuration", () => {
    const definition = editor()
    const result = definition.validate({
      ...definition.initialValues,
      [laoZhangFields.BillingType]: "8",
      [laoZhangFields.FallbackGroups]: ["primary"],
      group: "primary",
      [laoZhangFields.RateLimitEnabled]: true,
      [laoZhangFields.RateLimitDuration]: 18001,
      [laoZhangFields.RateLimitNum]: -1,
      [laoZhangFields.ValidDuration]: 0.5,
      [laoZhangFields.TranslationEnabled]: true,
      [laoZhangFields.RetryBilling]: "bad",
    })
    expect(result).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: laoZhangFields.BillingType, code: "unsupported_option" },
        { fieldId: laoZhangFields.FallbackGroups, code: "invalid_value" },
        { fieldId: laoZhangFields.RateLimitDuration, code: "out_of_range" },
        { fieldId: laoZhangFields.RateLimitNum, code: "out_of_range" },
        { fieldId: laoZhangFields.ValidDuration, code: "out_of_range" },
        { fieldId: laoZhangFields.TranslationApiKey, code: "required" },
        { fieldId: laoZhangFields.TranslationBaseUrl, code: "required" },
        { fieldId: laoZhangFields.TranslationModel, code: "required" },
      ]),
    })
  })

  it("loads fallback groups excluding the primary group with the operation signal", async () => {
    const definition = editor()
    const signal = new AbortController().signal
    await expect(
      definition.loadOptions?.(
        laoZhangFields.FallbackGroups,
        { ...definition.initialValues, group: "primary" },
        { signal },
      ),
    ).resolves.toEqual([
      { value: "backup", displayLabel: "backup", secondaryLabel: undefined },
    ])
    expect(transport.fetchUserGroups).toHaveBeenLastCalledWith({
      ...request,
      abortSignal: signal,
    })
    await expect(
      definition.loadOptions?.(laoZhangFields.FallbackGroups, {
        ...definition.initialValues,
        group: LAOZHANG_AUTO_GROUP,
      }),
    ).resolves.toEqual([])
  })
  it("exposes and presents every ordinary-account native editing field", async () => {
    const definition = editor()
    const required = [
      laoZhangFields.BillingType,
      laoZhangFields.FallbackGroups,
      laoZhangFields.Remark,
      laoZhangFields.ActivateOnFirstUse,
      laoZhangFields.ValidDuration,
      laoZhangFields.RateLimitEnabled,
      laoZhangFields.RateLimitDuration,
      laoZhangFields.RateLimitNum,
      laoZhangFields.RateLimitMessage,
      laoZhangFields.RetryBilling,
      laoZhangFields.DiscordProxyUrl,
      laoZhangFields.TranslationEnabled,
      laoZhangFields.TranslationBaseUrl,
      laoZhangFields.TranslationApiKey,
      laoZhangFields.TranslationModel,
    ]
    expect(definition.fields.map((field) => field.fieldId)).toEqual(
      expect.arrayContaining(required),
    )
    const presentation = getNativeKeyResourceEditorPresentation(
      SITE_TYPES.LAOZHANG,
      "edit",
      {
        describedFieldIds: definition.fields.map((field) => field.fieldId),
      },
    )
    expect(presentation.policy.fields.map((field) => field.fieldId)).toEqual(
      expect.arrayContaining(required),
    )
    expect(
      new Set(presentation.policy.fields.map((field) => field.fieldId)),
    ).toEqual(new Set(definition.fields.map((field) => field.fieldId)))
    const i18n = createInstance()
    await i18n.init({
      lng: "en",
      resources: { en: { keyManagement } },
    })
    const resolveKey = ((key: string) => key) as TFunction
    for (const field of presentation.policy.fields.filter((item) =>
      required.includes(item.fieldId as (typeof required)[number]),
    )) {
      const keys = [
        field.resolveLabel(resolveKey),
        ...Object.values(field.optionLabelResolvers ?? {}).map((resolve) =>
          resolve(resolveKey),
        ),
      ]
      for (const key of keys) expect(i18n.exists(key), key).toBe(true)
    }
  })

  it("converts native selections and limits into the provider write contract", () => {
    const definition = editor()
    const values = {
      ...definition.initialValues,
      [laoZhangFields.BillingType]: billing.Request,
      group: "primary",
      [laoZhangFields.FallbackGroups]: ["backup"],
      [laoZhangFields.Remark]: "note",
      [laoZhangFields.RateLimitEnabled]: true,
      [laoZhangFields.RateLimitDuration]: 60,
      [laoZhangFields.RateLimitNum]: 12,
      [laoZhangFields.RateLimitMessage]: "slow down",
      [laoZhangFields.RetryBilling]: retryBilling.Off,
      [laoZhangFields.ActivateOnFirstUse]: true,
      [laoZhangFields.ValidDuration]: 7,
    }
    expect(definition.validate(values)).toEqual({ valid: true })
    expect(definition.buildCommand(values).values).toMatchObject({
      billing_type: 2,
      fallback_groups: "backup",
      remark: "note",
      rate_limit_duration: 60,
      rate_limit_num: 12,
      rate_limit_exceeded_message: "slow down",
      retry_keep_billing_type_enabled: false,
      activate_on_first_use: true,
      valid_duration: 7,
    })
    expect(definition.buildCommand(values).values).not.toHaveProperty(
      laoZhangFields.RateLimitEnabled,
    )
  })
})
