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
}

export function TokenListItem({
  token,
  visibleKeys,
  toggleKeyVisibility,
  copyKey,
  handleEditToken,
  handleDeleteToken,
  account
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
          />
          <div className="min-w-0 flex-1">
            <div className="space-y-2 text-xs text-gray-600 dark:text-dark-text-secondary sm:text-sm">
              <KeyDisplay
                tokenKey={token.key}
                tokenId={token.id}
                visibleKeys={visibleKeys}
                toggleKeyVisibility={toggleKeyVisibility}
              />
              <TokenDetails token={token} />
              {token.group && (
                <div>
                  <span className="text-gray-500 dark:text-dark-text-tertiary">
                    {t("keyDetails.group")}
                  </span>
                  <span className="ml-2 font-medium text-gray-900 dark:text-dark-text-primary">
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
