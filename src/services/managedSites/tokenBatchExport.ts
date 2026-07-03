import { ChannelType } from "~/constants/managedSite"
import { SITE_TYPES } from "~/constants/siteType"
import {
  accountRuntimeKeyToLegacyAccountToken,
  isAccountTokenRuntimeKey,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import { resolveDisplayAccountRuntimeKeySecret } from "~/services/accounts/utils/apiServiceRequest"
import { getManagedSiteChannelExactMatch } from "~/services/managedSites/channelMatch"
import { resolveManagedSiteChannelMatch } from "~/services/managedSites/channelMatchResolver"
import {
  getManagedSiteService,
  getManagedSiteServiceForType,
  type ManagedSiteConfig,
  type ManagedSiteService,
} from "~/services/managedSites/managedSiteService"
import { normalizeManagedSiteChannelBaseUrl } from "~/services/managedSites/utils/channelMatching"
import {
  collectManagedConfigSecrets,
  hasUsableManagedSiteChannelKey,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"
import { toSanitizedErrorSummary } from "~/services/verification/aiApiVerification/utils"
import type { AccountToken } from "~/types"
import type { ChannelFormData, ManagedSiteChannel } from "~/types/managedSite"
import {
  isExecutableManagedSiteTokenBatchExportPreviewItem,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES,
  MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES,
  type ExecutableManagedSiteTokenBatchExportPreviewItem,
  type ManagedSiteTokenBatchExportBlockedReasonCode,
  type ManagedSiteTokenBatchExportExecutionItem,
  type ManagedSiteTokenBatchExportExecutionResult,
  type ManagedSiteTokenBatchExportItemInput,
  type ManagedSiteTokenBatchExportPreview,
  type ManagedSiteTokenBatchExportPreviewItem,
  type ManagedSiteTokenBatchExportWarningCode,
} from "~/types/managedSiteTokenBatchExport"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ManagedSiteTokenBatchExport")

const TOKEN_BATCH_EXPORT_CONCURRENCY = 4
const FALLBACK_BLOCKING_MESSAGE = "Failed to prepare this key for batch import"

const mapWithConcurrency = async <TItem, TResult>(
  items: TItem[],
  concurrency: number,
  mapper: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> => {
  if (items.length === 0) {
    return []
  }

  const results = new Array<TResult>(items.length)
  let nextIndex = 0

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = nextIndex
        nextIndex += 1

        if (index >= items.length) {
          return
        }

        results[index] = await mapper(items[index], index)
      }
    },
  )

  await Promise.all(workers)

  return results
}

const getInputRuntimeKeyId = (input: ManagedSiteTokenBatchExportItemInput) =>
  input.runtimeKey.id

const getInputRuntimeKeyName = (input: ManagedSiteTokenBatchExportItemInput) =>
  input.runtimeKey.label

const toMatchedChannel = (
  channel: ManagedSiteChannel,
): { id: number; name: string } => ({
  id: channel.id,
  name: channel.name,
})

const buildBasePreviewItem = (
  input: ManagedSiteTokenBatchExportItemInput,
): Pick<
  ManagedSiteTokenBatchExportPreviewItem,
  "id" | "accountId" | "accountName" | "runtimeKeyId" | "runtimeKeyName"
> => ({
  id: getInputRuntimeKeyId(input),
  accountId: input.account.id,
  accountName:
    input.account.name || input.runtimeKey.accountName || input.account.id,
  runtimeKeyId: input.runtimeKey.id,
  runtimeKeyName: getInputRuntimeKeyName(input),
})

const buildBlockedPreviewItem = (
  input: ManagedSiteTokenBatchExportItemInput,
  reason: ManagedSiteTokenBatchExportBlockedReasonCode,
  blockingMessage?: string,
): ManagedSiteTokenBatchExportPreviewItem => ({
  ...buildBasePreviewItem(input),
  draft: null,
  status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
  warningCodes: [],
  blockingReasonCode: reason,
  blockingMessage,
})

const uniqueWarningCodes = (
  warnings: ManagedSiteTokenBatchExportWarningCode[],
) => Array.from(new Set(warnings))

const isExactVerificationUnavailable = (
  resolution: Awaited<ReturnType<typeof resolveManagedSiteChannelMatch>>,
) => resolution.url.matched && !resolution.key.comparable

const getDraftBlockedReason = (
  service: ManagedSiteService,
  draft: ChannelFormData,
): ManagedSiteTokenBatchExportBlockedReasonCode | null => {
  if (!draft.name.trim()) {
    return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.NAME_REQUIRED
  }

  if (
    service.siteType === SITE_TYPES.CLAUDE_CODE_HUB &&
    !hasUsableManagedSiteChannelKey(draft.key)
  ) {
    return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.REAL_KEY_REQUIRED
  }

  if (!draft.key.trim()) {
    return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.KEY_REQUIRED
  }

  const requiresBaseUrl =
    service.siteType === SITE_TYPES.AXON_HUB ||
    service.siteType === SITE_TYPES.CLAUDE_CODE_HUB ||
    draft.type === ChannelType.VolcEngine ||
    draft.type === ChannelType.SunoAPI

  if (requiresBaseUrl && !draft.base_url.trim()) {
    return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.BASE_URL_REQUIRED
  }

  if (draft.models.length === 0) {
    return MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.MODELS_REQUIRED
  }

  return null
}

const isCollectedSecret = (value: string | undefined): value is string =>
  Boolean(value)

const collectSecrets = (
  input: ManagedSiteTokenBatchExportItemInput,
  managedConfig: ManagedSiteConfig,
) =>
  [
    input.runtimeKey.secret,
    input.account.token,
    input.account.cookieAuthSessionCookie,
    ...collectManagedConfigSecrets(managedConfig),
  ].filter(isCollectedSecret)

const resolveInputRuntimeKeyForManagedSiteExport = async (
  input: ManagedSiteTokenBatchExportItemInput,
): Promise<AccountRuntimeKey> => {
  if (!isAccountTokenRuntimeKey(input.runtimeKey)) {
    return input.runtimeKey
  }

  return resolveDisplayAccountRuntimeKeySecret(input.account, input.runtimeKey)
}

const resolveInputTokenForManagedSiteExport = async (
  input: ManagedSiteTokenBatchExportItemInput,
): Promise<AccountToken> =>
  accountRuntimeKeyToLegacyAccountToken(
    await resolveInputRuntimeKeyForManagedSiteExport(input),
  )

const resolveInputAccountForManagedSiteExport = (
  input: ManagedSiteTokenBatchExportItemInput,
) => {
  const runtimeKeyBaseUrl = input.runtimeKey.baseUrl.trim()
  const baseUrl = isAccountTokenRuntimeKey(input.runtimeKey)
    ? normalizeManagedSiteChannelBaseUrl(
        runtimeKeyBaseUrl || input.account.baseUrl,
      )
    : runtimeKeyBaseUrl ||
      normalizeManagedSiteChannelBaseUrl(input.account.baseUrl)

  return {
    ...input.account,
    baseUrl,
  }
}

const preparePreviewItem = async (params: {
  input: ManagedSiteTokenBatchExportItemInput
  service: ManagedSiteService
  managedConfig: ManagedSiteConfig
}): Promise<ManagedSiteTokenBatchExportPreviewItem> => {
  const { input, service, managedConfig } = params
  let secretsToRedact = collectSecrets(input, managedConfig)

  let resolvedToken: AccountToken

  try {
    resolvedToken = await resolveInputTokenForManagedSiteExport(input)
    secretsToRedact = Array.from(
      new Set([...secretsToRedact, resolvedToken.key].filter(Boolean)),
    )
  } catch (error) {
    const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)
    logger.warn("Managed-site token batch secret resolution failed", {
      accountId: input.account.id,
      runtimeKeyId: input.runtimeKey.id,
      runtimeKeySource: input.runtimeKey.source,
      siteType: service.siteType,
      diagnostic,
    })

    return buildBlockedPreviewItem(
      input,
      MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.SECRET_RESOLUTION_FAILED,
      diagnostic || FALLBACK_BLOCKING_MESSAGE,
    )
  }

  try {
    const channelDraftAccount = resolveInputAccountForManagedSiteExport(input)
    const draft = await service.prepareChannelFormData(
      channelDraftAccount,
      resolvedToken,
    )
    const blockedReason = getDraftBlockedReason(service, draft)

    if (blockedReason) {
      return {
        ...buildBasePreviewItem(input),
        draft,
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED,
        warningCodes: [],
        blockingReasonCode: blockedReason,
      }
    }

    const warningCodes: ManagedSiteTokenBatchExportWarningCode[] = []
    if (draft.modelPrefillFetchFailed) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MODEL_PREFILL_FAILED,
      )
    }

    if (!supportsManagedSiteBaseUrlChannelLookup(service.siteType)) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.DEDUPE_UNSUPPORTED,
      )

      return {
        ...buildBasePreviewItem(input),
        draft,
        status:
          warningCodes.length > 0
            ? MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING
            : MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
        warningCodes: uniqueWarningCodes(warningCodes),
      }
    }

    const searchBaseUrl = normalizeManagedSiteChannelBaseUrl(draft.base_url)
    const resolution = await resolveManagedSiteChannelMatch({
      service,
      managedConfig,
      accountBaseUrl: searchBaseUrl,
      models: draft.models,
      key: draft.key,
    })
    const exactMatch = getManagedSiteChannelExactMatch(resolution)

    if (exactMatch) {
      return {
        ...buildBasePreviewItem(input),
        draft,
        status: MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED,
        warningCodes: uniqueWarningCodes(warningCodes),
        matchedChannel: toMatchedChannel(exactMatch),
      }
    }

    if (!resolution.searchCompleted) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.BACKEND_SEARCH_FAILED,
      )
    } else if (isExactVerificationUnavailable(resolution)) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.EXACT_VERIFICATION_UNAVAILABLE,
      )
    } else if (
      resolution.url.matched ||
      resolution.key.matched ||
      resolution.models.matched
    ) {
      warningCodes.push(
        MANAGED_SITE_TOKEN_BATCH_EXPORT_WARNING_CODES.MATCH_REQUIRES_CONFIRMATION,
      )
    }

    return {
      ...buildBasePreviewItem(input),
      draft,
      status:
        warningCodes.length > 0
          ? MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING
          : MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY,
      warningCodes: uniqueWarningCodes(warningCodes),
    }
  } catch (error) {
    const diagnostic = toSanitizedErrorSummary(error, secretsToRedact)
    logger.warn("Managed-site token batch preview item failed", {
      accountId: input.account.id,
      runtimeKeyId: input.runtimeKey.id,
      runtimeKeySource: input.runtimeKey.source,
      siteType: service.siteType,
      diagnostic,
    })

    return buildBlockedPreviewItem(
      input,
      MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.INPUT_PREPARATION_FAILED,
      diagnostic || FALLBACK_BLOCKING_MESSAGE,
    )
  }
}

const buildPreview = (
  siteType: ManagedSiteService["siteType"],
  items: ManagedSiteTokenBatchExportPreviewItem[],
): ManagedSiteTokenBatchExportPreview => {
  const counts = items.reduce(
    (accumulator, item) => {
      switch (item.status) {
        case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.READY:
          accumulator.readyCount += 1
          break
        case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.WARNING:
          accumulator.warningCount += 1
          break
        case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.SKIPPED:
          accumulator.skippedCount += 1
          break
        case MANAGED_SITE_TOKEN_BATCH_EXPORT_PREVIEW_STATUSES.BLOCKED:
          accumulator.blockedCount += 1
          break
      }

      return accumulator
    },
    {
      readyCount: 0,
      warningCount: 0,
      skippedCount: 0,
      blockedCount: 0,
    },
  )

  return {
    siteType,
    items,
    totalCount: items.length,
    ...counts,
  }
}

/**
 * Builds a non-mutating preview for creating selected account tokens as
 * channels in the currently selected managed site.
 */
export async function prepareManagedSiteTokenBatchExportPreview(params: {
  items: ManagedSiteTokenBatchExportItemInput[]
}): Promise<ManagedSiteTokenBatchExportPreview> {
  const service = await getManagedSiteService()
  const managedConfig = await service.getConfig()

  if (!managedConfig) {
    return buildPreview(
      service.siteType,
      params.items.map((input) =>
        buildBlockedPreviewItem(
          input,
          MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.CONFIG_MISSING,
        ),
      ),
    )
  }

  const items = await mapWithConcurrency(
    params.items,
    TOKEN_BATCH_EXPORT_CONCURRENCY,
    (input) =>
      preparePreviewItem({
        input,
        service,
        managedConfig,
      }),
  )

  return buildPreview(service.siteType, items)
}

const buildExecutionSkippedItem = (
  item: ManagedSiteTokenBatchExportPreviewItem,
): ManagedSiteTokenBatchExportExecutionItem => ({
  id: item.id,
  accountName: item.accountName,
  runtimeKeyName: item.runtimeKeyName,
  success: false,
  skipped: true,
})

/**
 * Creates target managed-site channels for selected executable preview rows
 * and returns per-token execution results without mutating source accounts.
 */
export async function executeManagedSiteTokenBatchExport(params: {
  preview: ManagedSiteTokenBatchExportPreview
  selectedItemIds: string[]
}): Promise<ManagedSiteTokenBatchExportExecutionResult> {
  const selectedIds = new Set(params.selectedItemIds)
  const service = getManagedSiteServiceForType(params.preview.siteType)
  const managedConfig = await service.getConfig()
  const isSelectedExecutablePreviewItem = (
    item: ManagedSiteTokenBatchExportPreviewItem,
  ): item is ExecutableManagedSiteTokenBatchExportPreviewItem =>
    selectedIds.has(item.id) &&
    isExecutableManagedSiteTokenBatchExportPreviewItem(item)
  const executableItems = params.preview.items.filter(
    isSelectedExecutablePreviewItem,
  )

  if (!managedConfig) {
    const items = params.preview.items.map((item) =>
      isSelectedExecutablePreviewItem(item)
        ? {
            id: item.id,
            accountName: item.accountName,
            runtimeKeyName: item.runtimeKeyName,
            success: false,
            skipped: false,
            error:
              MANAGED_SITE_TOKEN_BATCH_EXPORT_BLOCKED_REASON_CODES.CONFIG_MISSING,
          }
        : buildExecutionSkippedItem(item),
    )

    return {
      totalSelected: selectedIds.size,
      attemptedCount: executableItems.length,
      createdCount: 0,
      failedCount: executableItems.length,
      skippedCount: items.filter((item) => item.skipped).length,
      items,
    }
  }

  const executionById = new Map<
    string,
    ManagedSiteTokenBatchExportExecutionItem
  >()
  const executedItems = await mapWithConcurrency(
    executableItems,
    TOKEN_BATCH_EXPORT_CONCURRENCY,
    async (item): Promise<ManagedSiteTokenBatchExportExecutionItem> => {
      try {
        const payload = service.buildChannelPayload(item.draft)
        const response = await service.createChannel(managedConfig, payload)

        if (!response.success) {
          throw new Error(response.message || "Failed to create channel")
        }

        return {
          id: item.id,
          accountName: item.accountName,
          runtimeKeyName: item.runtimeKeyName,
          success: true,
          skipped: false,
        }
      } catch (error) {
        return {
          id: item.id,
          accountName: item.accountName,
          runtimeKeyName: item.runtimeKeyName,
          success: false,
          skipped: false,
          error: getErrorMessage(error),
        }
      }
    },
  )

  for (const item of executedItems) {
    executionById.set(item.id, item)
  }

  const items = params.preview.items.map(
    (item) => executionById.get(item.id) ?? buildExecutionSkippedItem(item),
  )
  const createdCount = items.filter((item) => item.success).length
  const failedCount = items.filter(
    (item) => !item.success && !item.skipped,
  ).length
  const skippedCount = items.filter((item) => item.skipped).length

  return {
    totalSelected: selectedIds.size,
    attemptedCount: executableItems.length,
    createdCount,
    failedCount,
    skippedCount,
    items,
  }
}
