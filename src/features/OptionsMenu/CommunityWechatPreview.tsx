import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { ImageLightbox } from "~/components/ui/ImageLightbox"

import type { CommunityWechatImageState } from "./useCommunityWechatImage"

/** Displays the remote image, including personal contact codes when a group invite expires. */
export function CommunityWechatPreview({
  image,
  onClose,
  onOpenCommunityPage,
}: {
  image: CommunityWechatImageState
  onClose: () => void
  onOpenCommunityPage: () => void
}) {
  const { t } = useTranslation(["ui", "common"])
  const [now, setNow] = useState(Date.now)
  const expiresAt = Date.parse(image.expiresAt ?? "")
  const hasValidGroupInvite = Number.isFinite(expiresAt) && now < expiresAt

  useEffect(() => {
    if (!Number.isFinite(expiresAt)) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      const currentTime = Date.now()
      setNow(currentTime)
      if (expiresAt > currentTime) {
        // Long-lived invites must not overflow the browser's signed 32-bit timeout.
        timer = setTimeout(
          refresh,
          Math.min(expiresAt - currentTime, 2_147_483_647),
        )
      }
    }
    refresh()
    return () => clearTimeout(timer)
  }, [expiresAt])

  return (
    <ImageLightbox
      isOpen
      onClose={onClose}
      src={image.src}
      alt={t("feedback.wechat")}
      fallback={
        <p role="status" className="text-muted-foreground p-8 text-sm">
          {image.status === "loading"
            ? t("common:status.loading")
            : t("feedback.wechatUnavailable")}
        </p>
      }
      footer={
        <div className="space-y-2 p-3 text-center text-xs">
          {image.status === "ready" && !hasValidGroupInvite && (
            <p className="text-muted-foreground">{t("feedback.wechatHelp")}</p>
          )}
          <button
            type="button"
            className="text-link hover:underline"
            onClick={onOpenCommunityPage}
          >
            {t("feedback.openCommunityPage")}
          </button>
        </div>
      }
    />
  )
}
