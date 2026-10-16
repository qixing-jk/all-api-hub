import {
  sponsorWorkflowChannel,
  type SponsorWorkflowIntent,
  type SponsorWorkflowVisit,
} from "~/features/AccountManagement/sponsors/sponsorWorkflowIntent"
import { getSidePanelSupport, openSidePanel } from "~/utils/browser/sidePanel"
import { focusTab, getActiveTab } from "~/utils/browser/tabs"
import { closeIfPopup } from "~/utils/navigation/popup"

/** Best-effort sidebar setup; visiting a sponsor never requires an Options tab. */
export async function openSponsorWorkflow(
  intent: SponsorWorkflowIntent,
  visit: SponsorWorkflowVisit,
  targetTab?: browser.tabs.Tab | null,
) {
  if (getSidePanelSupport().supported) {
    // Start native opening before storage awaits to retain the click gesture.
    const opening = openSidePanel(targetTab).then(
      () => true,
      () => false,
    )
    let prepared: { id: string; windowId: number } | undefined
    try {
      const windowId = (targetTab ?? (await getActiveTab()))?.windowId
      if (typeof windowId === "number") {
        const id = await sponsorWorkflowChannel.prepare(intent, windowId)
        prepared = { id, windowId }
        const published = await sponsorWorkflowChannel.publish(id, windowId)
        if (!(await opening) || !published) {
          await sponsorWorkflowChannel.retract(id, windowId)
          await sponsorWorkflowChannel.discard(id)
        }
      } else await opening
    } catch {
      if (prepared) {
        await sponsorWorkflowChannel
          .retract(prepared.id, prepared.windowId)
          .catch(() => {})
        await sponsorWorkflowChannel.discard(prepared.id).catch(() => {})
      }
    }
  }
  const provider = await visit()
  if (typeof provider?.id === "number") await focusTab(provider)
  closeIfPopup()
}
