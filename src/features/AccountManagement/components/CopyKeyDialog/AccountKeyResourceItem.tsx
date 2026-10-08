import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import type { DeeplinkExportTarget } from "~/features/CredentialExport/DeeplinkExportDialog"
import { LinkedCredentialProfileActions } from "~/features/KeyManagement/associations/LinkedCredentialProfileActions"
import { getAccountKeyResourceCardAdapter } from "~/features/KeyManagement/presentation/accountKeyResourcePresentation"
import { useAccountKeySecretDisclosure } from "~/features/KeyManagement/resources/useAccountKeySecretDisclosure"
import type { NativeKeyManagementRow } from "~/features/KeyManagement/types"
import {
  buildAccountKeyResourceRuntimeKeyFromFacts,
  type AccountRuntimeKey,
} from "~/services/accounts/keys/accountRuntimeKeys"
import { supportsRecoverableAccountRuntimeKeySecrets } from "~/services/accounts/keys/keyProductCapabilities"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import { PRODUCT_ANALYTICS_SURFACE_IDS } from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

import { QuickKeyResourceCard } from "./QuickKeyResourceCard"
import { RuntimeKeyActionControls } from "./RuntimeKeyActionControls"

/** Renders a provider-native key as read-only inventory in the quick list. */
export function AccountKeyResourceItem({
  row,
  account,
  copiedRuntimeKeyId,
  onCopyKey,
  onOpenDeeplinkExport,
  associatedProfile,
}: {
  associatedProfile?: ApiCredentialProfile
  row: NativeKeyManagementRow
  account: DisplaySiteData
  copiedRuntimeKeyId: string | null
  onCopyKey: (key: AccountRuntimeKey) => void
  onOpenDeeplinkExport?: (
    target: DeeplinkExportTarget,
    source: CredentialExportSource,
  ) => void
}) {
  const { t } = useTranslation(["keyManagement", "common"])
  const [isExpanded, setIsExpanded] = useState(false)
  const adapter = getAccountKeyResourceCardAdapter(row.facts.ref.siteType)
  const runtimeKey = useMemo(
    () => buildAccountKeyResourceRuntimeKeyFromFacts(account, row.facts),
    [account, row.facts],
  )
  const disclosure = useAccountKeySecretDisclosure({
    account,
    runtimeKey,
    associatedProfile,
    recoverable: supportsRecoverableAccountRuntimeKeySecrets(account.siteType),
    maskedLabel: row.facts.maskedLabel,
    displayName: row.facts.displayName,
  })
  const base = adapter.buildPresentation(row, t, {
    hasAssociatedSecret: disclosure.hasAssociatedSecret,
  })
  const presentation = {
    ...base,
    detailFacts: adapter.buildDetailFacts(row.facts, t),
  }

  return (
    <QuickKeyResourceCard
      presentation={presentation}
      secret={disclosure.secret}
      secretControls={
        <>
          {disclosure.secretControls}
          {disclosure.associatedProfileWithSecret ? (
            <LinkedCredentialProfileActions
              profile={disclosure.associatedProfileWithSecret}
              surfaceId={
                PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementRowActions
              }
            />
          ) : row.facts.runtimeKey ? (
            <RuntimeKeyActionControls
              runtimeKey={runtimeKey}
              actionPolicy={presentation.actions}
              copiedRuntimeKeyId={copiedRuntimeKeyId}
              onCopyKey={onCopyKey}
              account={account}
              onOpenDeeplinkExport={onOpenDeeplinkExport}
            />
          ) : null}
        </>
      }
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    />
  )
}
