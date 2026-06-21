import { InformationCircleIcon } from "@heroicons/react/24/outline"
import { useEffect, useState, type ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { Modal } from "~/components/ui/Dialog/Modal"
import { DIALOG_MODES, type DialogMode } from "~/constants/dialogModes"
import { AIHUBMIX_API_ORIGIN } from "~/constants/siteType"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { useDialogStateContext } from "~/features/AccountManagement/hooks/DialogStateContext"
import { SPONSOR_RECOMMENDATION_SURFACES } from "~/features/AccountManagement/sponsors/constants"
import { normalizeSponsorAddAccountPrefill } from "~/features/AccountManagement/sponsors/pendingAddAccountIntent"
import { SponsorRecommendationsSection } from "~/features/AccountManagement/sponsors/SponsorRecommendationsSection"
import type { AddAccountPrefill } from "~/features/AccountManagement/sponsors/types"
import { useSponsorRecommendations } from "~/features/AccountManagement/sponsors/useSponsorRecommendations"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import { OneTimeApiKeyDialog } from "~/features/KeyManagement/components/OneTimeApiKeyDialog"
import { buildOneTimeApiKeyProfileSaveAction } from "~/features/KeyManagement/utils/apiCredentialProfileSaveAction"
import {
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  resolvePreferredDefaultUserGroup,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"
import {
  openApiCredentialProfilesPage,
  openFullBookmarkManagerPage,
} from "~/utils/navigation"

import AccountForm from "./AccountForm"
import ActionButtons from "./ActionButtons"
import { AihubmixDefaultKeyPromptDialog } from "./AihubmixDefaultKeyPromptDialog"
import AutoDetectErrorAlert from "./AutoDetectErrorAlert"
import AutoDetectSlowHintAlert from "./AutoDetectSlowHintAlert"
import DialogHeader from "./DialogHeader"
import { DuplicateAccountWarningDialog } from "./DuplicateAccountWarningDialog"
import { useAccountDialog } from "./hooks/useAccountDialog"
import InfoPanel from "./InfoPanel"
import { ManagedSiteConfigPromptDialog } from "./ManagedSiteConfigPromptDialog"
import { ACCOUNT_DIALOG_PHASES } from "./models"
import SiteInfoInput from "./SiteInfoInput"
import { getAccountDialogSitePolicy } from "./sitePolicy"

const logger = createLogger("AccountDialog")

interface AccountDialogProps {
  isOpen: boolean
  onClose: () => void
  mode: DialogMode
  account?: DisplaySiteData | null
  prefill?: AddAccountPrefill | null
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
 * @param props.prefill Optional add-mode account prefill.
 * @param props.onSuccess Callback fired with saved data.
 * @param props.onError Callback fired when submission fails.
 */
export default function AccountDialog({
  isOpen,
  onClose,
  mode,
  account,
  prefill,
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
    prefill,
    onSuccess,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const result = await handlers.handleSaveAccount()
      if (!handlers.shouldDeferAccountSaveSuccess(result)) {
        onSuccess(result)
      }
    } catch (error) {
      onError(error)
    }
  }

  const detectedDisplayAccount =
    displayData.find((acc) => acc.id === detectedAccount?.id) ?? null
  const showEntryAuthTypeSelector =
    mode === DIALOG_MODES.ADD &&
    state.phase === ACCOUNT_DIALOG_PHASES.SITE_INPUT
  const canShowSponsorRecommendations = isOpen && showEntryAuthTypeSelector
  const sponsorRecommendations = useSponsorRecommendations({
    surface: SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog,
    enabled: canShowSponsorRecommendations,
  })
  const showSponsorRecommendations =
    canShowSponsorRecommendations && sponsorRecommendations.items.length > 0
  const [selectedSponsorPostClickNote, setSelectedSponsorPostClickNote] =
    useState<string | null>(null)

  useEffect(() => {
    if (!canShowSponsorRecommendations) {
      setSelectedSponsorPostClickNote(null)
    }
  }, [canShowSponsorRecommendations])
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
  const cookieAuthPermissionProps = {
    cookieAuthPermissionsGranted: state.cookieAuthPermissionsGranted,
    isRequestingCookieAuthPermissions: state.isRequestingCookieAuthPermissions,
    onRequestCookieAuthPermissions: handlers.handleRequestCookieAuthPermissions,
  }
  const currentSitePolicy = getAccountDialogSitePolicy(state.siteType)
  const siteInfoInputProps: ComponentProps<typeof SiteInfoInput> =
    showEntryAuthTypeSelector
      ? {
          url: state.url,
          onUrlChange: handlers.handleUrlChange,
          isDetected: state.isDetected,
          onClearUrl: handlers.handleClearUrl,
          sitePolicy: currentSitePolicy,
          showAuthTypeSelector: true,
          authType: state.authType,
          onAuthTypeChange: setters.setAuthType,
          ...cookieAuthPermissionProps,
          ...addModeSiteInfoProps,
        }
      : {
          url: state.url,
          onUrlChange: handlers.handleUrlChange,
          isDetected: state.isDetected,
          onClearUrl: handlers.handleClearUrl,
          sitePolicy: currentSitePolicy,
          ...cookieAuthPermissionProps,
          ...addModeSiteInfoProps,
        }

  const postSaveSub2ApiCreatePrefill =
    state.postSaveSub2ApiAllowedGroups &&
    state.postSaveSub2ApiAllowedGroups.length > 0
      ? {
          modelId: "",
          defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
          group: resolvePreferredDefaultUserGroup(
            state.postSaveSub2ApiAllowedGroups,
          ),
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

  const postSaveOneTimeKeySaveAction = state.postSaveOneTimeToken
    ? buildOneTimeApiKeyProfileSaveAction({
        accountName: state.draft.siteName || "AIHubMix",
        baseUrl: AIHUBMIX_API_ORIGIN,
        siteType: state.siteType,
        tagIds: state.draft.tagIds,
        token: state.postSaveOneTimeToken,
        t,
        logger,
        source: "AccountDialog",
      })
    : undefined

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handlers.handleClose}
        size="lg"
        panelTestId={ACCOUNT_MANAGEMENT_TEST_IDS.accountDialog}
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
                siteType={state.siteType}
              />
            )}

            {state.isDetecting && state.isDetectingSlow && (
              <AutoDetectSlowHintAlert />
            )}

            <div className="grid gap-3">
              <SiteInfoInput {...siteInfoInputProps} />
              {selectedSponsorPostClickNote ? (
                <div
                  className="flex items-start gap-2 rounded-md bg-blue-50 p-2 text-xs leading-5 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                  data-testid={ACCOUNT_MANAGEMENT_TEST_IDS.sponsorPostClickNote}
                >
                  <InformationCircleIcon
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0"
                  />
                  <span>{selectedSponsorPostClickNote}</span>
                </div>
              ) : null}
              {showSponsorRecommendations ? (
                <SponsorRecommendationsSection
                  surface={SPONSOR_RECOMMENDATION_SURFACES.AddAccountDialog}
                  items={sponsorRecommendations.items}
                  onContinueAddAccount={(nextPrefill) => {
                    const normalizedPrefill =
                      normalizeSponsorAddAccountPrefill(nextPrefill)
                    if (!normalizedPrefill) return

                    handlers.handleUrlChange(normalizedPrefill.siteUrl, {
                      applyAuthDefault: false,
                    })
                    setters.setSiteType(normalizedPrefill.siteType)
                    if (normalizedPrefill.authType) {
                      setters.setAuthType(normalizedPrefill.authType)
                    }
                    const selectedSponsor = sponsorRecommendations.items.find(
                      (item) => item.id === normalizedPrefill.sponsorId,
                    )
                    setSelectedSponsorPostClickNote(
                      selectedSponsor?.postClickNote ?? null,
                    )
                  }}
                  onOpenBookmarkManager={(prefill) => {
                    void openFullBookmarkManagerPage({ create: prefill })
                  }}
                  onOpenApiCredentialProfiles={(prefill) => {
                    void openApiCredentialProfilesPage({ create: prefill })
                  }}
                />
              ) : null}
            </div>

            {state.phase === ACCOUNT_DIALOG_PHASES.ACCOUNT_FORM && (
              <AccountForm
                draft={state.draft}
                sitePolicy={currentSitePolicy}
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
                onExcludeFromTodayIncomeChange={
                  setters.setExcludeFromTodayIncome
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
                cookieAuthPermissionsGranted={
                  state.cookieAuthPermissionsGranted
                }
                isRequestingCookieAuthPermissions={
                  state.isRequestingCookieAuthPermissions
                }
                onCookieAuthSessionCookieChange={
                  setters.setCookieAuthSessionCookie
                }
                onImportCookieAuthSessionCookie={
                  handlers.handleImportCookieAuthSessionCookie
                }
                onOpenCookiePermissionSettings={
                  handlers.handleOpenCookiePermissionSettings
                }
                onRequestCookieAuthPermissions={
                  handlers.handleRequestCookieAuthPermissions
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
        onDisableWarningAndContinue={
          handlers.handleDuplicateAccountWarningDisableAndContinue
        }
      />

      <ManagedSiteConfigPromptDialog
        isOpen={state.managedSiteConfigPrompt.isOpen}
        managedSiteLabel={state.managedSiteConfigPrompt.managedSiteLabel}
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
          prefillNotice={t("tokenProvisioning.createRequiresGroupSelection")}
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
        saveAction={postSaveOneTimeKeySaveAction}
      />
    </>
  )
}
