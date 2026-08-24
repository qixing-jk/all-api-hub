import { useEffect, useRef, useState } from "react"

import { usePreferenceDraft } from "~/hooks/usePreferenceDraft"

export type DeferredPreferenceCommitResult<T> = {
  ok: boolean
  value?: T
}

type UseDeferredPreferenceDraftOptions<T> = {
  savedValue: T
  savedVersion: number
  onCommit: (draft: T) => Promise<DeferredPreferenceCommitResult<T>>
  isEqual?: (left: T, right: T) => boolean
}

/**
 * Owns one deferred preference draft, including clean-snapshot reconciliation,
 * single-flight commits, canonical success values, and failure rollback.
 */
export function useDeferredPreferenceDraft<T>({
  savedValue,
  savedVersion,
  onCommit,
  isEqual,
}: UseDeferredPreferenceDraftOptions<T>) {
  const { draft, setDraft, acceptDraft, isDirty } = usePreferenceDraft({
    savedValue,
    savedVersion,
    isEqual,
  })
  const [isCommitting, setIsCommitting] = useState(false)
  const inFlightCommitRef = useRef<Promise<
    DeferredPreferenceCommitResult<T>
  > | null>(null)
  const latestSavedValueRef = useRef(savedValue)

  useEffect(() => {
    latestSavedValueRef.current = savedValue
  }, [savedValue])

  const commit = (): Promise<DeferredPreferenceCommitResult<T>> => {
    if (inFlightCommitRef.current) {
      return inFlightCommitRef.current
    }
    if (!isDirty) {
      setDraft(savedValue)
      return Promise.resolve({ ok: true, value: savedValue })
    }

    const draftToCommit = draft
    const commitPromise = (async () => {
      setIsCommitting(true)
      try {
        const result = await onCommit(draftToCommit)
        const nextValue = result.ok
          ? result.value ?? draftToCommit
          : latestSavedValueRef.current
        if (result.ok) {
          acceptDraft(nextValue)
        } else {
          setDraft(nextValue)
        }
        return result.ok ? { ...result, value: nextValue } : result
      } catch {
        setDraft(latestSavedValueRef.current)
        return { ok: false }
      } finally {
        inFlightCommitRef.current = null
        setIsCommitting(false)
      }
    })()

    inFlightCommitRef.current = commitPromise
    return commitPromise
  }

  return {
    draft,
    setDraft,
    isDirty,
    isCommitting,
    commit,
  }
}
