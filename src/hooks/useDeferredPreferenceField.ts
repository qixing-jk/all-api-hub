import type { KeyboardEvent } from "react"

import {
  useDeferredPreferenceDraft,
  type DeferredPreferenceCommitResult as GenericDeferredPreferenceCommitResult,
} from "~/hooks/useDeferredPreferenceDraft"

export type DeferredPreferenceFieldCommitResult =
  GenericDeferredPreferenceCommitResult<string>

type UseDeferredPreferenceFieldOptions = {
  savedValue: string
  savedVersion: number
  preserveDraftOnError?: boolean
  onCommit: (draft: string) => Promise<DeferredPreferenceFieldCommitResult>
}

/** Treat Enter as the same commit boundary as leaving a single-line input. */
export function blurInputOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.currentTarget.blur()
  }
}

/**
 * Keeps one preference input editable locally and commits it on an explicit
 * interaction boundary such as blur or Enter.
 */
export function useDeferredPreferenceField({
  savedValue,
  savedVersion,
  onCommit,
  preserveDraftOnError,
}: UseDeferredPreferenceFieldOptions) {
  const deferredDraft = useDeferredPreferenceDraft({
    savedValue,
    savedVersion,
    onCommit,
    preserveDraftOnError,
  })

  return {
    ...deferredDraft,
    handleKeyDown: blurInputOnEnter,
  }
}
