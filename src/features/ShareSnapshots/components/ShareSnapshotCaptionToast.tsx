/**
 * Toast body that displays a generated caption and provides a one-click copy button.
 * Note: copying the caption may replace the current clipboard contents (including images).
 * The copy action is async, disables the button while in progress, and surfaces errors.
 */
import { useEffect, useRef, useState } from "react"

import { Button, Textarea } from "~/components/ui"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ShareSnapshotCaptionToast")

export const ShareSnapshotCaptionToast = ({
  caption,
  hint,
  copyLabel,
  closeLabel,
  onCopy,
  onClose,
}: {
  caption: string
  hint: string
  copyLabel: string
  closeLabel: string
  onCopy: () => Promise<void>
  onClose: () => void
}) => {
  const [isCopying, setIsCopying] = useState(false)
  const [copyError, setCopyError] = useState<string | null>(null)
  const isMountedRef = useRef(true)
  const isCopyingRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const handleCopy = async () => {
    if (isCopyingRef.current) return
    isCopyingRef.current = true
    setCopyError(null)
    setIsCopying(true)

    try {
      await onCopy()
    } catch (error) {
      logger.error("Failed to copy share snapshot caption", error)
      if (isMountedRef.current) {
        setCopyError(getErrorMessage(error) || "Copy failed")
      }
    } finally {
      isCopyingRef.current = false
      if (isMountedRef.current) {
        setIsCopying(false)
      }
    }
  }

  return (
    <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary w-[340px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      <div className="dark:text-dark-text-secondary mb-2 text-xs text-gray-500">
        {hint}
      </div>
      <Textarea
        readOnly
        value={caption}
        className="mb-3 h-28 resize-none text-xs"
      />
      {copyError ? (
        <div className="mb-2 text-xs text-red-600 dark:text-red-400">
          {copyError}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          onClick={handleCopy}
          disabled={isCopying}
        >
          {copyLabel}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
    </div>
  )
}
