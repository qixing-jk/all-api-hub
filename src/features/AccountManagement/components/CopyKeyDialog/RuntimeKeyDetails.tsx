import type {
  AccountRuntimeKey,
  ServiceCredentialRuntimeKey,
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
    <code className="dark:text-dark-text-secondary text-gray-700">
      {maskSecretForDisplay(secret)}
    </code>
  )
}

interface RuntimeKeyDetailsProps {
  runtimeKey: ServiceCredentialRuntimeKey
  copiedRuntimeKeyId: string | null
  onCopyKey: (runtimeKey: AccountRuntimeKey) => void
  account: DisplaySiteData
  onOpenCCSwitchDialog?: (token: ApiToken, account: DisplaySiteData) => void
}

/** Preserves the service-credential detail surface outside account-key migration. */
export function RuntimeKeyDetails({
  runtimeKey,
  copiedRuntimeKeyId,
  onCopyKey,
  account,
  onOpenCCSwitchDialog,
}: RuntimeKeyDetailsProps) {
  return (
    <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary border-t border-gray-100 bg-gray-50/30 px-3 py-3">
      <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary flex min-w-0 flex-wrap items-center justify-between gap-2 rounded border border-gray-100 bg-white p-2">
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
