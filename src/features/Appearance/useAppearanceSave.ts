import { useRef, useState } from "react"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import type { AppearanceUpdates } from "~/types/theme"

/** Keep all writes busy while reporting only the latest requested save's result. */
export function useAppearanceSave() {
  const { updateAppearance } = useUserPreferencesContext()
  const pending = useRef(0)
  const latestWrite = useRef(0)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const save = async (updates: AppearanceUpdates) => {
    const writeId = ++latestWrite.current
    pending.current += 1
    setSaving(true)
    setFailed(false)
    try {
      const result = await updateAppearance(updates)
      if (writeId === latestWrite.current) setFailed(!result.ok)
    } catch {
      if (writeId === latestWrite.current) setFailed(true)
    } finally {
      pending.current -= 1
      setSaving(pending.current > 0)
    }
  }

  return { save, saving, failed }
}
