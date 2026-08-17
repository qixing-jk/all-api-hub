import { Copy, Pencil, Terminal, Trash2, Wrench } from "lucide-react"
import { useTranslation } from "react-i18next"

import { VerifyCliSupportDialog } from "~/components/dialogs/VerifyCliSupportDialog"
import { IconButton } from "~/components/ui"
import { VerifyApiCredentialProfileDialog } from "~/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog"
import {
  KeyResourceActionGroup,
  KeyResourceActionToolbar,
  type KeyResourceCredentialAssociation,
} from "~/features/KeyManagement/components/KeyResourceCard"
import type { KeyResourceActionPolicy } from "~/features/KeyManagement/presentation/keyResourceCard"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import type { AccountToken, DisplaySiteData } from "~/types"

import { KEY_MANAGEMENT_TEST_IDS } from "../../testIds"
import {
  hasTokenIntegrationActionGroup,
  TokenIntegrationActionGroup,
  TokenIntegrationDialogs,
} from "./TokenIntegrationActions"
import { useTokenIntegrationActions } from "./useTokenIntegrationActions"
import { useTokenVerificationActions } from "./useTokenVerificationActions"

export interface TokenActionButtonsProps {
  association?: KeyResourceCredentialAssociation
  actionPolicy: KeyResourceActionPolicy
  token: AccountToken
  copyKey: (account: DisplaySiteData, token: AccountToken) => Promise<void>
  handleEditToken: (token: AccountToken) => void
  handleDeleteToken: (token: AccountToken) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: () => void
  managedSiteStatus?: ManagedSiteTokenChannelStatus
  onManagedSiteImportSuccess?: (token: AccountToken) => void | Promise<void>
  guidedManagedSiteImportRequest?: string
}

/**
 * Renders action buttons for a token (copy, export, edit/delete).
 * @param props Component props container.
 * @param props.actionPolicy Provider capability policy controlling available token actions.
 * @param props.association Current API credential-library relationship.
 * @param props.token Token being acted upon.
 * @param props.copyKey Clipboard copy handler.
 * @param props.handleEditToken Edit action callback.
 * @param props.handleDeleteToken Delete action callback.
 * @param props.account Account context for integrations.
 * @param props.managedSiteStatus Current managed-site status used to reuse duplicate-review results when available.
 * @param props.onOpenCCSwitchDialog Optional CCSwitch export opener.
 * @param props.onManagedSiteImportSuccess Optional managed-site import success callback.
 * @param props.guidedManagedSiteImportRequest Request key that highlights the managed-site import action.
 */
export function TokenActionButtons({
  actionPolicy,
  token,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account,
  managedSiteStatus,
  onOpenCCSwitchDialog,
  onManagedSiteImportSuccess,
  guidedManagedSiteImportRequest,
  association,
}: TokenActionButtonsProps) {
  const { t } = useTranslation("keyManagement")
  const integrationActions = useTokenIntegrationActions({
    account,
    enabled: actionPolicy.exportSecret,
    guidedManagedSiteImportRequest,
    managedSiteStatus,
    onManagedSiteImportSuccess,
    token,
  })
  const {
    cliVerifyingProfile,
    closeCliVerification,
    closeVerification,
    handleVerifyApi,
    handleVerifyCliSupport,
    verifyingProfile,
  } = useTokenVerificationActions({
    account,
    enabled: actionPolicy.verifySecret,
    token,
  })

  const hasQuickActions = actionPolicy.copySecret
  const hasIntegrations = actionPolicy.exportSecret
  const hasIntegrationGroup = hasTokenIntegrationActionGroup(
    actionPolicy,
    association,
  )
  const hasDiagnostics = actionPolicy.verifySecret

  return (
    <>
      <TokenIntegrationDialogs
        account={account}
        controller={integrationActions}
        enabled={actionPolicy.exportSecret}
        token={token}
      />
      {actionPolicy.verifySecret ? (
        <>
          <VerifyApiCredentialProfileDialog
            isOpen={Boolean(verifyingProfile)}
            onClose={closeVerification}
            profile={verifyingProfile}
          />
          {cliVerifyingProfile ? (
            <VerifyCliSupportDialog
              isOpen={true}
              onClose={closeCliVerification}
              profile={cliVerifyingProfile}
            />
          ) : null}
        </>
      ) : null}
      <KeyResourceActionToolbar
        label={t("keyManagement:actionToolbar.label")}
        testId={KEY_MANAGEMENT_TEST_IDS.tokenRowActions}
      >
        {hasQuickActions ? (
          <KeyResourceActionGroup
            label={t("keyManagement:actionToolbar.quickActions")}
          >
            {actionPolicy.copySecret ? (
              <IconButton
                aria-label={t("common:actions.copyKey")}
                size="sm"
                variant="ghost"
                onClick={() => void copyKey(account, token)}
              >
                <Copy className="dark:text-dark-text-tertiary h-4 w-4 text-gray-500" />
              </IconButton>
            ) : null}
          </KeyResourceActionGroup>
        ) : null}
        <TokenIntegrationActionGroup
          account={account}
          actionPolicy={actionPolicy}
          association={association}
          controller={integrationActions}
          onOpenCCSwitchDialog={onOpenCCSwitchDialog}
          token={token}
        />
        {actionPolicy.verifySecret ? (
          <KeyResourceActionGroup
            label={t("keyManagement:actionToolbar.diagnostics")}
            separated={hasQuickActions || hasIntegrationGroup}
          >
            <IconButton
              aria-label={t("keyManagement:actions.verifyApi")}
              size="sm"
              variant="ghost"
              data-testid={KEY_MANAGEMENT_TEST_IDS.verifyTokenApiButton}
              onClick={() => void handleVerifyApi()}
            >
              <Wrench className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </IconButton>
            <IconButton
              aria-label={t("keyManagement:actions.verifyCliSupport")}
              size="sm"
              variant="ghost"
              data-testid={KEY_MANAGEMENT_TEST_IDS.verifyTokenCliSupportButton}
              onClick={() => void handleVerifyCliSupport()}
            >
              <Terminal className="h-4 w-4 text-sky-600 dark:text-sky-400" />
            </IconButton>
          </KeyResourceActionGroup>
        ) : null}
        {actionPolicy.edit || actionPolicy.delete ? (
          <KeyResourceActionGroup
            label={t("keyManagement:actionToolbar.management")}
            separated={hasQuickActions || hasIntegrations || hasDiagnostics}
          >
            {actionPolicy.edit ? (
              <IconButton
                aria-label={t("actions.editKey")}
                size="sm"
                variant="ghost"
                onClick={() => handleEditToken(token)}
              >
                <Pencil className="h-4 w-4 text-blue-500 dark:text-blue-400" />
              </IconButton>
            ) : null}
            {actionPolicy.delete ? (
              <IconButton
                aria-label={t("actions.deleteKey")}
                size="sm"
                variant="destructiveGhost"
                onClick={() => handleDeleteToken(token)}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            ) : null}
          </KeyResourceActionGroup>
        ) : null}
      </KeyResourceActionToolbar>
    </>
  )
}
