import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createAIHubMixKeyEditor } from "~/services/apiAdapters/aihubmix/keyResourceEditor"
import type { EditableResourceProjection } from "~/services/apiAdapters/contracts/resourceNative"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { createSub2ApiKeyEditor } from "~/services/apiAdapters/sub2api/keyResourceEditor"
import { createVoApiV2KeyEditor } from "~/services/apiAdapters/voapiV2/keyResourceEditor"
import { defaultKeyManagementImplementation } from "~/services/apiService/newApiFamily/default/keyManagement"
import { AuthTypeEnum } from "~/types"

const request = {
  baseUrl: "https://example.invalid",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test" },
}
const transport = {
  ...defaultKeyManagementImplementation,
  fetchTokenById: vi.fn(),
  fetchUserGroups: vi.fn(),
  fetchAccountAvailableModels: vi.fn(),
}
const editors: Array<{
  name: string
  editor: () => Pick<
    ReturnType<typeof createAIHubMixKeyEditor>,
    "initialValues" | "validate"
  >
  valid: EditableResourceProjection
  fields: Record<string, string>
}> = [
  {
    name: "AIHubMix",
    editor: () => createAIHubMixKeyEditor(request),
    valid: {},
    fields: {
      name: "required",
      unlimited_quota: "invalid_value",
      models: "invalid_value",
      subnet: "invalid_value",
      expires_at: "invalid_value",
    },
  },
  {
    name: "New API",
    editor: () => createNewApiKeyEditor(SITE_TYPES.NEW_API, request, transport),
    valid: {},
    fields: {
      name: "required",
      unlimited_quota: "invalid_value",
      model_limits_enabled: "invalid_value",
      model_limits: "invalid_value",
      allow_ips: "invalid_value",
      group: "required",
      expires_at: "invalid_value",
    },
  },
  {
    name: "Sub2API",
    editor: () => createSub2ApiKeyEditor(request),
    valid: {},
    fields: {
      name: "required",
      unlimited: "invalid_value",
      group_id: "invalid_value",
      ip_whitelist: "invalid_value",
      expires_in_days: "out_of_range",
    },
  },
  {
    name: "VoAPI",
    editor: () => createVoApiV2KeyEditor(request),
    valid: { groups: ["1"], amount: 1 },
    fields: {
      name: "required",
      groups: "required",
      boundlessAmount: "invalid_value",
      enable: "invalid_value",
      note: "invalid_value",
      expires_at: "invalid_value",
    },
  },
]

describe.each(editors)(
  "$name native editor validation",
  ({ editor: create, valid, fields }) => {
    it("accepts its supported input and reports the precise invalid field", () => {
      const editor = create()
      const values = { ...editor.initialValues, ...valid }
      expect(editor.validate(values)).toEqual({ valid: true })
      for (const [fieldId, code] of Object.entries(fields)) {
        expect(
          editor.validate({
            ...values,
            [fieldId]: fieldId === "expires_in_days" ? -1 : 42,
          }),
        ).toMatchObject({
          valid: false,
          issues: expect.arrayContaining([{ fieldId, code }]),
        })
      }
      expect(editor.validate({ ...values, name: "  " })).toMatchObject({
        valid: false,
        issues: expect.arrayContaining([{ fieldId: "name", code: "required" }]),
      })
    })
  },
)

it.each([NaN, Infinity, -1, "1", Number.MAX_VALUE])(
  "rejects invalid limited dollar quota %s",
  (quotaUsd) => {
    for (const editor of [
      createAIHubMixKeyEditor(request),
      createNewApiKeyEditor(SITE_TYPES.NEW_API, request, transport),
    ]) {
      expect(
        editor.validate({
          ...editor.initialValues,
          unlimited_quota: false,
          quotaUsd,
        }),
      ).toMatchObject({
        valid: false,
        issues: expect.arrayContaining([
          { fieldId: "quotaUsd", code: "out_of_range" },
        ]),
      })
    }
  },
)

it.each([NaN, Infinity, -1, "1", 0])(
  "rejects nonpositive Sub2API quota %s",
  (quota) => {
    const editor = createSub2ApiKeyEditor(request)
    expect(
      editor.validate({ ...editor.initialValues, unlimited: false, quota }),
    ).toMatchObject({
      valid: false,
      issues: [{ fieldId: "quota", code: "out_of_range" }],
    })
  },
)

it.each([NaN, Infinity, -1, "1", 0])(
  "rejects invalid initial VoAPI amount %s",
  (amount) => {
    const editor = createVoApiV2KeyEditor(request)
    expect(
      editor.validate({ ...editor.initialValues, groups: ["1"], amount }),
    ).toMatchObject({
      valid: false,
      issues: [{ fieldId: "amount", code: "out_of_range" }],
    })
  },
)

it.each(["0", "01", "9007199254740992"])(
  "rejects noncanonical group ID %s",
  (id) => {
    const sub = createSub2ApiKeyEditor(request)
    expect(sub.validate({ ...sub.initialValues, group_id: id })).toMatchObject({
      valid: false,
      issues: [{ fieldId: "group_id", code: "invalid_value" }],
    })
    const vo = createVoApiV2KeyEditor(request)
    expect(
      vo.validate({ ...vo.initialValues, groups: [id], boundlessAmount: true }),
    ).toMatchObject({
      valid: false,
      issues: [{ fieldId: "groups", code: "required" }],
    })
  },
)

it("rejects malformed dates and model arrays", () => {
  for (const [editor, models] of [
    [createAIHubMixKeyEditor(request), "models"],
    [
      createNewApiKeyEditor(SITE_TYPES.NEW_API, request, transport),
      "model_limits",
    ],
  ] as const) {
    expect(
      editor.validate({
        ...editor.initialValues,
        expires_at: "not-a-date",
        [models]: [1] as unknown as string[],
      }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: "expires_at", code: "invalid_value" },
        { fieldId: models, code: "invalid_value" },
      ]),
    })
  }
})

it("keeps Sub2API edit expiry and status typed and preserves disabled state until enabled", () => {
  const editor = createSub2ApiKeyEditor(request, {
    id: 1,
    name: "Key",
    status: 2,
    key: "sk-test",
    quota: 2,
    group_id: 3,
    group_name: "VIP",
    expires_at: "2030-01-01T00:00:00Z",
    ip_whitelist: "192.0.2.1, 192.0.2.2",
  })
  expect(editor.initialValues).toMatchObject({
    enabled: false,
    group_id: "3",
    ip_whitelist: "192.0.2.1\n192.0.2.2",
  })
  expect(
    editor.validate({
      ...editor.initialValues,
      enabled: "yes",
      expires_at: "bad",
    }),
  ).toMatchObject({
    valid: false,
    issues: expect.arrayContaining([
      { fieldId: "enabled", code: "invalid_value" },
      { fieldId: "expires_at", code: "invalid_value" },
    ]),
  })
  expect(
    editor.buildCommand({ ...editor.initialValues, enabled: true }),
  ).toMatchObject({
    values: {
      status: "active",
      expires_at: "2030-01-01T00:00:00.000Z",
      quota: 2,
    },
  })
})
