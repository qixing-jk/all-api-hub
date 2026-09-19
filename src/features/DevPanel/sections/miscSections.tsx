import { Database, FlaskConical } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

import { DEV_MENU_ITEM_IDS } from "~/constants/devOptionsMenuIds"
import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { RuntimeActionIds } from "~/constants/runtimeActions"
import toast from "~/lib/notify"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { getErrorMessage } from "~/utils/core/error"
import { createLogger } from "~/utils/core/logger"
import { navigateWithinOptionsPage } from "~/utils/navigation"

import type { DevPanelSection } from "../types"

const logger = createLogger("DevBalanceHistorySection")

/**
 * Balance-history debug seeding, formerly a dev-only button inside the
 * Basic Settings Refresh/balance-history card.
 */
export function useBalanceHistoryDevSection(): DevPanelSection {
  const [isSeeding, setIsSeeding] = useState(false)

  const handleSeedEstimateSnapshots = useCallback(async () => {
    setIsSeeding(true)
    let toastId: string | undefined
    try {
      toastId = toast.loading("Seeding estimated income snapshots…")
      const response = await sendRuntimeMessage<{
        success: boolean
        data?: { seeded: number; skipped: number }
        error?: string
      }>({
        action: RuntimeActionIds.BalanceHistoryDebugSeedEstimateSnapshots,
      })

      if (!response?.success) {
        toast.error(response?.error ?? "Failed to seed test snapshots", {
          id: toastId,
        })
        return
      }

      toast.success(
        `Seeded ${response.data?.seeded ?? 0} account(s), skipped ${response.data?.skipped ?? 0}. Check Popup stats or Balance History metrics.`,
        { id: toastId },
      )
    } catch (error) {
      logger.error("Failed to seed estimated income test snapshots", error)
      toast.error(getErrorMessage(error), { id: toastId })
    } finally {
      setIsSeeding(false)
    }
  }, [])

  return useMemo(
    () => ({
      id: "balance-history-debug",
      title: "Balance history",
      icon: Database,
      // Reachable from the settings card that used to host the button and from
      // the visualization page whose metrics it seeds.
      pages: [MENU_ITEM_IDS.BASIC, MENU_ITEM_IDS.BALANCE_HISTORY],
      surfaces: ["options"],
      actions: [
        {
          id: "seed-estimate-snapshots",
          label: "Dev: Seed estimate snapshots",
          loading: isSeeding,
          disabled: isSeeding,
          run: handleSeedEstimateSnapshots,
        },
      ],
    }),
    [handleSeedEstimateSnapshots, isSeeding],
  )
}

/**
 * Quick navigation to the development-only options routes.
 */
export function useDevPagesSection(): DevPanelSection {
  return useMemo(
    () => ({
      id: "dev-pages",
      title: "Dev pages",
      icon: FlaskConical,
      surfaces: ["options"],
      actions: [
        {
          id: "open-mesh-gradient-lab",
          label: "Open Mesh Gradient Lab",
          run: () =>
            void navigateWithinOptionsPage(
              `#${DEV_MENU_ITEM_IDS.MESH_GRADIENT_LAB}`,
            ),
        },
        {
          id: "open-unified-api-guidance-preview",
          label: "Open Unified API Guidance preview",
          run: () =>
            void navigateWithinOptionsPage(
              `#${DEV_MENU_ITEM_IDS.UNIFIED_API_GUIDANCE_PREVIEW}`,
            ),
        },
      ],
    }),
    [],
  )
}
