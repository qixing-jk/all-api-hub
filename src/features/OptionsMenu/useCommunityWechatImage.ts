import { useEffect, useState } from "react"

import type {
  CommunityQrCode,
  CommunityResourceSource,
} from "./communityResources"
import { loadCommunityWechatImage } from "./communityWechatImage"

export type CommunityWechatImageState =
  | {
      status: "loading" | "error"
      src?: never
      source?: never
      expiresAt?: never
    }
  | {
      status: "ready"
      src: string
      source: CommunityResourceSource
      expiresAt?: string
    }

/** Owns one image request and URL across the community menu and its preview. */
export function useCommunityWechatImage(
  qrCode?: CommunityQrCode,
): CommunityWechatImageState {
  const url = qrCode?.url
  const expiresAt = qrCode?.expiresAt
  const [state, setState] = useState<CommunityWechatImageState>({
    status: "loading",
  })
  useEffect(() => {
    setState({ status: "loading" })
    if (!url) return
    const controller = new AbortController()
    let objectUrl: string | undefined
    void loadCommunityWechatImage({ url, expiresAt }, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        let src: string
        if (result.source === "bundled") {
          src = result.url
        } else {
          src = objectUrl = URL.createObjectURL(result.blob)
        }
        setState({
          status: "ready",
          src,
          source: result.source,
          expiresAt: result.expiresAt,
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" })
      })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url, expiresAt])
  return state
}
