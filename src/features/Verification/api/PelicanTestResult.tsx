import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, CollapsibleSection } from "~/components/ui"
import { AgentTestResult } from "~/features/Verification/api/AgentTestResult"
import type { PelicanTestResult as PelicanResult } from "~/services/verification/modelQuality/pelican"

import { VerificationOutputText } from "./VerificationOutputText"

/** Inline preview of a model-drawn SVG, rendered as an image so scripts never run. */
function PelicanSvgPreview({ svg }: { svg: string }) {
  const { t } = useTranslation("aiApiVerification")
  const src = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    [svg],
  )

  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (failedSrc === src) {
    return (
      <Alert variant="warning">
        <p>{t("verifyDialog.tools.pelican.previewFailed")}</p>
      </Alert>
    )
  }

  return (
    <img
      src={src}
      onError={() => setFailedSrc(src)}
      alt={t("verifyDialog.tools.pelican.previewAlt")}
      className="border-border-subtle bg-surface-subtle max-h-80 w-full rounded-lg border object-contain p-3"
      data-testid="pelican-svg-preview"
    />
  )
}

/** Render transient drawing evidence without owning request or history state. */
export function PelicanTestResult({ pelican }: { pelican: PelicanResult }) {
  const { t } = useTranslation("aiApiVerification")
  return (
    <div className="space-y-density-3" data-testid="pelican-result">
      {pelican.svg && pelican.analysis.safe ? (
        <PelicanSvgPreview svg={pelican.svg} />
      ) : null}
      <div className="text-muted-foreground text-xs">
        {pelican.svg
          ? t("verifyDialog.tools.pelican.analysis", {
              shapes: pelican.analysis.shapeCount,
              wheels: pelican.analysis.wheelClues,
              viewBox: pelican.analysis.viewBox ?? "-",
            })
          : t("verifyDialog.tools.pelican.noSvg")}
      </div>
      {pelican.svg && !pelican.analysis.safe ? (
        <Alert variant="warning">
          <p>{t("verifyDialog.tools.pelican.unsafe")}</p>
        </Alert>
      ) : null}
      {pelican.agent ? (
        <AgentTestResult agent={pelican.agent} latencyMs={pelican.latencyMs} />
      ) : null}
      <CollapsibleSection
        title={t("verifyDialog.tools.pelican.raw")}
        buttonClassName="border-border-subtle rounded-md border px-3 py-2"
      >
        <VerificationOutputText text={pelican.text} />
      </CollapsibleSection>
    </div>
  )
}
