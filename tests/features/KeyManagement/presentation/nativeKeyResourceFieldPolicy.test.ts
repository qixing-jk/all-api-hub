import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getNativeKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/nativeKeyResourceFieldPolicy"
import { resolveResourceFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"
import { createAIHubMixKeyEditor } from "~/services/apiAdapters/aihubmix/keyResourceEditor"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiFamilyTokenTransport } from "~/services/apiAdapters/newApi/tokenTransport"
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

describe("native key editor field policies", () => {
  it.each([
    ["required", "required"],
    ["invalid_value", "invalidValue"],
    ["out_of_range", "outOfRange"],
    ["unsupported_option", "unsupportedOption"],
    ["inconsistent_value", "inconsistentValue"],
  ] as const)(
    "provides actionable translated feedback for %s validation",
    (code, suffix) => {
      const presentation = getNativeKeyResourceEditorPresentation(
        SITE_TYPES.NEW_API,
        "create",
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
          SITE_TYPES.NEW_API,
          request,
          resolveNewApiFamilyTokenTransport(SITE_TYPES.NEW_API),
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
    const presentation = getNativeKeyResourceEditorPresentation(
      SITE_TYPES.SUB2API,
      "create",
    )
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
      getNativeKeyResourceEditorPresentation(SITE_TYPES.OPENROUTER, "create")
        .getAutomaticName,
    ).toBeUndefined()
  })

  it.each(["create", "edit"] as const)(
    "renders every supported provider's %s projection",
    (mode) => {
      const editors = [
        ...[SITE_TYPES.NEW_API, SITE_TYPES.ONE_API, SITE_TYPES.MODELFLARE].map(
          (siteType) => ({
            siteType,
            editor: createNewApiKeyEditor(
              siteType,
              request,
              resolveNewApiFamilyTokenTransport(siteType),
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
            mode === "edit"
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
        const presentation = getNativeKeyResourceEditorPresentation(
          siteType,
          mode,
        )
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
})

it("does not infer OpenRouter behavior when the owner is absent or unknown", () => {
  for (const siteType of [undefined, "unknown-provider", SITE_TYPES.NEW_API]) {
    const presentation = getNativeKeyResourceEditorPresentation(
      siteType,
      "create",
    )
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
    const field = getNativeKeyResourceEditorPresentation(
      siteType,
      "create",
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
  const createPresentation = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.RIGHT_CODE,
    "create",
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

  const editPresentation = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.RIGHT_CODE,
    "edit",
  )
  expect(
    editPresentation.policy.fields.some((f) => f.fieldId === "is_active"),
  ).toBe(true)
})
