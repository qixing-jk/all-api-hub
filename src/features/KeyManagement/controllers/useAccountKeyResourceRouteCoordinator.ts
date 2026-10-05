import { useCallback, useEffect } from "react"

import {
  ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES as controllerModes,
  ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS as requestSlots,
} from "../constants"
import type { ControllerMode } from "./accountKeyResourceControllerTypes"
import {
  accountContextsMatch,
  captureAccountContext,
  isAccountKeyResourceRouteTransitionAcknowledged,
} from "./accountKeyResourceWorkflowSupport"
import type { AccountKeyResourceEditorStateOwner } from "./useAccountKeyResourceEditorState"
import type { AccountKeyResourceInventoryStateOwner } from "./useAccountKeyResourceInventoryState"
import { type useAccountKeyResourceInventoryWorkflow } from "./useAccountKeyResourceInventoryWorkflow"
import type { AccountKeyResourceRequestLifecycle } from "./useAccountKeyResourceRequestLifecycle"
import type { AccountKeyResourceRouteStateOwner } from "./useAccountKeyResourceRouteState"

type Inputs = {
  routing: AccountKeyResourceRouteStateOwner
  editorState: AccountKeyResourceEditorStateOwner
  inventoryState: AccountKeyResourceInventoryStateOwner
  requests: AccountKeyResourceRequestLifecycle
  mode: ControllerMode
  selectedAccount: string
  load: ReturnType<typeof useAccountKeyResourceInventoryWorkflow>["load"]
  clearTerminalResourceState: (options?: {
    preserveCreatedSecret?: boolean
  }) => void
}

/** Coordinates route acknowledgement and account context changes without exposing one-time plaintext. */
export function useAccountKeyResourceRouteCoordinator({
  routing,
  editorState,
  inventoryState,
  requests,
  mode,
  selectedAccount,
  load,
  clearTerminalResourceState,
}: Inputs) {
  const {
    accountKey,
    routeAccountId,
    routeWorkspace,
    routeTransitionId,
    accountsRef,
    expectedRouteTransition,
    lastRouteObservation,
    lastAccountContextObservation,
    createdSecretRef,
    deferredSecretContextReload,
    transitionCreatedSecret,
  } = routing
  const { readEditor, abortEditorFieldLoads, setFocusWorkflowId } = editorState
  const { setIsScopeInventoryLoading } = inventoryState
  const deferSecretContextReload = useCallback(() => {
    // One-time plaintext remains available in this component only, but the
    // request context that produced the existing resource session is no longer
    // trustworthy. Drop every command owner before the secret can be closed.
    requests.advance()
    requests.cancel(requestSlots.Inventory)
    requests.release(requestSlots.Inventory)
    requests.cancel(requestSlots.Scopes)
    requests.release(requestSlots.Scopes)
    setIsScopeInventoryLoading(false)
    requests.cancel(requestSlots.Action)
    requests.release(requestSlots.Action)
    abortEditorFieldLoads()
    clearTerminalResourceState({ preserveCreatedSecret: true })
    requests.setInventoryLoading(true)
    deferredSecretContextReload.current = true
  }, [
    abortEditorFieldLoads,
    clearTerminalResourceState,
    deferredSecretContextReload,
    requests,
    setIsScopeInventoryLoading,
  ])
  useEffect(() => {
    const routeObservation = JSON.stringify([
      selectedAccount,
      routeAccountId,
      routeWorkspace,
      routeTransitionId,
    ])
    const routeChanged =
      lastRouteObservation.current !== null &&
      lastRouteObservation.current !== routeObservation
    lastRouteObservation.current = routeObservation
    const expectedTransition = expectedRouteTransition.current
    const selectedRouteAccount = accountsRef.current.find(
      (account) => account.id === selectedAccount,
    )
    const selectedAccountContext = selectedRouteAccount
      ? captureAccountContext(selectedRouteAccount)
      : null
    const previousContextObservation = lastAccountContextObservation.current
    const sameSelectedRoute =
      previousContextObservation?.mode === controllerModes.Single &&
      previousContextObservation.selectedAccount === selectedAccount &&
      previousContextObservation.routeAccountId === routeAccountId &&
      previousContextObservation.routeWorkspace === routeWorkspace
    const accountContextChanged =
      sameSelectedRoute &&
      !accountContextsMatch(
        previousContextObservation.context
          ? [previousContextObservation.context]
          : [],
        selectedAccountContext ? [selectedAccountContext] : [],
      )
    lastAccountContextObservation.current = {
      mode,
      selectedAccount,
      routeAccountId,
      routeWorkspace,
      context: selectedAccountContext,
    }
    const matchesExpectedTransition =
      isAccountKeyResourceRouteTransitionAcknowledged({
        expected: expectedTransition,
        generation: requests.version(),
        mode,
        transitionId: routeTransitionId,
        selectedAccount,
        selectedRouteSiteType: selectedRouteAccount?.siteType,
        routeAccountId,
        routeWorkspace,
      })
    // Any next route observation consumes the transition. A duplicate ID or a
    // coincidental value match cannot keep one-time plaintext alive.
    if (expectedTransition) expectedRouteTransition.current = null
    if (
      createdSecretRef.current !== null &&
      accountContextChanged &&
      !matchesExpectedTransition &&
      !routeChanged
    ) {
      deferSecretContextReload()
      return
    }
    if (
      createdSecretRef.current !== null &&
      !matchesExpectedTransition &&
      !routeChanged
    )
      return
    void load({
      preserveCreatedSecret: matchesExpectedTransition,
      ...(matchesExpectedTransition && expectedTransition
        ? { targetScopeKey: expectedTransition.scopeKey }
        : {}),
      preserveEditor:
        !matchesExpectedTransition &&
        mode === controllerModes.Single &&
        routeAccountId === selectedAccount &&
        !readEditor()?.terminalClose,
    })
    return () => {
      requests.advance()
      requests.cancel(requestSlots.Inventory)
      requests.cancel(requestSlots.Scopes)
      requests.release(requestSlots.Scopes)
    }
  }, [
    accountsRef,
    createdSecretRef,
    readEditor,
    expectedRouteTransition,
    lastAccountContextObservation,
    lastRouteObservation,
    requests,
    accountKey,
    deferSecretContextReload,
    load,
    mode,
    routeAccountId,
    routeTransitionId,
    routeWorkspace,
    selectedAccount,
  ])
  const closeCreatedSecret = useCallback(() => {
    const replayDeferredContext = deferredSecretContextReload.current
    deferredSecretContextReload.current = false
    transitionCreatedSecret(null)
    setFocusWorkflowId(null)
    if (replayDeferredContext) void load()
  }, [
    deferredSecretContextReload,
    transitionCreatedSecret,
    load,
    setFocusWorkflowId,
  ])
  return { closeCreatedSecret }
}
