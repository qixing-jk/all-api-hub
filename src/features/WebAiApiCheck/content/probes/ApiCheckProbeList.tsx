import type { TFunction } from "i18next"

import { Badge } from "~/components/ui"
import { ProbeStatusBadge } from "~/features/Verification/api/ProbeStatusBadge"
import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { VerificationProbeDetails } from "~/features/Verification/api/VerificationProbeDetails"
import { VerificationRunButton } from "~/features/Verification/api/VerificationRunButton"
import { VerificationTestLabel } from "~/features/Verification/api/VerificationTestLabel"
import type { ProbeItemState } from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { getWebAiApiCheckProbeTestId } from "~/features/WebAiApiCheck/content/testIds"
import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"
import {
  getApiVerificationProbeLabel,
  translateApiVerificationSummary,
} from "~/services/verification/aiApiVerification/i18n"

type ApiCheckProbeListProps = {
  t: TFunction<["webAiApiCheck", "common", "aiApiVerification"]>
  tools?: VerificationToolsController
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
  tools,
  isRunningAll,
  isFetchingModels,
  onRunProbe,
  onStopProbe,
}: ApiCheckProbeListProps) {
  const notRunYet = t("webAiApiCheck:modal.probes.notRunYet")

  return (
    <div className="gap-density-4 grid grid-cols-1 lg:grid-cols-2">
      {probes.map((probe) => {
        const result = probe.result
        const summary = result?.summaryKey
          ? translateApiVerificationSummary(
              t,
              result.summaryKey,
              result.summaryParams,
              result.summary,
            ) ?? result.summary
          : result?.summary

        return (
          <div
            key={probe.id}
            data-testid={getWebAiApiCheckProbeTestId(probe.id)}
            className="border-border-subtle min-w-0 rounded-lg border p-4 lg:has-[[aria-controls$=-result][aria-expanded=true]]:col-span-2"
          >
            <VerificationProbeDetails
              controller={tools}
              probeId={probe.id}
              result={result}
              heading={
                <div className="min-w-0 flex-1">
                  <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
                    <div className="text-foreground min-w-0 truncate text-sm font-medium">
                      <VerificationTestLabel testId={probe.id}>
                        {getApiVerificationProbeLabel(t, probe.id)}
                      </VerificationTestLabel>
                    </div>
                    <div className="gap-y-density-2 flex flex-wrap items-center gap-x-2">
                      {result ? (
                        <ProbeStatusBadge result={result} />
                      ) : (
                        <Badge variant="outline" size="sm">
                          {t("aiApiVerification:verifyDialog.status.pending")}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-muted-foreground mt-density-1 text-xs">
                    {result ? summary : notRunYet}
                  </div>
                </div>
              }
              action={
                <VerificationRunButton
                  type="button"
                  onClick={() =>
                    probe.isRunning
                      ? onStopProbe(probe.id)
                      : onRunProbe(probe.id)
                  }
                  loading={probe.isRunning}
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
                </VerificationRunButton>
              }
            />
          </div>
        )
      })}
    </div>
  )
}
