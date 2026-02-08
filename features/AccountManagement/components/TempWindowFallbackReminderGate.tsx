import { useEffect, useMemo, useState } from "react"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { TempWindowFallbackReminderDialog } from "~/features/AccountManagement/components/TempWindowFallbackReminderDialog"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import {
  getTempWindowFallbackIssue,
  type TempWindowFallbackIssue,
} from "~/features/AccountManagement/utils/tempWindowFallbackReminder"

/**
 * Mount-point component that decides whether the temp-window fallback reminder dialog
 * should be shown in the popup.
 */
export function TempWindowFallbackReminderGate() {
  const { displayData } = useAccountDataContext()
  const { tempWindowFallbackReminder, updateTempWindowFallbackReminder } =
    useUserPreferencesContext()

  const [isOpen, setIsOpen] = useState(false)
  const [hasShownInThisSession, setHasShownInThisSession] = useState(false)

  const issue: TempWindowFallbackIssue | null = useMemo(() => {
    return getTempWindowFallbackIssue(displayData)
  }, [displayData])

  useEffect(() => {
    if (tempWindowFallbackReminder.dismissed) {
      setIsOpen(false)
      return
    }

    if (!issue) {
      setIsOpen(false)
      return
    }

    if (hasShownInThisSession) {
      return
    }

    setHasShownInThisSession(true)
    setIsOpen(true)
  }, [hasShownInThisSession, issue, tempWindowFallbackReminder.dismissed])

  const handleNeverRemind = async () => {
    await updateTempWindowFallbackReminder({ dismissed: true })
  }

  if (!issue) {
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
