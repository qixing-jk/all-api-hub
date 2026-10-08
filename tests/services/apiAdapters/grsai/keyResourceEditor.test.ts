import { describe, expect, it } from "vitest"

import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/keys/accountKeyNames"
import {
  createGrsaiKeyEditor,
  GRSAI_KEY_FIELD_IDS as field,
  toGrsaiExpireTime,
  toGrsaiKeySnapshot,
} from "~/services/apiAdapters/grsai/keyResourceEditor"
import type { GrsaiApiKey } from "~/services/apiService/grsai/type"

const key = (overrides: Partial<GrsaiApiKey> = {}): GrsaiApiKey => ({
  id: "6abac34421d04b1bfcf0a911",
  key: "sk-d795321b9d32446a9c161bb5a9988aee",
  name: "Example key",
  credits: 0,
  type: 0,
  expireTime: 0,
  ...overrides,
})

describe("grsai key editor", () => {
  it("preserves stored credits when renaming an unlimited key", () => {
    const editor = createGrsaiKeyEditor({ key: key({ credits: 500 }) })
    const command = editor.buildCommand({
      ...editor.initialValues,
      [field.Name]: "Renamed",
    })
    expect(command.values.credits).toBe(500)
    expect(command.values.name).toBe("Renamed")
  })
  it("defaults a new key to an unlimited, named credential", () => {
    const editor = createGrsaiKeyEditor({})

    expect(editor.initialValues).toEqual({
      [field.Name]: DEFAULT_AUTO_PROVISION_KEY_NAME,
      [field.Unlimited]: true,
      [field.Credits]: 0,
      [field.ExpiresAt]: "",
    })
  })

  it("uses the caller's name hint when one is supplied", () => {
    const editor = createGrsaiKeyEditor({ intent: { nameHint: "  Claude  " } })

    expect(editor.initialValues[field.Name]).toBe("Claude")
  })

  it("requires a name", () => {
    const editor = createGrsaiKeyEditor({})

    expect(
      editor.validate({ ...editor.initialValues, [field.Name]: "   " }),
    ).toEqual({
      valid: false,
      issues: [{ fieldId: field.Name, code: "required" }],
    })
  })

  it("rejects a negative budget but allows an exhausted one", () => {
    const editor = createGrsaiKeyEditor({})
    const limited = {
      ...editor.initialValues,
      [field.Unlimited]: false,
    }

    expect(editor.validate({ ...limited, [field.Credits]: -1 })).toEqual({
      valid: false,
      issues: [{ fieldId: field.Credits, code: "out_of_range" }],
    })
    // A limited key that spent its whole budget reports zero and must stay
    // editable, so the bound is inclusive.
    expect(editor.validate({ ...limited, [field.Credits]: 0 })).toEqual({
      valid: true,
    })
  })

  it("ignores the budget while the key is unlimited", () => {
    const editor = createGrsaiKeyEditor({})

    expect(editor.validate(editor.initialValues)).toEqual({ valid: true })
  })

  it("rejects an unparseable expiry", () => {
    const editor = createGrsaiKeyEditor({})

    expect(
      editor.validate({
        ...editor.initialValues,
        [field.ExpiresAt]: "tomorrow",
      }),
    ).toEqual({
      valid: false,
      issues: [{ fieldId: field.ExpiresAt, code: "invalid_value" }],
    })
  })

  it("maps an unlimited form value to the unlimited wire type", () => {
    const editor = createGrsaiKeyEditor({})
    const command = editor.buildCommand({
      ...editor.initialValues,
      [field.Name]: "  Fresh key  ",
      [field.Credits]: 999,
    })

    expect(command.values).toEqual({
      name: "Fresh key",
      unlimited: true,
      // A new unlimited key keeps its initial budget; hidden edits are ignored.
      credits: 0,
      expiresAt: null,
    })
  })

  it("maps a limited form value with an expiry to wire values", () => {
    const editor = createGrsaiKeyEditor({})
    const command = editor.buildCommand({
      ...editor.initialValues,
      [field.Unlimited]: false,
      [field.Credits]: 250,
      [field.ExpiresAt]: "2027-01-01T00:00:00.000Z",
    })

    expect(command.values).toEqual({
      name: DEFAULT_AUTO_PROVISION_KEY_NAME,
      unlimited: false,
      credits: 250,
      expiresAt: "2027-01-01T00:00:00.000Z",
    })
  })

  it("reads an existing key's snapshot back into the form", () => {
    const editor = createGrsaiKeyEditor({
      key: key({
        name: "Budgeted",
        type: 1,
        credits: 250,
        expireTime: 1_798_761_600,
      }),
    })

    expect(editor.initialValues).toEqual({
      [field.Name]: "Budgeted",
      [field.Unlimited]: false,
      [field.Credits]: 250,
      [field.ExpiresAt]: "2027-01-01T00:00:00.000Z",
    })
  })

  it("treats a key without expiry metadata as never expiring", () => {
    expect(
      toGrsaiKeySnapshot(key({ expireTime: undefined })).expiresAt,
    ).toBeNull()
    expect(toGrsaiKeySnapshot(key()).unlimited).toBe(true)
  })

  it("converts expiries to the deployment's unix seconds", () => {
    expect(toGrsaiExpireTime("2027-01-01T00:00:00.000Z")).toBe(1_798_761_600)
    // Clearing the field is how the console expresses "never expires".
    expect(toGrsaiExpireTime(null)).toBe(0)
    expect(toGrsaiExpireTime("")).toBe(0)
  })
})
