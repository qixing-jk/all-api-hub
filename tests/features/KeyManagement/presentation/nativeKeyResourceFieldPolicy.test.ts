import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { getNativeKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/nativeKeyResourceFieldPolicy"
import { resolveResourceFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import { createAIHubMixKeyEditor } from "~/services/apiAdapters/aihubmix/keyResourceEditor"
import type { ResourceFieldDescriptor } from "~/services/apiAdapters/contracts/resourceNative"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiKeyVariant } from "~/services/apiAdapters/newApi/keyVariant"
import { createSub2ApiKeyEditor } from "~/services/apiAdapters/sub2api/keyResourceEditor"
import { createVoApiV2KeyEditor } from "~/services/apiAdapters/voapiV2/keyResourceEditor"
import { AuthTypeEnum } from "~/types"

const request = {
  baseUrl: "https://example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example",
    userId: 1,
  },
}

/** Supplies the same editor facts that the dialog passes in production. */
function getPresentation(
  siteType: string | undefined,
  mode: AccountKeyResourceEditorMode,
  options?: { fields: readonly ResourceFieldDescriptor[] },
) {
  const fields =
    options?.fields ??
    (getAccountSiteDefinition(siteType ?? "")?.adapterFamily ===
    ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily
      ? createNewApiKeyEditor(
          resolveNewApiKeyVariant(siteType as AccountSiteType),
          request,
        ).fields
      : undefined)
  return getNativeKeyResourceEditorPresentation(siteType, mode, { fields })
}

describe("native key editor field policies", () => {
  it.each([
    SITE_TYPES.ONE_API,
    SITE_TYPES.MODELFLARE,
    SITE_TYPES.RIX_API,
    SITE_TYPES.LAOZHANG,
  ])("renders %s field facts without knowing the variant", (siteType) => {
    const editor = createNewApiKeyEditor(
      resolveNewApiKeyVariant(siteType),
      request,
    )
    const presentation = getNativeKeyResourceEditorPresentation(
      SITE_TYPES.NEW_API,
      editorModes.Create,
      { fields: editor.fields },
    )
    const resolved = resolveResourceFieldPolicy(
      editor.fields,
      presentation.policy,
      presentation.sectionOrder,
    )
    expect(resolved.fields).toHaveLength(editor.fields.length)
  })

  it("uses descriptor nullability rather than the ModelFlare site type", () => {
    const fields = [
      { fieldId: "group", type: "select", nullable: true, options: [] },
    ] as const
    const presentation = getNativeKeyResourceEditorPresentation(
      SITE_TYPES.MODELFLARE,
      editorModes.Create,
      { fields },
    )
    expect(presentation.policy.fields.map((field) => field.fieldId)).toEqual([
      "group",
    ])
    expect(
      presentation.policy.fields[0]?.resolveNullableOptionLabel,
    ).toBeDefined()
    expect(() =>
      resolveResourceFieldPolicy(
        fields,
        presentation.policy,
        presentation.sectionOrder,
      ),
    ).not.toThrow()
  })

  it("presents only FreeModel key name, matching the website", () => {
    expect(
      getPresentation(
        SITE_TYPES.FREEMODEL,
        editorModes.Create,
      ).policy.fields.map((field) => field.fieldId),
    ).toEqual(["name"])
  })
  it("presents Grsai budgets as credits with their own explanatory text", () => {
    const fields = getPresentation(SITE_TYPES.GRSAI, editorModes.Edit).policy
      .fields
    const credits = fields.find((field) => field.fieldId === "credits")!
    const translate = ((key: string) => key) as TFunction
    expect(credits.resolveLabel(translate)).toBe(
      "keyManagement:native.editor.quotaCredits",
    )
    expect(credits.resolveHelp?.(translate)).toBe(
      "keyManagement:native.editor.quotaCreditsHelp",
    )
    expect(fields.map((field) => field.fieldId)).toEqual([
      "name",
      "unlimited_credits",
      "credits",
      "expires_at",
    ])
  })
  it.each([SITE_TYPES.KIMI, SITE_TYPES.KIMI_GLOBAL])(
    "presents only the supported name field for %s",
    (siteType) => {
      expect(
        getPresentation(siteType, editorModes.Create).policy.fields.map(
          (field) => field.fieldId,
        ),
      ).toEqual(["name"])
      expect(
        getPresentation(siteType, editorModes.Edit).policy.fields.map(
          (field) => field.fieldId,
        ),
      ).toEqual(["name"])
    },
  )
  it.each([
    ["required", "required"],
    ["invalid_value", "invalidValue"],
    ["out_of_range", "outOfRange"],
    ["unsupported_option", "unsupportedOption"],
    ["inconsistent_value", "inconsistentValue"],
  ] as const)(
    "provides actionable translated feedback for %s validation",
    (code, suffix) => {
      const presentation = getPresentation(
        SITE_TYPES.NEW_API,
        editorModes.Create,
      )
      const name = presentation.policy.fields.find(
        (field) => field.fieldId === "name",
      )!
      const translate = ((key: string) => key) as TFunction
      expect(name.issueLabelResolvers?.[code]?.(translate)).toBe(
        `keyManagement:native.editor.issues.${suffix}`,
      )
    },
  )

  it.each([undefined, "Model specific key"])(
    "prefills the selected group name and preserves an explicit name hint %s",
    (nameHint) => {
      const intent = { preferredGroup: "Priority", nameHint }
      const groups = [{ id: 11, displayName: "Priority" }]
      const editors = [
        createNewApiKeyEditor(
          resolveNewApiKeyVariant(SITE_TYPES.NEW_API),
          request,
          undefined,
          intent,
        ),
        createSub2ApiKeyEditor(
          request,
          undefined,
          intent,
          groups.map((group) => ({ ...group, description: "", ratio: 1 })),
        ),
        createVoApiV2KeyEditor(
          request,
          undefined,
          intent,
          groups.map((group) => ({ ...group, requirementKey: "Priority" })),
        ),
      ]
      for (const editor of editors) {
        expect(editor.initialValues.name).toBe(
          nameHint ?? "Priority group (auto)",
        )
      }
    },
  )

  it("keeps group IDs out of generated names when option labels are unavailable", () => {
    const presentation = getPresentation(SITE_TYPES.SUB2API, editorModes.Create)
    expect(
      presentation.getAutomaticName?.({ group_id: "11" }, {}),
    ).toBeUndefined()
    expect(
      presentation.getAutomaticName?.(
        { group_id: "11" },
        {
          group_id: [{ value: "11" }],
        },
      ),
    ).toBeUndefined()
  })

  it("does not treat a workspace as a token group", () => {
    expect(
      getPresentation(SITE_TYPES.OPENROUTER, editorModes.Create)
        .getAutomaticName,
    ).toBeUndefined()
  })

  it.each([editorModes.Create, editorModes.Edit] as const)(
    "renders every supported provider's %s projection",
    (mode) => {
      const editors = [
        ...[SITE_TYPES.NEW_API, SITE_TYPES.ONE_API, SITE_TYPES.MODELFLARE].map(
          (siteType) => ({
            siteType,
            editor: createNewApiKeyEditor(
              resolveNewApiKeyVariant(siteType),
              request,
            ),
          }),
        ),
        {
          siteType: SITE_TYPES.AIHUBMIX,
          editor: createAIHubMixKeyEditor(request),
        },
        {
          siteType: SITE_TYPES.VO_API_V2,
          editor: createVoApiV2KeyEditor(request),
        },
        {
          siteType: SITE_TYPES.SUB2API,
          editor: createSub2ApiKeyEditor(
            request,
            mode === editorModes.Edit
              ? {
                  id: 1,
                  name: "Example",
                  key: "masked",
                  group_name: "",
                  status: "active",
                }
              : undefined,
          ),
        },
      ]
      for (const { siteType, editor } of editors) {
        const presentation = getPresentation(siteType, mode, {
          fields: editor.fields,
        })
        expect(
          () =>
            resolveResourceFieldPolicy(
              editor.fields,
              presentation.policy,
              presentation.sectionOrder,
            ),
          siteType,
        ).not.toThrow()
      }
    },
  )
  it("follows the editor when a generation does not declare the Rix fields", () => {
    const deploymentFieldIds = [
      "unlimited_count",
      "remain_count",
      "group_only",
      "exclude_ips",
      "storage_location",
    ] as const

    const withoutDeploymentFields = getPresentation(
      SITE_TYPES.RIX_API,
      editorModes.Edit,
      {
        fields: createNewApiKeyEditor(
          resolveNewApiKeyVariant(SITE_TYPES.RIX_API),
          request,
        ).fields.filter((field) =>
          ["name", "group", "quotaUsd"].includes(field.fieldId),
        ),
      },
    ).policy.fields.map((field) => field.fieldId)
    for (const fieldId of deploymentFieldIds) {
      expect(withoutDeploymentFields).not.toContain(fieldId)
    }

    const withDeploymentFields = getPresentation(
      SITE_TYPES.RIX_API,
      editorModes.Edit,
      {
        fields: createNewApiKeyEditor(
          resolveNewApiKeyVariant(SITE_TYPES.RIX_API),
          request,
        ).fields.filter((field) =>
          [...deploymentFieldIds, "name"].includes(field.fieldId),
        ),
      },
    ).policy.fields.map((field) => field.fieldId)
    for (const fieldId of deploymentFieldIds) {
      expect(withDeploymentFields).toContain(fieldId)
    }
  })

  it("exposes the deployment-owned fields for Rix API keys only", () => {
    const rixFields = getPresentation(SITE_TYPES.RIX_API, editorModes.Edit)
      .policy.fields
    const rixFieldIds = rixFields.map((field) => field.fieldId)
    expect(rixFieldIds).toEqual(
      expect.arrayContaining([
        "unlimited_count",
        "remain_count",
        "group_only",
        "exclude_ips",
        "storage_location",
      ]),
    )

    const translate = ((key: string) => key) as TFunction

    const unlimitedCount = rixFields.find(
      (field) => field.fieldId === "unlimited_count",
    )!
    expect(unlimitedCount.resolveLabel?.(translate)).toBe(
      "keyManagement:native.editor.unlimitedCount",
    )
    expect(unlimitedCount.resolveHelp?.(translate)).toBe(
      "keyManagement:native.editor.unlimitedCountHelp",
    )

    const remainingCount = rixFields.find(
      (field) => field.fieldId === "remain_count",
    )!
    expect(remainingCount.resolveLabel?.(translate)).toBe(
      "keyManagement:native.editor.remainingCount",
    )
    expect(remainingCount.resolvePlaceholder?.(translate)).toBe(
      "keyManagement:native.editor.remainingCountPlaceholder",
    )
    expect(remainingCount.visibleWhen?.({ unlimited_count: true })).toBe(false)
    expect(remainingCount.visibleWhen?.({ unlimited_count: false })).toBe(true)

    const groupOnly = rixFields.find((field) => field.fieldId === "group_only")!
    expect(groupOnly.resolveLabel?.(translate)).toBe(
      "keyManagement:native.editor.groupOnly",
    )
    expect(groupOnly.resolveHelp?.(translate)).toBe(
      "keyManagement:native.editor.groupOnlyHelp",
    )

    const excludeIps = rixFields.find(
      (field) => field.fieldId === "exclude_ips",
    )!
    expect(excludeIps.resolveLabel?.(translate)).toBe(
      "keyManagement:native.editor.excludeIps",
    )
    expect(excludeIps.resolvePlaceholder?.(translate)).toBe(
      "keyManagement:native.editor.excludeIpsPlaceholder",
    )

    const storageLocation = rixFields.find(
      (field) => field.fieldId === "storage_location",
    )!
    expect(storageLocation.renderer).toBe("select")
    expect(storageLocation.resolveLabel?.(translate)).toBe(
      "keyManagement:native.editor.storageLocation",
    )
    expect(storageLocation.resolveHelp?.(translate)).toBe(
      "keyManagement:native.editor.storageLocationHelp",
    )
    expect(storageLocation.optionLabelResolvers?.global?.(translate)).toBe(
      "keyManagement:native.editor.storageLocationGlobal",
    )
    expect(storageLocation.optionLabelResolvers?.none?.(translate)).toBe(
      "keyManagement:native.editor.storageLocationNone",
    )
    expect(storageLocation.resolveNullableOptionLabel?.(translate)).toBe(
      "keyManagement:native.editor.storageLocationUnconfigured",
    )

    for (const siteType of [SITE_TYPES.NEW_API, SITE_TYPES.SUPER_API]) {
      const fieldIds = getPresentation(
        siteType,
        editorModes.Edit,
      ).policy.fields.map((field) => field.fieldId)
      for (const fieldId of [
        "unlimited_count",
        "remain_count",
        "group_only",
        "exclude_ips",
        "storage_location",
      ]) {
        expect(fieldIds).not.toContain(fieldId)
      }
    }
  })
})

it("does not infer OpenRouter behavior when the owner is absent or unknown", () => {
  for (const siteType of [undefined, "unknown-provider", SITE_TYPES.NEW_API]) {
    const presentation = getPresentation(siteType, editorModes.Create)
    expect(presentation.summary).toBeUndefined()
    expect(presentation.requireFreshOptions).toBeUndefined()
    expect(presentation.getOptionFeedback).toBeUndefined()
  }
})

it.each([
  [
    SITE_TYPES.SUB2API,
    "quota",
    "native.editor.totalQuotaUsd",
    "dialog.quotaPlaceholder",
  ],
  [
    SITE_TYPES.AIHUBMIX,
    "models",
    "dialog.availableModels",
    "dialog.selectModels",
  ],
  [
    SITE_TYPES.AIHUBMIX,
    "subnet",
    "dialog.subnetLimits",
    "dialog.subnetPlaceholder",
  ],
  [SITE_TYPES.RIGHT_CODE, "channel", "native.editor.channel", undefined],
  [
    SITE_TYPES.RIGHT_CODE,
    "allow_wallet",
    "native.editor.allowWallet",
    undefined,
  ],
  [
    SITE_TYPES.NEW_API,
    "model_limits",
    "dialog.availableModels",
    "dialog.selectModels",
  ],
  [SITE_TYPES.NEW_API, "model_limits_enabled", "dialog.modelLimits", undefined],
] as const)(
  "provides native field labels for %s %s",
  (siteType, fieldId, label, placeholder) => {
    const field = getPresentation(
      siteType,
      editorModes.Create,
    ).policy.fields.find((field) => field.fieldId === fieldId)!
    const t = ((key: string) => key) as TFunction
    expect(field.resolveLabel?.(t)).toBe(`keyManagement:${label}`)
    if (placeholder)
      expect(field.resolvePlaceholder?.(t)).toBe(`keyManagement:${placeholder}`)
    if (fieldId === "model_limits") {
      expect(field.visibleWhen?.({ model_limits_enabled: true })).toBe(true)
      expect(field.visibleWhen?.({ model_limits_enabled: false })).toBe(false)
    }
  },
)

it("configures RightCode key editor fields and automatic naming", () => {
  const createPresentation = getPresentation(
    SITE_TYPES.RIGHT_CODE,
    editorModes.Create,
  )
  expect(
    createPresentation.policy.fields.some((f) => f.fieldId === "channel"),
  ).toBe(true)
  expect(
    createPresentation.policy.fields.some((f) => f.fieldId === "is_active"),
  ).toBe(false)
  const allowWallet = createPresentation.policy.fields.find(
    (f) => f.fieldId === "allow_wallet",
  )
  const t = ((key: string) => key) as TFunction
  expect(allowWallet?.resolveHelp?.(t)).toBe(
    "keyManagement:native.editor.allowWalletHelp",
  )

  const autoName = createPresentation.getAutomaticName?.(
    { channel: "1" },
    { channel: [{ value: "1", displayLabel: "Codex" }] },
  )
  expect(autoName).toBe("Codex group (auto)")

  const editPresentation = getPresentation(
    SITE_TYPES.RIGHT_CODE,
    editorModes.Edit,
  )
  expect(
    editPresentation.policy.fields.some((f) => f.fieldId === "is_active"),
  ).toBe(true)
})
