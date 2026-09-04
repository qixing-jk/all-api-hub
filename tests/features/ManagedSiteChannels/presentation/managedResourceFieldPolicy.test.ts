import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import {
  AXON_HUB_CHANNEL_FIELD_IDS,
  AXON_HUB_CHANNEL_STATUS,
  AXON_HUB_CHANNEL_TYPE,
  AXON_HUB_CREATE_FIELD_IDS,
  AXON_HUB_EDITABLE_FIELD_IDS,
} from "~/constants/axonHub"
import {
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS,
  CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS,
  CLAUDE_CODE_HUB_PROVIDER_TYPE,
  ClaudeCodeHubProviderTypeNames,
} from "~/constants/claudeCodeHub"
import { SITE_TYPES } from "~/constants/siteType"
import {
  SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS,
  SUB2API_API_KEY_ACCOUNT_PLATFORMS,
  SUB2API_MANAGED_RESOURCE_EDITABLE_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_FIELD_IDS,
  SUB2API_MANAGED_RESOURCE_STATUS,
} from "~/constants/sub2api"
import {
  createManagedResourceFieldPolicyRegistry,
  defineManagedResourceFieldPolicy,
  getManagedResourceFieldOptionLabel,
  getManagedResourceFieldPolicy,
  MANAGED_RESOURCE_SECTION_ORDER,
  resolveManagedResourceFieldPolicy,
  type ManagedResourceFieldPresentation,
} from "~/features/ManagedSiteChannels/presentation/managedResourceFieldPolicy"
import enManagedSiteChannels from "~/locales/en/managedSiteChannels.json"
import es419ManagedSiteChannels from "~/locales/es-419/managedSiteChannels.json"
import jaManagedSiteChannels from "~/locales/ja/managedSiteChannels.json"
import viManagedSiteChannels from "~/locales/vi/managedSiteChannels.json"
import zhCnManagedSiteChannels from "~/locales/zh-CN/managedSiteChannels.json"
import zhTwManagedSiteChannels from "~/locales/zh-TW/managedSiteChannels.json"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import type { ResourceFieldDescriptor } from "~/services/apiAdapters/contracts/managedResourceNative"

const createDescriptors = (): readonly ResourceFieldDescriptor[] => [
  { fieldId: AXON_HUB_CHANNEL_FIELD_IDS.NAME, type: "text", required: true },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TYPE,
    type: "select",
    required: true,
    options: [
      { value: AXON_HUB_CHANNEL_TYPE.OPENAI },
      { value: AXON_HUB_CHANNEL_TYPE.ANTHROPIC },
    ],
  },
  { fieldId: AXON_HUB_CHANNEL_FIELD_IDS.BASE_URL, type: "text" },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.STATUS,
    type: "select",
    required: true,
    options: [
      { value: AXON_HUB_CHANNEL_STATUS.ENABLED },
      { value: AXON_HUB_CHANNEL_STATUS.DISABLED },
    ],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.KEY,
    type: "secret",
    secretState: "unavailable",
    canReplace: true,
    allowClear: false,
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.SUPPORTED_MODELS,
    type: "multi-select",
    options: [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
    type: "multi-select",
    options: [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.DEFAULT_TEST_MODEL,
    type: "select",
    required: true,
    options: [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS,
    type: "boolean",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_MODEL_PATTERN,
    type: "text",
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.TAGS,
    type: "multi-select",
    options: [],
  },
  {
    fieldId: AXON_HUB_CHANNEL_FIELD_IDS.ORDERING_WEIGHT,
    type: "number",
    step: 1,
  },
  { fieldId: AXON_HUB_CHANNEL_FIELD_IDS.REMARK, type: "textarea" },
  { fieldId: AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX, type: "text" },
]

const optionLabelLocales: readonly Record<string, unknown>[] = [
  enManagedSiteChannels,
  es419ManagedSiteChannels,
  jaManagedSiteChannels,
  viManagedSiteChannels,
  zhCnManagedSiteChannels,
  zhTwManagedSiteChannels,
]

const resolveLocaleValue = (locale: Record<string, unknown>, key: string) =>
  key
    .replace("managedSiteChannels:", "")
    .split(".")
    .reduce<unknown>(
      (value, segment) =>
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      locale,
    )

const resolveKey = ((key: string) => key) as TFunction

describe("managed resource field policy", () => {
  it("delegates stable section ordering to the neutral resource policy", () => {
    expect(MANAGED_RESOURCE_SECTION_ORDER).toMatchObject({
      basic: 0,
      connection: 1,
      advanced: 6,
    })
  })

  it("resolves field copy at the presentation boundary", () => {
    const policy = getManagedResourceFieldPolicy(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
      "edit",
    )!
    const tagsField = policy.fields.find(({ fieldId }) => fieldId === "tags")!

    expect(tagsField.resolveLabel(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.tags.label",
    )
    expect(tagsField.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.tags.help",
    )
    expect(tagsField.resolvePlaceholder?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.tags.placeholder",
    )
  })

  it.each(["create", "edit"] as const)(
    "gives Sub2API %s a provider-native field policy",
    (mode) => {
      const policy = getManagedResourceFieldPolicy(
        SITE_TYPES.SUB2API,
        MANAGED_RESOURCE_KINDS.Channel,
        mode,
      )!

      expect(policy.fields.map(({ fieldId }) => fieldId)).toEqual(
        SUB2API_MANAGED_RESOURCE_EDITABLE_FIELD_IDS,
      )
      expect(
        policy.fields.find(
          ({ fieldId }) =>
            fieldId === SUB2API_MANAGED_RESOURCE_FIELD_IDS.Concurrency,
        ),
      ).toMatchObject({ section: "routing", renderer: "number" })
      expect(
        policy.fields.find(
          ({ fieldId }) =>
            fieldId === SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models,
        ),
      ).toMatchObject({ section: "models", renderer: "multi-select" })
      expect(
        policy.fields
          .find(
            ({ fieldId }) =>
              fieldId === SUB2API_MANAGED_RESOURCE_FIELD_IDS.Models,
          )
          ?.resolveHelp?.(resolveKey),
      ).toBe("managedSiteChannels:editor.fields.sub2apiModels.help")
      expect(
        policy.fields.find(
          ({ fieldId }) =>
            fieldId === SUB2API_MANAGED_RESOURCE_FIELD_IDS.Priority,
        ),
      ).toMatchObject({ section: "routing", renderer: "number" })
      expect(
        policy.fields
          .find(
            ({ fieldId }) => fieldId === SUB2API_MANAGED_RESOURCE_FIELD_IDS.Key,
          )
          ?.resolveHelp?.(resolveKey),
      ).toBe("managedSiteChannels:editor.secret.keepExistingHint")
    },
  )

  it("resolves every Sub2API field and option label through the policy", () => {
    const policy = getManagedResourceFieldPolicy(
      SITE_TYPES.SUB2API,
      MANAGED_RESOURCE_KINDS.Channel,
      "create",
    )!
    const fields = Object.fromEntries(
      policy.fields.map((field) => [field.fieldId, field]),
    )

    expect(
      Object.fromEntries(
        policy.fields.map((field) => [
          field.fieldId,
          field.resolveLabel(resolveKey),
        ]),
      ),
    ).toEqual({
      name: "channelDialog:fields.name.label",
      platform: "managedSiteChannels:editor.fields.sub2apiPlatform.label",
      status: "channelDialog:fields.status.label",
      baseURL: "channelDialog:fields.baseUrl.label",
      key: "channelDialog:fields.key.label",
      supportedModels: "managedSiteChannels:editor.fields.sub2apiModels.label",
      concurrency: "managedSiteChannels:editor.fields.concurrency.label",
      priority: "managedSiteChannels:editor.fields.priority.label",
      notes: "managedSiteChannels:editor.fields.notes.label",
    })
    expect(fields.platform.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.sub2apiPlatform.help",
    )
    expect(fields.supportedModels.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.sub2apiModels.help",
    )
    expect(fields.concurrency.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.concurrency.help",
    )
    expect(fields.priority.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.priority.help",
    )
    expect(fields.notes.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.notes.help",
    )
    expect(fields.notes.resolvePlaceholder?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.notes.placeholder",
    )

    for (const platform of SUB2API_API_KEY_ACCOUNT_PLATFORMS) {
      expect(
        getManagedResourceFieldOptionLabel(
          fields.platform,
          platform,
          resolveKey,
        ),
      ).toBe(SUB2API_API_KEY_ACCOUNT_PLATFORM_LABELS[platform])
    }
    expect(
      getManagedResourceFieldOptionLabel(
        fields.status,
        SUB2API_MANAGED_RESOURCE_STATUS.Active,
        resolveKey,
      ),
    ).toBe("common:status.enabled")
    expect(
      getManagedResourceFieldOptionLabel(
        fields.status,
        SUB2API_MANAGED_RESOURCE_STATUS.Inactive,
        resolveKey,
      ),
    ).toBe("common:status.disabled")
    expect(
      getManagedResourceFieldOptionLabel(
        fields.status,
        SUB2API_MANAGED_RESOURCE_STATUS.Error,
        resolveKey,
      ),
    ).toBe("managedSiteChannels:statusLabels.autoDisabled")
  })

  it.each(["create", "edit"] as const)(
    "covers every Claude Code Hub %s field and provider-owned option label",
    (mode) => {
      const policy = getManagedResourceFieldPolicy(
        SITE_TYPES.CLAUDE_CODE_HUB,
        MANAGED_RESOURCE_KINDS.Channel,
        mode,
      )!
      const fieldIds = policy.fields.map(({ fieldId }) => fieldId)
      const typeField = policy.fields.find(
        ({ fieldId }) =>
          fieldId === CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Type,
      )!
      const statusField = policy.fields.find(
        ({ fieldId }) =>
          fieldId === CLAUDE_CODE_HUB_MANAGED_RESOURCE_FIELD_IDS.Status,
      )!

      expect(new Set(fieldIds)).toEqual(
        new Set(CLAUDE_CODE_HUB_MANAGED_RESOURCE_DETAIL_FIELD_IDS),
      )
      expect(policy.hiddenFields).toEqual([])
      for (const type of Object.values(CLAUDE_CODE_HUB_PROVIDER_TYPE)) {
        expect(
          getManagedResourceFieldOptionLabel(typeField, type, resolveKey),
        ).toBe(ClaudeCodeHubProviderTypeNames[type])
      }
      expect(
        getManagedResourceFieldOptionLabel(statusField, "enabled", resolveKey),
      ).toBe("common:status.enabled")
      expect(
        getManagedResourceFieldOptionLabel(
          typeField,
          "future-provider",
          resolveKey,
        ),
      ).toBe(typeField.resolveOptionFallback?.(resolveKey))
    },
  )

  it.each(["create", "edit"] as const)(
    "covers every AxonHub %s descriptor exactly once with compatible renderers",
    (mode) => {
      const policy = getManagedResourceFieldPolicy(
        SITE_TYPES.AXON_HUB,
        MANAGED_RESOURCE_KINDS.Channel,
        mode,
      )

      expect(policy).toBeDefined()
      const resolved = resolveManagedResourceFieldPolicy(
        createDescriptors().filter(
          ({ fieldId }) =>
            mode === "create" ||
            fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
        ),
        policy!,
      )

      expect(resolved.hiddenFields).toEqual([
        { fieldId: "manualModels", reason: "read-only" },
      ])
      expect(
        new Set(
          resolved.fields.map(({ presentation }) => presentation.fieldId),
        ),
      ).toEqual(
        new Set(
          (mode === "create"
            ? AXON_HUB_CREATE_FIELD_IDS
            : AXON_HUB_EDITABLE_FIELD_IDS
          ).filter(
            (fieldId) => fieldId !== AXON_HUB_CHANNEL_FIELD_IDS.MANUAL_MODELS,
          ),
        ),
      )
      expect(
        new Set(resolved.fields.map(({ presentation }) => presentation.fieldId))
          .size,
      ).toBe(
        (mode === "create"
          ? AXON_HUB_CREATE_FIELD_IDS
          : AXON_HUB_EDITABLE_FIELD_IDS
        ).length - 1,
      )
      for (const { descriptor, presentation } of resolved.fields) {
        expect(presentation.renderer).toBe(descriptor.type)
      }
    },
  )

  it("owns common-field renderer selection and textarea layout", () => {
    const policy = getManagedResourceFieldPolicy(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
      "edit",
    )!

    expect(
      Object.fromEntries(
        policy.fields
          .filter(({ fieldId }) =>
            [
              "name",
              "type",
              "key",
              "baseURL",
              "supportedModels",
              "status",
            ].includes(fieldId),
          )
          .map(({ fieldId, renderer, resolveLabel }) => [
            fieldId,
            { renderer, label: resolveLabel(resolveKey) },
          ]),
      ),
    ).toEqual({
      name: {
        renderer: "text",
        label: "channelDialog:fields.name.label",
      },
      type: {
        renderer: "select",
        label: "channelDialog:fields.type.label",
      },
      key: {
        renderer: "secret",
        label: "channelDialog:fields.key.label",
      },
      baseURL: {
        renderer: "text",
        label: "channelDialog:fields.baseUrl.label",
      },
      supportedModels: {
        renderer: "multi-select",
        label: "channelDialog:fields.models.label",
      },
      status: {
        renderer: "select",
        label: "channelDialog:fields.status.label",
      },
    })
    expect(
      policy.fields.find(({ fieldId }) => fieldId === "remark"),
    ).toMatchObject({ renderer: "textarea", rows: 3 })
    expect(
      createDescriptors().find(({ fieldId }) => fieldId === "remark"),
    ).not.toHaveProperty("rows")
  })

  it("configures native model fields with dependent select metadata and help copy", () => {
    const policy = getManagedResourceFieldPolicy(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
      "edit",
    )!

    const supportedModelsField = policy.fields.find(
      ({ fieldId }) => fieldId === "supportedModels",
    )!
    expect(supportedModelsField).toMatchObject({
      customValuesMirrorFieldId: "manualModels",
    })
    expect(supportedModelsField.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.supportedModels.help",
    )
    expect(
      policy.hiddenFields.find(({ fieldId }) => fieldId === "manualModels"),
    ).toEqual({ fieldId: "manualModels", reason: "read-only" })
    const defaultTestModelField = policy.fields.find(
      ({ fieldId }) => fieldId === "defaultTestModel",
    )!
    expect(defaultTestModelField).toMatchObject({
      renderer: "select",
      optionSourceFieldIds: ["supportedModels"],
      autoSelectFirstOption: true,
    })
    expect(defaultTestModelField.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.defaultTestModel.help",
    )
    expect(defaultTestModelField.resolvePlaceholder?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.defaultTestModel.placeholder",
    )
    const autoSyncField = policy.fields.find(
      ({ fieldId }) => fieldId === "autoSyncSupportedModels",
    )!
    expect(autoSyncField.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.autoSyncSupportedModels.help",
    )
    const patternField = policy.fields.find(
      ({ fieldId }) => fieldId === "autoSyncModelPattern",
    )!
    expect(patternField.resolveHelp?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.autoSyncModelPattern.help",
    )
    expect(patternField.resolvePlaceholder?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.autoSyncModelPattern.placeholder",
    )
    expect(patternField.issueLabelResolvers?.invalid_value?.(resolveKey)).toBe(
      "managedSiteChannels:editor.fields.autoSyncModelPattern.invalid",
    )
    expect(
      patternField.visibleWhen?.({
        [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: AXON_HUB_CHANNEL_TYPE.OPENAI,
        [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]: false,
      }),
    ).toBe(false)
    expect(
      patternField.visibleWhen?.({
        [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: AXON_HUB_CHANNEL_TYPE.OPENAI,
        [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]: true,
      }),
    ).toBe(true)
    expect(
      patternField.visibleWhen?.({
        [AXON_HUB_CHANNEL_FIELD_IDS.TYPE]: AXON_HUB_CHANNEL_TYPE.GITHUB_COPILOT,
        [AXON_HUB_CHANNEL_FIELD_IDS.AUTO_SYNC_SUPPORTED_MODELS]: true,
      }),
    ).toBe(false)
  })

  it("configures metadata and advanced fields with native guidance copy", () => {
    const policy = getManagedResourceFieldPolicy(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
      "edit",
    )!

    const expectedCopy = {
      tags: ["tags.help", "tags.placeholder"],
      remark: ["remark.help", "remark.placeholder"],
    } as const
    for (const [fieldId, [helpKey, placeholderKey]] of Object.entries(
      expectedCopy,
    )) {
      const field = policy.fields.find(
        (candidate) => candidate.fieldId === fieldId,
      )!
      expect(field.resolveHelp?.(resolveKey)).toBe(
        `managedSiteChannels:editor.fields.${helpKey}`,
      )
      expect(field.resolvePlaceholder?.(resolveKey)).toBe(
        `managedSiteChannels:editor.fields.${placeholderKey}`,
      )
    }

    expect(
      policy.fields.some(
        ({ fieldId }) =>
          fieldId === AXON_HUB_CHANNEL_FIELD_IDS.EXTRA_MODEL_PREFIX,
      ),
    ).toBe(false)
  })

  it("maps approved options to controlled labels and unknown values to one fallback", () => {
    const policy = getManagedResourceFieldPolicy(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
      "create",
    )!
    const typeField = policy.fields.find(({ fieldId }) => fieldId === "type")!
    const statusField = policy.fields.find(
      ({ fieldId }) => fieldId === "status",
    )!

    for (const value of Object.values(AXON_HUB_CHANNEL_TYPE)) {
      const label = getManagedResourceFieldOptionLabel(
        typeField,
        value,
        resolveKey,
      )
      expect(label).not.toBe(value)
      expect(label).not.toBe(typeField.resolveOptionFallback?.(resolveKey))
    }
    for (const value of Object.values(AXON_HUB_CHANNEL_STATUS)) {
      const label = getManagedResourceFieldOptionLabel(
        statusField,
        value,
        resolveKey,
      )
      expect(label).not.toBe(value)
      expect(label).not.toBe(statusField.resolveOptionFallback?.(resolveKey))
    }
    expect(
      getManagedResourceFieldOptionLabel(
        typeField,
        "future-provider",
        resolveKey,
      ),
    ).toBe(typeField.resolveOptionFallback?.(resolveKey))
    expect(
      getManagedResourceFieldOptionLabel(
        statusField,
        "future-status",
        resolveKey,
      ),
    ).toBe(statusField.resolveOptionFallback?.(resolveKey))
    for (const prototypeKey of ["toString", "constructor", "__proto__"]) {
      expect(
        getManagedResourceFieldOptionLabel(typeField, prototypeKey, resolveKey),
      ).toBe(typeField.resolveOptionFallback?.(resolveKey))
      expect(
        getManagedResourceFieldOptionLabel(
          statusField,
          prototypeKey,
          resolveKey,
        ),
      ).toBe(statusField.resolveOptionFallback?.(resolveKey))
    }
  })

  it("preserves an owned option label that intentionally equals its raw value", () => {
    const resolver = vi.fn(() => "provider-id")
    const presentation: ManagedResourceFieldPresentation = {
      fieldId: "provider",
      section: "basic",
      order: 10,
      renderer: "select",
      resolveLabel: () => "Provider",
      optionLabelResolvers: { "provider-id": resolver },
      resolveOptionFallback: () => "Unknown provider",
    }

    expect(
      getManagedResourceFieldOptionLabel(
        presentation,
        "provider-id",
        resolveKey,
      ),
    ).toBe("provider-id")
    expect(resolver).toHaveBeenCalledTimes(1)
  })

  it("provides every controlled option and fallback label in all six locales", () => {
    const policy = getManagedResourceFieldPolicy(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
      "create",
    )!
    const keys = policy.fields.flatMap((field) => [
      ...Object.values(field.optionLabelResolvers ?? {}).map((resolve) =>
        resolve(resolveKey),
      ),
      ...(field.resolveOptionFallback
        ? [field.resolveOptionFallback(resolveKey)]
        : []),
    ])

    expect(keys.length).toBeGreaterThan(0)
    for (const locale of optionLabelLocales) {
      for (const key of keys) {
        expect(resolveLocaleValue(locale, key), key).toEqual(expect.any(String))
      }
    }
  })

  it("provides every native field help, placeholder, and issue label in all six locales", () => {
    const policy = getManagedResourceFieldPolicy(
      SITE_TYPES.AXON_HUB,
      MANAGED_RESOURCE_KINDS.Channel,
      "create",
    )!
    const keys = policy.fields.flatMap((field) => [
      ...(field.resolveHelp ? [field.resolveHelp(resolveKey)] : []),
      ...(field.resolvePlaceholder
        ? [field.resolvePlaceholder(resolveKey)]
        : []),
      ...Object.values(field.issueLabelResolvers ?? {}).map((resolve) =>
        resolve(resolveKey),
      ),
    ])

    expect(keys.length).toBeGreaterThan(0)
    for (const locale of optionLabelLocales) {
      for (const key of keys) {
        expect(resolveLocaleValue(locale, key), key).toEqual(expect.any(String))
      }
    }
  })

  it("lets a second registration define mode-specific policy without copying a view", () => {
    const definition = defineManagedResourceFieldPolicy({
      siteType: SITE_TYPES.NEW_API,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      modes: {
        create: {
          fields: [
            {
              fieldId: "name",
              section: "basic",
              order: 10,
              resolveLabel: (t) => t("channelDialog:fields.name.label"),
              renderer: "text",
            },
          ],
          hiddenFields: [{ fieldId: "note", reason: "deferred" }],
        },
        edit: {
          fields: [
            {
              fieldId: "note",
              section: "metadata",
              order: 10,
              resolveLabel: (t) => t("example:fields.note"),
              renderer: "textarea",
              rows: 2,
            },
          ],
          hiddenFields: [{ fieldId: "name", reason: "read-only" }],
        },
      },
    })
    const registry = createManagedResourceFieldPolicyRegistry([definition])

    expect(
      registry.get(
        SITE_TYPES.NEW_API,
        MANAGED_RESOURCE_KINDS.Channel,
        "create",
      ),
    ).toMatchObject({
      fields: [{ fieldId: "name", renderer: "text" }],
      hiddenFields: [{ fieldId: "note", reason: "deferred" }],
    })
    expect(
      registry.get(SITE_TYPES.NEW_API, MANAGED_RESOURCE_KINDS.Channel, "edit"),
    ).toMatchObject({
      fields: [{ fieldId: "note", renderer: "textarea", rows: 2 }],
      hiddenFields: [{ fieldId: "name", reason: "read-only" }],
    })
  })

  it("rejects duplicate classification, arbitrary renderers, and descriptor mismatches", () => {
    expect(() =>
      defineManagedResourceFieldPolicy({
        siteType: SITE_TYPES.NEW_API,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        modes: {
          create: {
            fields: [
              {
                fieldId: "name",
                section: "basic",
                order: 10,
                resolveLabel: (t) => t("example:fields.name"),
                renderer: "raw-json" as never,
              },
            ],
            hiddenFields: [],
          },
          edit: { fields: [], hiddenFields: [] },
        },
      }),
    ).toThrow()

    expect(() =>
      defineManagedResourceFieldPolicy({
        siteType: SITE_TYPES.NEW_API,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        modes: {
          create: {
            fields: [
              {
                fieldId: "name",
                section: "basic",
                order: 10,
                resolveLabel: (t) => t("example:fields.name"),
                renderer: "text",
                optionSourceFieldIds: ["models"],
              },
            ],
            hiddenFields: [],
          },
          edit: { fields: [], hiddenFields: [] },
        },
      }),
    ).toThrow()

    expect(() =>
      defineManagedResourceFieldPolicy({
        siteType: SITE_TYPES.NEW_API,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        modes: {
          create: {
            fields: [
              {
                fieldId: "name",
                section: "basic",
                order: 10,
                resolveLabel: (t) => t("example:fields.name"),
                renderer: "select",
                optionSourceFieldIds: [],
              },
            ],
            hiddenFields: [],
          },
          edit: { fields: [], hiddenFields: [] },
        },
      }),
    ).toThrow()

    expect(() =>
      defineManagedResourceFieldPolicy({
        siteType: SITE_TYPES.NEW_API,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        modes: {
          create: {
            fields: [
              {
                fieldId: "name",
                section: "basic",
                order: 10,
                resolveLabel: (t) => t("example:fields.name"),
                renderer: "select",
                optionSourceFieldIds: ["models", "models"],
              },
            ],
            hiddenFields: [],
          },
          edit: { fields: [], hiddenFields: [] },
        },
      }),
    ).toThrow()

    expect(() =>
      defineManagedResourceFieldPolicy({
        siteType: SITE_TYPES.NEW_API,
        kind: MANAGED_RESOURCE_KINDS.Channel,
        modes: {
          create: {
            fields: [
              {
                fieldId: "name",
                section: "basic",
                order: 10,
                resolveLabel: (t) => t("example:fields.name"),
                renderer: "select",
                autoSelectFirstOption: true,
              },
            ],
            hiddenFields: [],
          },
          edit: { fields: [], hiddenFields: [] },
        },
      }),
    ).toThrow()

    expect(() =>
      resolveManagedResourceFieldPolicy([{ fieldId: "name", type: "number" }], {
        fields: [
          {
            fieldId: "name",
            section: "basic",
            order: 10,
            resolveLabel: (t) => t("example:fields.name"),
            renderer: "text",
          },
        ],
        hiddenFields: [{ fieldId: "name", reason: "read-only" }],
      }),
    ).toThrow()
  })
})
