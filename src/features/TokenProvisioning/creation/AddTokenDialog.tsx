import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, FormField, Modal, SearchableSelect } from "~/components/ui"
import { AccountKeyResourceEditorDialog } from "~/features/KeyManagement/resources/AccountKeyResourceEditorDialog"
import { useAccountKeyCreation } from "~/features/TokenProvisioning/creation/useAccountKeyCreation"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/secretDelivery/apiCredentialProfileSaveAction"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/secretDelivery/OneTimeSecretDialog"
import type { AccountKeyCreationResult } from "~/services/accounts/keys/accountKeyCreation"
import { canListAccountKeyResources } from "~/services/accounts/keys/keyProductCapabilities"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("AddTokenDialog")
interface AddTokenDialogProps {
  isOpen: boolean
  onClose: () => void
  availableAccounts: DisplaySiteData[]
  preSelectedAccountId?: string | null
  createPrefill?: {
    modelId: string
    defaultName?: string
    group?: string
    allowedGroups?: string[]
  }
  prefillNotice?: string
  onSuccess?: (result: AccountKeyCreationResult) => void | Promise<void>
  onEditorReady?: () => void
  /** False transfers the response-only secret to onSuccess's owner. */
  showOneTimeKeyDialog?: boolean
}

/** Foreground creation uses the same native editor and secret handoff as key management. */
export default function AddTokenDialog(props: AddTokenDialogProps) {
  return props.isOpen ? (
    <AccountKeyCreateSession
      key={props.preSelectedAccountId ?? ""}
      {...props}
    />
  ) : null
}

/** Owns account selection and one native editor session for a creation dialog. */
function AccountKeyCreateSession({
  availableAccounts,
  preSelectedAccountId,
  createPrefill,
  prefillNotice,
  onClose,
  onSuccess,
  onEditorReady,
  showOneTimeKeyDialog = true,
}: AddTokenDialogProps) {
  const { t } = useTranslation(["keyManagement", "common"])
  const accounts = availableAccounts.filter(canListAccountKeyResources)
  const hasPreselectedAccount = accounts.some(
    (account) => account.id === preSelectedAccountId,
  )
  const [accountId, setAccountId] = useState(() =>
    hasPreselectedAccount
      ? preSelectedAccountId!
      : accounts.length === 1
        ? accounts[0]?.id ?? ""
        : "",
  )
  const [completed, setCompleted] = useState(false)
  const pendingResult = useRef<AccountKeyCreationResult | null>(null)
  const finish = async (result: AccountKeyCreationResult) => {
    try {
      await onSuccess?.(result)
    } catch (error) {
      logger.error("Created key handoff failed", error)
    } finally {
      onClose()
    }
  }
  const intent: AccountKeyCreationIntent | undefined = createPrefill
    ? {
        nameHint: createPrefill.defaultName,
        preferredGroup: createPrefill.group,
        allowedGroups: createPrefill.allowedGroups,
        ...(createPrefill.modelId
          ? { modelContext: { modelId: createPrefill.modelId } }
          : {}),
      }
    : undefined
  const controller = useAccountKeyCreation({
    account: accounts.find((account) => account.id === accountId),
    intent,
    onCreated: async (result) => {
      setCompleted(true)
      if (showOneTimeKeyDialog && result.createdSecret)
        pendingResult.current = result
      else await finish(result)
    },
  })
  const hasEditor =
    Boolean(controller.editor || controller.terminalCloseEditor) ||
    controller.editorOpening.status !== "idle"
  useEffect(() => {
    if (controller.editor) onEditorReady?.()
  }, [controller.editor, onEditorReady])
  const saveAction = controller.createdSecret
    ? buildOneTimeApiKeyProfileSaveAction({
        result: controller.createdSecret,
        t,
        logger,
        source: "AddTokenDialog",
      })
    : undefined

  return (
    <>
      <Modal
        isOpen={!hasEditor && !completed && !hasPreselectedAccount}
        onClose={onClose}
        size="sm"
        title={t("keyManagement:native.editor.title.create")}
        header={<h2>{t("keyManagement:native.editor.title.create")}</h2>}
      >
        {!hasPreselectedAccount ? (
          <FormField
            label={t("keyManagement:dialog.accountSelect")}
            htmlFor="create-key-account"
          >
            <SearchableSelect
              id="create-key-account"
              options={accounts.map((account) => ({
                value: account.id,
                label: account.name,
              }))}
              value={accountId}
              onChange={(value) => {
                setAccountId(value)
              }}
              placeholder={t("keyManagement:pleaseSelectAccount")}
              disabled={controller.editorOpening.status === "loading"}
            />
          </FormField>
        ) : null}
        {!accounts.length ? (
          <Alert description={t("ui:dialog.copyKey.createNotSupported")} />
        ) : null}
      </Modal>
      <AccountKeyResourceEditorDialog
        editor={controller.editor}
        terminalCloseEditor={controller.terminalCloseEditor}
        opening={controller.editorOpening}
        notice={prefillNotice}
        onRetryOpening={controller.retryEditorOpening}
        onCancelOpening={(attemptId) => {
          controller.cancelEditorOpening(attemptId)
          onClose()
        }}
        onClose={(editorId) => {
          controller.closeEditor(editorId)
          onClose()
        }}
        onTerminalCloseSettled={controller.settleTerminalClose}
        onSubmit={controller.submitEditor}
        onValuesChange={controller.setEditorValues}
        onLoadOptions={controller.loadEditorOptions}
        focusWorkflowId={controller.focusWorkflowId ?? undefined}
      />
      <OneTimeSecretDialog
        isOpen={showOneTimeKeyDialog && controller.createdSecret !== null}
        result={showOneTimeKeyDialog ? controller.createdSecret : null}
        onClose={() => {
          const result = pendingResult.current
          pendingResult.current = null
          controller.closeCreatedSecret()
          if (result) void finish(result)
          else onClose()
        }}
        saveAction={saveAction}
        onCopyResult={controller.recordCreatedSecretCopyResult}
        onSaveResult={controller.recordCreatedSecretSaveResult}
        focusWorkflowId={controller.focusWorkflowId ?? undefined}
      />
    </>
  )
}
