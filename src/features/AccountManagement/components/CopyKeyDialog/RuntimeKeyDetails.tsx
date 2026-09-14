import type {
  AccountRuntimeKey,
  AccountTokenRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import type { ApiToken, DisplaySiteData } from "~/types"
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
  runtimeKey: Exclude<AccountRuntimeKey, AccountTokenRuntimeKey>
  copiedRuntimeKeyId: string | null
  onCopyKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
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
    <div className="dark:border-border dark:bg-background border-border-subtle bg-surface-subtle/30 rounded-b-[var(--corner-inner-radius)] border-t px-3 py-3">
      <div className="dark:border-border border-border-subtle bg-card flex min-w-0 flex-wrap items-center justify-between gap-2 rounded border p-2">
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
