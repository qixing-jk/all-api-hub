import {
  resolveTurnstileAssistPresentation,
  type TurnstileAssistPresentation,
} from "./assistPresentation"

/** Sends each enabled reminder independently, without enabling fallback channels. */
export async function deliverTurnstileAssistNotice(
  preference: TurnstileAssistPresentation,
  channels: { page: () => Promise<boolean>; system: () => Promise<boolean> },
): Promise<Array<"page" | "system">> {
  const action = resolveTurnstileAssistPresentation({
    preference,
    canNotify: true,
  })
  const delivered: Array<"page" | "system"> = []
  await Promise.all(
    (["page", "system"] as const).map(async (channel) => {
      if (!(channel === "page" ? action.page : action.notify)) return
      try {
        if (await channels[channel]()) delivered.push(channel)
      } catch {
        // A permission may be revoked or the receiving page may close during delivery.
      }
    }),
  )
  return delivered.sort()
}
