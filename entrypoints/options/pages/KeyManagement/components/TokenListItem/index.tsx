import { useTranslation } from "react-i18next"

import { Card, CardContent } from "~/components/ui"
import type { DisplaySiteData } from "~/types"

import { AccountToken } from "../../type"
import { KeyDisplay } from "./KeyDisplay"
import { TokenDetails } from "./TokenDetails"
import { TokenHeader } from "./TokenHeader"

interface TokenListItemProps {
  token: AccountToken
  visibleKeys: Set<number>
  toggleKeyVisibility: (id: number) => void
  copyKey: (key: string, name: string) => void
  handleEditToken: (token: AccountToken) => void
  handleDeleteToken: (token: AccountToken) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog: (token: AccountToken, account: DisplaySiteData) => void
}

export function TokenListItem({
  token,
  visibleKeys,
  toggleKeyVisibility,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account,
  onOpenCCSwitchDialog,
}: TokenListItemProps) {
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
