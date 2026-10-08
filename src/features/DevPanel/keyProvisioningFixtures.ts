import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  type AccountSiteType,
} from "~/constants/siteType"
import { DEFAULT_AUTO_PROVISION_KEY_NAME } from "~/services/accounts/accountKeyNames"
import { createAccountKeyResourceCreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import type { AccountKeyResourceEditorDefinition } from "~/services/apiAdapters/accountKeyResources/definition"
import { createAIHubMixKeyEditor } from "~/services/apiAdapters/aihubmix/keyResourceEditor"
import {
  AccountKeyResourceError,
  type AccountKeyProvisioningRequirement,
  type AccountKeyProvisioningSnapshot,
  type AccountKeyResourceCapability,
  type AccountKeyResourceFacts,
  type AccountKeyResourceSession,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { INVENTORY_SECRET_AVAILABILITIES } from "~/services/apiAdapters/contracts/inventorySecret"
import { createFreeModelKeyEditor } from "~/services/apiAdapters/freemodel/keyResources"
import { createGrsaiKeyEditor } from "~/services/apiAdapters/grsai/keyResourceEditor"
import { createKimiKeyEditor } from "~/services/apiAdapters/kimiOpenPlatform/accountKeyResource"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiKeyVariant } from "~/services/apiAdapters/newApi/keyVariant"
import { createOpenRouterKeyEditorProjection } from "~/services/apiAdapters/openrouter/keyEditorSession"
import { OPENROUTER_KEY_FIELD_IDS } from "~/services/apiAdapters/openrouter/keyResourceFields"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import { createRightCodeKeyEditor } from "~/services/apiAdapters/rightcode/keyResourceEditor"
import { createSub2ApiKeyEditor } from "~/services/apiAdapters/sub2api/keyResourceEditor"
import { createVoApiV2KeyEditor } from "~/services/apiAdapters/voapiV2/keyResourceEditor"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"

import type { KeyProvisioningPreviewScenario } from "./keyProvisioningPreview"

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
type Groups = typeof groups
type EditorDefinition = Pick<
  AccountKeyResourceEditorDefinition<unknown>,
  "fields" | "initialValues" | "validate" | "loadOptions"
>
type Fixture = {
  readonly description?: string
  readonly supportsInputForAllGroups?: boolean
  readonly emptyRequirementsAction?: AccountKeyProvisioningSnapshot["emptyRequirementsAction"]
  requirements?(): Promise<readonly AccountKeyProvisioningRequirement[]>
  editor(requirementKey?: string): EditorDefinition
  readonly fieldOptions?: {
    fieldId: string
    values: readonly { value: string; displayLabel: string }[]
  }
  readonly useNativeOptionLoader?: boolean
}
type FixtureParams = { siteType: AccountSiteType; availableGroups: Groups }

/** Native requirement identities and forms belong to fixtures, not to the preview planner. */
const groupedRequirements = (availableGroups: Groups) => async () =>
  availableGroups.map((group) => ({
    requirementKey: group.requirementKey,
    displayName: group.displayName,
    provisioning: { kind: "automatic" as const },
  }))

const fixtures = {
  [ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily]: ({
    siteType,
    availableGroups,
  }: FixtureParams): Fixture => {
    const variant = resolveNewApiKeyVariant(siteType)
    const groupCatalog = Object.fromEntries(
      availableGroups.map((group) => [
        group.displayName,
        { desc: group.description, ratio: group.ratio },
      ]),
    )
    let requirementSnapshot: readonly AccountKeyProvisioningRequirement[] = []
    const requirements = async () =>
      (requirementSnapshot = await variant.group.loadRequirements(
        async () => groupCatalog,
        "Preview account",
      ))
    return {
      requirements,
      emptyRequirementsAction: "default-creation",
      editor: (requirementKey) =>
        createNewApiKeyEditor(
          variant,
          previewRequest,
          undefined,
          requirementKey
            ? {
                preferredGroup: variant.group.resolveRequirementGroup(
                  requirementSnapshot,
                  requirementKey,
                ),
              }
            : undefined,
        ),
      fieldOptions: {
        fieldId: "group",
        values: availableGroups.map((group) => ({
          value: group.displayName,
          displayLabel: group.displayName,
        })),
      },
    }
  },
  [ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2]: ({
    availableGroups,
  }: FixtureParams): Fixture => ({
    requirements: groupedRequirements(availableGroups),
    editor: (requirementKey) =>
      createVoApiV2KeyEditor(
        previewRequest,
        undefined,
        undefined,
        availableGroups,
        requirementKey
          ? availableGroups.find(
              (group) => group.requirementKey === requirementKey,
            )?.id
          : undefined,
      ),
    fieldOptions: {
      fieldId: "groups",
      values: availableGroups.map((group) => ({
        value: String(group.id),
        displayLabel: group.displayName,
      })),
    },
    description:
      "Unlimited quota by default. A single group or all groups can be provisioned automatically; multiple candidate groups require a selection.",
  }),
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api]: ({
    availableGroups,
  }: FixtureParams): Fixture => ({
    requirements: groupedRequirements(availableGroups),
    editor: (requirementKey) =>
      createSub2ApiKeyEditor(
        previewRequest,
        undefined,
        requirementKey
          ? {
              preferredGroup: availableGroups.find(
                (group) => group.requirementKey === requirementKey,
              )?.displayName,
            }
          : undefined,
        availableGroups,
      ),
    fieldOptions: {
      fieldId: "group_id",
      values: availableGroups.map((group) => ({
        value: String(group.id),
        displayLabel: group.displayName,
      })),
    },
  }),
  [ACCOUNT_SITE_ADAPTER_FAMILIES.RightCode]: ({
    availableGroups,
  }: FixtureParams): Fixture => ({
    editor: () =>
      createRightCodeKeyEditor({
        channels: availableGroups.map((group) => ({
          id: group.id,
          name: group.displayName,
          prefix: `/preview-${group.id}`,
          models: ["preview-model"],
        })),
      }),
    supportsInputForAllGroups: true,
    useNativeOptionLoader: true,
    description:
      "A single channel can be provisioned automatically; multiple channels require a selection. Both scopes prepare one key.",
  }),
  [ACCOUNT_SITE_ADAPTER_FAMILIES.FreeModel]: (): Fixture => ({
    editor: () => createFreeModelKeyEditor(),
  }),
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Grsai]: (): Fixture => ({
    editor: () => createGrsaiKeyEditor({}),
  }),
  [ACCOUNT_SITE_ADAPTER_FAMILIES.KimiOpenPlatform]: (): Fixture => ({
    editor: () => createKimiKeyEditor(DEFAULT_AUTO_PROVISION_KEY_NAME),
  }),
  [ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix]: (): Fixture => ({
    editor: () => createAIHubMixKeyEditor(previewRequest),
  }),
  [ACCOUNT_SITE_ADAPTER_FAMILIES.OpenRouter]: (): Fixture => {
    const creators = [
      { value: "preview-creator", displayLabel: "Preview creator" },
    ]
    return {
      fieldOptions: {
        fieldId: OPENROUTER_KEY_FIELD_IDS.Creator,
        values: creators,
      },
      editor: () => {
        const scope = {
          scopeKey: "preview",
          routeKey: "preview",
          displayName: "Preview workspace",
          isDefault: true,
        }
        return createOpenRouterKeyEditorProjection(
          scope,
          [scope],
          undefined,
          () => new Set(creators.map((creator) => creator.value)),
        )
      },
    }
  },
}

const previewRequest = {
  baseUrl: "https://key-preview.example.invalid",
  auth: { authType: AuthTypeEnum.None },
}

/** Resolves local forms by the registered adapter family; unsupported families have no fixture. */
export function getKeyProvisioningFixture(
  siteType: AccountSiteType,
  singleTarget = false,
) {
  const capabilities = getSiteTypeCapabilities(siteType)
  const family = capabilities.family
  const factory =
    family && Object.hasOwn(fixtures, family)
      ? fixtures[family as keyof typeof fixtures]
      : undefined
  return factory?.({
    siteType,
    availableGroups: singleTarget ? groups.slice(0, 1) : groups,
  })
}

/** Supplies native forms and local resource facts while every read and write stays in memory. */
export async function createKeyProvisioningFixtureSession(
  account: DisplaySiteData,
  resources: AccountKeyResourceCapability,
  mode: AccountKeyAutoProvisionMode,
  options: {
    scenario?: KeyProvisioningPreviewScenario
    delayMs?: number
    signal?: AbortSignal
    onCreated?: (label: string) => void
  },
): Promise<AccountKeyResourceSession> {
  const fixture = getKeyProvisioningFixture(
    account.siteType,
    options.scenario === "single-target",
  )
  if (!fixture) throw new AccountKeyResourceError({ code: "unavailable" })
  const requirements = await fixture.requirements?.()
  const facts = new Map<string, AccountKeyResourceFacts>()
  const scope = {
    scopeKey: "preview",
    routeKey: "preview",
    displayName: account.name,
    isDefault: true,
  }
  let created = 0
  const create = async (requirementKey?: string) => {
    options.signal?.throwIfAborted()
    if (options.delayMs)
      await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    options.signal?.throwIfAborted()
    const lastRequirement =
      mode === "all-groups" ? requirements?.at(-1)?.requirementKey : undefined
    if (
      options.scenario === "uncertain" &&
      (!lastRequirement || requirementKey === lastRequirement)
    )
      throw new AccountKeyResourceError({ code: "mutation_state_uncertain" })
    const label =
      requirements?.find((entry) => entry.requirementKey === requirementKey)
        ?.displayName ?? account.name
    const ref = {
      accountId: account.id,
      siteType: account.siteType,
      scopeKey: scope.scopeKey,
      resourceId: `preview-${++created}`,
    }
    const item: AccountKeyResourceFacts = {
      ref,
      displayName: label,
      maskedLabel: "sk-preview…",
      status: "enabled",
      fields: [],
      actions: { canUpdate: false, canDelete: false },
    }
    facts.set(ref.resourceId, item)
    options.onCreated?.(label)
    return {
      ref,
      facts: item,
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
  const unavailable = () => {
    throw new AccountKeyResourceError({ code: "unavailable" })
  }
  return {
    resolveDefaultScope: async () => scope,
    listScopes: async () => [scope],
    openCollection: async () => ({
      scope,
      list: async () => ({ items: [...facts.values()] }),
      get: async (ref) => facts.get(ref.resourceId) ?? unavailable(),
      openEditEditor: unavailable,
      delete: unavailable,
    }),
    ...(requirements
      ? {
          provisioning: {
            inspect: async () => ({
              requirements,
              items:
                options.scenario === "covered"
                  ? requirements.map((requirement, index) => ({
                      ref: {
                        accountId: account.id,
                        siteType: account.siteType,
                        scopeKey: scope.scopeKey,
                        resourceId: `covered-${index}`,
                      },
                      coverage: "usable" as const,
                      placement: {
                        kind: "requirement" as const,
                        requirementKeys: [requirement.requirementKey],
                      },
                    }))
                  : [],
              emptyRequirementsAction: fixture.emptyRequirementsAction,
            }),
            provision: async (requirementKey) => {
              try {
                const result = await create(requirementKey)
                return { certainty: "applied" as const, value: result }
              } catch (error) {
                if (
                  error instanceof AccountKeyResourceError &&
                  error.failure.code === "mutation_state_uncertain"
                )
                  return {
                    certainty: "possibly-applied" as const,
                    failure: error.failure,
                  }
                throw error
              }
            },
          },
        }
      : {}),
    openCreateEditor: async (_scope, _options, _intent, requirementKey) => {
      const definition = fixture.editor(requirementKey)
      return {
        fields: definition.fields,
        initialValues: definition.initialValues,
        validate: definition.validate,
        resolveDestinationScopeKey: () => scope.scopeKey,
        submit: async (values) => {
          const validation = definition.validate(values)
          if (!validation.valid)
            throw new AccountKeyResourceError({
              code: "validation_failed",
              fieldIssues: validation.issues,
            })
          return create(requirementKey)
        },
        loadOptions: async (fieldId, values) => {
          options.signal?.throwIfAborted()
          if (options.scenario === "option-failure")
            throw new AccountKeyResourceError({ code: "unavailable" })
          if (fieldId === fixture.fieldOptions?.fieldId)
            return fixture.fieldOptions.values
          return fixture.useNativeOptionLoader
            ? (await definition.loadOptions?.(fieldId, values)) ?? []
            : [{ value: "preview-model", displayLabel: "Preview model" }]
        },
      }
    },
  }
}
