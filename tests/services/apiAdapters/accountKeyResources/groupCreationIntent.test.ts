import { describe, expect, it } from "vitest"

import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import { createSub2ApiKeyEditor } from "~/services/apiAdapters/sub2api/keyResourceEditor"
import { createVoApiV2KeyEditor } from "~/services/apiAdapters/voapiV2/keyResourceEditor"
import { AuthTypeEnum } from "~/types"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const request = {
  baseUrl: "https://example.invalid",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test" },
}
const groups = [
  {
    id: 9,
    displayName: "Premium",
    description: "",
    requirementKey: "9",
    ratio: 1,
  },
  {
    id: 10,
    displayName: "Standard",
    description: "",
    requirementKey: "10",
    ratio: 1,
  },
]

describe.each([
  {
    name: "Sub2API",
    create: (intent: AccountKeyCreationIntent, available = groups) =>
      createSub2ApiKeyEditor(request, undefined, intent, available),
    field: "group_id",
    selection: "9",
    empty: null,
  },
  {
    name: "VoAPI v2",
    create: (intent: AccountKeyCreationIntent, available = groups) =>
      createVoApiV2KeyEditor(request, undefined, intent, available),
    field: "groups",
    selection: ["9"],
    empty: [],
  },
])("$name group creation intent", ({ create, field, selection, empty }) => {
  it("selects a unique preferred name and uses it for the automatic name", () => {
    const editor = create({ preferredGroup: "Premium" })
    expect(editor.initialValues[field]).toEqual(selection)
    expect(editor.initialValues.name).toBe("Premium group (auto)")
  })

  it("uses a sole allowed name when no preference is present", () => {
    expect(create({ allowedGroups: ["Premium"] }).initialValues[field]).toEqual(
      selection,
    )
  })

  it("does not choose an arbitrary ID when names are ambiguous", () => {
    const editor = create({ preferredGroup: "Premium" }, [
      ...groups,
      { ...atIndex(groups, 0), id: 11, requirementKey: "11" },
    ])
    expect(editor.initialValues[field]).toEqual(empty)
    expect(editor.initialValues.name).toBe("user group (auto)")
  })

  it("keeps a conflicting preference visible but rejects it against allowed groups", () => {
    const editor = create({
      preferredGroup: "Premium",
      allowedGroups: ["Standard"],
    })
    expect(editor.initialValues[field]).toEqual(selection)
    const validation = editor.validate(editor.initialValues)
    expect(validation.valid).toBe(false)
    if (!validation.valid)
      expect(validation.issues.some((issue) => issue.fieldId === field)).toBe(
        true,
      )
  })

  it("treats an empty allowed list as denying selection", () => {
    const editor = create({ allowedGroups: [] })
    const validation = editor.validate({
      ...editor.initialValues,
      [field]: selection,
    })
    expect(validation.valid).toBe(false)
    if (!validation.valid)
      expect(validation.issues.some((issue) => issue.fieldId === field)).toBe(
        true,
      )
  })
})
