import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { CredentialExportSource } from "~/services/integrations/credentialExport"
import type { DisplaySiteData } from "~/types"
import { maskSecretForDisplay } from "~/utils/core/formatters"

import { RuntimeKeyActionControls } from "./RuntimeKeyActionControls"

const SERVICE_CREDENTIAL_ACTION_POLICY = {
  copySecret: true,
  exportSecret: true,
} as const

/** Renders the bounded secret preview shared by quick-list key sources. */
export function RuntimeKeySecretPreview({ secret }: { secret: string }) {
  return (
    <code className="text-secondary-foreground">
      {maskSecretForDisplay(secret)}
    </code>
  )
}

interface RuntimeKeyDetailsProps {
  runtimeKey: AccountRuntimeKey
  copiedRuntimeKeyId: string | null
  onCopyKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (source: CredentialExportSource) => void
}

/** Renders already-resolved non-token runtime keys without legacy token lookup. */
export function RuntimeKeyDetails({
  runtimeKey,
  copiedRuntimeKeyId,
  onCopyKey,
  account,
  onOpenCCSwitchDialog,
}: RuntimeKeyDetailsProps) {
  return (
    <div className="dark:border-border dark:bg-background border-border-subtle bg-surface-subtle/30 py-density-3 rounded-b-[var(--corner-inner-radius)] border-t px-3">
      <div className="dark:border-border border-border-subtle bg-card gap-y-density-2 py-density-2 flex min-w-0 flex-wrap items-center justify-between gap-x-2 rounded border px-2">
        <RuntimeKeySecretPreview secret={runtimeKey.secret} />
        <RuntimeKeyActionControls
          runtimeKey={runtimeKey}
          actionPolicy={SERVICE_CREDENTIAL_ACTION_POLICY}
          copiedRuntimeKeyId={copiedRuntimeKeyId}
          onCopyKey={onCopyKey}
          account={account}
          onOpenCCSwitchDialog={onOpenCCSwitchDialog}
        />
      </div>
    </div>
  )
}
