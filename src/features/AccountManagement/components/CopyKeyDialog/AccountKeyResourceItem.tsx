import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { getAccountKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/accountKeyResourcePresentation"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import {
  buildAccountKeyResourceRuntimeKeyFromFacts,
  type AccountRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import type { DisplaySiteData } from "~/types"

import { QuickKeyResourceCard } from "./QuickKeyResourceCard"
import { RuntimeKeyActionControls } from "./RuntimeKeyActionControls"

/** Renders a provider-native key as read-only inventory in the quick list. */
export function AccountKeyResourceItem({
  row,
  account,
  copiedRuntimeKeyId,
  onCopyKey,
  onOpenCCSwitchDialog,
}: {
  row: NativeKeyManagementRow
  account: DisplaySiteData
  copiedRuntimeKeyId: string | null
  onCopyKey: (key: AccountRuntimeKey) => void
  onOpenCCSwitchDialog?: (source: CredentialExportSource) => void
}) {
  const { t } = useTranslation(["keyManagement", "common"])
  const [isExpanded, setIsExpanded] = useState(false)
  const adapter = getAccountKeyResourceCardAdapter(row.facts.ref.siteType)
  const base = adapter.buildPresentation(row, t, { hasAssociatedSecret: false })
  const presentation = {
    ...base,
    detailFacts: adapter.buildDetailFacts(row.facts, t),
  }
  const runtimeKey = useMemo(
    () =>
      row.facts.runtimeKey
        ? buildAccountKeyResourceRuntimeKeyFromFacts(account, row.facts)
        : null,
    [account, row.facts],
  )

  return (
    <QuickKeyResourceCard
      presentation={presentation}
      secret={presentation.maskedLabel}
      secretControls={
        runtimeKey ? (
          <RuntimeKeyActionControls
            runtimeKey={runtimeKey}
            actionPolicy={presentation.actions}
            copiedRuntimeKeyId={copiedRuntimeKeyId}
            onCopyKey={onCopyKey}
            account={account}
            onOpenCCSwitchDialog={onOpenCCSwitchDialog}
          />
        ) : undefined
      }
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    />
  )
}
