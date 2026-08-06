import type { AccountRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import type { ApiToken, DisplaySiteData } from "~/types"

import { RuntimeKeyActionControls } from "./RuntimeKeyActionControls"

const SECRET_PREVIEW_PREFIX_LENGTH = 16
const SECRET_PREVIEW_SUFFIX_LENGTH = 6
const SECRET_PREVIEW_MASK_LENGTH = 6

const SERVICE_CREDENTIAL_ACTION_POLICY = {
  copySecret: true,
  exportSecret: true,
} as const

/** Renders the bounded secret preview shared by quick-list key sources. */
export function RuntimeKeySecretPreview({ secret }: { secret: string }) {
  const shouldElide =
    secret.length > SECRET_PREVIEW_PREFIX_LENGTH + SECRET_PREVIEW_SUFFIX_LENGTH
  const prefix = shouldElide
    ? secret.slice(0, SECRET_PREVIEW_PREFIX_LENGTH)
    : secret
  const suffix = shouldElide ? secret.slice(-SECRET_PREVIEW_SUFFIX_LENGTH) : ""

  return (
    <code className="dark:text-dark-text-secondary text-gray-700">
      <span className="dark:text-dark-text-primary text-gray-900">
        {prefix}
      </span>
      {suffix ? (
        <>
          <span className="text-gray-400 dark:text-gray-600">
            {"•".repeat(SECRET_PREVIEW_MASK_LENGTH)}
          </span>
          <span className="dark:text-dark-text-primary text-gray-900">
            {suffix}
          </span>
        </>
      ) : null}
    </code>
  )
}

interface RuntimeKeyDetailsProps {
  runtimeKey: AccountRuntimeKey
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
