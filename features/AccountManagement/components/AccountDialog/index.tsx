import { Modal } from "~/components/ui/Dialog/Modal"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import type { DisplaySiteData } from "~/types"

import AccountForm from "./AccountForm"
import ActionButtons from "./ActionButtons"
import AutoDetectErrorAlert from "./AutoDetectErrorAlert"
import DialogHeader from "./DialogHeader"
import { useAccountDialog } from "./hooks/useAccountDialog"
import InfoPanel from "./InfoPanel"
import SiteInfoInput from "./SiteInfoInput"

interface AccountDialogProps {
  isOpen: boolean
  onClose: () => void
  mode: "add" | "edit"
  account?: DisplaySiteData | null
  onSuccess: (data: any) => void
  onError: (error: any) => void
}

export default function AccountDialog({
  isOpen,
  onClose,
  mode,
  account,
  onSuccess,
  onError
}: AccountDialogProps) {
  const { displayData, detectedAccount } = useAccountDataContext()
  const { openEditAccount } = useDialogStateContext()

  const { state, setters, handlers } = useAccountDialog({
    isOpen,
    onClose: () => {
      onClose()
    },
    mode,
    account,
    onSuccess
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
      panelClassName="max-h-[90vh]"
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
      }>
      <div>
        <form
          id="account-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-2">
          {state.detectionError && (
            <AutoDetectErrorAlert
              error={state.detectionError}
              siteUrl={state.url}
            />
          )}

          <SiteInfoInput
            url={state.url}
            onUrlChange={handlers.handleUrlChange}
            isDetected={state.isDetected}
            onClearUrl={() => setters.setUrl("")}
            authType={state.authType}
            onAuthTypeChange={setters.setAuthType}
            {...(mode === "add" && {
              currentTabUrl: state.currentTabUrl,
              isCurrentSiteAdded: !!detectedAccount,
              detectedAccount: detectedDisplayAccount,
              onUseCurrentTab: handlers.handleUseCurrentTabUrl,
              onEditAccount: openEditAccount
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
              showAccessToken={state.showAccessToken}
              onSiteNameChange={setters.setSiteName}
              onUsernameChange={setters.setUsername}
              onUserIdChange={setters.setUserId}
              onAccessTokenChange={setters.setAccessToken}
              onExchangeRateChange={setters.setExchangeRate}
              onToggleShowAccessToken={() =>
                setters.setShowAccessToken(!state.showAccessToken)
              }
              notes={state.notes}
              onNotesChange={setters.setNotes}
              checkIn={state.checkIn}
              onCheckInChange={setters.setCheckIn}
              siteType={state.siteType}
              onSiteTypeChange={setters.setSiteType}
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
