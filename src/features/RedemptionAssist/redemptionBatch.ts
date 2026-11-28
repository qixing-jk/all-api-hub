import { trackProductAnalyticsActionCompleted } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsErrorCategory,
} from "~/services/productAnalytics/contracts"
import { REDEMPTION_ASSIST_RESULT_CODES } from "~/services/redemption/contracts"
import type { RedemptionAssistRedeemResponse } from "~/services/redemption/redemptionAssist"
import {
  RedemptionAssistMessageTypes,
  sendRedemptionAssistMessage,
} from "~/services/redemption/redemptionAssistMessaging"
import {
  getRedemptionCodeKind,
  REDEMPTION_CODE_KINDS,
} from "~/services/redemption/utils/redemptionCode"
import { t } from "~/utils/i18n/core"

import type { RedemptionBatchResultItem } from "./contracts"
import { getUnconfirmedRedemptionOutcome } from "./redemptionOutcome"
import {
  dismissToast,
  showAccountSelectToast,
  showRedeemBatchResultToast,
  showRedeemLoadingToast,
  showRedeemResultToast,
} from "./redemptionToasts"

/**
 * Masks sensitive redemption codes for UI prompts/logs.
 * @param code Raw redemption code.
 * @returns Masked code preview.
 */
export function maskCode(code: string): string {
  const trimmed = code.trim()
  if (trimmed.length <= 8) return trimmed
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
}

/**
 * Redeems a code for a specific account, via background runtime messaging.
 * @param accountId Selected account id.
 * @param code Redemption code.
 * @returns Redeem result payload from background.
 */
async function redeemForAccount(accountId: string, code: string) {
  const manualResp = await sendRedemptionAssistMessage(
    RedemptionAssistMessageTypes.AutoRedeem,
    {
      accountId,
      code,
    },
  ).catch(() => undefined)
  return manualResp && "data" in manualResp && manualResp.data
    ? manualResp.data
    : {
        ...getUnconfirmedRedemptionOutcome(code),
        code: REDEMPTION_ASSIST_RESULT_CODES.OutcomeUncertain,
      }
}

type RedeemBatchItem = RedemptionBatchResultItem

type RedeemBatchDisplayItem = Omit<RedeemBatchItem, "analyticsErrorCategory">

type RedemptionResult = Extract<
  RedemptionAssistRedeemResponse,
  { success: true }
>["data"]

/** Preserves retry suppression and uncertainty flags without inventing defaults. */
function getRetryPresentation(result?: RedemptionResult) {
  return {
    ...(result && "retryable" in result && result.retryable === false
      ? { retryable: false }
      : {}),
    ...(result?.code === REDEMPTION_ASSIST_RESULT_CODES.OutcomeUncertain
      ? { outcomeUncertain: true }
      : {}),
  }
}

/** Projects background routing outcomes into the existing picker variants. */
function getAccountSelection(result?: RedemptionResult) {
  if (!result) return undefined
  if (
    result.code === REDEMPTION_ASSIST_RESULT_CODES.NoAccounts &&
    "allAccounts" in result &&
    result.allAccounts?.length
  ) {
    return {
      accounts: result.allAccounts,
      options: { title: t("redemptionAssist:accountSelect.titleFallback") },
    }
  }
  if (!("candidates" in result) || !result.candidates?.length) return undefined
  switch (result.code) {
    case REDEMPTION_ASSIST_RESULT_CODES.SelectAccount:
      return {
        accounts: result.candidates,
        options: {
          title: t("redemptionAssist:accountSelect.titlePmplan"),
          message: result.message,
        },
      }
    case REDEMPTION_ASSIST_RESULT_CODES.NoAutomaticRedemption:
      return {
        accounts: result.candidates,
        options: {
          title: t("redemptionAssist:accountSelect.titleNoAutomatic"),
        },
      }
    case REDEMPTION_ASSIST_RESULT_CODES.MultipleAccounts:
      return {
        accounts: result.candidates,
        options: { title: t("redemptionAssist:accountSelect.titleMultiple") },
      }
    default:
      return undefined
  }
}

/** Fixed result codes retain the existing coarse analytics categories. */
function getRedemptionPromptAnalyticsErrorCategory(
  code?: string,
): ProductAnalyticsErrorCategory {
  switch (code) {
    case REDEMPTION_ASSIST_RESULT_CODES.InvalidUrl:
    case REDEMPTION_ASSIST_RESULT_CODES.MultipleAccounts:
    case REDEMPTION_ASSIST_RESULT_CODES.NoAccounts:
    case REDEMPTION_ASSIST_RESULT_CODES.NoCompatibleAccounts:
    case REDEMPTION_ASSIST_RESULT_CODES.IncompatibleCodeKind:
    case REDEMPTION_ASSIST_RESULT_CODES.UnsupportedSiteType:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation
    default:
      return PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown
  }
}

/** Removes analytics-only fields before handing redemption results to UI. */
function toRedeemBatchDisplayItem(
  item: RedeemBatchItem,
): RedeemBatchDisplayItem {
  return {
    code: item.code,
    preview: item.preview,
    success: item.success,
    message: item.message,
    ...(item.retryable === false ? { retryable: false } : {}),
    ...(item.outcomeUncertain ? { outcomeUncertain: true } : {}),
  }
}

/**
 * Completes the prompt-confirm action using only aggregate success/failure state.
 */
function trackConfirmRedemptionPromptCompleted(
  results: RedeemBatchItem[],
  selectedCount?: number,
) {
  const successCount = results.filter((item) => item.success).length
  const failureCount = results.length - successCount
  const failureCategory = results
    .filter((item) => !item.success)
    .map((item) => item.analyticsErrorCategory)
    .find(
      (category): category is ProductAnalyticsErrorCategory =>
        Boolean(category) &&
        category !== PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    )
  const result =
    results.length === 0
      ? PRODUCT_ANALYTICS_RESULTS.Skipped
      : failureCount === 0
        ? PRODUCT_ANALYTICS_RESULTS.Success
        : PRODUCT_ANALYTICS_RESULTS.Failure

  void trackProductAnalyticsActionCompleted({
    featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
    actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionPrompt,
    surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
    entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    result,
    ...(result === PRODUCT_ANALYTICS_RESULTS.Failure
      ? {
          errorCategory:
            failureCategory ?? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        }
      : {}),
    insights: {
      itemCount: results.length,
      ...(typeof selectedCount === "number" ? { selectedCount } : {}),
      successCount,
      failureCount,
    },
  })
}

/**
 * Redeems multiple codes sequentially (no concurrent requests) and returns the
 * result list plus a retry handler for a single code.
 * @param params Sequential redeem parameters.
 * @param params.url Page URL to infer account candidates.
 * @param params.codes Selected redemption codes to redeem.
 * @param params.dismissOuterLoading Dismiss outer loading toast before user prompts.
 * @returns Results list and per-code retry handler.
 */
async function redeemCodesSequential(params: {
  url: string
  codes: string[]
  dismissOuterLoading: () => void
}) {
  const selectedAccounts = new Map<string, string>()
  const terminalResults = new Map<string, RedeemBatchItem>()

  const redeemAttempt = async (code: string): Promise<RedeemBatchItem> => {
    const codeKind = getRedemptionCodeKind(code)
    // A reset card carries no deployment identity, so each card needs consent.
    const selectionKey =
      codeKind === REDEMPTION_CODE_KINDS.PmplanResetCard ? code : codeKind
    const forcedAccountId = selectedAccounts.get(selectionKey)
    if (forcedAccountId) {
      const manual = await redeemForAccount(forcedAccountId, code)
      const message =
        manual?.message || t("redemptionAssist:messages.redeemFailed")
      const success = !!manual?.success
      return {
        code,
        preview: maskCode(code),
        success,
        message,
        ...getRetryPresentation(manual),
        ...(!success
          ? {
              analyticsErrorCategory: getRedemptionPromptAnalyticsErrorCategory(
                manual?.code,
              ),
            }
          : {}),
      }
    }

    const redeemResp = await sendRedemptionAssistMessage(
      RedemptionAssistMessageTypes.AutoRedeemByUrl,
      {
        url: params.url,
        code,
      },
    ).catch(() => undefined)

    const result =
      redeemResp && "data" in redeemResp ? redeemResp.data : undefined

    if (!result && codeKind === REDEMPTION_CODE_KINDS.Generic) {
      return {
        code,
        preview: maskCode(code),
        ...getUnconfirmedRedemptionOutcome(code),
      }
    }

    if (result?.success) {
      return {
        code,
        preview: maskCode(code),
        success: true,
        message: result.message || "",
      }
    }

    const selection = getAccountSelection(result)
    if (selection) {
      params.dismissOuterLoading()
      const selected = await showAccountSelectToast(
        selection.accounts,
        selection.options,
      )

      if (!selected) {
        return {
          code,
          preview: maskCode(code),
          success: false,
          message: t("redemptionAssist:messages.cancelled"),
          analyticsErrorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        }
      }

      selectedAccounts.set(selectionKey, selected.id)
      return redeemOne(code)
    }

    const fallbackMessage = t("redemptionAssist:messages.redeemFailed")
    const msg =
      (redeemResp && "error" in redeemResp ? redeemResp.error : undefined) ||
      result?.message ||
      fallbackMessage
    return {
      code,
      preview: maskCode(code),
      success: false,
      message: msg,
      ...getRetryPresentation(result),
      analyticsErrorCategory: getRedemptionPromptAnalyticsErrorCategory(
        result?.code,
      ),
    }
  }

  const redeemOne = async (code: string): Promise<RedeemBatchItem> => {
    const terminal = terminalResults.get(code)
    if (terminal) return terminal
    try {
      const result = await redeemAttempt(code)
      if (result.retryable === false) terminalResults.set(code, result)
      return result
    } catch {
      // Picker/preparation failure must not discard other completed rows.
      return {
        code,
        preview: maskCode(code),
        success: false,
        message: t("redemptionAssist:messages.redeemFailed"),
      }
    }
  }

  const results: RedeemBatchItem[] = []
  for (const code of params.codes) {
    results.push(await redeemOne(code))
  }

  return {
    results,
    retry: redeemOne,
  }
}

/** Owns loading dismissal and final feedback for detected and context-menu batches. */
export async function runRedemptionBatch(params: {
  url: string
  codes: string[]
  confirmedPrompt: boolean
}) {
  const loadingMessage = t("redemptionAssist:messages.redeemLoading")
  let loadingToastId: string | undefined
  const dismissLoadingToast = () => {
    if (loadingToastId) {
      dismissToast(loadingToastId)
      loadingToastId = undefined
    }
  }

  try {
    loadingToastId = await showRedeemLoadingToast(loadingMessage)
    const { results, retry } = await redeemCodesSequential({
      url: params.url,
      codes: params.codes,
      dismissOuterLoading: dismissLoadingToast,
    })
    if (params.confirmedPrompt) {
      trackConfirmRedemptionPromptCompleted(results, params.codes.length)
    }
    if (results.length === 1 && results[0]?.success) {
      await showRedeemResultToast(true, results[0].message)
      return
    }
    await showRedeemBatchResultToast(
      results.map(toRedeemBatchDisplayItem),
      retry,
    )
  } finally {
    dismissLoadingToast()
  }
}
