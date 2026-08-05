import { useState } from "react"
import { useTranslation } from "react-i18next"

import { KeyResourceCard } from "~/features/KeyManagement/components/KeyResourceCard"
import { buildLegacyKeyResourceCardPresentation } from "~/features/KeyManagement/presentation/legacyKeyResourceCard"
import { buildDisplayAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import type { AccountToken, DisplaySiteData } from "~/types"

import { getKeyManagementTokenRowTestId } from "../../testIds"
import { buildTokenIdentityKey } from "../../utils"
import { KeyDisplay } from "./KeyDisplay"
import { TokenHeader } from "./TokenHeader"

interface TokenListItemProps {
  /**
   * Token entry including account display name.
   */
  token: AccountToken
  /**
   * Current source key used for display, resolved if the secret has been fetched.
   */
  displayTokenKey: string
  /**
   * Set of token identity keys currently visible (unmasked).
   */
  visibleKeys: Set<string>
  /**
   * Whether the reveal action is currently resolving a usable secret key.
   */
  isKeyVisibilityLoading: boolean
  /**
   * Toggles visibility of a token by identity key.
   */
  toggleKeyVisibility: (
    account: DisplaySiteData,
    token: AccountToken,
  ) => Promise<void>
  /**
   * Copies the token key to clipboard.
   */
  copyKey: (account: DisplaySiteData, token: AccountToken) => Promise<void>
  /**
   * Opens the edit dialog for the token.
   */
  handleEditToken: (token: AccountToken) => void
  /**
   * Deletes the token.
   */
  handleDeleteToken: (token: AccountToken) => void
  /**
   * Account context for rendering labels/actions.
   */
  account: DisplaySiteData
  /**
   * Opens CCSwitch dialog for exporting the token.
   */
  onOpenCCSwitchDialog: (token: AccountToken, account: DisplaySiteData) => void
  /**
   * Current managed-site status for the token, when available.
   */
  managedSiteStatus?: ManagedSiteTokenChannelStatus
  /**
   * Whether the token's managed-site status is currently being checked.
   */
  isManagedSiteStatusChecking?: boolean
  /**
   * Callback invoked after a successful managed-site import for this token.
   */
  onManagedSiteImportSuccess?: (token: AccountToken) => void | Promise<void>
  /**
   * Starts verification-assisted retry for recoverable managed-site states.
   */
  onManagedSiteVerificationRetry?: (
    token: AccountToken,
    managedSiteStatus: ManagedSiteTokenChannelStatus,
  ) => void | Promise<void>
  /**
   * Whether this token is selected for batch actions.
   */
  isSelected?: boolean
  /**
   * Toggles batch selection for this token.
   */
  onSelectionChange?: (checked: boolean) => void
  /** Explanation shown when this row is visible but unavailable to batch actions. */
  selectionDisabledReason?: string
  /**
   * Request key used to temporarily highlight this token's managed-site import action.
   */
  guidedManagedSiteImportRequest?: string
}

/**
 * Card presenting a single token with header actions, key display, and details.
 * @param props Component props configuring the token card.
 */
export function TokenListItem(props: TokenListItemProps) {
  const {
    token,
    displayTokenKey,
    visibleKeys,
    isKeyVisibilityLoading,
    toggleKeyVisibility,
    copyKey,
    handleEditToken,
    handleDeleteToken,
    account,
    onOpenCCSwitchDialog,
    managedSiteStatus,
    isManagedSiteStatusChecking,
    onManagedSiteImportSuccess,
    onManagedSiteVerificationRetry,
    isSelected = false,
    onSelectionChange,
    selectionDisabledReason,
    guidedManagedSiteImportRequest,
  } = props
  const { t } = useTranslation("keyManagement")
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false)
  const tokenIdentityKey = buildTokenIdentityKey(token.accountId, token.id)
  const runtimeKey = buildDisplayAccountTokenRuntimeKey(account, token)
  const presentation = buildLegacyKeyResourceCardPresentation(runtimeKey, t)
  const canInteractWithSecret =
    presentation.actions.copySecret || presentation.actions.revealSecret
  const selectionChange = presentation.actions.batchSelect
    ? onSelectionChange
    : undefined

  return (
    <KeyResourceCard
      presentation={presentation}
      secret={
        canInteractWithSecret ? (
          <KeyDisplay
            tokenKey={displayTokenKey}
            tokenIdentityKey={tokenIdentityKey}
            visibleKeys={visibleKeys}
            isKeyVisibilityLoading={isKeyVisibilityLoading}
            toggleKeyVisibility={() => void toggleKeyVisibility(account, token)}
          />
        ) : presentation.maskedLabel ? (
          <code>{presentation.maskedLabel}</code>
        ) : undefined
      }
      details={{ status: "ready", facts: presentation.detailFacts }}
      isDetailsExpanded={isDetailsExpanded}
      onDetailsExpandedChange={setIsDetailsExpanded}
      isSelected={selectionChange ? isSelected : undefined}
      onSelectionChange={selectionChange}
      selectionDisabledReason={
        selectionChange ? undefined : selectionDisabledReason
      }
      selectionLabel={t("batchManagedSiteExport.selection.rowLabel", {
        name: token.name,
      })}
      testId={getKeyManagementTokenRowTestId(token.id)}
      renderHeader={(headerProps) => (
        <TokenHeader
          token={token}
          copyKey={copyKey}
          handleEditToken={handleEditToken}
          handleDeleteToken={handleDeleteToken}
          account={account}
          managedSiteStatus={managedSiteStatus}
          isManagedSiteStatusChecking={isManagedSiteStatusChecking}
          onManagedSiteImportSuccess={onManagedSiteImportSuccess}
          onManagedSiteVerificationRetry={onManagedSiteVerificationRetry}
          onOpenCCSwitchDialog={() => onOpenCCSwitchDialog(token, account)}
          guidedManagedSiteImportRequest={guidedManagedSiteImportRequest}
          headerProps={headerProps}
          actionPolicy={presentation.actions}
        />
      )}
    />
  )
}
