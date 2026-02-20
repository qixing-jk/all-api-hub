/**
 * Toast body that displays a generated caption and provides a one-click copy button.
 * Note: copying the caption may replace the current clipboard contents (including images).
 */
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
  return (
    <div className="dark:border-dark-bg-tertiary dark:bg-dark-bg-secondary w-[340px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      <div className="dark:text-dark-text-secondary mb-2 text-xs text-gray-500">
        {hint}
      </div>
      <textarea
        readOnly
        value={caption}
        className="dark:border-dark-bg-tertiary dark:bg-dark-bg-primary dark:text-dark-text-primary mb-3 h-28 w-full resize-none rounded-md border border-gray-200 bg-gray-50 p-2 text-xs text-gray-900 focus:outline-none"
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="dark:bg-dark-bg-tertiary dark:text-dark-text-primary rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
          onClick={() => void onCopy()}
        >
          {copyLabel}
        </button>
        <button
          type="button"
          className="dark:text-dark-text-secondary rounded-md px-3 py-1.5 text-xs text-gray-600"
          onClick={onClose}
        >
          {closeLabel}
        </button>
      </div>
    </div>
  )
}
