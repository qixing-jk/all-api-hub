import { useTranslation } from "react-i18next"

import { Card, CardContent, Checkbox } from "~/components/ui"
import type { ManagedSiteTokenChannelStatus } from "~/services/managedSites/tokenChannelStatus"
import type { AccountToken, DisplaySiteData } from "~/types"

import { buildTokenIdentityKey } from "../../utils"
import { KeyDisplay } from "./KeyDisplay"
import { TokenDetails } from "./TokenDetails"
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
  } = props
  const { t } = useTranslation("keyManagement")
  const tokenIdentityKey = buildTokenIdentityKey(token.accountId, token.id)

  return (
    <Card variant="interactive">
      <CardContent padding="default">
        <div className="flex gap-3">
          {onSelectionChange ? (
            <Checkbox
              className="mt-1"
              checked={isSelected}
              aria-label={t("batchManagedSiteExport.selection.rowLabel", {
                name: token.name,
              })}
              onCheckedChange={(checked) => onSelectionChange(checked === true)}
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 sm:gap-3">
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
                onOpenCCSwitchDialog={() =>
                  onOpenCCSwitchDialog(token, account)
                }
              />
              <div className="min-w-0 flex-1">
                <div className="dark:text-dark-text-secondary space-y-2 text-xs text-gray-600 sm:text-sm">
                  <KeyDisplay
                    tokenKey={displayTokenKey}
                    tokenIdentityKey={tokenIdentityKey}
                    visibleKeys={visibleKeys}
                    isKeyVisibilityLoading={isKeyVisibilityLoading}
                    toggleKeyVisibility={() =>
                      void toggleKeyVisibility(account, token)
                    }
                  />
                  <TokenDetails token={token} />
                  {token.group && (
                    <div>
                      <span className="dark:text-dark-text-tertiary text-gray-500">
                        {t("keyDetails.group")}
                      </span>
                      <span className="dark:text-dark-text-primary ml-2 font-medium text-gray-900">
                        {token.group}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
