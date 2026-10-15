import { useRef, useState } from "react"

import { canCreateAccountKeyResources } from "~/services/accounts/keys/keyProductCapabilities"
import type { DisplaySiteData } from "~/types"
import type { AccountKeyAutoProvisionMode } from "~/types/accountKeyAutoProvisioning"

import { AccountKeyProvisioningDialog } from "./AccountKeyProvisioningDialog"

type ProvisioningRequest = {
  account: DisplaySiteData
  mode: AccountKeyAutoProvisionMode
}

/** Captures the selected account and keeps the operation alive after its menu closes. */
export function useAccountKeyProvisioning(
  onSettled?: (account: DisplaySiteData) => void,
) {
  const [request, setRequest] = useState<ProvisioningRequest | null>(null)
  const active = useRef<ProvisioningRequest | null>(null)
  const open = (
    account: DisplaySiteData,
    mode: AccountKeyAutoProvisionMode,
  ) => {
    if (active.current || !canCreateAccountKeyResources(account)) return
    const next = { account: { ...account }, mode }
    active.current = next
    setRequest(next)
  }
  return {
    open,
    isRunning: request !== null,
    dialog: request ? (
      <AccountKeyProvisioningDialog
        account={request.account}
        mode={request.mode}
        onClose={() => {
          if (active.current !== request) return
          active.current = null
          setRequest(null)
          onSettled?.(request.account)
        }}
      />
    ) : null,
  }
}
