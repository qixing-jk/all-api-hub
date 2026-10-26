import { describe, expect, it } from "vitest"

import { RESOURCE_FIELD_ISSUE_CODES as codes } from "~/services/apiAdapters/contracts/resourceNative"
import { createPmApiKeyEditor } from "~/services/apiAdapters/pmapi/keyEditor"
import { PMAPI_KEY_EDITOR_FIELDS as f } from "~/services/apiAdapters/pmapi/keyResourceFields"

const editor = () =>
  createPmApiKeyEditor({
    groups: [{ name: "Free", ratio: 0 }],
    models: ["model-a"],
  })
describe("PM-API native key form validation", () => {
  it.each([
    [f.Name, 3, codes.InvalidValue],
    [f.Group, 3, codes.InvalidValue],
    [f.Group, "unknown", codes.UnsupportedOption],
    [f.Unlimited, "yes", codes.InvalidValue],
    [f.ExpiresAt, 123, codes.InvalidValue],
    [f.Models, "model-a", codes.UnsupportedOption],
    [f.Models, ["unknown"], codes.UnsupportedOption],
    [f.Subnet, 3, codes.InvalidValue],
    [f.Rpm, -1, codes.OutOfRange],
    [f.Rpm, 0.5, codes.OutOfRange],
  ])("rejects invalid %s input %j", (field, value, code) => {
    const form = editor()
    expect(
      form.validate({ ...form.initialValues, [f.Quota]: 1, [field]: value }),
    ).toEqual({
      valid: false,
      issues: [{ fieldId: field, code }],
    })
  })
  it("rejects a bounded quota rounding to zero", () => {
    const form = editor()
    expect(
      form.validate({
        ...form.initialValues,
        [f.Unlimited]: false,
        [f.Quota]: 0,
      }),
    ).toEqual({
      valid: false,
      issues: [{ fieldId: f.Quota, code: codes.OutOfRange }],
    })
  })
  it("preserves fractional dollar budgets, expiry, models and network restrictions", () => {
    const form = editor()
    const values = {
      ...form.initialValues,
      [f.Name]: null,
      [f.Group]: "Free",
      [f.Unlimited]: false,
      [f.Quota]: 0.5,
      [f.ExpiresAt]: "2030-01-01T00:00:00Z",
      [f.Models]: ["model-a"],
      [f.Subnet]: " 1.2.3.4 , ::1 ",
      [f.Rpm]: 7,
    }
    expect(form.validate(values)).toEqual({ valid: true })
    expect(form.buildCommand(values)).toEqual({
      name: "",
      grp: "Free",
      unlimited: false,
      remainQuota: 250000,
      expiredAt: 1893456000,
      models: "model-a",
      subnet: "1.2.3.4,::1",
      rpm: 7,
    })
  })
  it("normalizes omitted optional restrictions to safe defaults", () => {
    const form = editor()
    const { [f.Models]: _models, [f.Rpm]: _rpm, ...values } = form.initialValues
    expect(form.buildCommand(values)).toMatchObject({
      models: "",
      rpm: 0,
      expiredAt: -1,
    })
  })
})
