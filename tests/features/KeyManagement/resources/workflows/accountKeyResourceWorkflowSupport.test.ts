import { describe, expect, it, vi } from "vitest"

import {
  accountContextsMatch,
  awaitAbortable,
  captureAccountContext,
  mergeEditorValuesForScopeChange,
  resetInvalidOptionValue,
  resolveCreateDestinationBoundary,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import type {
  AccountKeyResourceEditor,
  ResourceFieldDescriptor,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"

const options = [{ value: "current" }, { value: "other" }]
const field: ResourceFieldDescriptor = {
  fieldId: "group",
  type: "select",
  options,
}
const createEditor = (
  overrides: Partial<AccountKeyResourceEditor> = {},
): AccountKeyResourceEditor => ({
  fields: [],
  initialValues: {},
  validate: () => ({ valid: true }),
  resolveDestinationScopeKey: () => "missing",
  submit: vi.fn(),
  ...overrides,
})

describe("account-key workflow boundaries", () => {
  it("detects tag changes without retaining mutable account tag arrays", () => {
    const account = buildDisplaySiteData({ tagIds: ["first", "second"] })
    const snapshot = captureAccountContext(account)
    expect(
      accountContextsMatch([snapshot], [captureAccountContext(account)]),
    ).toBe(true)
    account.tagIds = ["first", "changed"]
    expect(
      accountContextsMatch([snapshot], [captureAccountContext(account)]),
    ).toBe(false)
    expect(snapshot.tagIds).toEqual(["first", "second"])
  })

  it("rejects creation into a scope absent from the account inventory", () => {
    expect(() =>
      resolveCreateDestinationBoundary(
        createEditor(),
        {},
        {
          accountId: "account",
          siteType: "openrouter",
          scopeKey: "current",
          routeKey: "current",
        },
        [],
      ),
    ).toThrow(
      expect.objectContaining({ failure: { code: "validation_failed" } }),
    )
  })

  it("preserves only multiselect values available in the destination scope", () => {
    const editor = createEditor({
      fields: [{ ...field, type: "multi-select" }],
      initialValues: { group: ["current"] },
    })
    expect(
      mergeEditorValuesForScopeChange({ group: ["other"] }, editor),
    ).toEqual({ group: ["other"] })
    expect(
      mergeEditorValuesForScopeChange({ group: ["other", "removed"] }, editor),
    ).toEqual({ group: ["current"] })
  })

  it.each([
    { initial: "other", required: false, expected: { group: "other" } },
    { initial: ["other"], required: false, expected: { group: ["other"] } },
    { initial: "removed", required: true, expected: { group: "current" } },
    { initial: "removed", required: false, expected: {} },
  ])(
    "recovers an invalid selection using allowed defaults or field requirements: $initial/$required",
    ({ initial, required, expected }) => {
      const values = { group: "removed", name: "Keep this name" }
      expect(
        resetInvalidOptionValue(
          values,
          { group: initial },
          { ...field, required },
          options,
        ),
      ).toEqual({ name: "Keep this name", ...expected })
      expect(values.group).toBe("removed")
    },
  )

  it("rejects work whose signal was already cancelled", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      awaitAbortable(Promise.resolve("late data"), controller.signal),
    ).rejects.toMatchObject({ failure: { code: "aborted" } })
  })
})
