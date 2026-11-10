import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { createAimlApiKeyEditor } from "~/services/apiAdapters/aimlapi/keyEditor"
import { AIMLAPI_KEY_EDITOR_FIELDS as fields } from "~/services/apiAdapters/aimlapi/keyResourceFields"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const request = {
  directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  baseUrl: "https://aimlapi.com",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "management" },
}
const create = () => createAimlApiKeyEditor({ request })

it.each([
  [fields.Name, "", "required"],
  [fields.Name, "a".repeat(256), "out_of_range"],
  [fields.Scopes, "model:chat", "invalid_value"],
  [fields.Scopes, ["unsupported"], "unsupported_option"],
  [fields.LimitMode, "invalid", "invalid_value"],
  [fields.ExpiresAt, 123, "invalid_value"],
  [fields.ExpiresAt, "not a date", "invalid_value"],
  [
    fields.AllowedModels,
    Array.from({ length: 1001 }, (_, i) => `model-${i}`),
    "out_of_range",
  ],
  [
    fields.AllowedTools,
    Array.from({ length: 1001 }, (_, i) => `tool-${i}`),
    "out_of_range",
  ],
] as const)(
  "validates %s without submitting an invalid native mutation",
  (field, value, code) => {
    const editor = create()
    expect(
      editor.validate({ ...editor.initialValues, [field]: value }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([{ fieldId: field, code }]),
    })
  },
)

it.each([0, -1, NaN, "5"])(
  "rejects invalid finite spending caps: %s",
  (amount) => {
    const editor = create()
    expect(
      editor.validate({
        ...editor.initialValues,
        [fields.LimitMode]: "limited",
        [fields.LimitAmount]: amount,
        [fields.LimitRetention]: "unknown",
      }),
    ).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        { fieldId: fields.LimitAmount, code: "out_of_range" },
        { fieldId: fields.LimitRetention, code: "unsupported_option" },
      ]),
    })
  },
)

it("normalizes comma/newline restrictions and preserves explicit scopes and expiry", () => {
  const editor = create()
  const values = {
    ...editor.initialValues,
    [fields.Name]: " key ",
    [fields.AllowedModels]: " model-a,\nmodel-b ",
    [fields.AllowedTools]: ["tool"],
    [fields.Scopes]: ["model:chat"],
    [fields.LimitMode]: "limited",
    [fields.LimitAmount]: 1.235,
    [fields.LimitRetention]: "day",
    [fields.ExpiresAt]: "2027-01-01",
  }
  expect(editor.validate(values)).toEqual({ valid: true })
  expect(editor.buildCommand(values)).toMatchObject({
    name: "key",
    allowedModels: ["model-a", "model-b"],
    allowedTools: ["tool"],
    limit: { thresholdUsd: 1.24, retention: "day" },
    expiresAt: "2027-01-01T00:00:00.000Z",
    scopes: ["model:chat"],
  })
})

it("retains selected model/tool restrictions absent from the public catalogue", async () => {
  const detail = {
    prefix: "abcdefgh",
    name: "Key",
    scopes: [],
    limit: null,
    allowedModels: ["retired"],
    allowedTools: ["private/tool"],
    expiresAt: null,
    disabled: true,
  } as never
  const editor = createAimlApiKeyEditor({ request, detail })
  server.use(
    http.get("https://api.aimlapi.com/v1/models", () =>
      HttpResponse.json({
        data: [
          { id: "new", info: { name: "New", developer: "Vendor" } },
          { id: "same", info: { name: "same", developer: "Vendor" } },
        ],
      }),
    ),
    http.get("https://tools.aimlapi.com/v1/tools", () =>
      HttpResponse.json({ data: [{ id: "web/search", name: "Search" }] }),
    ),
  )
  expect(
    await editor.loadOptions!(fields.AllowedModels, editor.initialValues),
  ).toMatchObject([
    { value: "retired" },
    { value: "new", displayLabel: "New (new)" },
    { value: "same", displayLabel: "same" },
  ])
  expect(
    await editor.loadOptions!(fields.AllowedTools, editor.initialValues),
  ).toMatchObject([{ value: "private/tool" }, { value: "web/search" }])
  expect(await editor.loadOptions!(fields.Name, editor.initialValues)).toEqual(
    [],
  )
  expect(
    editor.validate({ ...editor.initialValues, [fields.Enabled]: "invalid" }),
  ).toMatchObject({
    valid: false,
    issues: [{ fieldId: fields.Enabled, code: "invalid_value" }],
  })
  expect(editor.buildCommand(editor.initialValues)).toMatchObject({
    disabled: true,
  })
  expect(editor.buildCommand(editor.initialValues)).not.toHaveProperty(
    "expiresAt",
  )
})
