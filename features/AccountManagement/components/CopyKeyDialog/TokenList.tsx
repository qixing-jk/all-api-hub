import { KeyIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { EmptyState } from "~/components/ui"
import type { ApiToken, DisplaySiteData } from "~/types"

import { TokenItem } from "./TokenItem"

interface TokenListProps {
  tokens: ApiToken[]
  expandedTokens: Set<number>
  copiedKey: string | null
  onToggleToken: (id: number) => void
  onCopyKey: (key: string) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
}

/**
 * List view wrapper for TokenItem elements, handling empty states and expansion toggles.
 */
export function TokenList({
  tokens,
  expandedTokens,
  copiedKey,
  onToggleToken,
  onCopyKey,
  account,
  onOpenCCSwitchDialog,
}: TokenListProps) {
  const { t } = useTranslation("ui")

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return (
      <EmptyState
        icon={<KeyIcon className="h-12 w-12" />}
        title={t("dialog.copyKey.noKeys")}
      />
    )
  }

  return (
    <div className="space-y-3">
      {tokens.map((token) => (
        <TokenItem
          key={token.id}
          token={token}
          isExpanded={expandedTokens.has(token.id)}
          copiedKey={copiedKey}
          onToggle={() => onToggleToken(token.id)}
          onCopyKey={onCopyKey}
          account={account}
          onOpenCCSwitchDialog={onOpenCCSwitchDialog}
        />
      ))}
    </div>
  )
}
