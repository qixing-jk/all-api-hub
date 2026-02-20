import { t } from "i18next"
import toast from "react-hot-toast"

import { exportShareSnapshot } from "~/services/shareSnapshots/shareSnapshots"
import type { ShareSnapshotPayload } from "~/services/shareSnapshots/types"
import { getErrorMessage } from "~/utils/error"

import { ShareSnapshotCaptionToast } from "../components/ShareSnapshotCaptionToast"

const DEFAULT_CAPTION_TOAST_DURATION_MS = 12000

/**
 * Exports a snapshot payload and provides user feedback via toasts.
 *
 * - Success: shows either "copied" or "downloaded".
 * - Caption: if clipboard didn't include caption, shows a follow-up toast with one-click copy.
 * - Failure: shows the shared "operationFailed" toast.
 */
export const exportShareSnapshotWithToast = async ({
  payload,
  captionToastDurationMs = DEFAULT_CAPTION_TOAST_DURATION_MS,
}: {
  payload: ShareSnapshotPayload
  captionToastDurationMs?: number
}) => {
  try {
    const result = await exportShareSnapshot(payload)

    toast.success(
      result.method === "clipboard"
        ? t("messages:toast.success.shareSnapshotCopied")
        : t("messages:toast.success.shareSnapshotDownloaded"),
    )

    if (!result.didCopyCaption) {
      toast.custom(
        (toastInstance) => (
          <ShareSnapshotCaptionToast
            caption={result.caption}
            hint={t("shareSnapshots:toast.captionHint")}
            copyLabel={t("shareSnapshots:toast.copyCaption")}
            closeLabel={t("common:actions.close")}
            onCopy={async () => {
              try {
                await navigator.clipboard.writeText(result.caption)
                toast.success(
                  t("messages:toast.success.shareSnapshotCaptionCopied"),
                )
              } catch {
                toast.error(t("messages:toast.error.copyFailed"))
              }
              toast.dismiss(toastInstance.id)
            }}
            onClose={() => toast.dismiss(toastInstance.id)}
          />
        ),
        { duration: captionToastDurationMs },
      )
    }

    return result
  } catch (error) {
    toast.error(
      t("messages:toast.error.operationFailed", {
        error: getErrorMessage(error),
      }),
    )
    return null
  }
}
