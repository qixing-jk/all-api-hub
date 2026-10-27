import { createInstance } from "i18next"
import type { TFunction } from "i18next"
import { describe, expect, expectTypeOf, it } from "vitest"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  type AccountKeyResourceEditorMode,
} from "~/features/KeyManagement/constants"
import { resolveAccountKeyAutomaticName } from "~/features/KeyManagement/presentation/accountKeyAutomaticName"
import { ACCOUNT_KEY_AUTOMATIC_NAME_KINDS } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import type { AccountKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/accountKeyResourceEditorPresentation"
import { getNativeKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/nativeKeyResourceFieldPolicy"
import { resolveResourceFieldPolicy } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import zhKeyManagement from "~/locales/zh-CN/keyManagement.json"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import { createAIHubMixKeyEditor } from "~/services/apiAdapters/aihubmix/keys/keyResourceEditor"
import type { ResourceFieldDescriptor } from "~/services/apiAdapters/contracts/resourceNative"
import { createCubenceKeyEditor } from "~/services/apiAdapters/cubence/keyEditor"
import {
  EMRANK_EXPIRATION_MODES,
  emrankKeyFields,
} from "~/services/apiAdapters/emrank/keyResourceFields"
import { createFoxCodeKeyEditor } from "~/services/apiAdapters/foxcode/keyEditor"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keys/keyResourceEditor"
import { resolveNewApiKeyVariant } from "~/services/apiAdapters/newApi/keys/keyVariant"
import { novitaKeyEditor } from "~/services/apiAdapters/novita/keyEditor"
import {
  createRelayForKeyEditor,
  editRelayForKeyEditor,
} from "~/services/apiAdapters/relayfor/accountKeyResource"
import { createSub2ApiKeyEditor } from "~/services/apiAdapters/sub2api/keys/keyResourceEditor"
import { createVercelKeyEditor } from "~/services/apiAdapters/vercelAiGateway/keyEditor"
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

it("renders Novita API-key policy editing without requiring an unavailable name field", () => {
  const editor = novitaKeyEditor(request, {
    name: "Existing key",
    allowedIps: [],
    canRename: false,
    modelPolicy: {
      schemaVersion: 1,
      productScope: "model_api",
      mode: "all_enabled",
      allowedModels: [],
      excludedModels: [],
    },
  })
  const presentation = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.NOVITA,
    editorModes.Edit,
    { fields: editor.fields },
  )
  expect(() =>
    resolveResourceFieldPolicy(
      editor.fields,
      presentation.policy,
      presentation.sectionOrder,
    ),
  ).not.toThrow()
  expect(
    presentation.policy.fields.map((field) => field.fieldId),
  ).not.toContain("name")
})

it("presents Novita lifecycle and conditional native model/IP controls", () => {
  const create = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.NOVITA,
    editorModes.Create,
  )
  expect(create.policy.fields.map((field) => field.fieldId)).toEqual([
    "name",
    "lifecycle",
    "model_mode",
    "excluded_models",
    "allowed_models",
    "ip_restricted",
    "allowed_ips",
  ])
  expect(
    create.policy.fields
      .find((field) => field.fieldId === "allowed_models")
      ?.visibleWhen?.({ model_mode: "selected" }),
  ).toBe(true)
  expect(
    create.policy.fields
      .find((field) => field.fieldId === "excluded_models")
      ?.visibleWhen?.({ model_mode: "selected" }),
  ).toBe(false)
  expect(
    create.policy.fields
      .find((field) => field.fieldId === "allowed_ips")
      ?.visibleWhen?.({ ip_restricted: false }),
  ).toBe(false)
  const edit = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.NOVITA,
    editorModes.Edit,
  )
  expect(edit.policy.fields.map((field) => field.fieldId)).not.toContain(
    "lifecycle",
  )
})

it("presents Vercel budget editing when attribution is unavailable", () => {
  const editor = createVercelKeyEditor(undefined, { canSetAttribution: false })
  const presentation = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.VERCEL_AI_GATEWAY,
    editorModes.Create,
    { fields: editor.fields },
  )
  expect(() =>
    resolveResourceFieldPolicy(
      editor.fields,
      presentation.policy,
      presentation.sectionOrder,
    ),
  ).not.toThrow()
  expect(
    presentation.policy.fields.map((field) => field.fieldId),
  ).not.toContain("spend_attribution")
})

it("shows Vercel budget controls only after enabling a custom budget", () => {
  const editor = createVercelKeyEditor()
  const presentation = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.VERCEL_AI_GATEWAY,
    editorModes.Create,
    { fields: editor.fields },
  )
  const fields = presentation.policy.fields
  expect(
    fields.find((field) => field.fieldId === "budget_enabled")?.renderer,
  ).toBe("boolean")
  expect(
    fields.find((field) => field.fieldId === "budget_alerts")
      ?.multiSelectLayout,
  ).toBe("cards")
  expect(
    fields
      .find((field) => field.fieldId === "budget_limit")
      ?.visibleWhen?.(editor.initialValues),
  ).toBe(false)
  expect(
    fields
      .find((field) => field.fieldId === "budget_limit")
      ?.visibleWhen?.({ ...editor.initialValues, budget_enabled: true }),
  ).toBe(true)
})

it.each([SITE_TYPES.NEW_API, SITE_TYPES.SUB2API, SITE_TYPES.OPENROUTER])(
  "keeps the existing section presentation for %s when styling Daya",
  (siteType) => {
    for (const mode of [editorModes.Create, editorModes.Edit]) {
      expect(getPresentation(siteType, mode).policy.sections).toBeUndefined()
    }
  },
)

it("offers Daya expiry during creation", () => {
  const presentation = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.DAYA,
    editorModes.Create,
  )
  expect(presentation.policy.fields).toContainEqual(
    expect.objectContaining({ fieldId: "expiresInDays", renderer: "number" }),
  )
})

it.each([editorModes.Create, editorModes.Edit])(
  "presents Daya native controls and collapsed restriction summaries in %s mode",
  (mode) => {
    const presentation = getNativeKeyResourceEditorPresentation(
      SITE_TYPES.DAYA,
      mode,
    )
    const t = ((key: string) => key) as TFunction
    const byId = (id: string) =>
      presentation.policy.fields.find((field) => field.fieldId === id)!
    expect(byId("allowFast").resolveLabel(t)).toBe(
      "keyManagement:native.editor.daya.allowFast",
    )
    expect(byId("allowFast").resolveHelp?.(t)).toBe(
      "keyManagement:native.editor.daya.allowFastHelp",
    )
    expect(byId("groupIds").resolveHelp?.(t)).toBe(
      "keyManagement:native.editor.daya.groupOrderHelp",
    )
    expect(byId("rateLimit5h").resolveHelp?.(t)).toBe(
      "keyManagement:native.editor.daya.budgetHelp",
    )
    expect(byId("rateLimit7d").resolveLabel(t)).toBe(
      "keyManagement:native.editor.daya.budget7d",
    )
    expect(byId("ipBlacklist").resolveLabel(t)).toBe(
      "keyManagement:native.editor.daya.ipBlacklist",
    )
    expect(byId("ipWhitelist").resolveHelp?.(t)).toBe(
      "keyManagement:native.editor.allowlistHelp",
    )
    expect(byId("ipBlacklist").resolveHelp?.(t)).toBe(
      "keyManagement:native.editor.allowlistHelp",
    )
    if (mode === editorModes.Create) {
      expect(byId("customKey").resolveHelp?.(t)).toBe(
        "keyManagement:native.editor.daya.customKeyHelp",
      )
    }
    const expiry = byId(
      mode === editorModes.Create ? "expiresInDays" : "expiresAt",
    )
    expect(expiry.resolveLabel(t)).toBe(
      mode === editorModes.Create
        ? "keyManagement:native.editor.expiryDays"
        : "keyManagement:dialog.expiration",
    )
    expect(expiry.resolveHelp?.(t)).toBe(
      mode === editorModes.Create
        ? ""
        : "keyManagement:dialog.expirationPlaceholder",
    )
    const summary = presentation.policy.sections!.advanced!.resolveSummary!
    expect(summary(t, {})).toBe("")
    expect(
      summary(t, {
        ipWhitelist: "192.0.2.1",
        ipBlacklist: "203.0.113.0/24",
        customKey: { kind: "replace", value: "secret" },
      }),
    ).toBe(
      "keyManagement:native.editor.daya.ipWhitelist · keyManagement:native.editor.daya.ipBlacklist · keyManagement:native.editor.daya.customKey",
    )
  },
)

it.each([editorModes.Create, editorModes.Edit])(
  "presents PM-API native controls in %s mode",
  (mode) => {
    const presentation = getNativeKeyResourceEditorPresentation(
      SITE_TYPES.PMAPI,
      mode,
    )
    const t = ((key: string) => key) as TFunction
    const byId = (id: string) =>
      presentation.policy.fields.find((field) => field.fieldId === id)!
    expect(byId("grp").resolveLabel(t)).toBe("keyManagement:dialog.groupLabel")
    expect(byId("rpm").resolveLabel(t)).toBe(
      "keyManagement:native.editor.pmapi.rpm",
    )
    expect(byId("rpm").resolveHelp?.(t)).toBe(
      "keyManagement:native.editor.pmapi.rpmHelp",
    )
    expect(byId("models").resolveLabel(t)).toBe(
      "keyManagement:dialog.availableModels",
    )
    expect(byId("subnet").resolveLabel(t)).toBe("keyManagement:dialog.ipLimits")
    expect(byId("quotaUsd").resolveLabel(t)).toBe(
      "keyManagement:native.editor.totalQuotaUsd",
    )
    expect(byId("expiresAt").resolveLabel(t)).toBe(
      "keyManagement:dialog.expiration",
    )
    // Lifecycle lives in row actions; the dialog never carries a status
    // field, matching the console edit form.
    expect(
      presentation.policy.fields.some((field) => field.fieldId === "enabled"),
    ).toBe(false)
  },
)

it.each([
  ["budget_5h", "budget5h", "budgetResetHelp"],
  ["budget_day", "budgetDay", ""],
  ["budget_week", "budgetWeek", ""],
  ["budget_month", "budgetMonth", ""],
  ["requests_per_minute", "keyRpm", "keyRateHelp"],
  ["concurrent_requests", "keyConcurrency", "keyRateHelp"],
  ["unlimited_quota", "keyUnlimitedQuota", "keyUnlimitedQuotaHelp"],
  ["quota", "independentQuotaUsd", "followAccountQuotaHelp"],
  ["model_limits", "modelAllowlist", "allowlistHelp"],
  ["ip_limits", "ipCidrAllowlist", "allowlistHelp"],
])("explains the native RelayFor setting %s", (id, label, help) => {
  const presentation = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.RELAYFOR,
    editorModes.Edit,
  )
  const field = presentation.policy.fields.find((f) => f.fieldId === id)!
  const t = ((key: string) => key) as TFunction
  expect(field.resolveLabel(t)).toBe(`keyManagement:native.editor.${label}`)
  expect(field.resolveHelp?.(t)).toBe(
    help ? `keyManagement:native.editor.${help}` : "",
  )
  expect(presentation.sectionLabelResolvers.limits?.(t)).toBe(
    "keyManagement:native.editor.budgetsAndLimits",
  )
})

it.each(["rotate", "enable", "disable"] as const)(
  "explains the consequence of %s without editable settings",
  (action) => {
    const presentation = getNativeKeyResourceEditorPresentation(
      SITE_TYPES.RELAYFOR,
      editorModes.Edit,
      { action },
    )
    const t = ((key: string) => key) as TFunction
    expect(presentation.policy.fields).toEqual([])
    expect(presentation.title?.(t, {})).toBe(
      `keyManagement:native.actions.${action}`,
    )
    expect(presentation.submitLabel?.(t, {})).toBe(
      `keyManagement:native.actions.${action}`,
    )
    expect(presentation.summary?.describe({}, t, "en")).toBe(
      `keyManagement:native.lifecycle.${action}Description`,
    )
  },
)

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
  it("labels EMRank native quota and shows only the selected spending and expiry fields", () => {
    const fields = getPresentation(SITE_TYPES.EMRANK, editorModes.Create).policy
      .fields
    const t = ((key: string) => key) as TFunction
    const field = (id: string) => fields.find((item) => item.fieldId === id)!
    expect(field(emrankKeyFields.Unlimited).resolveLabel(t)).toBe(
      "keyManagement:dialog.unlimitedQuota",
    )
    expect(field(emrankKeyFields.Quota).resolveLabel(t)).toBe(
      "keyManagement:native.editor.emrank.quotaMToken",
    )
    expect(field(emrankKeyFields.Quota).resolveHelp?.(t)).toBe(
      "keyManagement:native.editor.emrank.quotaHelp",
    )
    expect(field(emrankKeyFields.ExpirationMode).resolveLabel(t)).toBe(
      "keyManagement:native.editor.emrank.expiration",
    )
    for (const unlimited of [true, false])
      expect(
        field(emrankKeyFields.Quota).visibleWhen?.({
          [emrankKeyFields.Unlimited]: unlimited,
        }),
      ).toBe(!unlimited)
    for (const mode of [
      EMRANK_EXPIRATION_MODES.Custom,
      EMRANK_EXPIRATION_MODES.Never,
    ])
      expect(
        field(emrankKeyFields.ExpiresAt).visibleWhen?.({
          [emrankKeyFields.ExpirationMode]: mode,
        }),
      ).toBe(mode === EMRANK_EXPIRATION_MODES.Custom)
  })
  it("presents FoxCode name, description, channel and quota without unrelated fields", () => {
    const editor = createFoxCodeKeyEditor(async () => [])
    const presentation = getPresentation(
      SITE_TYPES.FOXCODE,
      editorModes.Create,
      { fields: editor.fields },
    )
    expect(presentation.requireFreshOptions).toBe(true)
    expect(presentation.policy.fields.map((field) => field.fieldId)).toEqual([
      "name",
      "description",
      "channelKey",
      "unlimited",
      "quotaUsd",
    ])
    expect(
      resolveResourceFieldPolicy(
        editor.fields,
        presentation.policy,
        presentation.sectionOrder,
      ).fields,
    ).toHaveLength(editor.fields.length)
  })
  it("presents only native Cubence creation fields and hides finite quota when unlimited", () => {
    const editor = createCubenceKeyEditor(async () => [])
    const presentation = getPresentation(
      SITE_TYPES.CUBENCE,
      editorModes.Create,
      { fields: editor.fields },
    )
    const resolved = resolveResourceFieldPolicy(
      editor.fields,
      presentation.policy,
      presentation.sectionOrder,
    )
    expect(resolved.fields).toHaveLength(editor.fields.length)
    expect(presentation.requireFreshOptions).toBe(true)
    expect(presentation.policy.fields.map((field) => field.fieldId)).toEqual([
      "name",
      "group",
      "unlimited",
      "quota",
    ])
    const quota = presentation.policy.fields.find(
      (field) => field.fieldId === "quota",
    )!
    expect(quota.visibleWhen?.({ unlimited: true })).toBe(false)
    expect(quota.visibleWhen?.({ unlimited: false })).toBe(true)
    expect(
      getPresentation(SITE_TYPES.CUBENCE, editorModes.Edit).policy.fields.map(
        (field) => field.fieldId,
      ),
    ).toEqual(["group", "unlimited", "quota", "enabled"])
  })
  it("keeps Cubence status in basic information without an unsupported expiration section", () => {
    const { policy } = getPresentation(SITE_TYPES.CUBENCE, editorModes.Edit)
    expect(
      policy.fields.find((field) => field.fieldId === "enabled"),
    ).toMatchObject({
      section: "basic",
    })
    expect(policy.fields.some((field) => field.section === "lifecycle")).toBe(
      false,
    )
  })
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
      resolveAccountKeyAutomaticName(
        presentation.automaticName,
        { group_id: "11" },
        {},
      ),
    ).toBeUndefined()
    expect(
      resolveAccountKeyAutomaticName(
        presentation.automaticName,
        { group_id: "11" },
        {
          group_id: [{ value: "11" }],
        },
      ),
    ).toBeUndefined()
  })

  it("does not treat a workspace as a token group", () => {
    expect(
      getPresentation(SITE_TYPES.OPENROUTER, editorModes.Create).automaticName,
    ).toEqual({ kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed })
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

  const autoName = resolveAccountKeyAutomaticName(
    createPresentation.automaticName,
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

it("declares the grouping field or an explicit fixed naming policy", () => {
  expect(
    getPresentation(SITE_TYPES.FOXCODE, editorModes.Create).automaticName,
  ).toEqual({
    kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Group,
    fieldId: "channelKey",
    useOptionLabels: true,
    unselectedName: "default key (auto)",
  })
  expect(
    getPresentation(SITE_TYPES.GRSAI, editorModes.Create).automaticName,
  ).toEqual({ kind: ACCOUNT_KEY_AUTOMATIC_NAME_KINDS.Fixed })
})

it("presents RelayFor fields without mismatch in create and edit modes", () => {
  const createEditor = createRelayForKeyEditor()
  const createPresentation = getPresentation(
    SITE_TYPES.RELAYFOR,
    editorModes.Create,
    { fields: createEditor.fields },
  )
  expect(() =>
    resolveResourceFieldPolicy(
      createEditor.fields,
      createPresentation.policy,
      createPresentation.sectionOrder,
    ),
  ).not.toThrow()

  const editEditor = editRelayForKeyEditor({
    id: 1,
    name: "test",
    key: "sk-...",
    status: 1,
    remain_quota: 500000,
    used_quota: 0,
    unlimited_quota: true,
  })
  const editPresentation = getPresentation(
    SITE_TYPES.RELAYFOR,
    editorModes.Edit,
    { fields: editEditor.fields },
  )
  expect(() =>
    resolveResourceFieldPolicy(
      editEditor.fields,
      editPresentation.policy,
      editPresentation.sectionOrder,
    ),
  ).not.toThrow()
})

it("requires a naming decision in every editor presentation", () => {
  expectTypeOf<
    Omit<
      AccountKeyResourceEditorPresentation,
      "automaticName"
    > extends AccountKeyResourceEditorPresentation
      ? true
      : false
  >().toEqualTypeOf<false>()
})

it("presents every EMRank expiry choice as readable localized text", async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: "zh-CN",
    resources: { "zh-CN": { keyManagement: zhKeyManagement } },
  })
  const field = getPresentation(
    SITE_TYPES.EMRANK,
    editorModes.Edit,
  ).policy.fields.find((f) => f.fieldId === emrankKeyFields.ExpirationMode)!
  expect(
    Object.values(EMRANK_EXPIRATION_MODES).map((value) =>
      field.optionLabelResolvers?.[value]?.(i18n.t),
    ),
  ).toEqual([
    "保持现有有效期",
    "永不过期",
    "一个月（30 天）",
    "一天",
    "一小时",
    "自定义时间",
  ])
})

it.each([editorModes.Create, editorModes.Edit] as const)(
  "presents Requesty %s fields with management and spending guidance",
  (mode) => {
    const presentation = getPresentation(SITE_TYPES.REQUESTY, mode)
    const translate = ((key: string) => key) as TFunction
    const fields = presentation.policy.fields
    expect(fields.map((f) => f.fieldId)).toEqual(
      mode === editorModes.Create
        ? ["name", "manage_permission", "monthly_limit"]
        : ["monthly_limit", "expires_at"],
    )
    const limit = fields.find((f) => f.fieldId === "monthly_limit")!
    expect(limit.resolveLabel?.(translate)).toBe(
      "keyManagement:native.editor.requestyMonthlyLimit",
    )
    expect(limit.resolvePlaceholder?.(translate)).toBe(
      "keyManagement:native.editor.requestyMonthlyLimitPlaceholder",
    )
    if (mode === editorModes.Create) {
      const manage = fields.find((f) => f.fieldId === "manage_permission")!
      expect(manage.resolveLabel?.(translate)).toBe(
        "keyManagement:native.editor.requestyManagePermission",
      )
      expect(manage.resolveHelp?.(translate)).toBe(
        "keyManagement:native.editor.requestyManagePermissionHelp",
      )
    }
  },
)

it("resolves translated Vercel field labels and native options", async () => {
  const i18n = createInstance()
  await i18n.init({
    lng: "zh-CN",
    resources: { "zh-CN": { keyManagement: zhKeyManagement } },
    parseMissingKeyHandler: (key) => `__MISSING__${key}`,
  })
  const editor = createVercelKeyEditor()
  const presentation = getNativeKeyResourceEditorPresentation(
    SITE_TYPES.VERCEL_AI_GATEWAY,
    editorModes.Create,
    { fields: editor.fields },
  )
  const fields = presentation.policy.fields
  const translated = fields.map((field) => field.resolveLabel(i18n.t))
  expect(translated).toContain("消费归属")
  for (const field of fields) {
    expect(field.resolveLabel(i18n.t)).not.toContain("__MISSING__")
    if (field.resolveHelp)
      expect(field.resolveHelp(i18n.t)).not.toContain("__MISSING__")
    for (const resolve of Object.values(field.optionLabelResolvers ?? {}))
      expect(resolve(i18n.t)).not.toContain("__MISSING__")
    if (field.visibleWhen)
      expect(field.visibleWhen({ budget_enabled: true })).toBe(true)
  }
})
