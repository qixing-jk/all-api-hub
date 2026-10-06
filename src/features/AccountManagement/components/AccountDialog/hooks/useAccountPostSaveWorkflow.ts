import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useChannelDialog } from "~/components/dialogs/ChannelDialog"
import type { ManagedSiteType } from "~/constants/siteType"
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
import { fetchDisplayAccountRuntimeKeys } from "~/services/accounts/utils/apiServiceRequest"
import type { DisplaySiteData, SiteAccount } from "~/types"
import {
  ACCOUNT_KEY_AUTO_PROVISION_MODES,
  type AccountKeyAutoProvisionMode,
} from "~/types/accountKeyAutoProvisioning"
import type { AccountSaveResponse } from "~/types/serviceResponse"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AccountPostSaveWorkflow")
interface AihubmixPostSaveKeyPromptState {
  isOpen: boolean
  accountId: string | null
  accountName: string
  isCreating: boolean
}

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
  const [aihubmixPostSaveKeyPrompt, setAihubmixPostSaveKeyPrompt] =
    useState<AihubmixPostSaveKeyPromptState>({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
  const newAccountRef = useRef<DisplaySiteData | string | null>(null)
  const targetAccountRef = useRef<DisplaySiteData | string | null>(null)
  const pendingPostSaveChannelRef = useRef<{
    displaySiteData: DisplaySiteData
    runtimeKey?: AccountRuntimeKey | null
    createdSecret?: CreatedRuntimeSecret
  } | null>(null)
  const pendingAccountKeyProvisioningSuccessRef = useRef<string | null>(null)
  const [postSaveKeyProvisioning, setPostSaveKeyProvisioning] = useState<{
    account: DisplaySiteData
    mode: AccountKeyAutoProvisionMode
  } | null>(null)
  const postSaveAutoConfigRunRef = useRef(0)
  const postSaveCreationAbort = useRef<AbortController | null>(null)
  const postSaveKeyProvisioningRunRef = useRef(0)
  const nextPostSaveKeyInputDialogSessionIdRef = useRef(0)
  const activePostSaveKeyInputDialogSessionIdRef = useRef<number | null>(null)
  const {
    openWithAccount: openChannelDialog,
    openWithCredentials: openChannelDialogWithCredentials,
    openDefaultTokenQuickCreateDialogForAccount,
  } = useChannelDialog()

  const invalidatePostSaveAutoConfigRun = useCallback(() => {
    postSaveAutoConfigRunRef.current += 1
  }, [])

  const openPostSaveKeyInputDialogSession = useCallback(() => {
    const nextSessionId = nextPostSaveKeyInputDialogSessionIdRef.current + 1
    nextPostSaveKeyInputDialogSessionIdRef.current = nextSessionId
    activePostSaveKeyInputDialogSessionIdRef.current = nextSessionId
    setPostSaveKeyInputDialogSessionId(nextSessionId)
    return nextSessionId
  }, [])

  const invalidatePostSaveKeyInputDialogSession = useCallback(() => {
    activePostSaveKeyInputDialogSessionIdRef.current = null
    setPostSaveKeyInputDialogSessionId(null)
  }, [])

  const clearPostSaveWorkflowState = useCallback(() => {
    newAccountRef.current = null
    targetAccountRef.current = null
    setIsAutoConfiguring(false)
    postSaveCreationAbort.current?.abort()
    postSaveCreationAbort.current = null
    invalidatePostSaveAutoConfigRun()
    invalidatePostSaveKeyInputDialogSession()
    postSaveKeyProvisioningRunRef.current += 1
    setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
    setPostSaveOneTimeSecret(null)
    setPostSaveKeyInputAccount(null)
    setPostSaveKeyProvisioning(null)
    setAihubmixPostSaveKeyPrompt({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
    pendingAccountKeyProvisioningSuccessRef.current = null
    pendingPostSaveChannelRef.current = null
  }, [invalidatePostSaveAutoConfigRun, invalidatePostSaveKeyInputDialogSession])

  const completePendingAccountKeyProvisioningSuccess = useCallback(() => {
    const savedAccountId = pendingAccountKeyProvisioningSuccessRef.current
    pendingAccountKeyProvisioningSuccessRef.current = null
    if (savedAccountId) {
      onSuccess?.(savedAccountId)
    }
  }, [onSuccess])

  const handlePostSaveKeyProvisioningClose = useCallback(() => {
    setPostSaveKeyProvisioning(null)
    completePendingAccountKeyProvisioningSuccess()
  }, [completePendingAccountKeyProvisioningSuccess])

  const openAihubmixPostSaveKeyPrompt = useCallback(
    (params: { accountId: string; accountName: string }) => {
      postSaveKeyProvisioningRunRef.current += 1
      pendingAccountKeyProvisioningSuccessRef.current = params.accountId
      setAihubmixPostSaveKeyPrompt({
        isOpen: true,
        accountId: params.accountId,
        accountName: params.accountName,
        isCreating: false,
      })
    },
    [],
  )

  const handleAihubmixNormalSaveForegroundKeyFlow = useCallback(
    async (params: { accountId: string; accountName: string }) => {
      const runId = postSaveKeyProvisioningRunRef.current
      const isCurrentRun = () => postSaveKeyProvisioningRunRef.current === runId
      const savedAccountId = params.accountId.trim()
      if (!savedAccountId) return

      const openPrompt = () => {
        if (!isCurrentRun()) return

        openAihubmixPostSaveKeyPrompt({
          accountId: savedAccountId,
          accountName: params.accountName,
        })
      }

      try {
        const savedAccount = await accountQueries.getAccountById(savedAccountId)
        if (!isCurrentRun()) return

        if (!savedAccount) {
          openPrompt()
          return
        }

        const displaySiteData =
          (await accountReadModels.getDisplayDataById(savedAccountId)) ??
          accountPresentation.convertToDisplayData(savedAccount)
        if (!isCurrentRun()) return

        const inventory = await fetchDisplayAccountRuntimeKeys(displaySiteData)
        if (!isCurrentRun()) return

        if (inventory.length) {
          onSuccess?.(savedAccountId)
          return
        }

        openPrompt()
      } catch {
        openPrompt()
      }
    },
    [onSuccess, openAihubmixPostSaveKeyPrompt],
  )

  const handleAihubmixPostSaveKeyPromptCancel = useCallback(() => {
    postSaveKeyProvisioningRunRef.current += 1
    setAihubmixPostSaveKeyPrompt({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
    completePendingAccountKeyProvisioningSuccess()
    toast.info(t("messages:aihubmix.oneTimeKeyPromptCancelled"))
  }, [completePendingAccountKeyProvisioningSuccess, t])

  const handleAihubmixPostSaveKeyPromptConfirm = useCallback(async () => {
    const accountId = aihubmixPostSaveKeyPrompt.accountId
    if (!accountId) return

    const runId = postSaveKeyProvisioningRunRef.current + 1
    postSaveKeyProvisioningRunRef.current = runId
    const isCurrentRun = () => postSaveKeyProvisioningRunRef.current === runId

    setAihubmixPostSaveKeyPrompt((prev) => ({
      ...prev,
      isCreating: true,
    }))

    try {
      const savedAccount = await accountQueries.getAccountById(accountId)
      if (!isCurrentRun()) return
      if (!savedAccount) {
        toast.error(t("messages:toast.error.findAccountDetailsFailed"))
        setAihubmixPostSaveKeyPrompt({
          isOpen: false,
          accountId: null,
          accountName: "",
          isCreating: false,
        })
        completePendingAccountKeyProvisioningSuccess()
        return
      }

      if (!isCurrentRun()) return

      postSaveCreationAbort.current?.abort()
      const controller = new AbortController()
      postSaveCreationAbort.current = controller
      const ensureResult = await ensureAccountKey(
        accountPresentation.convertToDisplayData(savedAccount),
        { allowOneTimeSecret: true, signal: controller.signal },
      )
      if (!isCurrentRun()) return

      if (
        ensureResult.kind === "created" &&
        ensureResult.creation.createdSecret
      ) {
        setAihubmixPostSaveKeyPrompt({
          isOpen: false,
          accountId: null,
          accountName: "",
          isCreating: false,
        })
        setPostSaveOneTimeSecret(ensureResult.creation.createdSecret)
        return
      }

      toast.error(t("messages:aihubmix.oneTimeKeyUnavailableAfterCreate"))
      setAihubmixPostSaveKeyPrompt({
        isOpen: false,
        accountId: null,
        accountName: "",
        isCreating: false,
      })
      completePendingAccountKeyProvisioningSuccess()
    } catch (error) {
      if (!isCurrentRun()) return

      toast.error(t("messages:aihubmix.oneTimeKeyUnavailableAfterCreate"))
      setAihubmixPostSaveKeyPrompt({
        isOpen: false,
        accountId: null,
        accountName: "",
        isCreating: false,
      })
      completePendingAccountKeyProvisioningSuccess()
      logger.error("AIHubMix post-save one-time key creation failed", {
        accountId,
        error: getErrorMessage(error),
      })
    }
  }, [
    aihubmixPostSaveKeyPrompt.accountId,
    completePendingAccountKeyProvisioningSuccess,
    t,
  ])

  const openPostSaveManagedSiteDialog = useCallback(
    async (
      displaySiteData: DisplaySiteData,
      runtimeKey: AccountRuntimeKey | null,
      runId = postSaveAutoConfigRunRef.current,
      targetAccount = targetAccountRef.current,
      createdSecret?: CreatedRuntimeSecret,
    ) => {
      if (postSaveAutoConfigRunRef.current !== runId) {
        return
      }
      const isCurrentRun = () => postSaveAutoConfigRunRef.current === runId

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
    [onSuccess, openChannelDialog, openChannelDialogWithCredentials, t],
  )

  const handlePostSaveOneTimeSecretClose = useCallback(async () => {
    const runId = postSaveAutoConfigRunRef.current
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
  ])

  const handlePostSaveKeyInputTokenDialogCloseForSession = useCallback(
    (sessionId: number | null) => {
      if (
        sessionId === null ||
        activePostSaveKeyInputDialogSessionIdRef.current !== sessionId
      ) {
        return
      }

      invalidatePostSaveKeyInputDialogSession()
      pendingPostSaveChannelRef.current = null
      setPostSaveKeyInputAccount(null)
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
    },
    [invalidatePostSaveKeyInputDialogSession],
  )

  const handlePostSaveKeyInputTokenDialogClose = useCallback(() => {
    handlePostSaveKeyInputTokenDialogCloseForSession(
      activePostSaveKeyInputDialogSessionIdRef.current,
    )
  }, [handlePostSaveKeyInputTokenDialogCloseForSession])

  const handlePostSaveKeyInputTokenCreatedForSession = useCallback(
    async (
      sessionId: number | null,
      createdToken: AccountKeyCreationResult,
    ) => {
      if (
        sessionId === null ||
        activePostSaveKeyInputDialogSessionIdRef.current !== sessionId
      ) {
        return
      }

      invalidatePostSaveKeyInputDialogSession()
      const runId = postSaveAutoConfigRunRef.current
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
        if (postSaveAutoConfigRunRef.current !== runId) return
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
        if (postSaveAutoConfigRunRef.current !== runId) {
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
    [invalidatePostSaveKeyInputDialogSession, openPostSaveManagedSiteDialog, t],
  )

  const handlePostSaveKeyInputTokenCreated = useCallback(
    async (createdToken: AccountKeyCreationResult) => {
      await handlePostSaveKeyInputTokenCreatedForSession(
        activePostSaveKeyInputDialogSessionIdRef.current,
        createdToken,
      )
    },
    [handlePostSaveKeyInputTokenCreatedForSession],
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
    const runId = postSaveAutoConfigRunRef.current + 1
    postSaveAutoConfigRunRef.current = runId
    const isCurrentRun = () => postSaveAutoConfigRunRef.current === runId

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
      postSaveCreationAbort.current?.abort()
      const controller = new AbortController()
      postSaveCreationAbort.current = controller
      const ensureResult = await ensureAccountKey(
        accountPresentation.convertToDisplayData(savedSiteAccount),
        { allowOneTimeSecret: true, signal: controller.signal },
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

  const beginProvisioning = async (params: {
    accountId: string
    accountName: string
    mode: AccountKeyAutoProvisionMode
    confirmOneTimeKey: boolean
  }) => {
    if (
      params.confirmOneTimeKey &&
      params.mode === ACCOUNT_KEY_AUTO_PROVISION_MODES.Default
    ) {
      await handleAihubmixNormalSaveForegroundKeyFlow(params)
      return
    }
    pendingAccountKeyProvisioningSuccessRef.current = params.accountId
    const runId = postSaveKeyProvisioningRunRef.current
    try {
      const display = await accountReadModels.getDisplayDataById(
        params.accountId,
      )
      const stored = display
        ? null
        : await accountQueries.getAccountById(params.accountId)
      if (runId !== postSaveKeyProvisioningRunRef.current) return
      const owner =
        display ??
        (stored ? accountPresentation.convertToDisplayData(stored) : null)
      if (owner)
        setPostSaveKeyProvisioning({ account: owner, mode: params.mode })
      else completePendingAccountKeyProvisioningSuccess()
    } catch {
      if (runId === postSaveKeyProvisioningRunRef.current)
        completePendingAccountKeyProvisioningSuccess()
    }
  }
  const openDefaultKeyPrompt = async (accountId: string) => {
    const generation = postSaveKeyProvisioningRunRef.current
    const display = await accountReadModels.getDisplayDataById(accountId)
    if (generation === postSaveKeyProvisioningRunRef.current && display) {
      await openDefaultTokenQuickCreateDialogForAccount(display)
    }
  }
  useEffect(
    () => () => {
      postSaveAutoConfigRunRef.current += 1
      postSaveKeyProvisioningRunRef.current += 1
      activePostSaveKeyInputDialogSessionIdRef.current = null
      postSaveCreationAbort.current?.abort()
    },
    [],
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
