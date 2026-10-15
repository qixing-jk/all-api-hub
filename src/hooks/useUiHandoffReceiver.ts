import { useEffect, useRef } from "react"

import type { UiHandoffChannel } from "~/services/uiHandoff"
import { getActiveTab } from "~/utils/browser/tabs"

export const UI_HANDOFF_RECEIVE_RESULTS = {
  Accepted: "accepted",
  Busy: "busy",
  Unavailable: "unavailable",
} as const

export type UiHandoffReceiveResult =
  (typeof UI_HANDOFF_RECEIVE_RESULTS)[keyof typeof UI_HANDOFF_RECEIVE_RESULTS]
export type UiHandoffFailureReason = Exclude<
  UiHandoffReceiveResult,
  typeof UI_HANDOFF_RECEIVE_RESULTS.Accepted
>

/** Subscribes before reading and acknowledges only data accepted by the current UI. */
export function useUiHandoffReceiver<T>({
  enabled,
  initialId,
  channel,
  onReceive,
  onFailure,
}: {
  enabled: boolean
  initialId?: string
  channel: Pick<UiHandoffChannel<T>, "getPending" | "watchPending" | "receive">
  onReceive: (state: T) => UiHandoffReceiveResult
  onFailure: (reason: UiHandoffFailureReason) => void
}) {
  const received = useRef(new Set<string>())
  const lastBlockedId = useRef<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let processing = false
    let queued: { id: string; windowId?: number } | null = null
    let stopWatching = () => {}
    const fail = (id: string, reason: UiHandoffFailureReason) => {
      if (!cancelled && lastBlockedId.current !== id) {
        lastBlockedId.current = id
        onFailure(reason)
      }
    }
    const receive = async (id: string | null, windowId?: number) => {
      if (!id || cancelled || received.current.has(id)) return
      if (processing) {
        queued = { id, windowId }
        return
      }
      processing = true
      try {
        let inspected = false
        const restored = await channel.receive(
          id,
          (state) => {
            if (cancelled) return false
            inspected = true
            const result = onReceive(state)
            if (result === UI_HANDOFF_RECEIVE_RESULTS.Accepted) {
              received.current.add(id)
              return true
            }
            fail(id, result)
            return false
          },
          windowId,
        )
        if (!restored && !inspected)
          fail(id, UI_HANDOFF_RECEIVE_RESULTS.Unavailable)
      } catch {
        fail(id, UI_HANDOFF_RECEIVE_RESULTS.Unavailable)
      } finally {
        processing = false
        const next = queued
        queued = null
        if (next) void receive(next.id, next.windowId)
      }
    }
    if (initialId) {
      void receive(initialId)
    } else {
      void getActiveTab()
        .then((tab) => {
          if (cancelled || typeof tab?.windowId !== "number") return
          const windowId = tab.windowId
          const consumePending = () => {
            void channel
              .getPending(windowId)
              .then((id) => receive(id, windowId))
              .catch(() => {
                if (!cancelled)
                  onFailure(UI_HANDOFF_RECEIVE_RESULTS.Unavailable)
              })
          }
          stopWatching = channel.watchPending(windowId, consumePending)
          consumePending()
        })
        .catch(() => {
          if (!cancelled) onFailure(UI_HANDOFF_RECEIVE_RESULTS.Unavailable)
        })
    }
    return () => {
      cancelled = true
      stopWatching()
    }
  }, [enabled, initialId, channel, onReceive, onFailure])
}
