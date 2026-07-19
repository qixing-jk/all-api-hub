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
  const instructions =
    target === KILO_CODE_EXPORT_TARGETS.KiloV7
      ? [
          {
            id: "catalog",
            text: t("dialog.kiloCode.help.kiloV7CatalogInstructions"),
          },
          {
            id: "download",
            text: t("dialog.kiloCode.help.kiloV7DownloadInstructions"),
          },
          {
            id: "copy",
            text: t("dialog.kiloCode.help.kiloV7CopyInstructions"),
          },
          {
            id: "api-key-editor",
            text: t("dialog.kiloCode.help.kiloV7ApiKeyEditorNote"),
          },
        ]
      : [
          {
            id: "single-model",
            text: t("dialog.kiloCode.help.legacySingleModelInstructions"),
          },
          {
            id: "download",
            text: t("dialog.kiloCode.help.legacyDownloadInstructions"),
          },
          {
            id: "copy",
            text: t("dialog.kiloCode.help.legacyCopyInstructions"),
          },
        ]

  return (
    <Alert variant="info" title={t("dialog.kiloCode.help.usageTitle")}>
      <div className="space-y-2 text-sm">
        {instructions.map(({ id, text }) => (
          <p key={id}>{text}</p>
        ))}
      </div>
    </Alert>
  )
}
