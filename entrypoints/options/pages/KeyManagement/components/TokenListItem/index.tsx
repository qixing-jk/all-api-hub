import { useTranslation } from "react-i18next"

import { Card, CardContent } from "~/components/ui"
import type { DisplaySiteData } from "~/types"

import { AccountToken } from "../../type"
import { KeyDisplay } from "./KeyDisplay"
import { TokenDetails } from "./TokenDetails"
import { TokenHeader } from "./TokenHeader"

interface TokenListItemProps {
  /**
   * Token entry including account display name.
   */
  token: AccountToken
  /**
   * Set of token IDs currently visible (unmasked).
   */
  visibleKeys: Set<number>
  /**
   * Toggles visibility of a token by ID.
   */
  toggleKeyVisibility: (id: number) => void
  /**
   * Copies the token key to clipboard.
   */
  copyKey: (key: string, name: string) => void
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
}

/**
 * Card presenting a single token with header actions, key display, and details.
 * @param props Component props configuring the token card.
 */
export function TokenListItem(props: TokenListItemProps) {
  const {
    token,
    visibleKeys,
    toggleKeyVisibility,
    copyKey,
    handleEditToken,
    handleDeleteToken,
    account,
    onOpenCCSwitchDialog,
  } = props
  const { t } = useTranslation("keyManagement")

  return (
    <Card variant="interactive">
      <CardContent padding="default">
        <div className="flex flex-col gap-2 sm:gap-3">
          <TokenHeader
            token={token}
            copyKey={copyKey}
            handleEditToken={handleEditToken}
            handleDeleteToken={handleDeleteToken}
            account={account}
            onOpenCCSwitchDialog={() => onOpenCCSwitchDialog(token, account)}
          />
          <div className="min-w-0 flex-1">
            <div className="dark:text-dark-text-secondary space-y-2 text-xs text-gray-600 sm:text-sm">
              <KeyDisplay
                tokenKey={token.key}
                tokenId={token.id}
                visibleKeys={visibleKeys}
                toggleKeyVisibility={toggleKeyVisibility}
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
      </CardContent>
    </Card>
  )
}
