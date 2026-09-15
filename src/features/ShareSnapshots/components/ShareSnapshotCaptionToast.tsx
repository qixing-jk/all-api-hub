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
    <div className="border-border bg-card py-density-3 w-[min(340px,calc(100vw-2rem))] rounded-lg border px-3 shadow-lg">
      <div className="dark:text-secondary-foreground text-muted-foreground mb-density-2 text-xs">
        {hint}
      </div>
      <textarea
        readOnly
        value={caption}
        data-testid={SHARE_SNAPSHOT_TEST_IDS.captionTextarea}
        className="dark:bg-background border-border bg-surface-subtle text-foreground mb-density-3 py-density-2 focus-visible:ring-ring h-28 w-full resize-none rounded-md border px-2 text-xs focus:outline-none focus-visible:border-transparent focus-visible:ring-2 focus-visible:outline-none"
      />
      {copyError ? (
        <div className="text-destructive-text mb-density-2 text-xs">
          {copyError}
        </div>
      ) : null}
      <div className="gap-y-density-2 flex items-center justify-end gap-x-2">
        <Button
          type="button"
          size="sm"
          className="dark:bg-secondary dark:text-foreground bg-surface-inverse text-inverse-foreground py-density-1-5 h-auto min-h-0 px-3 text-xs"
          onClick={handleCopy}
          loading={isCopying}
        >
          {isCopying ? copyingLabel : copyLabel}
        </Button>
        <button
          type="button"
          className="dark:text-secondary-foreground text-muted-foreground py-density-1-5 min-h-(--density-control-xs) rounded-md px-3 text-xs"
          onClick={onClose}
        >
          {closeLabel}
        </button>
      </div>
    </div>
  )
}
