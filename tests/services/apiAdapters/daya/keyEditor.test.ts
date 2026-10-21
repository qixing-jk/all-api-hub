import { describe, expect, it } from "vitest"

import { RESOURCE_SECRET_EDIT_INTENT_KINDS } from "~/services/apiAdapters/contracts/resourceNative"
import { createDayaKeyEditor } from "~/services/apiAdapters/daya/keyEditor"
import { DAYA_KEY_EDITOR_FIELDS } from "~/services/apiAdapters/daya/keyResourceFields"
import { DAYA_KEY_STATUSES } from "~/services/apiService/daya/constants"

const openai = {
  id: 2,
  name: "OpenAI",
  platform: "openai",
  rateMultiplier: 0.24,
  description: "OpenAI route description",
}
const claude = {
  id: 25,
  name: "Claude-VIP",
  platform: "anthropic",
  rateMultiplier: 1.8,
}

describe("Daya key editor", () => {
  it.each(["short", "invalid-key-with-space 123456"])(
    "rejects invalid custom secret %s",
    (customKey) => {
      const editor = createDayaKeyEditor({
        groups: [openai],
        defaultGroupIds: [2],
      })
      expect(
        editor.validate({
          ...editor.initialValues,
          customKey: {
            kind: RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
            value: customKey,
          },
        }),
      ).toEqual({
        valid: false,
        issues: [{ fieldId: "customKey", code: "invalid_value" }],
      })
    },
  )
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid window budget %s",
    (rateLimit5h) => {
      const editor = createDayaKeyEditor({
        groups: [openai],
        defaultGroupIds: [2],
      })
      expect(editor.validate({ ...editor.initialValues, rateLimit5h })).toEqual(
        {
          valid: false,
          issues: [{ fieldId: "rateLimit5h", code: "out_of_range" }],
        },
      )
    },
  )
  it.each([0, 0.001, -1, Number.NaN])(
    "rejects finite quota %s that cannot produce a positive USD limit",
    (quota) => {
      const editor = createDayaKeyEditor({ groups: [openai] })
      expect(
        editor.validate({
          ...editor.initialValues,
          [DAYA_KEY_EDITOR_FIELDS.Groups]: ["2"],
          [DAYA_KEY_EDITOR_FIELDS.Unlimited]: false,
          [DAYA_KEY_EDITOR_FIELDS.Quota]: quota,
        }),
      ).toEqual({
        valid: false,
        issues: [
          { fieldId: DAYA_KEY_EDITOR_FIELDS.Quota, code: "out_of_range" },
        ],
      })
    },
  )
  it("offers prepared routing descriptions and validates the same catalogue", () => {
    const editor = createDayaKeyEditor({
      groups: [openai, claude],
    })
    expect(
      editor.fields.find(
        (field) => field.fieldId === DAYA_KEY_EDITOR_FIELDS.Groups,
      ),
    ).toMatchObject({
      options: [
        {
          value: "2",
          displayLabel: "OpenAI",
          secondaryLabel: "×0.24",
          description: "OpenAI route description",
        },
        { value: "25", displayLabel: "Claude-VIP", secondaryLabel: "×1.8" },
      ],
    })
    expect(
      editor.validate({
        name: "disposable",
        allowFast: true,
        [DAYA_KEY_EDITOR_FIELDS.Groups]: ["2"],
        [DAYA_KEY_EDITOR_FIELDS.Unlimited]: true,
        [DAYA_KEY_EDITOR_FIELDS.Quota]: 0,
      }),
    ).toEqual({ valid: true })
  })

  it("rejects a group that the catalogue never offered", () => {
    const editor = createDayaKeyEditor({
      groups: [openai],
    })
    expect(
      editor.validate({
        name: "disposable",
        allowFast: true,
        [DAYA_KEY_EDITOR_FIELDS.Groups]: ["25"],
        [DAYA_KEY_EDITOR_FIELDS.Unlimited]: true,
        [DAYA_KEY_EDITOR_FIELDS.Quota]: 0,
      }),
    ).toEqual({
      valid: false,
      issues: [
        {
          fieldId: DAYA_KEY_EDITOR_FIELDS.Groups,
          code: "unsupported_option",
        },
      ],
    })
  })

  it("builds the create command with unlimited quota and day-based expiry", () => {
    const editor = createDayaKeyEditor({ groups: [openai] })
    expect(editor.fields).toContainEqual(
      expect.objectContaining({
        fieldId: DAYA_KEY_EDITOR_FIELDS.ExpiresInDays,
        type: "number",
      }),
    )
    expect(
      editor.buildCommand({
        name: "disposable",
        [DAYA_KEY_EDITOR_FIELDS.Groups]: ["2", "25"],
        [DAYA_KEY_EDITOR_FIELDS.Unlimited]: false,
        [DAYA_KEY_EDITOR_FIELDS.Quota]: 5,
        [DAYA_KEY_EDITOR_FIELDS.ExpiresInDays]: 30,
      }),
    ).toMatchObject({
      name: "disposable",
      groupIds: [2, 25],
      quotaUsd: 5,
      expiresInDays: 30,
    })
  })

  it("maps the edit command's enabled toggle to the native status", () => {
    const editor = createDayaKeyEditor({
      groups: [openai],
      detail: {
        name: "existing",
        groupIds: [2],
        status: DAYA_KEY_STATUSES.Active,
        quotaUsd: 0,
        expiresAt: null,
      },
    })
    expect(
      editor.buildCommand({
        name: "existing",
        [DAYA_KEY_EDITOR_FIELDS.Groups]: ["2"],
        [DAYA_KEY_EDITOR_FIELDS.Unlimited]: true,
        [DAYA_KEY_EDITOR_FIELDS.Quota]: 0,
        [DAYA_KEY_EDITOR_FIELDS.Enabled]: false,
        [DAYA_KEY_EDITOR_FIELDS.ExpiresAt]: null,
      }),
    ).toMatchObject({ status: "inactive", groupIds: [2], quotaUsd: 0 })
  })
})
