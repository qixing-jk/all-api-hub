import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { createManagedResourcePresentationMapper as createPresentationMapper } from "~/features/ManagedSiteChannels/presentation/managedResourcePresentation"
import type { ResourceDisplayFacts } from "~/services/apiAdapters/contracts/managedResourceNative"
import { createManagedResourceFacts } from "~~/tests/test-utils/managedResourceWorkspace"

const TEST_FIELD_IDS = [
  "name",
  "type",
  "baseURL",
  "status",
  "supportedModels",
  "manualModels",
  "autoSyncSupportedModels",
  "tags",
  "remark",
] as const

const createManagedResourcePresentationMapper = (
  options: Parameters<typeof createPresentationMapper>[0] = {},
) =>
  createPresentationMapper({
    fieldIds: TEST_FIELD_IDS,
    semantics: { baseUrlFieldId: "baseURL", statusFieldId: "status" },
    ...options,
  })

describe("managedResourcePresentation", () => {
  const labels: Record<string, string> = {
    "managedSiteChannels:editor.options.channelType.openai": "Localized OpenAI",
    "managedSiteChannels:editor.options.status.enabled": "Localized enabled",
    "managedSiteChannels:editor.options.channelType.unsupported":
      "Localized unsupported type",
    "managedSiteChannels:editor.options.status.unknown":
      "Localized unknown status",
  }
  const resolveLabel = ((key: string) =>
    labels[key] ?? `missing:${key}`) as TFunction

  it("maps only controlled safe facts and opaque controller identities", () => {
    const mapper = createManagedResourcePresentationMapper()
    const facts = createManagedResourceFacts("private-id", "Duplicate name")
    const row = mapper.map(facts)

    expect(row).toMatchObject({
      name: "Duplicate name",
      baseURL: "https://api.example.invalid",
      capabilities: { canView: true, canEdit: true, canDelete: true },
    })
    expect(row.rowKey).not.toContain("private-id")
    expect(row.testToken).not.toContain("private-id")
    expect(JSON.stringify(row)).not.toContain(facts.ref.scopeKey)
    expect(JSON.stringify(row)).not.toContain("private-id")
  })

  it("projects safe native channel action facts without exposing resource identity", () => {
    const mapper = createManagedResourcePresentationMapper()
    const facts = createManagedResourceFacts("private-channel-id")
    const row = mapper.map({
      ...facts,
      displayName: "Safe channel name",
      actions: {
        ...facts.actions,
        channel: {
          channelId: 42,
          channelType: "openai",
          canSyncModels: true,
          canOpenModelSync: true,
          canConfigureModelFilters: true,
        },
      },
    })

    expect(row.channelActions).toEqual({
      channelId: 42,
      channelType: "openai",
      canSyncModels: true,
      canOpenModelSync: true,
      canConfigureModelFilters: true,
    })
    expect(JSON.stringify(row)).not.toContain(facts.ref.scopeKey)
    expect(JSON.stringify(row)).not.toContain("private-channel-id")
  })

  it("fails closed for invalid native channel action facts", () => {
    const mapper = createManagedResourcePresentationMapper()
    const facts = createManagedResourceFacts()
    const row = mapper.map({
      ...facts,
      actions: {
        ...facts.actions,
        channel: {
          channelId: 0,
          channelType: "openai",
          canSyncModels: true,
          canOpenModelSync: true,
          canConfigureModelFilters: true,
        },
      },
    })

    expect(row.channelActions).toBeUndefined()
  })

  it("includes approved display-safe fields in client search text", () => {
    const mapper = createManagedResourcePresentationMapper()
    const row = mapper.map({
      ...createManagedResourceFacts(),
      displayName: "Gateway",
      fields: [
        { fieldId: "type", kind: "text", value: "openai" },
        {
          fieldId: "baseURL",
          kind: "text",
          value: "https://gateway.example.invalid",
        },
        {
          fieldId: "supportedModels",
          kind: "list",
          value: ["model-a", "model-b"],
        },
        { fieldId: "tags", kind: "list", value: ["production"] },
        { fieldId: "key", kind: "secret", state: "masked" },
      ],
    })

    expect(row.searchText).toContain("Gateway")
    expect(row.searchText).toContain("openai")
    expect(row.searchText).toContain("enabled")
    expect(row.searchText).toContain("https://gateway.example.invalid")
    expect(row.searchText).toContain("model-a")
    expect(row.searchText).toContain("production")
    expect(row.searchText).not.toContain("key")
  })

  it("keeps row identity stable across rename and accepted refresh", () => {
    const mapper = createManagedResourcePresentationMapper()
    const before = mapper.map(createManagedResourceFacts("same", "Before"))
    mapper.accept([createManagedResourceFacts("same", "After")])
    const after = mapper.map(createManagedResourceFacts("same", "After"))

    expect(after.rowKey).toBe(before.rowKey)
    expect(after.testToken).toBe(before.testToken)
    expect(after.name).toBe("After")
  })

  it("does not expose unknown fields, raw ids, or secret values", () => {
    const mapper = createManagedResourcePresentationMapper()
    const facts = {
      ...createManagedResourceFacts("secret-id"),
      displayName: "Safe display name",
      fields: [
        { fieldId: "backendMessage", kind: "text", value: "private" } as const,
        { fieldId: "key", kind: "secret", state: "available" } as const,
      ],
    }
    expect(JSON.stringify(mapper.map(facts))).not.toMatch(
      /private|secret-id|key/,
    )
  })

  it("shows an approved secret state without adding it to client search", () => {
    const mapper = createManagedResourcePresentationMapper({
      resolveLabel,
      fieldIds: ["key", "concurrency", "priority"],
    })
    const row = mapper.map({
      ...createManagedResourceFacts(),
      fields: [
        { fieldId: "key", kind: "secret", state: "available" },
        { fieldId: "concurrency", kind: "number", value: 3 },
        { fieldId: "priority", kind: "number", value: 8 },
      ],
    })

    expect(row.cells.key).toMatchObject({
      kind: "text",
      sortValue: "available",
    })
    expect(row.cells.concurrency).toMatchObject({ value: "3", sortValue: 3 })
    expect(row.cells.priority).toMatchObject({ value: "8", sortValue: 8 })
    expect(row.searchText).not.toContain("available")
  })

  it.each([
    ["masked", "managedSiteChannels:editor.secret.state.masked"],
    ["unavailable", "managedSiteChannels:editor.secret.state.unavailable"],
    [
      "permission-hidden",
      "managedSiteChannels:editor.secret.state.permissionHidden",
    ],
  ] as const)("maps the %s secret state to controlled copy", (state, key) => {
    const mapper = createManagedResourcePresentationMapper({
      resolveLabel,
      fieldIds: ["key"],
    })
    const row = mapper.map({
      ...createManagedResourceFacts(),
      fields: [{ fieldId: "key", kind: "secret", state }],
    })

    expect(row.cells.key).toMatchObject({
      kind: "text",
      value: `missing:${key}`,
      sortValue: state,
    })
    expect(row.searchText).not.toContain(state)
  })

  it("maps approved detail fields while excluding unregistered and secret facts", () => {
    const mapper = createManagedResourcePresentationMapper()
    const row = mapper.map({
      ...createManagedResourceFacts(),
      fields: [
        { fieldId: "manualModels", kind: "list", value: ["manual-model"] },
        { fieldId: "remark", kind: "text", value: "Approved remark" },
        { fieldId: "backendMessage", kind: "text", value: "private detail" },
        { fieldId: "key", kind: "secret", state: "available" },
      ],
    })

    expect(row.cells.manualModels).toMatchObject({
      kind: "groups",
      values: ["manual-model"],
    })
    expect(row.cells.remark).toMatchObject({
      kind: "text",
      value: "Approved remark",
    })
    expect(row.cells.backendMessage).toBeUndefined()
    expect(row.cells.key).toBeUndefined()
  })

  it("uses controlled localized labels for known type and status values", () => {
    const mapper = createManagedResourcePresentationMapper({
      resolveLabel,
      semantics: {
        fieldValuePresentations: {
          type: {
            optionLabelResolvers: {
              openai: (t) =>
                t("managedSiteChannels:editor.options.channelType.openai"),
            },
            resolveOptionFallback: (t) =>
              t("managedSiteChannels:editor.options.channelType.unsupported"),
          },
        },
      },
    })
    const facts = {
      ...createManagedResourceFacts(),
      status: "enabled" as const,
      fields: [{ fieldId: "type", kind: "text", value: "openai" } as const],
    }

    const row = mapper.map(facts)

    expect(row.cells.type).toEqual({
      kind: "text",
      value: "Localized OpenAI",
      sortValue: "openai",
    })
    expect(row.cells.status).toMatchObject({
      value: "Localized enabled",
      sortValue: "enabled",
    })
  })

  it("projects no provider-specific cells without an explicit field policy", () => {
    const row = createPresentationMapper().map(createManagedResourceFacts())

    expect(row.baseURL).toBe("https://api.example.invalid")
    expect(row.cells).toEqual({
      status: expect.objectContaining({ kind: "status" }),
    })
  })

  it("does not assume a provider vocabulary when no value policy is supplied", () => {
    const mapper = createManagedResourcePresentationMapper({ resolveLabel })
    const row = mapper.map({
      ...createManagedResourceFacts(),
      fields: [{ fieldId: "type", kind: "text", value: "provider-owned-type" }],
    })

    expect(row.cells.type).toEqual({
      kind: "text",
      value: "provider-owned-type",
      sortValue: "provider-owned-type",
    })
  })

  it("keeps the controlled localized status cell when detail facts include status", () => {
    const mapper = createManagedResourcePresentationMapper({ resolveLabel })
    const row = mapper.map({
      ...createManagedResourceFacts(),
      status: "enabled",
      fields: [{ fieldId: "status", kind: "text", value: "enabled" }],
    })

    expect(row.cells.status).toEqual({
      kind: "status",
      value: "Localized enabled",
      sortValue: "enabled",
      tone: "success",
    })
  })

  it("localizes approved boolean detail cells through the supplied resolver", () => {
    const localized = {
      "common:status.enabled": "Activado",
      "common:status.disabled": "Desactivado",
    } as Record<string, string>
    const mapper = createManagedResourcePresentationMapper({
      resolveLabel: ((key: string) => localized[key] ?? key) as TFunction,
    })

    const enabled = mapper.map({
      ...createManagedResourceFacts("enabled"),
      fields: [
        {
          fieldId: "autoSyncSupportedModels",
          kind: "boolean",
          value: true,
        },
      ],
    })
    const disabled = mapper.map({
      ...createManagedResourceFacts("disabled"),
      fields: [
        {
          fieldId: "autoSyncSupportedModels",
          kind: "boolean",
          value: false,
        },
      ],
    })

    expect(enabled.cells.autoSyncSupportedModels).toMatchObject({
      kind: "text",
      value: "Activado",
    })
    expect(disabled.cells.autoSyncSupportedModels).toMatchObject({
      kind: "text",
      value: "Desactivado",
    })
  })

  it.each(["unlisted", "__proto__", "constructor"])(
    "uses controlled fallbacks without exposing unknown option %s",
    (unknownValue) => {
      const mapper = createManagedResourcePresentationMapper({
        resolveLabel,
        semantics: {
          fieldValuePresentations: {
            type: {
              optionLabelResolvers: {},
              resolveOptionFallback: (t) =>
                t("managedSiteChannels:editor.options.channelType.unsupported"),
            },
          },
        },
      })
      const row = mapper.map({
        ...createManagedResourceFacts(),
        status: unknownValue as unknown as ResourceDisplayFacts["status"],
        fields: [
          { fieldId: "type", kind: "text", value: unknownValue } as const,
        ],
      })

      expect(row.cells.type).toMatchObject({
        value: "Localized unsupported type",
        sortValue: unknownValue,
      })
      expect(row.cells.status).toMatchObject({
        value: "Localized unknown status",
        sortValue: unknownValue,
      })
      expect(row.cells.type).not.toMatchObject({ value: unknownValue })
      expect(row.cells.status).not.toMatchObject({ value: unknownValue })
    },
  )
})
