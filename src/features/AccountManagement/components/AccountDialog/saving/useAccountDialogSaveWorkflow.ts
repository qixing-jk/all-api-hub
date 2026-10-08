import type { RefObject } from "react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import { startAccountDialogAnalyticsAction } from "~/features/AccountManagement/components/AccountDialog/analytics"
import {
  getAccountDialogSitePolicy,
  shouldDeferAccountSaveSuccessForAccountDialogSite,
} from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import { type useOpenRouterAccountOnboarding } from "~/features/AccountManagement/components/AccountDialog/form/useOpenRouterAccountOnboarding"
import { type useSub2ApiAccountSession } from "~/features/AccountManagement/components/AccountDialog/form/useSub2ApiAccountSession"
import { type AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { type useAccountPostSaveWorkflow } from "~/features/AccountManagement/components/AccountDialog/postSave/useAccountPostSaveWorkflow"
import { type useAccountDuplicateConfirmation } from "~/features/AccountManagement/components/AccountDialog/saving/useAccountDuplicateConfirmation"
import toast from "~/lib/notify"
import { validateAndSaveAccount } from "~/services/accounts/accountCreation"
import { ACCOUNT_SAVE_FEEDBACK_LEVELS } from "~/services/accounts/accountPersistence/constants"
import { accountRefresh } from "~/services/accounts/accountStorage/accountRefresh"
import { validateAndUpdateAccount } from "~/services/accounts/accountUpdate"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import { buildActionFailureDiagnostics } from "~/services/productAnalytics/diagnosticsError"
import { withProtectionBypassUserCommand } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_USER_COMMANDS,
  type ProtectionBypassExecution,
} from "~/services/protectionBypass/contracts"
import { type DisplaySiteData } from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_AUTO_PROVISION_MODES } from "~/types/accountKeyAutoProvisioning"
import type { CheckInMethodSelection } from "~/types/checkIn"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"
import {
  isMessageReceiverUnavailableError,
  sendRuntimeMessage,
} from "~/utils/browser/runtimeMessages"
import { getCurrentTempWindowRequestSource } from "~/utils/browser/tempWindowRequestSource"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AccountDialogHook")
/**
 * Refreshes saved account data after the save command has persisted the account.
 */
async function refreshPostSaveAccount(
  accountId: string,
  tempWindowRequestSource: TempWindowRequestSource,
  protectionBypassExecution: ProtectionBypassExecution,
  onPostSaveAccountRefresh?: (accountIds: string[]) => Promise<void>,
) {
  try {
    const result = await accountRefresh.refreshAccount(accountId, true, {
      discoverCheckInAfterSave: true,
      tempWindowRequestSource,
      protectionBypassExecution,
    })
    if (!result?.refreshed) {
      return
    }

    if (onPostSaveAccountRefresh) {
      await onPostSaveAccountRefresh([accountId])
    }

    try {
      await sendRuntimeMessage(
        {
          action: RuntimeActionIds.AccountRefreshCompleted,
          updatedAccountIds: [accountId],
        },
        { maxAttempts: 1 },
      )
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      if (isMessageReceiverUnavailableError(error)) {
        logger.debug("Post-save account refresh notification ignored", {
          accountId,
          error: errorMessage,
        })
        return
      }

      logger.warn("Post-save account refresh notification failed", {
        accountId,
        error: errorMessage,
      })
    }
  } catch (error) {
    logger.warn("Post-save initial account refresh failed", {
      accountId,
      error: getErrorMessage(error),
    })
  }
}

type SaveWorkflowInput = {
  mode: DialogMode
  account?: DisplaySiteData | null
  url: string
  draft: AccountDialogDraft
  sub2ApiSession: Pick<ReturnType<typeof useSub2ApiAccountSession>, "auth">
  autoProvisionKeyOnAccountAdd: boolean
  autoProvisionKeyOnAccountAddMode: AccountKeyAutoProvisionMode
  confirmDuplicateAccount: ReturnType<
    typeof useAccountDuplicateConfirmation
  >["confirm"]
  confirmSavedOpenRouterCredential: ReturnType<
    typeof useOpenRouterAccountOnboarding
  >["confirmSavedCredential"]
  postSaveWorkflow: Pick<
    ReturnType<typeof useAccountPostSaveWorkflow>,
    "beginProvisioning" | "openDefaultKeyPrompt"
  >
  checkInSelectionChangedRef: RefObject<boolean>
  checkInDiscoveryBaseSelectionRef: RefObject<CheckInMethodSelection | null>
  loadedKimiAuthRef: RefObject<
    | { accessToken: string; refreshToken?: string; organizationId?: string }
    | undefined
  >
  onPostSaveAccountRefresh?: (accountIds: string[]) => Promise<void>
}
/** Own persistence, protected refresh and successful-save follow-up ordering. */
export function useAccountDialogSaveWorkflow({
  mode,
  account,
  url,
  draft,
  sub2ApiSession,
  autoProvisionKeyOnAccountAdd,
  autoProvisionKeyOnAccountAddMode,
  confirmDuplicateAccount,
  confirmSavedOpenRouterCredential,
  postSaveWorkflow,
  checkInSelectionChangedRef,
  checkInDiscoveryBaseSelectionRef,
  loadedKimiAuthRef,
  onPostSaveAccountRefresh,
}: SaveWorkflowInput) {
  const { t } = useTranslation(["accountDialog", "settings", "messages"])
  const [isSaving, setIsSaving] = useState(false)
  const {
    siteName,
    username,
    accessToken,
    userId,
    exchangeRate,
    manualBalanceUsd,
    notes,
    tagIds,
    excludeFromTotalBalance,
    excludeFromTodayIncome,
    checkIn,
    siteType,
    authType,
    cookieAuthSessionCookie,
  } = draft
  const shouldDeferAccountSaveSuccess = useCallback(
    (result: AccountSaveResponse) => {
      const policy = getAccountDialogSitePolicy(siteType)

      return (
        shouldDeferAccountSaveSuccessForAccountDialogSite({
          policy,
          isAddMode: mode === DIALOG_MODES.ADD,
          autoProvisionKeyOnAccountAdd,
          autoProvisionKeyOnAccountAddMode,
          skipAutoProvisionKeyOnAccountAdd: false,
        }) &&
        result.success === true &&
        typeof result.accountId === "string" &&
        result.accountId.trim().length > 0
      )
    },
    [
      autoProvisionKeyOnAccountAdd,
      autoProvisionKeyOnAccountAddMode,
      mode,
      siteType,
    ],
  )

  const handleSaveAccount = async (options?: {
    skipSub2ApiKeyPrompt?: boolean
    skipAutoProvisionKeyOnAccountAdd?: boolean
  }) => {
    const tempWindowRequestSource = getCurrentTempWindowRequestSource()
    const analyticsActionRef: {
      current: ReturnType<typeof startAccountDialogAnalyticsAction> | null
    } = { current: null }
    const startSaveAnalyticsAction = () => {
      if (!analyticsActionRef.current) {
        analyticsActionRef.current = startAccountDialogAnalyticsAction(
          mode === DIALOG_MODES.ADD
            ? PRODUCT_ANALYTICS_ACTION_IDS.CreateAccount
            : PRODUCT_ANALYTICS_ACTION_IDS.UpdateAccount,
        )
      }
      return analyticsActionRef.current
    }
    let isAnalyticsActionCompleted = false

    try {
      setIsSaving(true)
      const policy = getAccountDialogSitePolicy(siteType)
      const saveAnalyticsAction = startSaveAnalyticsAction()
      const duplicateConfirmed = await confirmDuplicateAccount()
      if (!duplicateConfirmed?.isCurrent()) {
        saveAnalyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Cancelled)
        isAnalyticsActionCompleted = true
        // Let callers distinguish cancellation from a failed save.
        return null
      }
      const shouldDeferSuccessForSitePolicy =
        shouldDeferAccountSaveSuccessForAccountDialogSite({
          policy,
          isAddMode: mode === DIALOG_MODES.ADD,
          autoProvisionKeyOnAccountAdd,
          autoProvisionKeyOnAccountAddMode,
          skipAutoProvisionKeyOnAccountAdd:
            options?.skipAutoProvisionKeyOnAccountAdd === true,
        })
      const sub2apiAuth = sub2ApiSession.auth
      const normalizedUserId = userId.trim()
      const normalizedAccessToken = accessToken.trim()

      const saveInput = {
        url: url.trim(),
        siteName: siteName.trim(),
        username: username.trim(),
        accessToken: normalizedAccessToken,
        userId: normalizedUserId,
        exchangeRate: exchangeRate,
        notes: notes.trim(),
        tagIds: tagIds,
        checkInConfig: checkIn,
        siteType: siteType,
        authType: authType,
        cookieAuthSessionCookie: cookieAuthSessionCookie.trim(),
        manualBalanceUsd: manualBalanceUsd,
        excludeFromTotalBalance: excludeFromTotalBalance,
        excludeFromTodayIncome: excludeFromTodayIncome,
        sub2apiAuth: sub2apiAuth,
      }
      const saveAccount = () =>
        mode === DIALOG_MODES.ADD
          ? validateAndSaveAccount({
              ...saveInput,
              options: {
                deferDataRefresh: true,
                skipAutoProvisionKeyOnAccountAdd:
                  options?.skipAutoProvisionKeyOnAccountAdd === true ||
                  shouldDeferSuccessForSitePolicy,
                ...(draft.kimiOpenPlatformAuth
                  ? { kimiOpenPlatformAuth: draft.kimiOpenPlatformAuth }
                  : {}),
              },
            })
          : validateAndUpdateAccount({
              accountId: account!.id,
              ...saveInput,
              options: {
                deferDataRefresh: true,
                ...(draft.kimiOpenPlatformAuth
                  ? { kimiOpenPlatformAuth: draft.kimiOpenPlatformAuth }
                  : {}),
                selectionChanged: checkInSelectionChangedRef.current,
                loadedKimiAuth: loadedKimiAuthRef.current,
                ...(checkInDiscoveryBaseSelectionRef.current
                  ? {
                      discoveryBaseSelection:
                        checkInDiscoveryBaseSelectionRef.current,
                    }
                  : {}),
              },
            })
      const result = await withProtectionBypassUserCommand(
        mode === DIALOG_MODES.ADD
          ? PROTECTION_BYPASS_USER_COMMANDS.AddAccount
          : PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
        tempWindowRequestSource,
        async (protectionBypassExecution) => {
          const saveResult = await saveAccount()
          const savedAccountId =
            saveResult.success &&
            typeof saveResult.accountId === "string" &&
            saveResult.accountId.trim().length
              ? saveResult.accountId.trim()
              : null

          if (savedAccountId) {
            // The execution metadata is immutable and validated at each protected request,
            // so the refresh can continue after this save command returns.
            void refreshPostSaveAccount(
              savedAccountId,
              tempWindowRequestSource,
              protectionBypassExecution,
              onPostSaveAccountRefresh,
            )
          }

          return saveResult
        },
      )

      if (!result.success) {
        saveAnalyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          diagnostics: {
            failure: buildActionFailureDiagnostics({
              error: new Error(result.message || t("messages.saveFailed")),
            }),
          },
        })
        isAnalyticsActionCompleted = true
        throw new Error(result.message || t("messages.saveFailed"))
      }

      saveAnalyticsAction.complete(PRODUCT_ANALYTICS_RESULTS.Success)
      isAnalyticsActionCompleted = true
      confirmSavedOpenRouterCredential(normalizedAccessToken)

      const savedAccountId =
        typeof result.accountId === "string" && result.accountId.trim().length
          ? result.accountId.trim()
          : null

      const feedbackMessage =
        typeof result.message === "string" && result.message.trim().length > 0
          ? result.message
          : mode === DIALOG_MODES.ADD
            ? t("messages.addSuccess", {
                name: siteName,
              })
            : t("messages.updateSuccess", {
                name: siteName,
              })

      if (result.feedbackLevel === ACCOUNT_SAVE_FEEDBACK_LEVELS.Warning) {
        const warningAccountId =
          typeof result.accountId === "string" && result.accountId.trim()
            ? result.accountId.trim()
            : null

        toast.warning(feedbackMessage, {
          action: warningAccountId
            ? {
                label: t("common:actions.refresh"),
                pendingLabel: t("common:status.refreshing"),
                onClick: async () => {
                  const accountName =
                    siteName.trim() ||
                    t("messages:toast.success.accountSaveSuccess")
                  const toastId = toast.loading(
                    t("messages:toast.loading.refreshingAccount", {
                      accountName,
                    }),
                  )

                  try {
                    const tempWindowRequestSource =
                      getCurrentTempWindowRequestSource()
                    const refreshResult = await withProtectionBypassUserCommand(
                      mode === DIALOG_MODES.ADD
                        ? PROTECTION_BYPASS_USER_COMMANDS.AddAccount
                        : PROTECTION_BYPASS_USER_COMMANDS.ReauthenticateAccount,
                      tempWindowRequestSource,
                      (protectionBypassExecution) =>
                        accountRefresh.refreshAccount(warningAccountId, true, {
                          tempWindowRequestSource,
                          protectionBypassExecution,
                        }),
                    )

                    if (!refreshResult?.refreshed) {
                      toast.error(
                        t("messages:toast.error.refreshAccount", {
                          accountName,
                        }),
                        { id: toastId },
                      )
                      return
                    }

                    toast.success(
                      t("messages:toast.success.refreshAccount", {
                        accountName,
                      }),
                      { id: toastId },
                    )
                  } catch (error) {
                    toast.error(
                      t("messages:toast.error.refreshAccount", {
                        accountName,
                      }),
                      { id: toastId },
                    )
                    logger.error("Post-save warning refresh failed", {
                      accountId: warningAccountId,
                      error: getErrorMessage(error),
                    })
                  }
                },
              }
            : undefined,
        })
      } else {
        toast.success(feedbackMessage)
      }

      if (shouldDeferSuccessForSitePolicy && savedAccountId) {
        await postSaveWorkflow.beginProvisioning({
          accountId: savedAccountId,
          accountName: siteName.trim() || policy.defaultSiteName || siteType,
          mode: autoProvisionKeyOnAccountAddMode,
          confirmOneTimeKey: policy.deferSuccessForOneTimeKeyPostSaveFlow,
        })
      }

      // A single provisioning owner must finish before any legacy default-key prompt opens.
      const autoProvisioningAllGroups =
        mode === DIALOG_MODES.ADD &&
        autoProvisionKeyOnAccountAdd &&
        autoProvisionKeyOnAccountAddMode ===
          ACCOUNT_KEY_AUTO_PROVISION_MODES.AllGroups &&
        options?.skipAutoProvisionKeyOnAccountAdd !== true
      const skipSub2ApiKeyPrompt =
        options?.skipSub2ApiKeyPrompt === true ||
        autoProvisioningAllGroups ||
        shouldDeferSuccessForSitePolicy
      if (
        savedAccountId &&
        policy.openSub2ApiTokenDialogPostSave &&
        !skipSub2ApiKeyPrompt
      ) {
        try {
          await postSaveWorkflow.openDefaultKeyPrompt(savedAccountId)
        } catch (error) {
          logger.error("Post-save Sub2API token dialog failed", {
            accountId: savedAccountId,
            error: getErrorMessage(error),
          })
        }
      }

      return result
    } catch (error: any) {
      if (analyticsActionRef.current && !isAnalyticsActionCompleted) {
        analyticsActionRef.current.complete(PRODUCT_ANALYTICS_RESULTS.Failure, {
          diagnostics: {
            failure: buildActionFailureDiagnostics({
              error,
            }),
          },
        })
      }
      toast.error(
        t("messages.operationFailed", { error: getErrorMessage(error) }),
      )
      throw error
    } finally {
      setIsSaving(false)
    }
  }

  return { isSaving, handleSaveAccount, shouldDeferAccountSaveSuccess }
}
