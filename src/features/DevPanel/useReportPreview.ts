import { FlaskConical } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { REPORT_PREVIEW_SCENARIOS } from "~/features/DevPanel/reportPreviewScenarios"
import { useDevUnlocked } from "~/utils/core/devMode"

import { useRegisterDevPanelSection } from "./DevPanelSectionsContext"
import type { ReportPreviewScenario } from "./reportPreviewScenarios"
import type { DevPanelSection } from "./types"

export type { ReportPreviewScenario } from "./reportPreviewScenarios"

/** Register page-scoped previews whose data exists only for this page visit. */
export function useReportPreview<T>(
  page: string,
  labels: { title: string; standard: string; mixed: string },
  build: (scenario: ReportPreviewScenario) => T,
) {
  const unlocked = useDevUnlocked()
  const [selection, setSelection] = useState<ReportPreviewScenario>()
  const scenario = unlocked ? selection : undefined
  const exit = useCallback(() => setSelection(undefined), [])
  const { title, standard, mixed } = labels
  const section = useMemo<DevPanelSection>(
    () => ({
      id: `${page}-preview`,
      title,
      category: "preview",
      pages: [page],
      surfaces: ["options"],
      icon: FlaskConical,
      order: -1,
      description:
        "Sample data is loaded only in this tab. Exit or reload to restore your data.",
      actions: [
        {
          id: REPORT_PREVIEW_SCENARIOS.Standard,
          label: standard,
          run: () => setSelection(REPORT_PREVIEW_SCENARIOS.Standard),
        },
        {
          id: REPORT_PREVIEW_SCENARIOS.Mixed,
          label: mixed,
          run: () => setSelection(REPORT_PREVIEW_SCENARIOS.Mixed),
        },
        {
          id: REPORT_PREVIEW_SCENARIOS.Empty,
          label: "Dev: Preview empty history",
          run: () => setSelection(REPORT_PREVIEW_SCENARIOS.Empty),
        },
        {
          id: "exit",
          label: "Dev: Exit preview",
          run: exit,
          disabled: !scenario,
        },
      ],
    }),
    [page, title, standard, mixed, scenario, exit],
  )
  useRegisterDevPanelSection(unlocked ? section : null)
  const data = useMemo(() => scenario && build(scenario), [scenario, build])
  return { scenario, data, exit }
}
