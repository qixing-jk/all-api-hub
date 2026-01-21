import { Modal } from "~/components/ui/Dialog/Modal"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import type { DisplaySiteData } from "~/types"

import AccountForm from "./AccountForm"
import ActionButtons from "./ActionButtons"
import AutoDetectErrorAlert from "./AutoDetectErrorAlert"
import AutoDetectSlowHintAlert from "./AutoDetectSlowHintAlert"
import DialogHeader from "./DialogHeader"
import { useAccountDialog } from "./hooks/useAccountDialog"
import InfoPanel from "./InfoPanel"
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
  const {
    displayData,
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

  return (
    <Modal
      isOpen={isOpen}
      onClose={handlers.handleClose}
      header={<DialogHeader mode={mode} />}
      footer={
        <ActionButtons
          mode={mode}
          url={state.url}
          isDetecting={state.isDetecting}
          onAutoDetect={handlers.handleAutoDetect}
          onShowManualForm={() => setters.setShowManualForm(true)}
          onClose={handlers.handleClose}
          isFormValid={state.isFormValid}
          isSaving={state.isSaving}
          isDetected={state.isDetected}
          onAutoConfig={handlers.handleAutoConfig}
          isAutoConfiguring={state.isAutoConfiguring}
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

          <SiteInfoInput
            url={state.url}
            onUrlChange={handlers.handleUrlChange}
            isDetected={state.isDetected}
            onClearUrl={() => setters.setUrl("")}
            authType={state.authType}
            onAuthTypeChange={setters.setAuthType}
            {...(mode === DIALOG_MODES.ADD && {
              currentTabUrl: state.currentTabUrl,
              isCurrentSiteAdded: !!detectedAccount,
              detectedAccount: detectedDisplayAccount,
              onUseCurrentTab: handlers.handleUseCurrentTabUrl,
              onEditAccount: openEditAccount,
            })}
          />

          {(state.isDetected || state.showManualForm) && (
            <AccountForm
              authType={state.authType}
              siteName={state.siteName}
              username={state.username}
              userId={state.userId}
              accessToken={state.accessToken}
              exchangeRate={state.exchangeRate}
              manualBalanceUsd={state.manualBalanceUsd}
              isManualBalanceUsdInvalid={state.isManualBalanceUsdInvalid}
              showAccessToken={state.showAccessToken}
              onSiteNameChange={setters.setSiteName}
              onUsernameChange={setters.setUsername}
              onUserIdChange={setters.setUserId}
              onAccessTokenChange={setters.setAccessToken}
              onExchangeRateChange={setters.setExchangeRate}
              onManualBalanceUsdChange={setters.setManualBalanceUsd}
              onToggleShowAccessToken={() =>
                setters.setShowAccessToken(!state.showAccessToken)
              }
              notes={state.notes}
              onNotesChange={setters.setNotes}
              selectedTagIds={state.tagIds}
              onSelectedTagIdsChange={setters.setTagIds}
              tags={tags}
              tagCountsById={tagCountsById}
              createTag={createTag}
              renameTag={renameTag}
              deleteTag={deleteTag}
              checkIn={state.checkIn}
              onCheckInChange={setters.setCheckIn}
              siteType={state.siteType}
              onSiteTypeChange={setters.setSiteType}
              cookieAuthSessionCookie={state.cookieAuthSessionCookie}
              isImportingCookies={state.isImportingCookies}
              onCookieAuthSessionCookieChange={
                setters.setCookieAuthSessionCookie
              }
              onImportCookieAuthSessionCookie={
                handlers.handleImportCookieAuthSessionCookie
              }
            />
          )}
        </form>
      </div>

      <InfoPanel
        mode={mode}
        isDetected={state.isDetected}
        showManualForm={state.showManualForm}
      />
    </Modal>
  )
}
