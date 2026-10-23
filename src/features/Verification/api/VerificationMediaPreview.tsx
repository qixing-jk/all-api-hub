import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
  API_VERIFICATION_MEDIA_TYPES,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"

/** Render transient verification media with playback controls and recovery links. */
export function VerificationMediaPreview({
  output,
  media,
}: {
  output?: unknown
  media?: ApiVerificationProbeResult["media"]
}) {
  const { t } = useTranslation("aiApiVerification")
  const [failedUrl, setFailedUrl] = useState<string>()
  const url =
    media?.url ??
    (output &&
    typeof output === "object" &&
    "url" in output &&
    typeof output.url === "string"
      ? output.url
      : undefined)
  const isVideo = media?.type === API_VERIFICATION_MEDIA_TYPES.Video
  const external = typeof url === "string" && /^https?:\/\//i.test(url)
  if (
    !url ||
    (!external &&
      (isVideo || !/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(url)))
  )
    return null
  const failed = failedUrl === url
  return (
    <div className="mt-density-2 space-y-density-2">
      {failed ? (
        <p role="alert" className="text-muted-foreground text-xs">
          {t("verifyDialog.mediaPreviewUnavailable")}
        </p>
      ) : isVideo ? (
        <video
          src={url}
          aria-label={t("verifyDialog.generatedVideoPreview")}
          controls
          playsInline
          preload="metadata"
          onError={() => setFailedUrl(url)}
          className="border-border max-h-64 max-w-full rounded border"
        />
      ) : (
        <img
          src={url}
          alt={t("verifyDialog.generatedImagePreview")}
          onError={() => setFailedUrl(url)}
          className="border-border max-h-48 max-w-full rounded border object-contain"
        />
      )}
      {external && (isVideo || failed) && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary block text-xs underline"
        >
          {t("verifyDialog.openGeneratedMedia")}
        </a>
      )}
    </div>
  )
}
