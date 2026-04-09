import { useEffect, useMemo, useState } from "react"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { TempWindowFallbackReminderDialog } from "~/features/AccountManagement/components/TempWindowFallbackReminderDialog"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import {
  getTempWindowFallbackIssue,
  type TempWindowFallbackIssue,
} from "~/features/AccountManagement/utils/tempWindowFallbackReminder"
import { type TempWindowHealthStatusCode } from "~/types"
import { getTempWindowFallbackBlockStatus } from "~/utils/browser/tempWindowFetch"

/**
 * Mount-point component that decides whether the temp-window fallback reminder dialog
 * should be shown in the current UI surface.
 */
export function TempWindowFallbackReminderGate() {
  const { displayData } = useAccountDataContext()
  const {
    tempWindowFallback,
    tempWindowFallbackReminder,
    updateTempWindowFallbackReminder,
  } = useUserPreferencesContext()

  const [isOpen, setIsOpen] = useState(false)
  const [currentBlockCode, setCurrentBlockCode] =
    useState<TempWindowHealthStatusCode | null>(null)
  const [resolvedBlockToken, setResolvedBlockToken] = useState<string | null>(
    null,
  )
  const [hasShownInThisSession, setHasShownInThisSession] = useState(false)

  const issue: TempWindowFallbackIssue | null = useMemo(() => {
    return getTempWindowFallbackIssue(displayData)
  }, [displayData])

  const blockCheckToken = useMemo(() => {
    if (!issue) {
      return null
    }

    return JSON.stringify({
      accountId: issue.accountId,
      code: issue.code,
      enabled: tempWindowFallback.enabled,
      useInPopup: tempWindowFallback.useInPopup,
      useInSidePanel: tempWindowFallback.useInSidePanel,
      useInOptions: tempWindowFallback.useInOptions,
      useForAutoRefresh: tempWindowFallback.useForAutoRefresh,
      useForManualRefresh: tempWindowFallback.useForManualRefresh,
    })
  }, [
    issue,
    tempWindowFallback.enabled,
    tempWindowFallback.useForAutoRefresh,
    tempWindowFallback.useForManualRefresh,
    tempWindowFallback.useInOptions,
    tempWindowFallback.useInPopup,
    tempWindowFallback.useInSidePanel,
  ])

  useEffect(() => {
    if (!issue || !blockCheckToken) {
      setCurrentBlockCode(null)
      setResolvedBlockToken(null)
      return
    }

    let cancelled = false
    const activeToken = blockCheckToken

    void getTempWindowFallbackBlockStatus({
      preferences: tempWindowFallback,
    })
      .then((status) => {
        if (cancelled) {
          return
        }

        setCurrentBlockCode(status.kind === "blocked" ? status.code : null)
        setResolvedBlockToken(activeToken)
      })
      .catch(() => {
        if (cancelled) {
          return
        }

        setCurrentBlockCode(null)
        setResolvedBlockToken(activeToken)
      })

    return () => {
      cancelled = true
    }
  }, [blockCheckToken, issue, tempWindowFallback])

  const shouldShowReminder = useMemo(() => {
    if (!issue || !blockCheckToken || resolvedBlockToken !== blockCheckToken) {
      return false
    }

    return issue.code === currentBlockCode
  }, [blockCheckToken, currentBlockCode, issue, resolvedBlockToken])

  useEffect(() => {
    if (tempWindowFallbackReminder.dismissed) {
      setIsOpen(false)
      return
    }

    if (!shouldShowReminder) {
      setIsOpen(false)
      return
    }

    if (hasShownInThisSession) {
      return
    }

    setHasShownInThisSession(true)
    setIsOpen(true)
  }, [
    hasShownInThisSession,
    shouldShowReminder,
    tempWindowFallbackReminder.dismissed,
  ])

  const handleNeverRemind = async () => {
    await updateTempWindowFallbackReminder({ dismissed: true })
  }

  if (!issue || !shouldShowReminder) {
    return null
  }

  return (
    <TempWindowFallbackReminderDialog
      isOpen={isOpen}
      issue={issue}
      onClose={() => setIsOpen(false)}
      onNeverRemind={handleNeverRemind}
    />
  )
}
