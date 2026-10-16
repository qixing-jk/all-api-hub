import {
  sponsorWorkflowChannel,
  type SponsorWorkflowIntent,
} from "~/features/AccountManagement/sponsors/sponsorWorkflowIntent"
import { getActiveTab } from "~/utils/browser/tabs"

/** Stages and publishes a creation hint for the current browser window. */
export async function stageSponsorWorkflow(
  intent: SponsorWorkflowIntent,
  windowId?: number,
) {
  const targetWindow = windowId ?? (await getActiveTab())?.windowId
  if (typeof targetWindow !== "number")
    throw new Error("Sponsor target window unavailable")
  const id = await sponsorWorkflowChannel.prepare(intent, targetWindow)
  if (!(await sponsorWorkflowChannel.publish(id, targetWindow))) {
    await sponsorWorkflowChannel.discard(id)
    throw new Error("Sponsor setup already pending")
  }
}

/** Atomically accepts one pending hint. */
export async function consumeSponsorWorkflow(
  windowId?: number,
): Promise<SponsorWorkflowIntent | null> {
  const targetWindow = windowId ?? (await getActiveTab())?.windowId
  if (typeof targetWindow !== "number") return null
  const id = await sponsorWorkflowChannel.getPending(targetWindow)
  let intent: SponsorWorkflowIntent | null = null
  if (id)
    await sponsorWorkflowChannel.receive(
      id,
      (state) => {
        intent = state
        return true
      },
      targetWindow,
    )
  return intent
}
