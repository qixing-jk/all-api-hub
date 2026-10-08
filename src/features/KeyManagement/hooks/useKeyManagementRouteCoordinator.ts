import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import {
  KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES,
  KEY_MANAGEMENT_ROUTE_PARAMS,
  type KeyManagementAssociationTargetLookupState,
} from "~/features/KeyManagement/constants"
import {
  useAccountKeyResourceController,
  type AccountKeyResourceRouteTransition,
} from "~/features/KeyManagement/controllers/useAccountKeyResourceController"
import {
  getCredentialAssociationForLocator,
  KEY_CREDENTIAL_ASSOCIATION_STATES,
} from "~/features/KeyManagement/credentialAssociations"
import { type useKeyManagement } from "~/features/KeyManagement/hooks/useKeyManagement"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  getAccountRuntimeKeyLocatorAccountId,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import type { ApiCredentialProfileLink } from "~/types/apiCredentialProfiles"
import { replaceWithinOptionsPage } from "~/utils/navigation/optionsPage"

/** Apply key deep-link transitions only while the keys page is active. */
function replaceActiveKeysRoute(params?: Record<string, string | undefined>) {
  const currentPage = window.location.hash.slice(1).split("?")[0]
  if (currentPage && currentPage !== MENU_ITEM_IDS.KEYS) return
  replaceWithinOptionsPage(`#${MENU_ITEM_IDS.KEYS}`, params)
}

const getRouteSignature = (params?: Record<string, string | undefined>) =>
  JSON.stringify(
    Object.entries(params ?? {})
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  )

const getAssociationLocatorWorkspace = (locator: AccountRuntimeKeyLocator) =>
  locator.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource
    ? locator.ref.scopeKey
    : undefined

type RouteCoordinatorInput = {
  routeParams?: Record<string, string>
  credentialProfileLinks: ApiCredentialProfileLink[]
  inventory: Pick<
    ReturnType<typeof useKeyManagement>,
    | "displayData"
    | "selectedAccount"
    | "setSelectedAccount"
    | "searchTerm"
    | "setSearchTerm"
    | "setAllAccountsFilterAccountIds"
  >
}
/** Coordinate association deep links and native route acknowledgements in one owner. */
export function useKeyManagementRouteCoordinator({
  routeParams,
  credentialProfileLinks,
  inventory,
}: RouteCoordinatorInput) {
  const {
    displayData,
    selectedAccount,
    setSelectedAccount,
    searchTerm,
    setSearchTerm,
    setAllAccountsFilterAccountIds,
  } = inventory
  const acknowledgedNativeRouteTransitionIdRef = useRef<string | null>(null)
  const routeAssociationId =
    routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.AssociationId]
  const routeAccountId = routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]
  const routeWorkspace = routeParams?.[KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]
  const associationNavigationActiveRef = useRef(Boolean(routeAssociationId))
  const [pendingNativeRoute, setPendingNativeRoute] = useState<{
    params: Record<string, string>
    transition: AccountKeyResourceRouteTransition
    sourceRouteSignature: string
  } | null>(null)
  const requestedAssociation = useMemo<ApiCredentialProfileLink | null>(
    () =>
      routeAssociationId
        ? credentialProfileLinks.find(
            (link) => link.id === routeAssociationId,
          ) ?? null
        : null,
    [credentialProfileLinks, routeAssociationId],
  )
  const associationNeedsConfirmation = useMemo(() => {
    if (!requestedAssociation) return null
    const association = getCredentialAssociationForLocator(
      credentialProfileLinks,
      requestedAssociation.locator,
    )
    return !(
      association.status === KEY_CREDENTIAL_ASSOCIATION_STATES.Linked &&
      association.associationId === requestedAssociation.id
    )
  }, [credentialProfileLinks, requestedAssociation])
  const associationTarget = requestedAssociation
  const [associationTargetStatus, setAssociationTargetStatus] =
    useState<KeyManagementAssociationTargetLookupState>(
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Locating,
    )

  useEffect(() => {
    associationNavigationActiveRef.current = Boolean(routeAssociationId)
    setAssociationTargetStatus(
      KEY_MANAGEMENT_ASSOCIATION_TARGET_STATES.Locating,
    )
  }, [routeAssociationId])

  const routeSignature = getRouteSignature(routeParams)
  const routeTransition =
    pendingNativeRoute &&
    getRouteSignature(pendingNativeRoute.params) === routeSignature
      ? pendingNativeRoute.transition
      : undefined

  const nativeKeys = useAccountKeyResourceController({
    accounts: displayData,
    selectedAccount,
    routeParams,
    routeTransition,
    replaceRoute: (params, transition) => {
      const nextParams = { ...params }
      if (params[KEY_MANAGEMENT_ROUTE_PARAMS.AccountId] === routeAccountId) {
        for (const key of [
          KEY_MANAGEMENT_ROUTE_PARAMS.GuidedImport,
          KEY_MANAGEMENT_ROUTE_PARAMS.TokenId,
        ]) {
          const value = routeParams?.[key]
          if (value !== undefined) nextParams[key] = value
        }
      }
      if (associationNavigationActiveRef.current && routeAssociationId) {
        nextParams[KEY_MANAGEMENT_ROUTE_PARAMS.AssociationId] =
          routeAssociationId
      }
      if (transition) {
        const pending = {
          params: nextParams,
          transition,
          sourceRouteSignature: routeSignature,
        }
        acknowledgedNativeRouteTransitionIdRef.current = null
        setPendingNativeRoute(pending)
      } else {
        acknowledgedNativeRouteTransitionIdRef.current = null
        setPendingNativeRoute(null)
      }
      replaceActiveKeysRoute(nextParams)
    },
  })

  useEffect(() => {
    if (!associationTarget) return

    const accountId = getAccountRuntimeKeyLocatorAccountId(
      associationTarget.locator,
    )
    const workspaceScopeKey = getAssociationLocatorWorkspace(
      associationTarget.locator,
    )
    // A reload temporarily clears the scope inventory. Retain this account's
    // route until its scope can be resolved, so navigation cannot replay loading.
    const workspace =
      (selectedAccount === accountId
        ? nativeKeys.scopes.find(
            (scope) => scope.scopeKey === workspaceScopeKey,
          )?.routeKey
        : undefined) ??
      (routeAccountId === accountId ? routeWorkspace : undefined)
    const nextParams = {
      [KEY_MANAGEMENT_ROUTE_PARAMS.AssociationId]: associationTarget.id,
      [KEY_MANAGEMENT_ROUTE_PARAMS.AccountId]: accountId,
      ...(workspace
        ? { [KEY_MANAGEMENT_ROUTE_PARAMS.Workspace]: workspace }
        : {}),
    }

    setSearchTerm("")
    setAllAccountsFilterAccountIds([])
    setSelectedAccount(accountId)
    if (getRouteSignature(nextParams) !== routeSignature) {
      replaceActiveKeysRoute(nextParams)
    }
  }, [
    associationTarget,
    nativeKeys.scopes,
    routeAccountId,
    routeSignature,
    routeWorkspace,
    selectedAccount,
    setAllAccountsFilterAccountIds,
    setSearchTerm,
    setSelectedAccount,
  ])

  const setNativeSearch = nativeKeys.setSearch
  useEffect(() => {
    setNativeSearch(searchTerm)
  }, [searchTerm, setNativeSearch])

  useEffect(() => {
    if (!pendingNativeRoute) return
    if (routeTransition) {
      acknowledgedNativeRouteTransitionIdRef.current = routeTransition.id
      return
    }
    if (
      acknowledgedNativeRouteTransitionIdRef.current ===
        pendingNativeRoute.transition.id ||
      routeSignature !== pendingNativeRoute.sourceRouteSignature
    ) {
      acknowledgedNativeRouteTransitionIdRef.current = null
      setPendingNativeRoute(null)
    }
  }, [pendingNativeRoute, routeSignature, routeTransition])

  const handleAccountSummaryClick = (accountId: string) => {
    associationNavigationActiveRef.current = false
    if (routeAssociationId) {
      replaceActiveKeysRoute(
        selectedAccount ? { accountId: selectedAccount } : undefined,
      )
    }
    setAllAccountsFilterAccountIds((currentAccountIds) =>
      currentAccountIds.includes(accountId)
        ? currentAccountIds.filter((id) => id !== accountId)
        : [...currentAccountIds, accountId],
    )
  }

  const handleSelectedAccountChange = useCallback(
    (accountId: string) => {
      associationNavigationActiveRef.current = false
      setSelectedAccount(accountId)
      acknowledgedNativeRouteTransitionIdRef.current = null
      setPendingNativeRoute(null)
      replaceActiveKeysRoute(accountId ? { accountId } : undefined)
    },
    [setSelectedAccount],
  )

  const clearAssociationTarget = useCallback(() => {
    associationNavigationActiveRef.current = false
    replaceActiveKeysRoute(
      selectedAccount ? { accountId: selectedAccount } : undefined,
    )
  }, [selectedAccount])

  const handleSearchTermChange = useCallback(
    (value: string) => {
      if (routeAssociationId) clearAssociationTarget()
      setSearchTerm(value)
    },
    [clearAssociationTarget, routeAssociationId, setSearchTerm],
  )

  return {
    nativeKeys,
    routeAssociationId,
    requestedAssociation,
    associationNeedsConfirmation,
    associationTarget,
    associationTargetStatus,
    setAssociationTargetStatus,
    handleAccountSummaryClick,
    handleSelectedAccountChange,
    clearAssociationTarget,
    handleSearchTermChange,
  }
}
