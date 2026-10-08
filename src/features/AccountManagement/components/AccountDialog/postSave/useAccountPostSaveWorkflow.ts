import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import type { ManagedSiteType } from "~/constants/siteType"
import { AccountPostSaveSession } from "~/features/AccountManagement/components/AccountDialog/postSave/accountPostSaveSession"
import { useAccountPostSaveProvisioning } from "~/features/AccountManagement/components/AccountDialog/postSave/useAccountPostSaveProvisioning"
import toast from "~/lib/notify"
import {
  ensureAccountKey,
  getCreatedAccountRuntimeKey,
  resolveCreatedAccountRuntimeKey,
  type AccountKeyCreationResult,
} from "~/services/accounts/accountKeyCreation"
import {
  ACCOUNT_POST_SAVE_WORKFLOW_STEPS,
  type AccountPostSaveWorkflowStep,
} from "~/services/accounts/accountPostSaveWorkflow"
import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import type { DisplaySiteData, SiteAccount } from "~/types"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AccountPostSaveWorkflow")
/** Owns key input, response-only secrets and every continuation after account save. */
export function useAccountPostSaveWorkflow({
  onSuccess,
  managedSiteType,
}: {
  onSuccess?: (account: DisplaySiteData | string) => void
  managedSiteType: ManagedSiteType
}) {
  const { t } = useTranslation(["accountDialog", "settings", "messages"])
  const [isAutoConfiguring, setIsAutoConfiguring] = useState(false)
  const [accountPostSaveWorkflowStep, setAccountPostSaveWorkflowStep] =
    useState<AccountPostSaveWorkflowStep>(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
  const [postSaveOneTimeSecret, setPostSaveOneTimeSecret] =
    useState<CreatedRuntimeSecret | null>(null)
  const [postSaveKeyInputAccount, setPostSaveKeyInputAccount] =
    useState<DisplaySiteData | null>(null)
  const [postSaveKeyInputSessionId, setPostSaveKeyInputDialogSessionId] =
    useState<number | null>(null)
  const newAccountRef = useRef<DisplaySiteData | string | null>(null)
  const targetAccountRef = useRef<DisplaySiteData | string | null>(null)
  const pendingPostSaveChannelRef = useRef<{
    displaySiteData: DisplaySiteData
    runtimeKey?: AccountRuntimeKey | null
    createdSecret?: CreatedRuntimeSecret
  } | null>(null)
  const [session] = useState(() => new AccountPostSaveSession())
  const {
    openWithAccount: openChannelDialog,
    openWithCredentials: openChannelDialogWithCredentials,
    openDefaultTokenQuickCreateDialogForAccount,
  } = useChannelDialog()

  const openPostSaveKeyInputDialogSession = useCallback(() => {
    const nextSessionId = session.openKeyInput()
    setPostSaveKeyInputDialogSessionId(nextSessionId)
    return nextSessionId
  }, [session])

  const invalidatePostSaveKeyInputDialogSession = useCallback(() => {
    session.invalidateKeyInput()
    setPostSaveKeyInputDialogSessionId(null)
  }, [session])

  const {
    state: { postSaveKeyProvisioning, aihubmixPostSaveKeyPrompt },
    clear: clearProvisioning,
    completePendingAccountKeyProvisioningSuccess,
    beginProvisioning,
    openDefaultKeyPrompt,
    handlePostSaveKeyProvisioningClose,
    handleAihubmixPostSaveKeyPromptCancel,
    handleAihubmixPostSaveKeyPromptConfirm,
  } = useAccountPostSaveProvisioning({
    session,
    onSuccess,
    onCreatedSecret: setPostSaveOneTimeSecret,
    openDefaultTokenQuickCreateDialogForAccount,
  })
  const clearPostSaveWorkflowState = useCallback(() => {
    newAccountRef.current = null
    targetAccountRef.current = null
    setIsAutoConfiguring(false)
    session.clear()
    setPostSaveKeyInputDialogSessionId(null)
    setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
    setPostSaveOneTimeSecret(null)
    setPostSaveKeyInputAccount(null)
    clearProvisioning()
    pendingPostSaveChannelRef.current = null
  }, [session, clearProvisioning])

  const openPostSaveManagedSiteDialog = useCallback(
    async (
      displaySiteData: DisplaySiteData,
      runtimeKey: AccountRuntimeKey | null,
      runId = session.autoConfigRun,
      targetAccount = targetAccountRef.current,
      createdSecret?: CreatedRuntimeSecret,
    ) => {
      if (!session.acceptsAutoConfig(runId)) {
        return
      }
      const isCurrentRun = () => session.acceptsAutoConfig(runId)

      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog,
      )
      try {
        const completed = () => {
          if (onSuccess && targetAccount && isCurrentRun())
            onSuccess(targetAccount)
        }
        const openResult = runtimeKey
          ? await openChannelDialog(displaySiteData, runtimeKey, completed, {
              shouldContinue: isCurrentRun,
            })
          : createdSecret
            ? await openChannelDialogWithCredentials(
                {
                  name: createdSecret.displayName,
                  baseUrl: createdSecret.credential.baseUrl,
                  apiKey: createdSecret.secret,
                  apiType: createdSecret.credential.apiType,
                },
                completed,
              )
            : { opened: false }
        if (!isCurrentRun()) {
          return
        }
        if (!openResult.opened) {
          if (openResult.deferred) {
            return
          }
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
        )
      } catch (error) {
        if (!isCurrentRun()) {
          return
        }
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed)
        toast.error(
          t("messages.newApiConfigFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to open post-save managed-site dialog", {
          error: getErrorMessage(error),
          accountId: targetAccount,
          siteType: displaySiteData.siteType,
        })
      }
    },
    [
      onSuccess,
      openChannelDialog,
      openChannelDialogWithCredentials,
      t,
      session,
    ],
  )

  const handlePostSaveOneTimeSecretClose = useCallback(async () => {
    const runId = session.autoConfigRun
    setPostSaveOneTimeSecret(null)
    const pending = pendingPostSaveChannelRef.current
    pendingPostSaveChannelRef.current = null
    if (!pending || (!pending.runtimeKey && !pending.createdSecret)) {
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
      completePendingAccountKeyProvisioningSuccess()
      return
    }

    await openPostSaveManagedSiteDialog(
      pending.displaySiteData,
      pending.runtimeKey ?? null,
      runId,
      undefined,
      pending.createdSecret,
    )
  }, [
    completePendingAccountKeyProvisioningSuccess,
    openPostSaveManagedSiteDialog,
    session,
  ])

  const handlePostSaveKeyInputTokenDialogCloseForSession = useCallback(
    (sessionId: number | null) => {
      if (!session.acceptsKeyInput(sessionId)) {
        return
      }

      invalidatePostSaveKeyInputDialogSession()
      pendingPostSaveChannelRef.current = null
      setPostSaveKeyInputAccount(null)
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
    },
    [invalidatePostSaveKeyInputDialogSession, session],
  )

  const handlePostSaveKeyInputTokenDialogClose = useCallback(() => {
    handlePostSaveKeyInputTokenDialogCloseForSession(session.keyInputSession)
  }, [handlePostSaveKeyInputTokenDialogCloseForSession, session])

  const handlePostSaveKeyInputTokenCreatedForSession = useCallback(
    async (
      sessionId: number | null,
      createdToken: AccountKeyCreationResult,
    ) => {
      if (!session.acceptsKeyInput(sessionId)) {
        return
      }

      invalidatePostSaveKeyInputDialogSession()
      const runId = session.autoConfigRun
      const pending = pendingPostSaveChannelRef.current
      setPostSaveKeyInputAccount(null)

      if (!pending) {
        pendingPostSaveChannelRef.current = null
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
        return
      }

      pendingPostSaveChannelRef.current = null
      if (createdToken.createdSecret) {
        pendingPostSaveChannelRef.current = {
          ...pending,
          runtimeKey: getCreatedAccountRuntimeKey(
            pending.displaySiteData,
            createdToken,
          ),
          createdSecret: createdToken.createdSecret,
        }
        setPostSaveOneTimeSecret(createdToken.createdSecret)
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement,
        )
        return
      }
      try {
        const runtimeKey = await resolveCreatedAccountRuntimeKey(
          pending.displaySiteData,
          createdToken,
        )
        if (!session.acceptsAutoConfig(runId)) return
        if (!runtimeKey) {
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          toast.error(t("messages:accountOperations.tokenNotFound"))
          return
        }
        await openPostSaveManagedSiteDialog(
          pending.displaySiteData,
          runtimeKey,
          runId,
        )
      } catch (error) {
        if (!session.acceptsAutoConfig(runId)) {
          return
        }
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed)
        toast.error(
          t("messages.newApiConfigFailed", {
            error: getErrorMessage(error),
          }),
        )
        logger.error("Failed to resolve the created account runtime key", {
          accountId: pending.displaySiteData.id,
          error: getErrorMessage(error),
        })
      }
    },
    [
      invalidatePostSaveKeyInputDialogSession,
      openPostSaveManagedSiteDialog,
      t,
      session,
    ],
  )

  const handlePostSaveKeyInputTokenCreated = useCallback(
    async (createdToken: AccountKeyCreationResult) => {
      await handlePostSaveKeyInputTokenCreatedForSession(
        session.keyInputSession,
        createdToken,
      )
    },
    [handlePostSaveKeyInputTokenCreatedForSession, session],
  )

  const getPostSaveKeyInputDialogHandlers = useCallback(
    (sessionId: number | null) => ({
      onClose: () => {
        handlePostSaveKeyInputTokenDialogCloseForSession(sessionId)
      },
      onSuccess: async (createdToken: AccountKeyCreationResult) => {
        await handlePostSaveKeyInputTokenCreatedForSession(
          sessionId,
          createdToken,
        )
      },
    }),
    [
      handlePostSaveKeyInputTokenCreatedForSession,
      handlePostSaveKeyInputTokenDialogCloseForSession,
    ],
  )

  const executeAutoConfig = async ({
    account,
    saveAccount,
    ensureManagedSiteAutoConfigReady,
  }: {
    account?: DisplaySiteData | null
    saveAccount: () => Promise<AccountSaveResponse | null>
    ensureManagedSiteAutoConfigReady: () => Promise<boolean>
  }) => {
    const runId = session.beginAutoConfig()
    const isCurrentRun = () => session.acceptsAutoConfig(runId)

    try {
      const isManagedSiteReady = await ensureManagedSiteAutoConfigReady()
      if (!isCurrentRun()) {
        return
      }
      if (!isManagedSiteReady) {
        return
      }
    } catch (error) {
      if (!isCurrentRun()) {
        return
      }
      toast.error(
        t("messages.operationFailed", {
          error: getErrorMessage(error),
        }),
      )
      logger.error(
        "Failed to validate managed-site auto-config prerequisites",
        {
          managedSiteType,
          error: getErrorMessage(error),
        },
      )
      return
    }

    setIsAutoConfiguring(true)
    try {
      let targetAccount: DisplaySiteData | null | string | undefined =
        account || newAccountRef.current
      let savedSiteAccount: SiteAccount | null = null
      // 如果是新增（account 不存在），就先保存
      if (!targetAccount) {
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.SavingAccount,
        )
        const saveResult = await saveAccount()
        if (!isCurrentRun()) {
          return
        }
        if (saveResult === null) {
          setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
          return
        }
        targetAccount = saveResult?.accountId
        if (!targetAccount) {
          toast.error(t("messages.saveAccountFailed"))
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        // 缓存到 ref，避免重复保存
        newAccountRef.current = targetAccount
      }

      // 缓存目标账户
      if (!isCurrentRun()) {
        return
      }
      targetAccountRef.current = targetAccount
      const intendedTargetAccount = targetAccount
      let displaySiteData

      if (typeof targetAccount === "string") {
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.LoadingSavedAccount,
        )
        // 获取账户详细信息
        const siteAccount = await accountQueries.getAccountById(targetAccount)
        if (!isCurrentRun()) {
          return
        }
        if (!siteAccount) {
          toast.error(t("messages:toast.error.findAccountDetailsFailed"))
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        savedSiteAccount = siteAccount
        displaySiteData =
          (await accountReadModels.getDisplayDataById(siteAccount.id)) ??
          accountPresentation.convertToDisplayData(siteAccount)
        if (!isCurrentRun()) {
          return
        }
      } else {
        displaySiteData = targetAccount
      }

      // The current runtime path opens the channel dialog with prefilled data
      // so users can review it before creation. The direct auto-import helpers
      // are kept only as deprecated compatibility shims.
      if (!savedSiteAccount) {
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog,
        )
        const openResult = await openChannelDialog(
          displaySiteData,
          null,
          () => {
            if (onSuccess && intendedTargetAccount && isCurrentRun()) {
              onSuccess(intendedTargetAccount)
            }
          },
          { shouldContinue: isCurrentRun },
        )
        if (!isCurrentRun()) {
          return
        }
        if (!openResult.opened) {
          if (openResult.deferred) {
            return
          }
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
        }
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
        )
        return
      }

      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.CheckingToken,
      )
      const signal = session.beginCreation()
      const ensureResult = await ensureAccountKey(
        accountPresentation.convertToDisplayData(savedSiteAccount),
        { allowOneTimeSecret: true, signal },
      )
      if (!isCurrentRun()) {
        return
      }

      if (ensureResult.kind === "input-required") {
        openPostSaveKeyInputDialogSession()
        pendingPostSaveChannelRef.current = { displaySiteData }
        setPostSaveKeyInputAccount(displaySiteData)
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForKeyInput,
        )
        return
      }
      const secret =
        ensureResult.kind === "created"
          ? ensureResult.creation.createdSecret
          : undefined
      if (secret) {
        pendingPostSaveChannelRef.current = {
          displaySiteData,
          runtimeKey: ensureResult.runtimeKey,
          createdSecret: secret,
        }
        setPostSaveOneTimeSecret(secret)
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement,
        )
        return
      }
      await openPostSaveManagedSiteDialog(
        displaySiteData,
        ensureResult.runtimeKey,
        runId,
        intendedTargetAccount,
      )
    } catch (error) {
      if (!isCurrentRun()) {
        return
      }
      toast.error(
        t("messages.newApiConfigFailed", {
          error: getErrorMessage(error),
        }),
      )
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed)
      logger.error("Auto configuration failed", { error })
    } finally {
      if (isCurrentRun()) {
        setIsAutoConfiguring(false)
      }
    }
  }

  useEffect(
    () => () => {
      session.clear()
    },
    [session],
  )

  return {
    state: {
      isAutoConfiguring,
      accountPostSaveWorkflowStep,
      postSaveOneTimeSecret,
      postSaveKeyProvisioning,
      postSaveKeyInputAccount,
      postSaveKeyInputSessionId,
      aihubmixPostSaveKeyPrompt,
    },
    clear: clearPostSaveWorkflowState,
    completePendingSuccess: completePendingAccountKeyProvisioningSuccess,
    beginProvisioning,
    openDefaultKeyPrompt,
    executeAutoConfig,
    handlers: {
      handleAihubmixPostSaveKeyPromptCancel,
      handleAihubmixPostSaveKeyPromptConfirm,
      handlePostSaveOneTimeSecretClose,
      handlePostSaveKeyProvisioningClose,
      handlePostSaveKeyInputTokenDialogClose,
      handlePostSaveKeyInputTokenCreated,
      getPostSaveKeyInputDialogHandlers,
    },
  }
}
