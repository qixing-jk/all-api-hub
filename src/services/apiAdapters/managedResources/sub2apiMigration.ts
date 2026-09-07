import { SITE_TYPES } from "~/constants/siteType"
import {
  SUB2API_MANAGED_RESOURCE_STATUS,
  type Sub2ApiApiKeyAccountPlatform,
} from "~/constants/sub2api"
import { MANAGED_RESOURCE_KINDS } from "~/services/accountSiteDefinitions/contracts"
import {
  isManagedResourceRefFor,
  MANAGED_RESOURCE_CREATE_SEED_KINDS,
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedChannelImportCreateSeed,
  type ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  isManagedSiteMigrationSourceType,
  resolveManagedSiteMigrationType,
} from "~/services/apiAdapters/managedResources/migrationTypeRoutes"
import {
  openSub2ApiNativeResourceOperations,
  sub2ApiManagedResourceRegistration,
} from "~/services/apiAdapters/managedResources/sub2api"
import { MANAGED_SITE_MUTATION_OUTCOMES } from "~/services/managedSites/mutations"
import {
  parseSub2ApiResourceId,
  SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE,
  Sub2ApiAdminApiError,
} from "~/services/managedSites/providers/sub2api"
import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/managedSite"
import { MANAGED_SITE_CHANNEL_MIGRATION_BLOCKED_REASON_CODES as blockers } from "~/types/managedSiteMigration"
import {
  MANAGED_SITE_MIGRATION_EXECUTION_FAILURE_CODES as failures,
  type ManagedSiteMigrationCapability,
  type ManagedSiteMigrationSelection,
  type ManagedSiteMigrationSource,
} from "~/types/managedSiteMigrationCapability"
import type { Sub2ApiAdminApiKeyAccount } from "~/types/sub2apiManagedSite"

// Sub2API has no channel weight; use the same neutral value as native imports.
const SUB2API_MIGRATION_WEIGHT = 1

const prepareBaseUrl = (
  baseUrl: string,
  platform: Sub2ApiApiKeyAccountPlatform,
): string => {
  let url: URL
  try {
    url = new URL(baseUrl.trim())
  } catch {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed,
    })
  }
  url.pathname = url.pathname.replace(/\/+$/, "")
  // Anthropic/Gemini append their versioned protocol paths to the stored URL.
  // OpenAI accepts an existing version root. Preserve other custom prefixes.
  // github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/service/gateway_upstream_request.go
  // github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/service/gemini_upstream_url.go
  if (platform === "anthropic") url.pathname = url.pathname.replace(/\/v1$/, "")
  if (platform === "gemini")
    url.pathname = url.pathname.replace(/\/v1(?:beta)?$/, "")
  return url.toString().replace(/\/$/, "")
}

const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === null || value === undefined || value === false) return false
  if (typeof value === "string") return Boolean(value.trim())
  if (typeof value === "number") return value !== 0
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === "object") return Object.keys(value).length > 0
  return true
}

// Native account settings are absent from the portable migration projection.
// github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/handler/dto/types.go
const hasAdvancedSettings = (account: Sub2ApiAdminApiKeyAccount): boolean =>
  (account.concurrency ?? 1) !== 1 ||
  (account.rate_multiplier ?? 1) !== 1 ||
  account.schedulable === false ||
  [
    account.notes,
    account.extra,
    account.proxy_id,
    account.load_factor,
    account.expires_at,
  ].some(hasMeaningfulValue) ||
  Boolean(account.group_ids?.length && !account.groups?.length) ||
  Object.entries(account.credentials ?? {}).some(
    ([field, value]) =>
      !["api_key", "base_url", "model_mapping"].includes(field) &&
      hasMeaningfulValue(value),
  )

const decodeSelectionAccountId = (
  selection: ManagedSiteMigrationSelection,
  scopeKey: string,
): number | null => {
  if (
    !isManagedResourceRefFor(selection.ref, {
      siteType: SITE_TYPES.SUB2API,
      kind: MANAGED_RESOURCE_KINDS.Channel,
      scopeKey,
    })
  ) {
    return null
  }
  try {
    return parseSub2ApiResourceId(selection.ref.resourceId)
  } catch {
    return null
  }
}

const openSelection = async (
  selection: ManagedSiteMigrationSelection,
  options?: ResourceOperationOptions,
) => {
  const operations = await openSub2ApiNativeResourceOperations(options)
  const accountId = decodeSelectionAccountId(selection, operations.scopeKey)
  if (accountId === null) return null
  const detail = await operations.get(accountId, options)
  return { accountId, detail, operations }
}

const toSource = (
  account: Sub2ApiAdminApiKeyAccount,
): ManagedSiteMigrationSource => {
  // Sub2API uses identity model mappings as its allowlist; only aliases lose
  // mapping behavior during migration. Empty mappings permit all models.
  // github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/service/account.go
  const rawMapping = account.credentials?.model_mapping
  const mapping =
    rawMapping && typeof rawMapping === "object" && !Array.isArray(rawMapping)
      ? Object.entries(rawMapping).filter(
          (entry): entry is [string, string] =>
            Boolean(entry[0].trim()) &&
            typeof entry[1] === "string" &&
            Boolean(entry[1].trim()),
        )
      : []
  return {
    sourceSiteType: SITE_TYPES.SUB2API,
    resourceType: account.platform,
    baseUrl:
      typeof account.credentials?.base_url === "string"
        ? account.credentials.base_url.trim()
        : "",
    models: mapping.map(([model]) => model.trim()),
    groups: [
      ...new Set(
        (account.groups ?? []).flatMap((group) =>
          typeof group?.name === "string" && group.name.trim()
            ? [group.name.trim()]
            : [],
        ),
      ),
    ],
    priority: account.priority ?? 1,
    weight: SUB2API_MIGRATION_WEIGHT,
    status:
      account.status === SUB2API_MANAGED_RESOURCE_STATUS.Active &&
      account.schedulable !== false
        ? "enabled"
        : account.status === SUB2API_MANAGED_RESOURCE_STATUS.Inactive
          ? "disabled"
          : "other",
    lossSignals: {
      hasModelMapping: mapping.some(
        ([model, target]) =>
          model.trim() !== target.trim() || model.includes("*"),
      ),
      hasStatusCodeMapping: false,
      hasAdvancedSettings: hasAdvancedSettings(account),
      hasMultiKeyState: false,
    },
  }
}

/** Canonical migration behavior for Sub2API API-key accounts. */
export const sub2ApiManagedSiteMigrationCapability: ManagedSiteMigrationCapability =
  {
    source: {
      createSelectionValidationContext: async (options) => {
        const operations = await openSub2ApiNativeResourceOperations(options)
        return {
          isValid: (selection) =>
            decodeSelectionAccountId(selection, operations.scopeKey) !== null,
        }
      },
      prepare: async (selection, options) => {
        const resolved = await openSelection(selection, options)
        if (!resolved)
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        if (
          resolved.detail.type !== "apikey" ||
          !isManagedSiteMigrationSourceType(
            SITE_TYPES.SUB2API,
            resolved.detail.platform,
          )
        ) {
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
          }
        }
        if (resolved.detail.credentials_status?.has_api_key === false) {
          return { status: "blocked", reasonCode: blockers.SOURCE_KEY_MISSING }
        }
        return { status: "ready", source: toSource(resolved.detail) }
      },
      resolveCredential: async (selection, options) => {
        try {
          const resolved = await openSelection(selection, options)
          if (!resolved)
            return {
              status: "blocked",
              reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
            }
          if (
            resolved.detail.type !== "apikey" ||
            !isManagedSiteMigrationSourceType(
              SITE_TYPES.SUB2API,
              resolved.detail.platform,
            )
          ) {
            return {
              status: "blocked",
              reasonCode: blockers.SOURCE_TYPE_UNSUPPORTED,
            }
          }
          if (resolved.detail.credentials_status?.has_api_key === false) {
            return {
              status: "blocked",
              reasonCode: blockers.SOURCE_KEY_MISSING,
            }
          }
          const credential = (
            await resolved.operations.loadSecret(resolved.accountId, options)
          ).trim()
          return hasUsableManagedSiteChannelKey(credential)
            ? { status: "ready", credential }
            : { status: "blocked", reasonCode: blockers.SOURCE_KEY_MISSING }
        } catch (error) {
          options?.signal?.throwIfAborted()
          if (error instanceof Error && error.name === "AbortError") throw error
          if (
            error instanceof Sub2ApiAdminApiError &&
            error.code === "API_KEY_UNAVAILABLE"
          ) {
            return {
              status: "blocked",
              reasonCode: blockers.SOURCE_KEY_MISSING,
            }
          }
          if (
            error instanceof Sub2ApiAdminApiError &&
            error.code === SUB2API_STEP_UP_ADMIN_KEY_FORBIDDEN_CODE
          ) {
            return {
              status: "blocked",
              reasonCode: blockers.SOURCE_KEY_EXPORT_RESTRICTED,
            }
          }
          return {
            status: "blocked",
            reasonCode: blockers.SOURCE_KEY_RESOLUTION_FAILED,
          }
        }
      },
    },
    target: {
      prepare: async (source, options) => {
        options?.signal?.throwIfAborted()
        const type = resolveManagedSiteMigrationType(source, SITE_TYPES.SUB2API)
        if (type.status === "unsupported") {
          throw new Error(
            "Sub2API does not support this migration channel type",
          )
        }
        const priority = Number.isFinite(source.priority)
          ? Math.max(0, Math.trunc(source.priority))
          : 1
        const baseUrl = prepareBaseUrl(source.baseUrl, type.value)
        return {
          projection: {
            name: "",
            type: type.value,
            baseUrl,
            models: [
              ...new Set(
                source.models.map((model) => model.trim()).filter(Boolean),
              ),
            ],
            // No group IDs are transferred between deployments. Sub2API binds
            // the platform-default group when it exists and otherwise leaves
            // the account ungrouped.
            // github.com/Wei-Shaw/sub2api/blob/b7dba62678a834080564966c002fd0ca2b328b7a/backend/internal/service/admin_account.go
            groups: [],
            priority,
            weight: SUB2API_MIGRATION_WEIGHT,
            enabled: source.status === "enabled",
          },
          adjustments: {
            remappedType: type.remappedType,
            normalizedBaseUrl: baseUrl !== source.baseUrl,
            forcedDefaultGroup: source.groups.length > 0,
            ignoredPriority: priority !== source.priority,
            ignoredWeight: source.weight !== SUB2API_MIGRATION_WEIGHT,
            simplifiedStatus: source.status === "other",
          },
        }
      },
      create: async (command, options) => {
        options?.signal?.throwIfAborted()
        const type = resolveManagedSiteMigrationType(
          command.source,
          SITE_TYPES.SUB2API,
        )
        if (
          command.targetSiteType !== SITE_TYPES.SUB2API ||
          type.status !== "mapped" ||
          type.value !== command.projection.type
        ) {
          return { status: "failed", failureCode: failures.TargetRejected }
        }
        const seed: ManagedChannelImportCreateSeed = {
          kind: MANAGED_RESOURCE_CREATE_SEED_KINDS.ManagedChannelImport,
          name: command.projection.name,
          channelType: type.value,
          baseUrl: command.projection.baseUrl,
          credential: command.credential,
          models: command.projection.models,
          enabled: command.projection.enabled,
          orderingWeight: command.projection.weight,
          priority: command.projection.priority,
          notes: "",
        }
        let submitted = false
        try {
          seed.baseUrl = prepareBaseUrl(seed.baseUrl, type.value)
          // Reuse the native account create rules and two-step pause mutation.
          // This editor stays inside execution; no credential enters UI state.
          const workspace =
            await sub2ApiManagedResourceRegistration.open(options)
          const editor = await workspace.openCreateEditor({ ...options, seed })
          submitted = true
          const result = await editor.submit(editor.initialValues, options)
          switch (result.outcome) {
            case MANAGED_SITE_MUTATION_OUTCOMES.Succeeded:
              return { status: "created" }
            case MANAGED_SITE_MUTATION_OUTCOMES.Rejected:
              return { status: "failed", failureCode: failures.TargetRejected }
            case MANAGED_SITE_MUTATION_OUTCOMES.Partial:
            case MANAGED_SITE_MUTATION_OUTCOMES.Uncertain:
              return { status: "uncertain" }
          }
        } catch (error) {
          options?.signal?.throwIfAborted()
          if (error instanceof Error && error.name === "AbortError") throw error
          if (
            error instanceof ManagedResourceError &&
            error.failure.code === MANAGED_RESOURCE_FAILURE_CODES.Aborted
          ) {
            throw new DOMException(
              "Sub2API migration was aborted",
              "AbortError",
            )
          }
          // A throw after submission can also come from projecting a successful
          // but malformed create response. Without authoritative rejection it
          // cannot prove that no account was created; never invite a replay.
          if (submitted) return { status: "uncertain" }
          if (error instanceof ManagedResourceError) {
            return {
              status: "failed",
              failureCode:
                error.failure.code ===
                MANAGED_RESOURCE_FAILURE_CODES.ValidationFailed
                  ? failures.TargetRejected
                  : failures.TargetUnavailable,
            }
          }
          return { status: "failed", failureCode: failures.Unexpected }
        }
      },
    },
  }
