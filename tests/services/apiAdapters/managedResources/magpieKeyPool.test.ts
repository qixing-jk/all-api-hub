import { describe, expect, it } from "vitest"

import type { ResourceSecretListValue } from "~/services/apiAdapters/contracts/resourceNative"
import { magpieEditor } from "~/services/apiAdapters/managedResources/magpie/editorProjection"
import { prepareMagpieKeyPool } from "~/services/apiAdapters/managedResources/magpie/keyPoolMutations"
import { magpieKeyFingerprint } from "~/services/apiService/magpie/keyIdentity"
import type { MagpieProvider } from "~/services/apiService/magpie/providers"

const provider: MagpieProvider = {
  id: "relay",
  name: "Relay",
  chat: "https://relay.test/v1",
  responses: "",
  anthropic: "",
  key: { set: true, masked: "sk-***", optional: false },
  off: false,
  chosen: ["model"],
  models: [],
  keyList: [
    {
      id: "primary",
      masked: "sk-***a",
      active: true,
      on: true,
      name: "Main",
      protocol: "anthropic",
      weight: 3,
    },
    {
      id: "secondary",
      masked: "sk-***b",
      active: false,
      on: false,
      name: "Backup",
      protocol: "responses",
      weight: 5,
    },
  ],
}

describe("Magpie key pool editing", () => {
  it.each<Record<string, string>>([
    { protocol: "invalid" },
    { weight: "1001" },
    { on: "yes" },
  ])("rejects invalid key metadata (%j)", (fields) => {
    const editor = magpieEditor(provider)
    const pool = editor.initialValues.keyPool as ResourceSecretListValue
    expect(
      editor.validate({
        ...editor.initialValues,
        keyPool: {
          ...pool,
          entries: pool.entries.map((row) => ({
            ...row,
            fields: { ...row.fields, ...fields },
          })),
        },
      }).valid,
    ).toBe(false)
  })
  it("updates protocol and weight independently and enables new weighted keys before disabling them", async () => {
    const ref = await magpieKeyFingerprint("sk-new")
    const operations = await prepareMagpieKeyPool(provider, {
      add: [
        { key: "sk-new", name: "New", protocol: "chat", weight: 4, on: false },
      ],
      update: [{ ref: "secondary", protocol: "chat" }],
      remove: [],
    })
    expect(operations.map((op) => [op.action, op.ref])).toEqual([
      ["add", ref],
      ["weight", ref],
      ["protocol", "secondary"],
      ["off", ref],
    ])
    const editor = magpieEditor(provider)
    const pool = editor.initialValues.keyPool as ResourceSecretListValue
    const entries = pool.entries.map((row) =>
      row.id === "secondary"
        ? { ...row, fields: { ...row.fields, protocol: "chat", weight: "7" } }
        : row,
    )
    expect(
      editor.buildCommand({
        ...editor.initialValues,
        keyPool: { ...pool, entries },
      }).keyPool?.update,
    ).toEqual([{ ref: "secondary", protocol: "chat", weight: 7 }])
  })

  it.each([
    null,
    { kind: "secret-list", entries: [null] },
    {
      kind: "secret-list",
      entries: [
        {
          id: "new",
          secret: { kind: "replace", value: "one two" },
          fields: {},
        },
      ],
    },
  ])("rejects malformed or ambiguous key-pool input (%j)", (keyPool) => {
    const editor = magpieEditor(provider)
    expect(
      editor.validate({ ...editor.initialValues, keyPool } as any).valid,
    ).toBe(false)
  })

  it("refuses to both remove and replace the primary key in one submission", () => {
    const editor = magpieEditor(provider)
    const pool = editor.initialValues.keyPool as ResourceSecretListValue
    expect(
      editor.validate({
        ...editor.initialValues,
        key: { kind: "replace", value: "sk-replaced" },
        keyPool: {
          ...pool,
          entries: [
            {
              ...pool.entries[1]!,
              fields: { ...pool.entries[1]!.fields, on: "true" },
            },
          ],
        },
      }).valid,
    ).toBe(false)
  })
  it("offers reveal only for the primary fingerprint without allowing a mask to be submitted", () => {
    const field = magpieEditor(provider).fields.find(
      (field) => field.fieldId === "keyPool",
    )!
    expect(field).toMatchObject({
      savedEntries: [
        { id: "primary", loadFieldId: "keyPool:primary", canReplace: false },
        { id: "secondary", canReplace: false },
      ],
    })
    if (field.type !== "secret-list") throw new Error("Expected key pool")
    expect(field.savedEntries[1]).not.toHaveProperty("loadFieldId")
  })
  it("enables a replacement before disabling and removing the only active key", async () => {
    const operations = await prepareMagpieKeyPool(provider, {
      add: [],
      update: [
        { ref: "primary", on: false },
        { ref: "secondary", on: true },
      ],
      remove: ["primary"],
    })
    expect(operations.map(({ action, ref }) => [action, ref])).toEqual([
      ["on", "secondary"],
      ["off", "primary"],
      ["remove", "primary"],
    ])
  })

  it("deduplicates against fresh native keys without changing their metadata", async () => {
    const ref = await magpieKeyFingerprint("sk-existing")
    const operations = await prepareMagpieKeyPool(
      { ...provider, keyList: [{ ...provider.keyList![0]!, id: ref }] },
      {
        add: [
          {
            key: " sk-existing ",
            name: "Overwrite",
            on: false,
            protocol: "chat",
            weight: 9,
          },
        ],
        update: [],
        remove: [],
      },
    )
    expect(operations).toEqual([])
  })

  it("targets primary metadata at its new fingerprint after explicit replacement", async () => {
    const operations = await prepareMagpieKeyPool(
      provider,
      {
        add: [],
        update: [{ ref: "primary", name: "Renamed", weight: 5 }],
        remove: [],
      },
      "replacement",
    )
    expect(operations.map(({ payload }) => payload)).toEqual([
      { id: "relay", ref: "replacement", name: "Renamed" },
      { id: "relay", ref: "replacement", weight: 5 },
    ])
  })

  it("rechecks the enabled-key invariant against fresh inventory before dispatch", async () => {
    await expect(
      prepareMagpieKeyPool(provider, {
        add: [],
        update: [],
        remove: ["primary"],
      }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
  })
  it("changes key routing without changing key contents", () => {
    const editor = magpieEditor(provider)
    expect(
      editor.buildCommand({ ...editor.initialValues, routing: "rotate" })
        .fields,
    ).toEqual({ routing: "rotate" })
    expect(
      editor.validate({ ...editor.initialValues, routing: "unknown" }).valid,
    ).toBe(false)
  })
  it("exposes masked saved rows and builds only explicit metadata changes", () => {
    const editor = magpieEditor(provider)
    const pool = editor.initialValues.keyPool as ResourceSecretListValue
    expect(pool.entries).toHaveLength(2)
    expect(pool.entries[0]).toMatchObject({
      id: "primary",
      secret: { kind: "unchanged" },
      fields: { name: "Main", on: "true", protocol: "anthropic", weight: "3" },
    })
    expect(editor.buildCommand(editor.initialValues)).not.toHaveProperty(
      "keyPool",
    )
    const command = editor.buildCommand({
      ...editor.initialValues,
      keyPool: {
        ...pool,
        entries: [
          pool.entries[0]!,
          {
            ...pool.entries[1]!,
            fields: { ...pool.entries[1]!.fields, name: "Renamed", on: "true" },
          },
        ],
      },
    })
    expect(command.fields).toEqual({})
    expect(command).toMatchObject({
      keyPool: {
        add: [],
        remove: [],
        update: [{ ref: "secondary", name: "Renamed", on: true }],
      },
    })
  })

  it("adds keys independently and removes only the explicitly removed fingerprint", () => {
    const editor = magpieEditor(provider)
    const pool = editor.initialValues.keyPool as ResourceSecretListValue
    const command = editor.buildCommand({
      ...editor.initialValues,
      keyPool: {
        ...pool,
        entries: [
          pool.entries[0]!,
          {
            id: "new",
            secret: { kind: "replace", value: " sk-added " },
            fields: { name: "New", protocol: "chat", weight: "2", on: "true" },
          },
        ],
      },
    })
    expect(command).toMatchObject({
      keyPool: {
        add: [
          {
            key: "sk-added",
            name: "New",
            protocol: "chat",
            weight: 2,
            on: true,
          },
        ],
        remove: ["secondary"],
        update: [],
      },
    })
  })

  it("requires an enabled key to remain and refuses saved-key replacement via pool rows", () => {
    const editor = magpieEditor(provider)
    const pool = editor.initialValues.keyPool as ResourceSecretListValue
    for (const entries of [
      [pool.entries[1]!],
      pool.entries.map((row) => ({
        ...row,
        fields: { ...row.fields, on: "false" },
      })),
      [
        {
          ...pool.entries[0]!,
          secret: { kind: "replace" as const, value: "sk-replace" },
        },
        pool.entries[1]!,
      ],
    ])
      expect(
        editor.validate({
          ...editor.initialValues,
          keyPool: { ...pool, entries },
        }).valid,
      ).toBe(false)
  })

  it("preserves unknown saved protocols until explicitly changed", () => {
    const editor = magpieEditor({
      ...provider,
      keyList: [
        { ...provider.keyList![0]!, protocol: "future-protocol", weight: 2000 },
      ],
    })
    expect(
      editor.buildCommand({ ...editor.initialValues, name: "New name" }).fields,
    ).toEqual({ name: "New name" })
  })
})
