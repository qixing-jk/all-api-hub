import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { ThemeAwareToaster } from "~/components/ThemeAwareToaster"
import { Modal } from "~/components/ui/Dialog/Modal"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import { OneTimeApiKeyDialog } from "~/features/KeyManagement/components/OneTimeApiKeyDialog"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import type { DisplaySiteData } from "~/types"

import AccountForm from "./AccountForm"
import ActionButtons from "./ActionButtons"
import AutoDetectErrorAlert from "./AutoDetectErrorAlert"
import AutoDetectSlowHintAlert from "./AutoDetectSlowHintAlert"
import DialogHeader from "./DialogHeader"
import { DuplicateAccountWarningDialog } from "./DuplicateAccountWarningDialog"
import { useAccountDialog } from "./hooks/useAccountDialog"
import InfoPanel from "./InfoPanel"
import { ManagedSiteConfigPromptDialog } from "./ManagedSiteConfigPromptDialog"
import { ACCOUNT_DIALOG_PHASES } from "./models"
import SiteInfoInput from "./SiteInfoInput"

interface AccountDialogProps {
  isOpen: boolean
  onClose: () => void
  mode: DialogMode
  account?: DisplaySiteData | null
  onSuccess: (data: any) => void
  onError: (error: any) => void
}

/**
 * Modal dialog for creating or editing account credentials with auto-detect support.
 * @param props Component props to control dialog visibility and behavior.
 * @param props.isOpen Whether the dialog is currently visible.
 * @param props.onClose Handler invoked when closing without saving.
 * @param props.mode Current dialog mode (add or edit).
 * @param props.account Account data to prefill the form when editing.
 * @param props.onSuccess Callback fired with saved data.
 * @param props.onError Callback fired when submission fails.
 */
export default function AccountDialog({
  isOpen,
  onClose,
  mode,
  account,
  onSuccess,
  onError,
}: AccountDialogProps) {
  const { t } = useTranslation("messages")
  const {
    displayData,
    detectedSiteAccounts,
    detectedAccount,
    tags,
    tagCountsById,
    createTag,
    renameTag,
    deleteTag,
  } = useAccountDataContext()
  const { openEditAccount } = useDialogStateContext()

  const { state, setters, handlers } = useAccountDialog({
    isOpen,
    onClose: () => {
      onClose()
    },
    mode,
    account,
    onSuccess,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await handlers.handleSaveAccount()
      onSuccess(result)
    } catch (error) {
      onError(error)
    }
  }

  const detectedDisplayAccount =
    displayData.find((acc) => acc.id === detectedAccount?.id) ?? null
  const showEntryAuthTypeSelector =
    mode === DIALOG_MODES.ADD &&
    state.phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT
  const addModeSiteInfoProps =
    mode === DIALOG_MODES.ADD
      ? {
          currentTabUrl: state.currentTabUrl,
          isCurrentSiteAdded: detectedSiteAccounts.length > 0,
          detectedAccount: detectedDisplayAccount,
          onUseCurrentTab: handlers.handleUseCurrentTabUrl,
          onEditAccount: openEditAccount,
        }
      : {}
  const siteInfoInputProps: ComponentProps<typeof SiteInfoInput> =
    showEntryAuthTypeSelector
      ? {
          url: state.url,
          onUrlChange: handlers.handleUrlChange,
          isDetected: state.isDetected,
          onClearUrl: handlers.handleClearUrl,
          siteType: state.siteType,
          showAuthTypeSelector: true,
          authType: state.authType,
          onAuthTypeChange: setters.setAuthType,
          ...addModeSiteInfoProps,
        }
      : {
          url: state.url,
          onUrlChange: handlers.handleUrlChange,
          isDetected: state.isDetected,
          onClearUrl: handlers.handleClearUrl,
          siteType: state.siteType,
          ...addModeSiteInfoProps,
        }

  const postSaveSub2ApiCreatePrefill =
    state.postSaveSub2ApiAllowedGroups &&
    state.postSaveSub2ApiAllowedGroups.length > 0
      ? {
          modelId: "",
          defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
          group: state.postSaveSub2ApiAllowedGroups.includes("default")
            ? "default"
            : state.postSaveSub2ApiAllowedGroups[0] ?? "default",
          allowedGroups: state.postSaveSub2ApiAllowedGroups,
        }
      : undefined
  const postSaveSub2ApiDialogSessionId =
    typeof state.postSaveSub2ApiDialogSessionId === "number"
      ? state.postSaveSub2ApiDialogSessionId
      : null
  const postSaveSub2ApiDialogHandlers =
    postSaveSub2ApiDialogSessionId !== null &&
    typeof handlers.getPostSaveSub2ApiDialogHandlers === "function"
      ? handlers.getPostSaveSub2ApiDialogHandlers(
          postSaveSub2ApiDialogSessionId,
        )
      : null

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handlers.handleClose}
        panelTestId={ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog}
        floatingContent={
          <ThemeAwareToaster
            position="top-center"
            containerStyle={{ zIndex: 75 }}
          />
        }
        header={<DialogHeader mode={mode} />}
        footer={
          <ActionButtons
            mode={mode}
            url={state.url}
            phase={state.phase}
            formSource={state.formSource}
            isDetecting={state.isDetecting}
            onAutoDetect={handlers.handleAutoDetect}
            onShowManualForm={handlers.handleShowManualForm}
            onClose={handlers.handleClose}
            isFormValid={state.isFormValid}
            isSaving={state.isSaving}
            onAutoConfig={handlers.handleAutoConfig}
            isAutoConfiguring={state.isAutoConfiguring}
            accountPostSaveWorkflowStep={state.accountPostSaveWorkflowStep}
            // ensure submit button in footer can submit the form by linking via form id
            formId="account-form"
          />
        }
      >
        <div>
          <form
            id="account-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-2"
            data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.accountForm}
          >
            {state.detectionError && (
              <AutoDetectErrorAlert
                error={state.detectionError}
                siteUrl={state.url}
              />
            )}

            {state.isDetecting && state.isDetectingSlow && (
              <AutoDetectSlowHintAlert />
            )}

            <SiteInfoInput {...siteInfoInputProps} />

            {state.phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM && (
              <AccountForm
                draft={state.draft}
                isDetected={state.isDetected}
                isImportingSub2apiSession={state.isImportingSub2apiSession}
                isManualBalanceUsdInvalid={state.isManualBalanceUsdInvalid}
                showAccessToken={state.showAccessToken}
                onSiteNameChange={setters.setSiteName}
                onUsernameChange={setters.setUsername}
                onUserIdChange={setters.setUserId}
                onAccessTokenChange={setters.setAccessToken}
                onSub2apiUseRefreshTokenChange={
                  handlers.handleSub2apiUseRefreshTokenChange
                }
                onSub2apiRefreshTokenChange={setters.setSub2apiRefreshToken}
                onImportSub2apiSession={handlers.handleImportSub2apiSession}
                onExchangeRateChange={setters.setExchangeRate}
                onManualBalanceUsdChange={setters.setManualBalanceUsd}
                onShowAccessTokenChange={setters.setShowAccessToken}
                onNotesChange={setters.setNotes}
                onSelectedTagIdsChange={setters.setTagIds}
                onExcludeFromTotalBalanceChange={
                  setters.setExcludeFromTotalBalance
                }
                tags={tags}
                tagCountsById={tagCountsById}
                createTag={createTag}
                renameTag={renameTag}
                deleteTag={deleteTag}
                onCheckInChange={setters.setCheckIn}
                onSiteTypeChange={setters.setSiteType}
                onAuthTypeChange={setters.setAuthType}
                isImportingCookies={state.isImportingCookies}
                showCookiePermissionWarning={state.showCookiePermissionWarning}
                onCookieAuthSessionCookieChange={
                  setters.setCookieAuthSessionCookie
                }
                onImportCookieAuthSessionCookie={
                  handlers.handleImportCookieAuthSessionCookie
                }
                onOpenCookiePermissionSettings={
                  handlers.handleOpenCookiePermissionSettings
                }
              />
            )}
          </form>
        </div>

        <InfoPanel
          mode={mode}
          phase={state.phase}
          formSource={state.formSource}
        />
      </Modal>

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
      />

      <ManagedSiteConfigPromptDialog
        isOpen={state.managedSiteConfigPrompt.isOpen}
        managedSiteLabel={state.managedSiteConfigPrompt.managedSiteLabel}
        missingMessage={state.managedSiteConfigPrompt.missingMessage}
        onClose={handlers.handleManagedSiteConfigPromptClose}
        onOpenSettings={handlers.handleOpenManagedSiteSettings}
      />

      {state.postSaveSub2ApiAccount && postSaveSub2ApiCreatePrefill ? (
        <AddTokenDialog
          isOpen={true}
          onClose={
            postSaveSub2ApiDialogHandlers?.onClose ??
            handlers.handlePostSaveSub2ApiTokenDialogClose
          }
          availableAccounts={[state.postSaveSub2ApiAccount]}
          preSelectedAccountId={state.postSaveSub2ApiAccount.id}
          createPrefill={postSaveSub2ApiCreatePrefill}
          prefillNotice={t("sub2api.createRequiresGroupSelection")}
          onSuccess={
            postSaveSub2ApiDialogHandlers?.onSuccess ??
            handlers.handlePostSaveSub2ApiTokenCreated
          }
          showOneTimeKeyDialog={false}
        />
      ) : null}

      <OneTimeApiKeyDialog
        isOpen={!!state.postSaveOneTimeToken}
        token={state.postSaveOneTimeToken}
        onClose={handlers.handlePostSaveOneTimeTokenClose}
      />
    </>
  )
}
