import { describe, expect, it, vi } from "vitest"

import type { NativeResourceEditorDefinition } from "~/services/apiAdapters/managedResources/factory"
import { scalarKeyCleanup } from "~/services/apiAdapters/managedResources/keyCleanup"

function editor(
  loadSecret: () => Promise<string>,
): NativeResourceEditorDefinition<unknown> {
  return {
    fields: [
      {
        fieldId: "key",
        type: "secret",
        secretState: "masked",
        canReplace: true,
        allowClear: false,
      },
    ],
    initialValues: { baseURL: "https://upstream.example" },
    validate: () => ({ valid: true }),
    buildCommand: (values) => values,
    loadSecret,
  }
}

describe("shared scalar cleanup secret reads", () => {
  it.each([undefined, "", "sk-****"])(
    "loads the secret once when detail contains %s",
    async (detailSecret) => {
      const load = vi.fn(async () => "first\nsecond")
      const cleanup = await scalarKeyCleanup(
        editor(load),
        vi.fn(),
        undefined,
        true,
        undefined,
        detailSecret,
      )
      expect(cleanup.keys).toEqual(["first", "second"])
      expect(load).toHaveBeenCalledOnce()
    },
  )

  it("reuses each fresh detail without an extra read or a cache across cleanup preparations", async () => {
    const load = vi.fn(async () => "stale-key")
    const first = await scalarKeyCleanup(
      editor(load),
      vi.fn(),
      undefined,
      true,
      undefined,
      "first\nretained",
    )
    const second = await scalarKeyCleanup(
      editor(load),
      vi.fn(),
      undefined,
      true,
      undefined,
      "changed\nretained",
    )
    expect(first.keys).toEqual(["first", "retained"])
    expect(second.keys).toEqual(["changed", "retained"])
    expect(load).not.toHaveBeenCalled()
  })
})
