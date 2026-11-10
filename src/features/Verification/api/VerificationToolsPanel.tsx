import { ContextCapacityPanel } from "./ContextCapacityPanel"
import { NeedlePanel } from "./NeedlePanel"
import { PelicanPanel } from "./PelicanPanel"
import { QuestionAnswerPanel } from "./QuestionAnswerPanel"
import type { VerificationToolsController } from "./useVerificationTools"

export type VerificationToolsPanelProps = {
  controller: VerificationToolsController
}

/** Compose the shared tests for account, profile and webpage workspaces. */
export function VerificationToolsPanel({
  controller,
}: VerificationToolsPanelProps) {
  return (
    <>
      {controller.questionAnswer ? (
        <QuestionAnswerPanel controller={controller.questionAnswer} />
      ) : null}
      <PelicanPanel controller={controller} />
      {controller.needle && controller.contextCapacity ? (
        <NeedlePanel
          controller={controller.needle}
          runCapacity={
            controller.contextCapacity.running
              ? controller.contextCapacity.stop
              : controller.contextCapacity.run
          }
          canRunCapacity={controller.contextCapacity.canRun}
          capacityRunning={controller.contextCapacity.running}
        />
      ) : null}
      {controller.contextCapacity ? (
        <ContextCapacityPanel controller={controller.contextCapacity} />
      ) : null}
    </>
  )
}
