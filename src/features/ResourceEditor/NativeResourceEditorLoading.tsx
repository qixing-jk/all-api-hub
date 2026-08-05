import { useEffect, useState } from "react"

import {
  NATIVE_RESOURCE_EDITOR_LOADING_REVEALS,
  type NativeResourceEditorLoadingReveal,
} from "./nativeResourceEditorOpeningState"

/** Brief grace period that prevents fast editor launches from flashing a skeleton. */
const EDITOR_LOADING_GRACE_PERIOD_MS = 150

type NativeResourceEditorLoadingRequest = {
  attemptId: number
  reveal: NativeResourceEditorLoadingReveal
} | null

/** Resolves whether a native resource editor launch should expose its loading UI. */
export function useNativeResourceEditorLoadingVisibility(
  request: NativeResourceEditorLoadingRequest,
) {
  const [revealedAttemptId, setRevealedAttemptId] = useState<number | null>(
    null,
  )
  const attemptId = request?.attemptId
  const reveal = request?.reveal

  useEffect(() => {
    if (
      attemptId === undefined ||
      reveal === NATIVE_RESOURCE_EDITOR_LOADING_REVEALS.Immediate
    )
      return
    const timeoutId = window.setTimeout(
      () => setRevealedAttemptId(attemptId),
      EDITOR_LOADING_GRACE_PERIOD_MS,
    )
    return () => window.clearTimeout(timeoutId)
  }, [attemptId, reveal])

  return (
    attemptId !== undefined &&
    (reveal === NATIVE_RESOURCE_EDITOR_LOADING_REVEALS.Immediate ||
      revealedAttemptId === attemptId)
  )
}

type NativeResourceEditorLoadingSkeletonProps = {
  accessibleLabel: string
  testId?: string
  sectionFieldCounts?: readonly number[]
}

/** Form-shaped loading state shared by native resource editor projections. */
export function NativeResourceEditorLoadingSkeleton({
  accessibleLabel,
  testId,
  sectionFieldCounts = [2, 2, 1],
}: NativeResourceEditorLoadingSkeletonProps) {
  return (
    <div data-testid={testId} aria-busy="true">
      <span className="sr-only" role="status" aria-live="polite">
        {accessibleLabel}
      </span>
      <div
        aria-hidden="true"
        className="animate-pulse space-y-5 motion-reduce:animate-none"
      >
        <div className="dark:bg-dark-bg-tertiary h-16 rounded-lg bg-gray-200" />
        {sectionFieldCounts.map((fieldCount, sectionIndex) => (
          <div key={sectionIndex} className="space-y-4">
            <div className="dark:bg-dark-bg-tertiary h-4 w-28 rounded bg-gray-200" />
            {Array.from({ length: fieldCount }, (_, fieldIndex) => (
              <div key={fieldIndex} className="space-y-2">
                <div className="dark:bg-dark-bg-tertiary h-3 w-24 rounded bg-gray-200" />
                <div className="dark:bg-dark-bg-tertiary h-9 rounded-md bg-gray-200" />
              </div>
            ))}
          </div>
        ))}
        <div className="dark:bg-dark-bg-tertiary h-4 w-32 rounded bg-gray-200" />
      </div>
    </div>
  )
}
