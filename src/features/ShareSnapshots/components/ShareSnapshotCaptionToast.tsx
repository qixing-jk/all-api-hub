/**
 * Toast body that displays a generated caption and provides a one-click copy button.
 * Note: copying the caption may replace the current clipboard contents (including images).
 * The copy action is async, disables the button while in progress, and surfaces errors.
 */
import { useEffect, useRef, useState } from "react"

import { Button } from "~/components/ui/button"
import { SHARE_SNAPSHOT_TEST_IDS } from "~/features/ShareSnapshots/testIds"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"

const logger = createLogger("ShareSnapshotCaptionToast")

export const ShareSnapshotCaptionToast = ({
  caption,
  hint,
  copyLabel,
  copyingLabel,
  closeLabel,
  onCopy,
  onClose,
}: {
  caption: string
  hint: string
  copyLabel: string
  copyingLabel: string
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
    <div className="border-border bg-card w-[340px] rounded-lg border p-3 shadow-lg">
      <div className="dark:text-secondary-foreground text-muted-foreground mb-2 text-xs">
        {hint}
      </div>
      <textarea
        readOnly
        value={caption}
        data-testid={SHARE_SNAPSHOT_TEST_IDS.captionTextarea}
        className="dark:bg-background border-border bg-surface-subtle text-foreground mb-3 h-28 w-full resize-none rounded-md border p-2 text-xs focus:outline-none"
      />
      {copyError ? (
        <div className="text-destructive-text mb-2 text-xs">{copyError}</div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          size="sm"
          className="dark:bg-secondary dark:text-foreground bg-surface-inverse text-inverse-foreground h-auto min-h-0 px-3 py-1.5 text-xs"
          onClick={handleCopy}
          loading={isCopying}
        >
          {isCopying ? copyingLabel : copyLabel}
        </Button>
        <button
          type="button"
          className="dark:text-secondary-foreground text-muted-foreground rounded-md px-3 py-1.5 text-xs"
          onClick={onClose}
        >
          {closeLabel}
        </button>
      </div>
    </div>
  )
}
