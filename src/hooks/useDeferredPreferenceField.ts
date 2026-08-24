import type { KeyboardEvent } from "react"

import {
  useDeferredPreferenceDraft,
  type DeferredPreferenceCommitResult as GenericDeferredPreferenceCommitResult,
} from "~/hooks/useDeferredPreferenceDraft"

export type DeferredPreferenceCommitResult =
  GenericDeferredPreferenceCommitResult<string>

type UseDeferredPreferenceFieldOptions = {
  savedValue: string
  savedVersion: number
  onCommit: (draft: string) => Promise<DeferredPreferenceCommitResult>
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
}: UseDeferredPreferenceFieldOptions) {
  const deferredDraft = useDeferredPreferenceDraft({
    savedValue,
    savedVersion,
    onCommit,
  })

  return {
    ...deferredDraft,
    handleKeyDown: blurInputOnEnter,
  }
}
