import { useEffect, useRef, useState, type KeyboardEvent } from "react"

import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"

export type DeferredPreferenceCommitResult = {
  ok: boolean
  value?: string
}

type UseDeferredPreferenceFieldOptions = {
  savedValue: string
  savedVersion: number
  onCommit: (draft: string) => Promise<DeferredPreferenceCommitResult>
}

/**
 * Keeps one preference input editable locally and commits it on an explicit
 * interaction boundary such as blur or Enter.
 */
export function useDeferredPreferenceField({
  savedValue,
  savedVersion,
  onCommit,
}: UseDeferredPreferenceFieldOptions) {
  const { draft, setDraft } = usePreferenceDraft({
    savedValue,
    savedVersion,
  })
  const [isCommitting, setIsCommitting] = useState(false)
  const isCommittingRef = useRef(false)
  const latestSavedValueRef = useRef(savedValue)

  useEffect(() => {
    latestSavedValueRef.current = savedValue
  }, [savedValue])

  const commit = async () => {
    if (isCommittingRef.current) return
    if (draft === savedValue) {
      setDraft(savedValue)
      return
    }

    isCommittingRef.current = true
    setIsCommitting(true)
    try {
      const result = await onCommit(draft)
      setDraft(result.ok ? result.value ?? draft : latestSavedValueRef.current)
    } catch {
      setDraft(latestSavedValueRef.current)
    } finally {
      isCommittingRef.current = false
      setIsCommitting(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur()
    }
  }

  return {
    draft,
    setDraft,
    isCommitting,
    commit,
    handleKeyDown,
  }
}
