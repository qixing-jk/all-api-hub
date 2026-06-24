import type { TFunction } from "i18next"

import { ProbeStatusBadge } from "~/components/dialogs/VerifyApiDialog/ProbeStatusBadge"
import { Button } from "~/components/ui"
import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"
import {
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"

import { getWebAiApiCheckProbeTestId } from "../testIds"
import type { ProbeItemState } from "./apiCheckModalTypes"

type ApiCheckProbeListProps = {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  probes: ProbeItemState[]
  isRunningAll: boolean
  isFetchingModels: boolean
  onRunProbe: (probeId: ApiVerificationProbeId) => void
  onStopProbe: (probeId: ApiVerificationProbeId) => void
}

/**
 * Renders probe rows and delegates run/stop actions to the modal controller.
 */
export function ApiCheckProbeList({
  t,
  probes,
  isRunningAll,
  isFetchingModels,
  onRunProbe,
  onStopProbe,
}: ApiCheckProbeListProps) {
  const notRunYet = t("webAiApiCheck:modal.probes.notRunYet")

  return (
    <div className="space-y-2">
      {probes.map((probe) => {
        const result = probe.result
        const summary = result?.summaryKey
          ? translateApiVerificationSummary(
              t,
              result.summaryKey,
              result.summaryParams,
            ) ?? result.summary
          : result?.summary

        return (
          <div
            key={probe.id}
            data-testid={getWebAiApiCheckProbeTestId(probe.id)}
            className="border-border rounded-md border p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-foreground min-w-0 truncate text-sm font-medium">
                    {getApiVerificationProbeLabel(t, probe.id)}
                  </div>
                  {result ? <ProbeStatusBadge result={result} /> : null}
                  <div className="text-muted-foreground text-xs">
                    {result ? `${Math.round(result.latencyMs)}ms` : " "}
                  </div>
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  {result ? summary : notRunYet}
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  probe.isRunning ? onStopProbe(probe.id) : onRunProbe(probe.id)
                }
                disabled={
                  isRunningAll || (!probe.isRunning && isFetchingModels)
                }
              >
                {probe.isRunning
                  ? isRunningAll
                    ? t("webAiApiCheck:modal.actions.running")
                    : t("webAiApiCheck:modal.actions.stopTest")
                  : probe.attempts > 0
                    ? t("webAiApiCheck:modal.actions.retry")
                    : t("webAiApiCheck:modal.actions.runOne")}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
