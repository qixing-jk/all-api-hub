import {
  KeyIcon,
  PencilSquareIcon,
  PlusIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Alert, EmptyState } from "~/components/ui"
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
  canCreateDefaultKey?: boolean
  isCreating?: boolean
  createError?: string | null
  onCreateDefaultKey?: () => void
  onOpenAddTokenDialog?: () => void
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
  canCreateDefaultKey = false,
  isCreating = false,
  createError,
  onCreateDefaultKey,
  onOpenAddTokenDialog,
}: TokenListProps) {
  const { t } = useTranslation("ui")

  if (!Array.isArray(tokens) || tokens.length === 0) {
    const actions = [
      ...(onCreateDefaultKey
        ? [
            {
              label: isCreating
                ? t("dialog.copyKey.creatingKey")
                : t("dialog.copyKey.createKey"),
              onClick: onCreateDefaultKey,
              icon: <PlusIcon className="h-4 w-4" />,
              disabled: !canCreateDefaultKey || isCreating,
              loading: isCreating,
            },
          ]
        : []),
      ...(onOpenAddTokenDialog
        ? [
            {
              label: t("dialog.copyKey.createCustomKey"),
              onClick: onOpenAddTokenDialog,
              icon: <PencilSquareIcon className="h-4 w-4" />,
              variant: "outline" as const,
              disabled: !canCreateDefaultKey || isCreating,
            },
          ]
        : []),
    ]

    return (
      <div className="space-y-4">
        <EmptyState
          icon={<KeyIcon className="h-12 w-12" />}
          title={t("dialog.copyKey.noKeys")}
          description={t("dialog.copyKey.noKeysDescription")}
          actions={actions}
        />
        {createError ? (
          <Alert variant="destructive" description={createError} />
        ) : null}
      </div>
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
