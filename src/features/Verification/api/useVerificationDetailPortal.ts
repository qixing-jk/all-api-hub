import { useCallback, useLayoutEffect, useRef, useState } from "react"

import { moveVerificationPortalHost } from "./moveVerificationPortalHost"

/** Move a stable portal host across responsive targets without remounting editors. */
export function useVerificationDetailPortal(
  detailTarget: HTMLElement | null | undefined,
) {
  const [detailContainer] = useState(() => {
    const host = document.createElement("div")
    host.className = "contents"
    return host
  })
  const detailParkingRef = useRef<HTMLDivElement | null>(null)
  const attachDetailParking = useCallback(
    (node: HTMLDivElement | null) => {
      detailParkingRef.current = node
      if (node && !detailContainer.parentElement)
        node.appendChild(detailContainer)
    },
    [detailContainer],
  )
  useLayoutEffect(() => {
    // Move the portal host rather than React-owned editor nodes on resize.
    const target = detailTarget ?? detailParkingRef.current
    if (target && detailContainer.parentElement !== target)
      moveVerificationPortalHost(detailContainer, target)
  }, [detailContainer, detailTarget])
  return { detailContainer, attachDetailParking }
}
