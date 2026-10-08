import { useCallback, useEffect, useRef, useState } from "react"

interface SafeExportActionToken {
  /** Whether this action still belongs to the open dialog and current inputs. */
  isCurrent: () => boolean
  /** Release the running state if this action is still current. */
  finish: () => void
}

/**
 * Prevent duplicate export actions and discard results produced for stale inputs.
 *
 * The caller owns the side effect and checks `isCurrent` immediately before each
 * externally visible step such as clipboard writes, downloads, toasts, or telemetry.
 */
export function useSafeExportAction({
  isOpen,
  signature,
}: {
  isOpen: boolean
  signature: string
}) {
  const generationRef = useRef(0)
  const contextRef = useRef({ isOpen, signature })
  const runningRef = useRef(false)
  const [isRunning, setIsRunning] = useState(false)

  const invalidate = useCallback(() => {
    generationRef.current += 1
    runningRef.current = false
    setIsRunning(false)
  }, [])

  useEffect(() => {
    const previous = contextRef.current
    contextRef.current = { isOpen, signature }
    if (previous.isOpen !== isOpen || previous.signature !== signature) {
      invalidate()
    }
  }, [invalidate, isOpen, signature])

  const begin = useCallback((): SafeExportActionToken | null => {
    if (!contextRef.current.isOpen || runningRef.current) return null

    const generation = ++generationRef.current
    const actionSignature = contextRef.current.signature
    runningRef.current = true
    setIsRunning(true)

    const isCurrent = () =>
      runningRef.current &&
      generationRef.current === generation &&
      contextRef.current.isOpen &&
      contextRef.current.signature === actionSignature

    return {
      isCurrent,
      finish: () => {
        if (!isCurrent()) return
        runningRef.current = false
        setIsRunning(false)
      },
    }
  }, [])

  return {
    begin,
    invalidate,
    isRunning,
  }
}
