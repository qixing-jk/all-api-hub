import { useCallback, useRef, useState } from "react"

import { KEY_MANAGEMENT_ROUTE_PARAMS } from "~/features/KeyManagement/constants"
import type {
  AccountContextObservation,
  AccountContextSnapshot,
  ExpectedRouteTransition,
  Options,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  accountContextsMatch,
  captureAccountContext,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import type { CreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"

let nextAccountKeyResourceControllerInstanceId = 0
/** Owns route observations, controller transition identity and one-time secret retention. */
export function useAccountKeyResourceRouteState({
  accounts,
  inventoryExecution,
  creationIntent,
  onCreated,
  routeParams,
  routeTransition,
  replaceRoute,
}: Omit<Options, "selectedAccount">) {
  const inventoryExecutionRef = useRef(inventoryExecution)
  inventoryExecutionRef.current = inventoryExecution
  const creationIntentRef = useRef(creationIntent)
  creationIntentRef.current = creationIntent
  const onCreatedRef = useRef(onCreated)
  onCreatedRef.current = onCreated
  const accountsRef = useRef(accounts)
  accountsRef.current = accounts
  const routeRef = useRef(routeParams)
  routeRef.current = routeParams
  const replaceRouteRef = useRef(replaceRoute)
  replaceRouteRef.current = replaceRoute
  const accountContextSnapshotsRef = useRef<readonly AccountContextSnapshot[]>(
    [],
  )
  const accountContextRevisionRef = useRef(0)
  const nextAccountContextSnapshots = accounts.map(captureAccountContext)
  if (
    !accountContextsMatch(
      accountContextSnapshotsRef.current,
      nextAccountContextSnapshots,
    )
  ) {
    accountContextSnapshotsRef.current = nextAccountContextSnapshots
    accountContextRevisionRef.current += 1
  }
  const accountKey = accounts
    .map((account) => `${account.id}:${account.siteType}`)
    .join("|")
    .concat(
      `:${accountContextRevisionRef.current}:${JSON.stringify(creationIntent)}:${JSON.stringify(inventoryExecution)}`,
    )
  const routeAccountId = routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]
  const routeWorkspace = routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]
  const routeTransitionId = routeTransition?.id
  const [createdSecret, setCreatedSecret] =
    useState<CreatedRuntimeSecret | null>(null)
  const createdSecretRef = useRef<CreatedRuntimeSecret | null>(null)
  const [routeTransitionInstanceId] = useState(
    () => ++nextAccountKeyResourceControllerInstanceId,
  )
  const routeTransitionSequence = useRef(0)
  const expectedRouteTransition = useRef<ExpectedRouteTransition | null>(null)
  const lastRouteObservation = useRef<string | null>(null)
  const lastAccountContextObservation =
    useRef<AccountContextObservation | null>(null)
  const deferredSecretContextReload = useRef(false)
  const transitionCreatedSecret = useCallback(
    (next: CreatedRuntimeSecret | null) => {
      createdSecretRef.current = next
      setCreatedSecret(next)
    },
    [],
  )
  const nextTransitionId = useCallback(
    () =>
      `account-key-resource-transition-${routeTransitionInstanceId}-${++routeTransitionSequence.current}`,
    [routeTransitionInstanceId],
  )
  const expectTransition = useCallback((next: ExpectedRouteTransition) => {
    expectedRouteTransition.current = next
  }, [])
  const clearDeferredContextReload = useCallback(() => {
    deferredSecretContextReload.current = false
  }, [])
  return {
    nextTransitionId,
    expectTransition,
    clearDeferredContextReload,
    inventoryExecutionRef,
    creationIntentRef,
    onCreatedRef,
    accountsRef,
    routeRef,
    replaceRouteRef,
    accountKey,
    routeAccountId,
    routeWorkspace,
    routeTransitionId,
    createdSecret,
    createdSecretRef,
    expectedRouteTransition,
    lastRouteObservation,
    lastAccountContextObservation,
    deferredSecretContextReload,
    transitionCreatedSecret,
  }
}
export type AccountKeyResourceRouteStateOwner = ReturnType<
  typeof useAccountKeyResourceRouteState
>
