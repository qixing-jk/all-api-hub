import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { type useChannelDialog } from "~/components/dialogs/ChannelDialog"
import toast from "~/lib/notify"
import { ensureAccountKey } from "~/services/accounts/accountKeyCreation"
import { accountPresentation } from "~/services/accounts/accountStorage/accountPresentation"
import { accountQueries } from "~/services/accounts/accountStorage/accountQueries"
import { accountReadModels } from "~/services/accounts/accountStorage/accountReadModels"
import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
import { fetchDisplayAccountRuntimeKeys } from "~/services/accounts/utils/apiServiceRequest"
import type { DisplaySiteData } from "~/types"
import {
  ACCOUNT_KEY_AUTO_PROVISION_MODES,
  type AccountKeyAutoProvisionMode,
} from "~/types/accountKeyAutoProvisioning"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

import { type AccountPostSaveSession } from "./accountPostSaveSession"

const logger = createLogger("AccountPostSaveWorkflow")

interface AihubmixPostSaveKeyPromptState {
  isOpen: boolean
  accountId: string | null
  accountName: string
  isCreating: boolean
}

/** Owns foreground provisioning, cancellation and success deferred until secret acknowledgement. */
export function useAccountPostSaveProvisioning({
  session,
  onSuccess,
  onCreatedSecret,
  openDefaultTokenQuickCreateDialogForAccount,
}: {
  session: AccountPostSaveSession
  onSuccess?: (account: DisplaySiteData | string) => void
  onCreatedSecret: (secret: CreatedRuntimeSecret) => void
  openDefaultTokenQuickCreateDialogForAccount: ReturnType<
    typeof useChannelDialog
  >["openDefaultTokenQuickCreateDialogForAccount"]
}) {
  const { t } = useTranslation(["accountDialog", "settings", "messages"])
  const [aihubmixPostSaveKeyPrompt, setAihubmixPostSaveKeyPrompt] =
    useState<AihubmixPostSaveKeyPromptState>({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
  const pendingAccountKeyProvisioningSuccessRef = useRef<string | null>(null)
  const [postSaveKeyProvisioning, setPostSaveKeyProvisioning] = useState<{
    account: DisplaySiteData
    mode: AccountKeyAutoProvisionMode
  } | null>(null)
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
      session.invalidateProvisioning()
      pendingAccountKeyProvisioningSuccessRef.current = params.accountId
      setAihubmixPostSaveKeyPrompt({
        isOpen: true,
        accountId: params.accountId,
        accountName: params.accountName,
        isCreating: false,
      })
    },
    [session],
  )

  const handleAihubmixNormalSaveForegroundKeyFlow = useCallback(
    async (params: { accountId: string; accountName: string }) => {
      const runId = session.provisioningRun
      const isCurrentRun = () => session.acceptsProvisioning(runId)
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
    [onSuccess, openAihubmixPostSaveKeyPrompt, session],
  )

  const handleAihubmixPostSaveKeyPromptCancel = useCallback(() => {
    session.invalidateProvisioning()
    setAihubmixPostSaveKeyPrompt({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
    completePendingAccountKeyProvisioningSuccess()
    toast.info(t("messages:aihubmix.oneTimeKeyPromptCancelled"))
  }, [completePendingAccountKeyProvisioningSuccess, t, session])

  const handleAihubmixPostSaveKeyPromptConfirm = useCallback(async () => {
    const accountId = aihubmixPostSaveKeyPrompt.accountId
    if (!accountId) return

    const runId = session.beginProvisioning()
    const isCurrentRun = () => session.acceptsProvisioning(runId)

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

      const signal = session.beginCreation()
      const ensureResult = await ensureAccountKey(
        accountPresentation.convertToDisplayData(savedAccount),
        { allowOneTimeSecret: true, signal },
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
        onCreatedSecret(ensureResult.creation.createdSecret)
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
    session,
    onCreatedSecret,
  ])

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
    const runId = session.provisioningRun
    try {
      const display = await accountReadModels.getDisplayDataById(
        params.accountId,
      )
      const stored = display
        ? null
        : await accountQueries.getAccountById(params.accountId)
      if (!session.acceptsProvisioning(runId)) return
      const owner =
        display ??
        (stored ? accountPresentation.convertToDisplayData(stored) : null)
      if (owner)
        setPostSaveKeyProvisioning({ account: owner, mode: params.mode })
      else completePendingAccountKeyProvisioningSuccess()
    } catch {
      if (session.acceptsProvisioning(runId))
        completePendingAccountKeyProvisioningSuccess()
    }
  }
  const openDefaultKeyPrompt = async (accountId: string) => {
    const generation = session.provisioningRun
    const display = await accountReadModels.getDisplayDataById(accountId)
    if (session.acceptsProvisioning(generation) && display) {
      await openDefaultTokenQuickCreateDialogForAccount(display)
    }
  }
  const clear = useCallback(() => {
    setPostSaveKeyProvisioning(null)
    setAihubmixPostSaveKeyPrompt({
      isOpen: false,
      accountId: null,
      accountName: "",
      isCreating: false,
    })
    pendingAccountKeyProvisioningSuccessRef.current = null
  }, [])
  return {
    state: { postSaveKeyProvisioning, aihubmixPostSaveKeyPrompt },
    clear,
    completePendingAccountKeyProvisioningSuccess,
    beginProvisioning,
    openDefaultKeyPrompt,
    handlePostSaveKeyProvisioningClose,
    handleAihubmixPostSaveKeyPromptCancel,
    handleAihubmixPostSaveKeyPromptConfirm,
  }
}
