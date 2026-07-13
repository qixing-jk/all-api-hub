import { useTranslation } from "react-i18next"

import { Alert } from "~/components/ui"
import {
  KILO_CODE_EXPORT_TARGETS,
  type KiloCodeExportTarget,
} from "~/services/integrations/kiloCodeExport"

interface KiloCodeExportGuidanceProps {
  target: KiloCodeExportTarget
}

/** Target-aware instructions for using a Kilo Code export. */
export function KiloCodeExportGuidance({
  target,
}: KiloCodeExportGuidanceProps) {
  const { t } = useTranslation("ui")
  const firstInstructions =
    target === KILO_CODE_EXPORT_TARGETS.KiloV7
      ? t("dialog.kiloCode.help.kiloV7DownloadInstructions")
      : t("dialog.kiloCode.help.legacyDownloadInstructions")
  const secondInstructions =
    target === KILO_CODE_EXPORT_TARGETS.KiloV7
      ? t("dialog.kiloCode.help.kiloV7CopyInstructions")
      : t("dialog.kiloCode.help.legacyCopyInstructions")

  return (
    <Alert variant="info" title={t("dialog.kiloCode.help.usageTitle")}>
      <div className="space-y-2 text-sm">
        <p>{firstInstructions}</p>
        <p>{secondInstructions}</p>
      </div>
    </Alert>
  )
}
