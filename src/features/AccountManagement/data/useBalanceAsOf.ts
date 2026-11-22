import { useEffect, useMemo, useState } from "react"

import {
  BALANCE_VALIDITY_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import type { DisplaySiteData } from "~/types"

const MAX_TIMEOUT_MS = 2_147_483_647

/** Refresh time-sensitive projections at expiry and when a suspended view resumes. */
export function useBalanceAsOf(
  sites: ReadonlyArray<
    Pick<
      DisplaySiteData,
      "balanceSnapshot" | "manualBalanceSnapshot" | "allowances"
    >
  >,
): number {
  const [asOf, setAsOf] = useState(Date.now)
  const deadlines = useMemo(
    () =>
      sites.flatMap((site) => [
        ...[site.balanceSnapshot, site.manualBalanceSnapshot].flatMap(
          (snapshot) =>
            snapshot?.positions.flatMap((position) => [
              ...(position.validity.kind === BALANCE_VALIDITY_KINDS.Expires
                ? [position.validity.at]
                : []),
              ...(position.window?.resetsAt !== undefined
                ? [position.window.resetsAt]
                : []),
              ...(position.window &&
              position.amount.status === OBSERVATION_STATUSES.Stale
                ? [position.window.end]
                : []),
            ]) ?? [],
        ),
        ...(site.allowances?.entries.flatMap((entry) => [
          ...(entry.validity.kind === BALANCE_VALIDITY_KINDS.Expires
            ? [entry.validity.at]
            : []),
          ...("resetsAt" in entry.constraint.window &&
          entry.constraint.window.resetsAt !== undefined
            ? [entry.constraint.window.resetsAt]
            : []),
        ]) ?? []),
      ]),
    [sites],
  )

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      clearTimeout(timer)
      const now = Date.now()
      setAsOf(now)
      const nextMidnight = new Date(now)
      nextMidnight.setHours(24, 0, 0, 0)
      const next = deadlines.reduce(
        (nearest, deadline) =>
          deadline > now ? Math.min(nearest, deadline) : nearest,
        nextMidnight.getTime(),
      )
      if (Number.isFinite(next)) {
        timer = setTimeout(
          update,
          Math.min(MAX_TIMEOUT_MS, Math.max(1, next - now)),
        )
      }
    }
    update()
    window.addEventListener("focus", update)
    document.addEventListener("visibilitychange", update)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("focus", update)
      document.removeEventListener("visibilitychange", update)
    }
  }, [deadlines])

  return asOf
}
