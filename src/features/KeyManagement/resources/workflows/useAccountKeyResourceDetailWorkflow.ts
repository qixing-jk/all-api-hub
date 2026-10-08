import { useCallback } from "react"
import type { Dispatch, RefObject, SetStateAction } from "react"

import {
  ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES as controllerModes,
  ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS as requestSlots,
} from "~/features/KeyManagement/constants"
import type {
  ControllerMode,
  DetailState,
  ResolveResourceActionContext,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  awaitAbortable,
  toFailure,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import type { AccountKeyResourceInventoryStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceInventoryState"
import type { AccountKeyResourceRequestLifecycle } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRequestLifecycle"
import type { AccountKeyResourceRouteStateOwner } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRouteState"
import {
  type AccountKeyResourceRef,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"

type WorkflowInputs = {
  runtime: { detailRequestEpoch: RefObject<number> }
  state: {
    mode: ControllerMode
    setDetail: Dispatch<SetStateAction<DetailState>>
    setDetailFailure: Dispatch<SetStateAction<ResourceFailure | null>>
    setIsDetailLoading: Dispatch<SetStateAction<boolean>>
  }
  actions: {
    isCurrentResourceRef: (ref: AccountKeyResourceRef) => boolean
    resolveResourceActionContext: ResolveResourceActionContext
  }
  requests: AccountKeyResourceRequestLifecycle
  inventoryState: AccountKeyResourceInventoryStateOwner
  routing: AccountKeyResourceRouteStateOwner
}

/** Owns detail commands while the controller coordinates shared lifecycle boundaries. */
export function useAccountKeyResourceDetailWorkflow({
  runtime: { detailRequestEpoch },
  state: { mode, setDetail, setDetailFailure, setIsDetailLoading },
  actions: { isCurrentResourceRef, resolveResourceActionContext },
  requests,
  inventoryState,
  routing,
}: WorkflowInputs) {
  const { createdSecretRef } = routing

  const { collectionRef } = inventoryState

  const openDetail = useCallback(
    async (ref: AccountKeyResourceRef) => {
      const collection = collectionRef.current
      if (
        mode !== controllerModes.Single ||
        createdSecretRef.current !== null ||
        requests.isInventoryLoading() ||
        !collection ||
        !isCurrentResourceRef(ref)
      )
        return
      requests.cancel(requestSlots.Action)
      const controller = new AbortController()
      requests.assign(requestSlots.Action, controller)
      const current = requests.version()
      const requestEpoch = ++detailRequestEpoch.current
      const isCurrentDetailRequest = () =>
        current === requests.version() &&
        requestEpoch === detailRequestEpoch.current &&
        requests.owns(requestSlots.Action, controller)
      setDetail(null)
      setDetailFailure(null)
      setIsDetailLoading(true)
      try {
        const actionContext = await resolveResourceActionContext(
          ref,
          controller,
        )
        if (!actionContext) return
        const facts = await awaitAbortable(
          actionContext.collection.get(ref, { signal: controller.signal }),
          controller.signal,
        )
        if (isCurrentDetailRequest()) {
          setDetail(facts)
          setDetailFailure(null)
        }
      } catch (error) {
        if (isCurrentDetailRequest()) setDetailFailure(toFailure(error))
      } finally {
        if (isCurrentDetailRequest()) setIsDetailLoading(false)
      }
    },
    [
      isCurrentResourceRef,
      mode,
      resolveResourceActionContext,
      collectionRef,
      createdSecretRef,
      requests,
      detailRequestEpoch,
      setDetail,
      setDetailFailure,
      setIsDetailLoading,
    ],
  )

  const closeDetail = useCallback(() => {
    detailRequestEpoch.current += 1
    requests.cancel(requestSlots.Action)
    setDetail(null)
    setDetailFailure(null)
    setIsDetailLoading(false)
  }, [
    detailRequestEpoch,
    requests,
    setDetail,
    setDetailFailure,
    setIsDetailLoading,
  ])
  return { openDetail, closeDetail }
}
