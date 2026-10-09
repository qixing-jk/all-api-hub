import { useCallback, useEffect, useRef, useState } from "react"

import {
  resolveCommunityResources,
  type CommunityChannel,
  type CommunityResourceSource,
} from "./communityResources"

type CommunityResourcesState =
  | { status: "loading" | "error"; channels?: never }
  | {
      status: "ready"
      channels: CommunityChannel[]
      source: CommunityResourceSource
    }

/** Preloads with the sidebar and refreshes on open without clearing an already usable directory. */
export function useCommunityResources(
  enabled: boolean,
  open = false,
): CommunityResourcesState {
  const [state, setState] = useState<CommunityResourcesState>({
    status: "loading",
  })
  const request = useRef<AbortController | null>(null)

  const refresh = useCallback(() => {
    // Opening during preload shares its request; closing the popover does not discard it.
    if (!enabled || request.current) return

    const controller = new AbortController()
    request.current = controller
    void resolveCommunityResources(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setState({ status: "ready", ...result })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState((current) =>
            current.status === "ready" ? current : { status: "error" },
          )
        }
      })
      .finally(() => {
        if (request.current === controller) request.current = null
      })
  }, [enabled])

  useEffect(() => {
    setState({ status: "loading" })
    refresh()
    return () => {
      request.current?.abort()
      request.current = null
    }
  }, [refresh])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  return state
}
