import type { TFunction } from "i18next"

import type { VerificationToolsController } from "~/features/Verification/api/useVerificationTools"
import { VerificationProbeRow } from "~/features/Verification/api/VerificationProbeRow"
import type { ProbeItemState } from "~/features/WebAiApiCheck/content/modal/apiCheckModalTypes"
import { getWebAiApiCheckProbeTestId } from "~/features/WebAiApiCheck/content/testIds"
import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"
import { translateApiVerificationSummary } from "~/services/verification/aiApiVerification/i18n"

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
  return (
    <>
      {probes.map((probe) => {
        const result = probe.result
        const summary = result?.summaryKey
          ? (translateApiVerificationSummary(
              t,
              result.summaryKey,
              result.summaryParams,
              result.summary,
            ) ?? result.summary)
          : result?.summary

        return (
          <div
            key={probe.id}
            data-testid={getWebAiApiCheckProbeTestId(probe.id)}
          >
            <VerificationProbeRow
              progress={probe.progress}
              startedAt={probe.startedAt}
              isRunning={probe.isRunning}
              controller={tools}
              probeId={probe.id}
              result={result}
              summary={summary}
              runButtonProps={{
                type: "button",
                onClick: () =>
                  probe.isRunning
                    ? onStopProbe(probe.id)
                    : onRunProbe(probe.id),
                loading: probe.isRunning,
                disabled:
                  isRunningAll || (!probe.isRunning && isFetchingModels),
                children: probe.isRunning
                  ? isRunningAll
                    ? t("webAiApiCheck:modal.actions.running")
                    : t("webAiApiCheck:modal.actions.stopTest")
                  : probe.attempts > 0
                    ? t("webAiApiCheck:modal.actions.retry")
                    : t("aiApiVerification:verifyDialog.actions.runOne"),
              }}
            />
          </div>
        )
      })}
    </>
  )
}
