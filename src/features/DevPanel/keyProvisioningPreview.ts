import { CHECK_IN_SELECTION_MODES } from "~/constants/checkIn"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  SITE_TYPES,
  type AccountSiteType,
} from "~/constants/siteType"
import type { AccountKeyCreationResult } from "~/services/accounts/accountKeyCreation"
import type {
  AccountKeyProvisioningEntry,
  AccountKeyProvisioningPlan,
} from "~/services/accounts/accountKeyProvisioning"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/factory"
import {
  AccountKeyResourceError,
  type AccountKeyResourceEditor,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiFamilyTokenTransport } from "~/services/apiAdapters/newApi/tokenTransport"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { createRightCodeKeyEditor } from "~/services/apiAdapters/rightcode/keyResourceEditor"
import { createSub2ApiKeyEditor } from "~/services/apiAdapters/sub2api/keyResourceEditor"
import { createVoApiV2KeyEditor } from "~/services/apiAdapters/voapiV2/keyResourceEditor"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"

export const KEY_PROVISIONING_PREVIEW_SCENARIOS = [
  "normal",
  "single-target",
  "covered",
  "uncertain",
  "option-failure",
  "inventory-failure",
] as const
export type KeyProvisioningPreviewScenario =
  (typeof KEY_PROVISIONING_PREVIEW_SCENARIOS)[number]

const groups = [
  {
    id: 1,
    requirementKey: "1",
    displayName: "Default",
    description: "Preview default group",
    ratio: 1,
  },
  {
    id: 2,
    requirementKey: "2",
    displayName: "Premium",
    description: "Preview premium group",
    ratio: 2,
  },
]

export const DEFAULT_PREVIEW_SITE_TYPE = SITE_TYPES.NEW_API

/** Provider-specific preview guidance stays with its native-editor fixtures. */
export function getKeyProvisioningPreviewProfile(
  siteType: AccountSiteType,
  mode: AccountKeyAutoProvisionMode,
) {
  const resources =
    getSiteTypeCapabilities(siteType).account?.keyResourceManagement
  return {
    supported: Boolean(resources),
    supportsInput:
      siteType === SITE_TYPES.RIGHT_CODE ||
      (mode === "default" &&
        (siteType === SITE_TYPES.SUB2API ||
          resources?.defaultCreation === "select-requirement")),
    description: !resources
      ? "This type uses existing service credentials or does not support key management; no new keys are created."
      : siteType === SITE_TYPES.VO_API_V2
        ? "Unlimited quota by default. A single group or all groups can be provisioned automatically; multiple candidate groups require a selection."
        : siteType === SITE_TYPES.RIGHT_CODE
          ? "A single channel can be provisioned automatically; multiple channels require a selection. Both scopes prepare one key."
          : mode === "all-groups"
            ? "Fill missing group requirements, or prepare one default key when there are no group requirements."
            : "Skip existing valid keys; open the editor for required inputs or multiple candidate groups.",
  }
}

/** Local-only owner: never inserted into account storage or sent to an adapter session. */
export function createKeyProvisioningPreviewAccount(
  siteType: AccountSiteType,
): DisplaySiteData {
  return {
    id: `dev-key-preview-${siteType}`,
    name: `Preview · ${siteType}`,
    username: "preview",
    baseUrl: "https://key-preview.example.invalid",
    siteType,
    token: "",
    userId: "preview",
    authType: AuthTypeEnum.None,
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    todayStatsAvailability: {
      consumption: { status: "unavailable", reason: "not_collected" },
      requests: { status: "unavailable", reason: "not_collected" },
      tokens: { status: "unavailable", reason: "not_collected" },
      income: { status: "unavailable", reason: "not_collected" },
    },
    health: { status: SiteHealthStatus.Healthy },
    checkIn: {
      automaticExecutionEnabled: false,
      methodKnowledge: { methods: {} },
      selection: { mode: CHECK_IN_SELECTION_MODES.Automatic },
    },
  }
}

/** Reuses native field definitions and validation, with exclusively local option loaders. */
export async function prepareKeyProvisioningPreview(
  account: DisplaySiteData,
  mode: AccountKeyAutoProvisionMode,
  options: {
    scenario?: KeyProvisioningPreviewScenario
    delayMs?: number
    signal?: AbortSignal
    onCreated?: (label: string) => void
  } = {},
): Promise<AccountKeyProvisioningPlan> {
  options.signal?.throwIfAborted()
  const capabilities = getSiteTypeCapabilities(account.siteType)
  const resources = capabilities.account?.keyResourceManagement
  if (!resources || options.scenario === "inventory-failure")
    throw new AccountKeyResourceError({ code: "unavailable" })
  const request = {
    baseUrl: account.baseUrl,
    auth: { authType: AuthTypeEnum.None },
  }
  const isVoApi = account.siteType === SITE_TYPES.VO_API_V2
  const hasGroups =
    isVoApi ||
    account.siteType === SITE_TYPES.SUB2API ||
    (capabilities.family === ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily &&
      account.siteType !== SITE_TYPES.ONE_API)
  const availableGroups =
    options.scenario === "single-target" ? groups.slice(0, 1) : groups
  const targets =
    mode === "all-groups" && hasGroups ? availableGroups : [undefined]
  if (options.scenario === "covered")
    return { coveredCount: targets.length, entries: [] }
  let created = 0
  const entries: AccountKeyProvisioningEntry[] = targets.map(
    (target, index) => {
      const label = target?.displayName ?? account.name
      const key = target?.requirementKey ?? "default"
      const create = async (): Promise<AccountKeyCreationResult> => {
        // A slow mock makes progress and in-flight cancellation inspectable.
        if (options.delayMs)
          await new Promise((resolve) => setTimeout(resolve, options.delayMs))
        if (options.scenario === "uncertain" && index === targets.length - 1)
          throw new AccountKeyResourceError({
            code: "mutation_state_uncertain",
          })
        created += 1
        options.onCreated?.(label)
        const ref = {
          accountId: account.id,
          siteType: account.siteType,
          scopeKey: "preview",
          resourceId: `preview-${created}`,
        }
        return {
          ref,
          facts: {
            ref,
            displayName: label,
            maskedLabel: "sk-preview…",
            status: "enabled",
            fields: [],
            actions: { canUpdate: false, canDelete: false },
          },
          ...(resources.inventorySecretAvailability ===
          INVENTORY_SECRET_AVAILABILITIES.CreateResponseOnly
            ? {
                createdSecret: createAccountKeyResourceCreatedRuntimeSecret({
                  ref,
                  displayName: `Preview · ${label}`,
                  secret: `sk-preview-not-a-real-key-${created}`,
                  credential: {
                    accountName: account.name,
                    baseUrl: account.baseUrl,
                    siteType: account.siteType,
                    apiType: "openai",
                    tagIds: [],
                  },
                }),
              }
            : {}),
        }
      }
      let definition:
        | Pick<
            AccountKeyResourceEditorDefinition<unknown>,
            "fields" | "initialValues" | "validate" | "loadOptions"
          >
        | undefined
      let groupField: string | undefined
      let groupOptions = availableGroups.map((group) => ({
        value: String(group.id),
        displayLabel: group.displayName,
      }))
      if (isVoApi && mode === "default" && availableGroups.length > 1) {
        definition = createVoApiV2KeyEditor(
          request,
          undefined,
          undefined,
          availableGroups,
          target?.id,
        )
        groupField = "groups"
        if (target)
          groupOptions = groupOptions.filter(
            (group) => group.value === String(target.id),
          )
      } else if (
        mode === "default" &&
        account.siteType === SITE_TYPES.SUB2API &&
        availableGroups.length > 1
      ) {
        definition = createSub2ApiKeyEditor(
          request,
          undefined,
          undefined,
          availableGroups,
        )
        groupField = "group_id"
      } else if (
        account.siteType === SITE_TYPES.RIGHT_CODE &&
        availableGroups.length > 1
      ) {
        definition = createRightCodeKeyEditor({
          channels: availableGroups.map((group) => ({
            id: group.id,
            name: group.displayName,
            prefix: `/preview-${group.id}`,
            models: ["preview-model"],
          })),
        })
      } else if (
        mode === "default" &&
        resources.defaultCreation === "select-requirement" &&
        availableGroups.length > 1
      ) {
        definition = createNewApiKeyEditor(
          account.siteType,
          request,
          resolveNewApiFamilyTokenTransport(account.siteType),
        )
        groupField = "group"
        groupOptions = groups.map((group) => ({
          value: group.displayName,
          displayLabel: group.displayName,
        }))
      }
      const editor: AccountKeyResourceEditor | undefined = definition
        ? {
            fields: definition.fields,
            initialValues: definition.initialValues,
            validate: definition.validate,
            resolveDestinationScopeKey: () => "preview",
            submit: async (values) => {
              const validation = definition!.validate(values)
              if (!validation.valid)
                throw new AccountKeyResourceError({
                  code: "validation_failed",
                  fieldIssues: validation.issues,
                })
              return create()
            },
            loadOptions: async (fieldId, values) => {
              if (options.scenario === "option-failure")
                throw new AccountKeyResourceError({ code: "unavailable" })
              if (fieldId === groupField) return groupOptions
              // RightCode's loader depends only on its in-memory channel descriptors.
              if (account.siteType === SITE_TYPES.RIGHT_CODE)
                return (await definition!.loadOptions?.(fieldId, values)) ?? []
              return [{ value: "preview-model", displayLabel: "Preview model" }]
            },
          }
        : undefined
      return {
        key,
        label,
        ...(editor ? { editor } : {}),
        create: editor
          ? (values) =>
              editor.submit(values ?? editor.initialValues).then((result) => ({
                ...result,
                ref: result.facts?.ref ?? null,
              }))
          : create,
      }
    },
  )
  return { coveredCount: 0, entries }
}
