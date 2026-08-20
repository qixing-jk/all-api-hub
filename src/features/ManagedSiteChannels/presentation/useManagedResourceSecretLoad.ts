import { useCallback, useEffect, useRef, useState } from "react"

import type {
  ResourceFieldDescriptor,
  ResourceFieldValue,
  ResourceOperationOptions,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import {
  MANAGED_RESOURCE_FIELD_TYPES,
  MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS,
} from "~/services/apiAdapters/contracts/managedResourceNative"

type Options = {
  descriptors: readonly ResourceFieldDescriptor[]
  onLoadSecret?: (
    fieldId: string,
    options?: ResourceOperationOptions,
  ) => Promise<string>
  onValueChange: (fieldId: string, value: ResourceFieldValue) => void
}

/** Owns one managed-resource editor session's cancelable secret-load state. */
export function useManagedResourceSecretLoad({
  descriptors,
  onLoadSecret,
  onValueChange,
}: Options) {
  const [isSecretRevealed, setIsSecretRevealed] = useState(false)
  const [loadedSecret, setLoadedSecret] = useState<{
    fieldId: string
    value: string
  }>()
  const [isSecretLoading, setIsSecretLoading] = useState(false)
  const [secretLoadFailed, setSecretLoadFailed] = useState(false)
  const secretLoadController = useRef<AbortController | undefined>(undefined)

  const cancelSecretLoad = useCallback(() => {
    secretLoadController.current?.abort()
    secretLoadController.current = undefined
    setIsSecretLoading(false)
    setSecretLoadFailed(false)
  }, [])

  const startSecretLoad = useCallback(
    (fieldId: string) => {
      if (!onLoadSecret) return
      const controller = new AbortController()
      secretLoadController.current?.abort()
      secretLoadController.current = controller
      setIsSecretLoading(true)
      setSecretLoadFailed(false)
      void onLoadSecret(fieldId, { signal: controller.signal })
        .then((value) => {
          if (!controller.signal.aborted) {
            setLoadedSecret({ fieldId, value })
            setIsSecretRevealed(true)
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setSecretLoadFailed(true)
        })
        .finally(() => {
          if (secretLoadController.current === controller) {
            secretLoadController.current = undefined
            setIsSecretLoading(false)
          }
        })
    },
    [onLoadSecret],
  )

  const secretFieldSignature = descriptors
    .filter(
      (descriptor) => descriptor.type === MANAGED_RESOURCE_FIELD_TYPES.Secret,
    )
    .map(
      (descriptor) =>
        `${descriptor.fieldId}:${descriptor.secretState}:${descriptor.canLoadSecret}:${descriptor.canReplace}`,
    )
    .join("|")

  useEffect(() => {
    setLoadedSecret(undefined)
    setIsSecretRevealed(false)
    setIsSecretLoading(false)
    setSecretLoadFailed(false)
    return () => {
      secretLoadController.current?.abort()
      secretLoadController.current = undefined
    }
  }, [onLoadSecret, secretFieldSignature])

  const handleSecretInput = useCallback(
    (fieldId: string, value: string) => {
      cancelSecretLoad()
      setLoadedSecret(undefined)
      onValueChange(
        fieldId,
        value
          ? {
              kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Replace,
              value,
            }
          : { kind: MANAGED_RESOURCE_SECRET_EDIT_INTENT_KINDS.Unchanged },
      )
    },
    [cancelSecretLoad, onValueChange],
  )

  return {
    loadedSecret,
    isSecretRevealed,
    isSecretLoading,
    secretLoadFailed,
    canLoadSecret: Boolean(onLoadSecret),
    setIsSecretRevealed,
    startSecretLoad,
    cancelSecretLoad,
    handleSecretInput,
  }
}
