import { useEffect, useRef, useState } from "react"

import type { AccountSiteType } from "~/constants/siteType"
import type { AccountDialogDraft } from "~/features/AccountManagement/components/AccountDialog/models"
import { findNativeCheckInPagesInBrowser } from "~/services/checkin/discovery/nativePageClient"
import type { NativeCheckInPageExploration } from "~/services/checkin/discovery/nativePageDiscovery"

export const NATIVE_PAGE_DISCOVERY_STATUSES = {
  Idle: "idle",
  Failed: "failed",
  Cancelled: "cancelled",
} as const
type NativePageDiscoveryStatus =
  (typeof NATIVE_PAGE_DISCOVERY_STATUSES)[keyof typeof NATIVE_PAGE_DISCOVERY_STATUSES]

export type NativePageDiscoveryIdentity = Pick<
  AccountDialogDraft,
  "userId" | "accessToken" | "authType" | "cookieAuthSessionCookie"
>

/** Local form state; late results can never replace a changed source or path. */
export function useNativeCheckInPageDiscovery(source: {
  siteUrl: string
  siteType?: AccountSiteType
  nativePagePath?: string
  identity?: NativePageDiscoveryIdentity
}) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<NativeCheckInPageExploration | null>(
    null,
  )
  const [status, setStatus] = useState<NativePageDiscoveryStatus>(
    NATIVE_PAGE_DISCOVERY_STATUSES.Idle,
  )
  const active = useRef<AbortController | null>(null)
  const latest = useRef(source)
  latest.current = source
  useEffect(() => {
    active.current?.abort()
    active.current = null
    setRunning(false)
    setResult(null)
    setStatus(NATIVE_PAGE_DISCOVERY_STATUSES.Idle)
    return () => {
      active.current?.abort()
      active.current = null
    }
  }, [
    source.siteUrl,
    source.siteType,
    source.nativePagePath,
    source.identity?.userId,
    source.identity?.accessToken,
    source.identity?.authType,
    source.identity?.cookieAuthSessionCookie,
  ])
  const find = async () => {
    if (active.current) return
    const controller = new AbortController()
    active.current = controller
    const requested = latest.current
    const isCurrent = () =>
      active.current === controller &&
      !controller.signal.aborted &&
      requested.siteUrl === latest.current.siteUrl &&
      requested.siteType === latest.current.siteType &&
      requested.nativePagePath === latest.current.nativePagePath &&
      requested.identity?.userId === latest.current.identity?.userId &&
      requested.identity?.accessToken ===
        latest.current.identity?.accessToken &&
      requested.identity?.authType === latest.current.identity?.authType &&
      requested.identity?.cookieAuthSessionCookie ===
        latest.current.identity?.cookieAuthSessionCookie
    setRunning(true)
    setResult(null)
    setStatus(NATIVE_PAGE_DISCOVERY_STATUSES.Idle)
    try {
      if (!requested.siteType) throw new Error("page_site_type")
      const found = await findNativeCheckInPagesInBrowser(
        { ...requested, siteType: requested.siteType },
        controller.signal,
      )
      if (isCurrent()) setResult(found)
    } catch {
      if (isCurrent()) setStatus(NATIVE_PAGE_DISCOVERY_STATUSES.Failed)
    } finally {
      if (active.current === controller) {
        active.current = null
        setRunning(false)
      }
    }
  }
  const cancel = (announce = true) => {
    active.current?.abort()
    active.current = null
    setRunning(false)
    setResult(null)
    setStatus(
      announce
        ? NATIVE_PAGE_DISCOVERY_STATUSES.Cancelled
        : NATIVE_PAGE_DISCOVERY_STATUSES.Idle,
    )
  }
  return { find, cancel, running, result, status }
}
