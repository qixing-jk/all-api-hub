import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { hasSub2ApiPanelProof } from "~/services/apiService/sub2api/auth/panelProofCapability"
import { isHttpUrl } from "~/utils/core/urlParsing"

/** Tracks positive website-session binding evidence for the current draft URL. */
export function useSub2ApiWebsiteSessionBinding({
  isOpen,
  siteSupportsRefreshToken,
  url,
  usesRefreshToken,
  isAcquiring,
}: {
  isOpen: boolean
  siteSupportsRefreshToken: boolean
  url: string
  usesRefreshToken: boolean
  isAcquiring: boolean
}) {
  const [boundSessionUrl, setBoundSessionUrl] = useState<string>()
  const proofLookupEpoch = useRef(0)
  const sessionUrl = url.trim()
  const canCheckWebsiteSession =
    isOpen && siteSupportsRefreshToken && isHttpUrl(sessionUrl)
  const rememberBoundSessionUrl = (confirmedUrl: string) => {
    if (isOpen && confirmedUrl === sessionUrl && isHttpUrl(confirmedUrl))
      setBoundSessionUrl(confirmedUrl)
  }
  const clearBoundSessionUrl = useCallback(() => {
    proofLookupEpoch.current += 1
    setBoundSessionUrl(undefined)
  }, [])
  useLayoutEffect(() => {
    setBoundSessionUrl((previous) =>
      canCheckWebsiteSession && previous === sessionUrl ? previous : undefined,
    )
  }, [canCheckWebsiteSession, sessionUrl])
  useLayoutEffect(() => {
    if (!canCheckWebsiteSession || isAcquiring) return
    const epoch = proofLookupEpoch.current
    let current = true
    void hasSub2ApiPanelProof(sessionUrl).then((confirmed) => {
      if (current && confirmed && epoch === proofLookupEpoch.current)
        setBoundSessionUrl(sessionUrl)
    })
    return () => {
      current = false
    }
  }, [canCheckWebsiteSession, sessionUrl, usesRefreshToken, isAcquiring])

  return {
    isWebsiteSessionBound:
      canCheckWebsiteSession && boundSessionUrl === sessionUrl,
    rememberBoundSessionUrl,
    clearBoundSessionUrl,
  }
}
