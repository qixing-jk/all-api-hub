import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  Alert,
  Button,
  FormField,
  Modal,
  SearchableSelect,
} from "~/components/ui"
import { AccountKeyResourceEditorDialog } from "~/features/KeyManagement/components/AccountKeyResource/AccountKeyResourceEditorDialog"
import {
  useAccountKeyResourceController,
  type AccountKeyResourceRouteTransition,
} from "~/features/KeyManagement/controllers/useAccountKeyResourceController"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/utils/apiCredentialProfileSaveAction"
import type { AccountKeyCreationResult } from "~/services/accounts/accountKeyCreation"
import { canListAccountKeyResources } from "~/services/accounts/keyProductCapabilities"
import type { AccountKeyCreationIntent } from "~/services/apiAdapters/contracts/accountKeyResource"
import { createUserCommandProtectionBypassExecution } from "~/services/protectionBypass/client"
import {
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
} from "~/services/protectionBypass/contracts"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"

import { OneTimeSecretDialog } from "../OneTimeSecretDialog"

const logger = createLogger("AddTokenDialog")
const CREATION_INVENTORY_EXECUTION = createUserCommandProtectionBypassExecution(
  PROTECTION_BYPASS_USER_COMMANDS.ManageApiKeys,
  PROTECTION_BYPASS_SURFACES.Options,
)

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
  showOneTimeKeyDialog = true,
}: AddTokenDialogProps) {
  const { t } = useTranslation(["keyManagement", "common"])
  const accounts = availableAccounts.filter(canListAccountKeyResources)
  const [accountId, setAccountId] = useState(() =>
    accounts.some((account) => account.id === preSelectedAccountId)
      ? preSelectedAccountId!
      : accounts.length === 1
        ? accounts[0]?.id ?? ""
        : "",
  )
  const [route, setRoute] = useState<{
    params: Record<string, string>
    transition?: AccountKeyResourceRouteTransition
  }>({ params: {} })
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
  const controller = useAccountKeyResourceController({
    accounts,
    selectedAccount: accountId,
    inventoryExecution: CREATION_INVENTORY_EXECUTION,
    creationIntent: intent,
    routeParams: route.params,
    routeTransition: route.transition,
    replaceRoute: (params, transition) => setRoute({ params, transition }),
    onCreated: async (_account, result) => {
      setCompleted(true)
      if (showOneTimeKeyDialog && result.createdSecret)
        pendingResult.current = result
      else await finish(result)
    },
  })
  const failure =
    controller.failures[accountId] ?? controller.scopeInventoryFailure
  const hasEditor =
    Boolean(controller.editor || controller.terminalCloseEditor) ||
    controller.editorOpening.status !== "idle"
  useEffect(() => {
    if (
      !accountId ||
      hasEditor ||
      controller.isLoading ||
      !controller.selectedScope ||
      failure ||
      completed
    )
      return
    void controller.openCreate()
  }, [accountId, controller, failure, completed, hasEditor])

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
        isOpen={!hasEditor && !completed}
        onClose={onClose}
        size="sm"
        title={t("keyManagement:native.editor.title.create")}
        header={<h2>{t("keyManagement:native.editor.title.create")}</h2>}
      >
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
              setRoute({ params: {} })
            }}
            placeholder={t("keyManagement:pleaseSelectAccount")}
            disabled={controller.isLoading}
          />
        </FormField>
        {controller.isLoading ? (
          <p role="status">{t("common:status.loading")}</p>
        ) : null}
        {failure ? (
          <>
            <Alert
              variant="destructive"
              description={t("keyManagement:native.editor.feedback.error")}
            />
            <Button onClick={() => void controller.refresh()}>
              {t("common:actions.retry")}
            </Button>
          </>
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
