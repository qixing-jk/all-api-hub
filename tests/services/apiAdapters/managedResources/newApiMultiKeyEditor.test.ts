import { describe, expect, it, vi } from "vitest"

import { NEW_API_MANAGED_RESOURCE_FIELD_IDS as fields } from "~/constants/newApi"
import { withNewApiMultiKeyEditor } from "~/services/apiAdapters/managedResources/newApiMultiKeyEditor"
import type { NewApiChannel } from "~/types/newApi"
import type { NewApiChannelCommand } from "~/types/newApiChannelEditor"

const detail = {
  channel_info: {
    is_multi_key: true,
    multi_key_size: 2,
    multi_key_mode: "random",
    multi_key_status_list: [1, 2],
  },
} as NewApiChannel
const base = {
  fields: [
    {
      fieldId: fields.Key,
      type: "secret" as const,
      secretState: "available" as const,
      canReplace: true,
      allowClear: false,
    },
  ],
  initialValues: { [fields.Key]: { kind: "unchanged" as const } },
  validate: () => ({ valid: true as const }),
  buildCommand: () => ({}) as NewApiChannelCommand,
}

describe("New API lazy multi-key editor", () => {
  it("reads once per editor and keeps disclosure out of public projections", async () => {
    const read = vi.fn().mockResolvedValue("first-secret\nsecond-secret")
    const editor = await withNewApiMultiKeyEditor(base, detail, read)
    expect(read).not.toHaveBeenCalled()
    await expect(editor.loadSecret!(fields.Key + ":0")).resolves.toBe(
      "first-secret",
    )
    await expect(editor.loadSecret!(fields.Key + ":1")).resolves.toBe(
      "second-secret",
    )
    expect(read).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(editor.initialValues)).not.toContain("first-secret")
    expect(editor.buildCommand(editor.initialValues)).toEqual({})
    const reopened = await withNewApiMultiKeyEditor(base, detail, read)
    await reopened.loadSecret!(fields.Key + ":0")
    expect(read).toHaveBeenCalledTimes(2)
  })

  it("does not cache failed or cancelled disclosure", async () => {
    const controller = new AbortController()
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("verification required"))
      .mockImplementationOnce(async () => {
        controller.abort()
        return "cancelled-one\ncancelled-two"
      })
      .mockResolvedValue("fresh-one\nfresh-two")
    const editor = await withNewApiMultiKeyEditor(base, detail, read)
    await expect(editor.loadSecret!(fields.Key + ":0")).rejects.toThrow(
      "verification required",
    )
    await expect(
      editor.loadSecret!(fields.Key + ":0", { signal: controller.signal }),
    ).rejects.toThrow()
    await expect(editor.loadSecret!(fields.Key + ":1")).resolves.toBe(
      "fresh-two",
    )
    expect(read).toHaveBeenCalledTimes(3)
  })

  it("rejects a changed slot count on disclosure", async () => {
    const editor = await withNewApiMultiKeyEditor(
      base,
      detail,
      vi.fn().mockResolvedValue("one\ntwo\nthree"),
    )
    await expect(editor.loadSecret!(fields.Key + ":0")).rejects.toMatchObject({
      failure: { code: "resource_changed" },
    })
  })
})
