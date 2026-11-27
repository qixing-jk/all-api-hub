import { useTranslation } from "react-i18next"

import { AihubmixDefaultKeyPromptDialog } from "~/features/AccountManagement/components/AccountDialog/postSave/AihubmixDefaultKeyPromptDialog"
import { ManagedSiteConfigPromptDialog } from "~/features/AccountManagement/components/AccountDialog/postSave/ManagedSiteConfigPromptDialog"
import { DuplicateAccountWarningDialog } from "~/features/AccountManagement/components/AccountDialog/saving/DuplicateAccountWarningDialog"
import { AccountKeyProvisioningDialog } from "~/features/TokenProvisioning/creation/AccountKeyProvisioningDialog"
import AddTokenDialog from "~/features/TokenProvisioning/creation/AddTokenDialog"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/TokenProvisioning/secretDelivery/apiCredentialProfileSaveAction"
import { OneTimeSecretDialog } from "~/features/TokenProvisioning/secretDelivery/OneTimeSecretDialog"
import { createLogger } from "~/utils/core/logger"

import type { useAccountDialog } from "./workspace/useAccountDialog"

const logger = createLogger("AccountDialog")

/** Renders confirmation and post-save dialogs for the account workflow. */
export function AccountDialogWorkflowDialogs({
  state,
  handlers,
}: Pick<ReturnType<typeof useAccountDialog>, "state" | "handlers">) {
  const { t } = useTranslation("messages")
  const { postSaveKeyInputSessionId } = state
  const postSaveKeyInputDialogHandlers =
    postSaveKeyInputSessionId !== null
      ? handlers.getPostSaveKeyInputDialogHandlers(postSaveKeyInputSessionId)
      : null

  const postSaveOneTimeKeySaveAction = state.postSaveOneTimeSecret
    ? buildOneTimeApiKeyProfileSaveAction({
        result: state.postSaveOneTimeSecret,
        t,
        logger,
        source: "AccountDialog",
      })
    : undefined
  return (
    <>
      <DuplicateAccountWarningDialog
        isOpen={state.duplicateAccountWarning.isOpen}
        siteUrl={state.duplicateAccountWarning.siteUrl}
        existingAccountsCount={
          state.duplicateAccountWarning.existingAccountsCount
        }
        existingUsername={state.duplicateAccountWarning.existingUsername}
        existingUserId={state.duplicateAccountWarning.existingUserId}
        onCancel={handlers.handleDuplicateAccountWarningCancel}
        onContinue={handlers.handleDuplicateAccountWarningContinue}
        onDisableWarningAndContinue={
          handlers.handleDuplicateAccountWarningDisableAndContinue
        }
      />

      <ManagedSiteConfigPromptDialog
        isOpen={state.managedSiteConfigPrompt.isOpen}
        managedSiteLabel={state.managedSiteConfigPrompt.managedSiteLabel}
        managedSiteType={state.managedSiteConfigPrompt.managedSiteType}
        missingMessage={state.managedSiteConfigPrompt.missingMessage}
        onClose={handlers.handleManagedSiteConfigPromptClose}
        onOpenSettings={handlers.handleOpenManagedSiteSettings}
      />

      <AihubmixDefaultKeyPromptDialog
        isOpen={state.aihubmixPostSaveKeyPrompt.isOpen}
        accountName={state.aihubmixPostSaveKeyPrompt.accountName}
        isCreating={state.aihubmixPostSaveKeyPrompt.isCreating}
        onCancel={handlers.handleAihubmixPostSaveKeyPromptCancel}
        onConfirm={handlers.handleAihubmixPostSaveKeyPromptConfirm}
      />

      {state.postSaveKeyProvisioning ? (
        <AccountKeyProvisioningDialog
          account={state.postSaveKeyProvisioning.account}
          mode={state.postSaveKeyProvisioning.mode}
          onClose={handlers.handlePostSaveKeyProvisioningClose}
        />
      ) : null}

      {state.postSaveKeyInputAccount ? (
        <AddTokenDialog
          isOpen={true}
          onClose={
            postSaveKeyInputDialogHandlers?.onClose ??
            handlers.handlePostSaveKeyInputTokenDialogClose
          }
          availableAccounts={[state.postSaveKeyInputAccount]}
          preSelectedAccountId={state.postSaveKeyInputAccount.id}
          onSuccess={
            postSaveKeyInputDialogHandlers?.onSuccess ??
            handlers.handlePostSaveKeyInputTokenCreated
          }
          showOneTimeKeyDialog={false}
        />
      ) : null}

      <OneTimeSecretDialog
        isOpen={!!state.postSaveOneTimeSecret}
        result={state.postSaveOneTimeSecret}
        onClose={handlers.handlePostSaveOneTimeSecretClose}
        saveAction={postSaveOneTimeKeySaveAction}
      />
    </>
  )
}
