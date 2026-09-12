import { describe, expect, it, vi } from "vitest"

import type { ResourceSecretListValue } from "~/services/apiAdapters/contracts/resourceNative"
import {
  resolveCredentialPatch,
  withCredentialListEditor,
} from "~/services/apiAdapters/managedResources/credentialListEditor"

const records: Parameters<typeof withCredentialListEditor>[2] = [
  {
    id: "a",
    key: "first-secret",
    fields: { enabled: "true", remark: "original" },
  },
  { id: "b", key: "second-secret", fields: { enabled: "false" } },
]
const base = {
  fields: [
    {
      fieldId: "key",
      type: "secret" as const,
      secretState: "available" as const,
      canReplace: true,
      allowClear: false,
    },
  ],
  initialValues: { key: { kind: "unchanged" as const } },
  validate: () => ({ valid: true as const }),
  buildCommand: () => ({ name: "channel" }),
}

describe("credential list editor", () => {
  it("rejects invalid row metadata and boolean values before command construction", async () => {
    const editor = await withCredentialListEditor(
      base,
      "key",
      records,
      true,
      undefined,
      [{ fieldId: "enabled", type: "boolean" }],
    )
    for (const fields of [{ enabled: "maybe" }, { remark: 7 }]) {
      const values = {
        key: {
          kind: "secret-list" as const,
          entries: [
            {
              id: "a",
              fields: fields as unknown as Record<string, string>,
              secret: { kind: "unchanged" as const },
            },
          ],
        },
      }
      expect(editor.validate(values).valid).toBe(false)
      expect(() => editor.buildCommand(values)).toThrow()
    }
  })

  it("allows the singleton loader alias and rejects unavailable or cancelled disclosures", async () => {
    const loader = vi.fn().mockResolvedValue([records[0]])
    const editor = await withCredentialListEditor(
      base,
      "key",
      [records[0]],
      true,
      loader,
    )
    await expect(editor.loadSecret!("key")).resolves.toBe("first-secret")
    await expect(editor.loadSecret!("other")).rejects.toMatchObject({
      failure: { code: "validation_failed" },
    })
    await expect(editor.loadSecret!("key:missing")).rejects.toMatchObject({
      failure: { code: "unavailable" },
    })
    const controller = new AbortController()
    controller.abort()
    loader.mockClear()
    await expect(
      editor.loadSecret!("key:a", { signal: controller.signal }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(loader).not.toHaveBeenCalled()
    const unavailable = await withCredentialListEditor(
      base,
      "key",
      [{ id: "empty", key: "", fields: {} }],
      true,
      vi.fn().mockResolvedValue([{ id: "empty", key: "", fields: {} }]),
    )
    expect(unavailable.fields[0]).toMatchObject({
      savedEntries: [{ id: "empty", secretState: "unavailable" }],
    })
    await expect(unavailable.loadSecret!("key:empty")).rejects.toMatchObject({
      failure: { code: "unavailable" },
    })
  })

  it("refuses unusable authoritative secrets during patch resolution", async () => {
    const editor = await withCredentialListEditor(base, "key", records, true)
    const command = editor.buildCommand({
      key: {
        kind: "secret-list",
        entries: [
          { id: "a", fields: {}, secret: { kind: "replace", value: "valid" } },
        ],
      },
    })
    await expect(
      resolveCredentialPatch(
        {
          ...command.credentialPatch!,
          entries: [{ id: "a", fields: {}, secret: { kind: "clear" } }],
        },
        records,
      ),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
  })
  it("keeps saved secrets out of projections and omits an untouched list", async () => {
    const editor = await withCredentialListEditor(base, "key", records, true)
    expect(JSON.stringify(editor.initialValues)).not.toContain("first-secret")
    expect(editor.buildCommand(editor.initialValues)).toEqual({
      name: "channel",
    })
  })

  it("rotates, removes and adds keys while retaining fresh untouched metadata", async () => {
    const editor = await withCredentialListEditor(base, "key", records, true)
    const list = editor.initialValues.key as ResourceSecretListValue
    const command = editor.buildCommand({
      key: {
        kind: "secret-list",
        entries: [
          { ...list.entries[0], secret: { kind: "replace", value: "rotated" } },
          {
            id: "new",
            secret: { kind: "replace", value: "added" },
            fields: { enabled: "false" },
          },
        ],
      },
    })
    const latest = records.map((record) => ({
      ...record,
      fields: { ...record.fields, remark: "changed elsewhere" },
    }))
    expect(
      await resolveCredentialPatch(command.credentialPatch!, latest),
    ).toEqual([
      {
        id: "a",
        key: "rotated",
        fields: { enabled: "true", remark: "changed elsewhere" },
      },
      { id: "new", key: "added", fields: { enabled: "false" } },
    ])
  })

  it("rejects same-size concurrent rotation and membership changes before replacement", async () => {
    const editor = await withCredentialListEditor(base, "key", records, true)
    const list = editor.initialValues.key as ResourceSecretListValue
    const command = editor.buildCommand({
      key: { ...list, entries: list.entries.slice(1) },
    })
    for (const latest of [
      [...records, { id: "c", key: "third", fields: {} }],
      records.map((record) => ({ ...record, key: "rotated elsewhere" })),
    ]) {
      await expect(
        resolveCredentialPatch(command.credentialPatch!, latest),
      ).rejects.toMatchObject({ failure: { code: "resource_changed" } })
    }
  })

  it("rejects empty collections, forged unchanged rows, blank replacements and duplicate row IDs", async () => {
    const editor = await withCredentialListEditor(base, "key", records, true)
    const list = editor.initialValues.key as ResourceSecretListValue
    for (const entries of [
      [],
      [{ id: "forged", fields: {}, secret: { kind: "unchanged" as const } }],
      [
        {
          id: "new",
          fields: {},
          secret: { kind: "replace" as const, value: " " },
        },
      ],
      [list.entries[0], list.entries[0]],
    ]) {
      expect(
        editor.validate({ key: { kind: "secret-list", entries } }).valid,
      ).toBe(false)
    }
  })

  it("loads only the requested row and propagates cancellation", async () => {
    const loader = vi.fn().mockResolvedValue(records)
    const editor = await withCredentialListEditor(
      base,
      "key",
      records,
      true,
      loader,
    )
    expect(loader).not.toHaveBeenCalled()
    const controller = new AbortController()
    await expect(
      editor.loadSecret!("key:b", { signal: controller.signal }),
    ).resolves.toBe("second-secret")
    expect(loader).toHaveBeenCalledWith({ signal: controller.signal })
  })
})
