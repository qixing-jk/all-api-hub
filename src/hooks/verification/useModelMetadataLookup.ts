import { useCallback, useEffect, useRef, useState } from "react"

import { modelMetadataService } from "~/services/models/modelMetadata"

/** Refresh cached capability lookups in this UI context while verification is idle. */
export function useModelMetadataLookup(
  enabled: boolean,
  isBusy?: () => boolean,
) {
  const [lookup, publishLookup] = useState(() =>
    modelMetadataService.resolveModelIdentity.bind(modelMetadataService),
  )
  const pending = useRef(false)
  const busy = useRef(isBusy)
  busy.current = isBusy
  const applyPending = useCallback(() => {
    if (pending.current && !busy.current?.()) {
      pending.current = false
      publishLookup(() =>
        modelMetadataService.resolveModelIdentity.bind(modelMetadataService),
      )
    }
  }, [])
  useEffect(() => {
    if (!enabled) return
    let active = true
    void modelMetadataService.initialize().then(
      () => {
        if (active) {
          pending.current = true
          applyPending()
        }
      },
      () => {}, // The metadata service owns failure reporting and cached fallback.
    )
    return () => {
      active = false
    }
  }, [enabled, applyPending])
  // Probe completion rerenders the owner; publish a deferred update only then.
  useEffect(() => {
    if (enabled) applyPending()
  })
  return lookup
}
