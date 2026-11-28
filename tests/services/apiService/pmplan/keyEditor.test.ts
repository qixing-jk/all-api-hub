import { afterEach, expect, it, vi } from "vitest"

import { createPmplanKeyEditor } from "~/services/apiAdapters/pmplan/keyEditor"
import {
  PMPLAN_KEY_EXPIRY_PRESETS as expiry,
  PMPLAN_KEY_EDITOR_FIELDS as fields,
} from "~/services/apiAdapters/pmplan/keyResourceFields"

afterEach(() => vi.useRealTimers())
it("defaults to never expiring and dynamically all models", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-03T00:00:00Z"))
  const editor = createPmplanKeyEditor(["model-a"])
  expect(editor.initialValues.expiry).toBe("never")
  expect(editor.validate(editor.initialValues)).toEqual({ valid: true })
  expect(editor.buildCommand(editor.initialValues)).toEqual({
    expires_at: null,
    models: [],
  })
  expect(editor.fields.map((field) => field.fieldId)).toEqual([
    "expiry",
    "expiresAt",
    "models",
  ])
  expect(
    editor.fields.find((field) => field.fieldId === fields.ExpiresAt),
  ).toMatchObject({ nullable: false })
  expect(
    editor.validate({ ...editor.initialValues, models: ["other"] }),
  ).toMatchObject({ valid: false })
})

it("supports native expiry presets without requiring a custom date", () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-11-03T00:00:00Z"))
  const editor = createPmplanKeyEditor([])
  expect(
    editor.buildCommand({ ...editor.initialValues, expiry: expiry.SevenDays }),
  ).toMatchObject({ expires_at: "2026-11-10T00:00:00.000Z" })
  expect(
    editor.buildCommand({ ...editor.initialValues, expiry: expiry.Never }),
  ).toMatchObject({ expires_at: null })
  expect(
    editor.validate({
      ...editor.initialValues,
      expiry: expiry.Custom,
      expiresAt: null,
    }),
  ).toMatchObject({ valid: false })
})

it("rejects unknown expiry presets before building a native request", () => {
  const editor = createPmplanKeyEditor([])
  expect(
    editor.validate({ ...editor.initialValues, expiry: "bad" }),
  ).toMatchObject({
    valid: false,
    issues: [{ fieldId: "expiry", code: "unsupported_option" }],
  })
})
