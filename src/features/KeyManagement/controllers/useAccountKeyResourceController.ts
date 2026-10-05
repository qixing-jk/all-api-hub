import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { createDisplayAccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
import {
  type AccountKeyResourceRef,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
  type ProductAnalyticsSiteType,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"

import {
  ACCOUNT_KEY_RESOURCE_CONTROLLER_MODES as controllerModes,
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS as requestSlots,
} from "../constants"
import type {
  ActiveResourceBoundary,
  ControllerMode,
  DeleteState,
  DetailState,
  OpenAccountResources,
  Options,
  ResourceActionContext,
} from "./accountKeyResourceControllerTypes"
import {
  AUTOMATIC_INVENTORY_EXECUTION,
  awaitAbortable,
  boundaryFromResourceRef,
  keyManagementAnalyticsContext,
  USER_KEY_MANAGEMENT_EXECUTION,
} from "./accountKeyResourceWorkflowSupport"
import { useAccountKeyResourceDeletionWorkflow } from "./useAccountKeyResourceDeletionWorkflow"
import { useAccountKeyResourceDetailWorkflow } from "./useAccountKeyResourceDetailWorkflow"
import { useAccountKeyResourceEditorState } from "./useAccountKeyResourceEditorState"
import { useAccountKeyResourceEditorWorkflow } from "./useAccountKeyResourceEditorWorkflow"
import { useAccountKeyResourceInventoryState } from "./useAccountKeyResourceInventoryState"
import { useAccountKeyResourceInventoryWorkflow } from "./useAccountKeyResourceInventoryWorkflow"
import { useAccountKeyResourceRequestLifecycle } from "./useAccountKeyResourceRequestLifecycle"
import { useAccountKeyResourceRouteCoordinator } from "./useAccountKeyResourceRouteCoordinator"
import { useAccountKeyResourceRouteState } from "./useAccountKeyResourceRouteState"

export type { AccountKeyResourceRouteTransition } from "./accountKeyResourceControllerTypes"
export { isAccountKeyResourceRouteTransitionAcknowledged } from "./accountKeyResourceWorkflowSupport"

/** Owns native account-key resource loading and mutation state without exposing sessions. */
export function useAccountKeyResourceController({
  accounts,
  selectedAccount,
  inventoryExecution,
  creationIntent,
  onCreated,
  routeParams,
  routeTransition,
  replaceRoute,
}: Options) {
  const routing = useAccountKeyResourceRouteState({
    accounts,
    inventoryExecution,
    creationIntent,
    onCreated,
    routeParams,
    routeTransition,
    replaceRoute,
  })
  const {
    inventoryExecutionRef,
    accountsRef,
    createdSecret,
    createdSecretRef,
    transitionCreatedSecret,
  } = routing
  const mode: ControllerMode = !selectedAccount
    ? controllerModes.Idle
    : selectedAccount === KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE
      ? controllerModes.All
      : controllerModes.Single
  const mutationAnalyticsMode =
    mode === controllerModes.All
      ? PRODUCT_ANALYTICS_MODE_IDS.All
      : PRODUCT_ANALYTICS_MODE_IDS.Single
  const editorState = useAccountKeyResourceEditorState(routing.createdSecretRef)
  const {
    focusWorkflowId,
    loadEditorOptions,
    clearNativeOwner: clearEditorNativeOwner,
    resetView: resetEditorView,
    dispose: disposeEditor,
  } = editorState

  const { editor, terminalCloseEditor, editorOpening, abortEditorFieldLoads } =
    editorState
  const inventoryState = useAccountKeyResourceInventoryState({
    mode,
    selectedAccount,
    routing,
  })
  const {
    currentResourceBoundary,
    isCurrentResourceRef,
    isAcceptedResourceRef,
    rows,
    setSearch,
    selectScope,
    clearNativeOwner: clearInventoryNativeOwner,
  } = inventoryState

  const {
    scopes,
    selectedScope,
    acceptedRows,
    failures,
    scopeInventoryFailure,
    isScopeInventoryLoading,
    settledAccountIds,
    progress,
    isLoading,
    notice,
    search,
    statusFilter,
    setStatusFilter,
    activeResourceBoundaryRef,
    getResourceScope,
  } = inventoryState

  const {
    requests,
    requireFreshRead,
    acceptFreshRead,
    isFreshReadRequiredForBoundary,
  } = useAccountKeyResourceRequestLifecycle()
  const { t } = useTranslation()
  const [detail, setDetail] = useState<DetailState>(null)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [detailFailure, setDetailFailure] = useState<ResourceFailure | null>(
    null,
  )
  const [deleteState, setDeleteState] = useState<DeleteState>({
    isOpen: false,
    isExecuting: false,
    ref: null,
    failure: null,
  })
  const freshReadRequired =
    currentResourceBoundary !== null &&
    isFreshReadRequiredForBoundary(currentResourceBoundary)
  const detailRequestEpoch = useRef(0)

  const clearActiveResourceRefs = useCallback(() => {
    clearInventoryNativeOwner()
    clearEditorNativeOwner()
  }, [clearInventoryNativeOwner, clearEditorNativeOwner])

  const clearTerminalResourceState = useCallback(
    ({
      preserveCreatedSecret = false,
    }: { preserveCreatedSecret?: boolean } = {}) => {
      clearActiveResourceRefs()
      resetEditorView({ preserveCreatedSecret })
      setDetail(null)
      setIsDetailLoading(false)
      setDetailFailure(null)
      if (!preserveCreatedSecret) {
        transitionCreatedSecret(null)
      }
      setDeleteState({
        isOpen: false,
        isExecuting: false,
        ref: null,
        failure: null,
      })
    },
    [clearActiveResourceRefs, resetEditorView, transitionCreatedSecret],
  )

  const defaultOpenResources = useCallback<OpenAccountResources>(
    async (account, { signal, protectionBypassExecution }) => {
      const context = createDisplayAccountApiContext(account)
      if (!context.accountKeyResources) return null
      return await context.accountKeyResources.open(
        {
          account: {
            id: account.id,
            name: account.name,
            siteType: account.siteType,
          },
          request: { ...context.request, protectionBypassExecution },
        },
        { signal },
      )
    },
    [],
  )

  const openSession = useCallback(
    async (
      account: DisplaySiteData,
      signal: AbortSignal,
      protectionBypassExecution = inventoryExecutionRef.current ??
        AUTOMATIC_INVENTORY_EXECUTION,
    ) => {
      return await awaitAbortable(
        defaultOpenResources(account, { signal, protectionBypassExecution }),
        signal,
      )
    },
    [defaultOpenResources, inventoryExecutionRef],
  )

  const clearDialogs = useCallback(() => {
    requests.cancel(requestSlots.Action)
    requests.release(requestSlots.Action)
    abortEditorFieldLoads()
    clearTerminalResourceState()
  }, [requests, abortEditorFieldLoads, clearTerminalResourceState])

  const { load, retryScopeInventory } = useAccountKeyResourceInventoryWorkflow({
    state: {
      selectedAccount,
      mode,
      setDetail,
      setDeleteState,
    },
    actions: {
      clearDialogs,
      clearTerminalResourceState,
      clearActiveResourceRefs,
      openSession,
      acceptFreshRead,
    },
    requests,
    editorState,
    inventoryState,
    routing,
  })
  const { closeCreatedSecret } = useAccountKeyResourceRouteCoordinator({
    routing,
    editorState,
    inventoryState,
    requests,
    mode,
    selectedAccount,
    load,
    clearTerminalResourceState,
  })

  useEffect(
    () => () => {
      requests.dispose()
      disposeEditor()
      clearInventoryNativeOwner()
    },
    [requests, disposeEditor, clearInventoryNativeOwner],
  )

  const resolveResourceActionContext = useCallback(
    async (
      ref: AccountKeyResourceRef,
      controller: AbortController,
    ): Promise<ResourceActionContext | null> => {
      if (
        mode === controllerModes.Idle ||
        (mode === controllerModes.Single
          ? !isCurrentResourceRef(ref)
          : !isAcceptedResourceRef(ref))
      )
        return null
      const account = accountsRef.current.find(
        (candidate) =>
          candidate.id === ref.accountId && candidate.siteType === ref.siteType,
      )
      if (!account) return null
      const boundary =
        mode === controllerModes.Single
          ? activeResourceBoundaryRef.current!
          : boundaryFromResourceRef(ref)
      const session = await openSession(
        account,
        controller.signal,
        USER_KEY_MANAGEMENT_EXECUTION,
      )
      if (!session) return null
      const collection = await awaitAbortable(
        session.openCollection(ref.scopeKey, { signal: controller.signal }),
        controller.signal,
      )
      return { session, collection, boundary }
    },
    [
      isAcceptedResourceRef,
      isCurrentResourceRef,
      mode,
      openSession,
      accountsRef,
      activeResourceBoundaryRef,
    ],
  )

  const refreshAfterMutation = useCallback(
    async (
      targetBoundary?: ActiveResourceBoundary,
      routeTransitionId?: string,
      retryAccountIds?: readonly string[],
    ) => {
      const account = accountsRef.current.find(
        (candidate) => candidate.id === selectedAccount,
      )
      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          PRODUCT_ANALYTICS_ACTION_IDS.RefreshAccountTokens,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementHeader,
        ),
      )
      const accepted = await load({
        protectionBypassExecution: USER_KEY_MANAGEMENT_EXECUTION,
        preserveCreatedSecret: true,
        preserveRows: true,
        retryAccountIds,
        ...(targetBoundary ? { targetScopeKey: targetBoundary.scopeKey } : {}),
        ...(routeTransitionId === undefined ? {} : { routeTransitionId }),
      })
      tracker.complete(
        accepted
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          ...(accepted
            ? {}
            : { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }),
          insights: {
            mode:
              mode === controllerModes.All
                ? PRODUCT_ANALYTICS_MODE_IDS.All
                : PRODUCT_ANALYTICS_MODE_IDS.Single,
            ...(account
              ? { siteType: account.siteType as ProductAnalyticsSiteType }
              : {}),
            selectedCount:
              mode === controllerModes.All
                ? accountsRef.current.length
                : account
                  ? 1
                  : 0,
          },
        },
      )
      return accepted
    },
    [load, mode, selectedAccount, accountsRef],
  )

  const refresh = useCallback(async () => {
    if (createdSecretRef.current !== null) return false
    return await refreshAfterMutation()
  }, [refreshAfterMutation, createdSecretRef])

  /** Retries a settled failure set without rereading successful inventories. */
  const retryFailed = useCallback(async () => {
    const retryAccountIds = Object.keys(failures)
    if (
      mode !== controllerModes.All ||
      requests.isInventoryLoading() ||
      createdSecretRef.current !== null ||
      retryAccountIds.length === 0
    )
      return false
    return await refreshAfterMutation(undefined, undefined, retryAccountIds)
  }, [failures, mode, refreshAfterMutation, requests, createdSecretRef])
  const { openDetail, closeDetail } = useAccountKeyResourceDetailWorkflow({
    runtime: { detailRequestEpoch },
    state: { mode, setDetail, setDetailFailure, setIsDetailLoading },
    actions: { isCurrentResourceRef, resolveResourceActionContext },
    inventoryState,
    requests,
    routing,
  })
  const {
    openEditor,
    retryEditorOpening,
    cancelEditorOpening,
    closeEditor,
    settleTerminalClose,
    setEditorValues,
    submitEditor,
  } = useAccountKeyResourceEditorWorkflow({
    state: { mode, mutationAnalyticsMode, t },
    actions: {
      isFreshReadRequiredForBoundary,
      isAcceptedResourceRef,
      isCurrentResourceRef,
      resolveResourceActionContext,
      openSession,
      requireFreshRead,
      refreshAfterMutation,
    },
    inventoryState,
    requests,
    editorState,
    routing,
  })

  const { openDelete, cancelDelete, confirmDelete } =
    useAccountKeyResourceDeletionWorkflow({
      state: { mode, setDeleteState, deleteState, mutationAnalyticsMode },
      actions: {
        isFreshReadRequiredForBoundary,
        isAcceptedResourceRef,
        isCurrentResourceRef,
        resolveResourceActionContext,
        requireFreshRead,
        refreshAfterMutation,
      },
      requests,
      inventoryState,
      routing,
    })

  const recordCreatedSecretActionResult = useCallback(
    (
      actionId:
        | typeof PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey
        | typeof PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
      result: "success" | "failure",
    ) => {
      const siteType =
        createdSecret?.correlation.kind === "account-key-resource"
          ? createdSecret.correlation.ref.siteType
          : undefined
      const tracker = startProductAnalyticsAction(
        keyManagementAnalyticsContext(
          actionId,
          PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
        ),
      )
      tracker.complete(
        result === "success"
          ? PRODUCT_ANALYTICS_RESULTS.Success
          : PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          ...(result === "success"
            ? {}
            : { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown }),
          insights: {
            mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
            ...(siteType
              ? { siteType: siteType as ProductAnalyticsSiteType }
              : {}),
            selectedCount: 1,
          },
        },
      )
    },
    [createdSecret],
  )

  return {
    mode,
    scopes,
    selectedScope,
    rows,
    allRows: acceptedRows,
    getResourceScope,
    failures,
    scopeInventoryFailure,
    isScopeInventoryLoading,
    settledAccountIds,
    progress,
    isLoading,
    notice,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    detail,
    isDetailLoading,
    detailFailure,
    editor,
    terminalCloseEditor,
    editorOpening,
    createdSecret,
    focusWorkflowId,
    deleteState,
    freshReadRequired,
    refresh,
    retryScopeInventory,
    retryFailed,
    openDetail,
    closeDetail,
    selectScope,
    openCreate: () => openEditor(editorModes.Create),
    openEdit: (ref: AccountKeyResourceRef) => openEditor(editorModes.Edit, ref),
    closeEditor,
    settleTerminalClose,
    retryEditorOpening,
    cancelEditorOpening,
    setEditorValues,
    loadEditorOptions,
    submitEditor,
    closeCreatedSecret,
    recordCreatedSecretCopyResult: (result: "success" | "failure") =>
      recordCreatedSecretActionResult(
        PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey,
        result,
      ),
    recordCreatedSecretSaveResult: (result: "success" | "failure") =>
      recordCreatedSecretActionResult(
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
        result,
      ),
    openDelete,
    cancelDelete,
    confirmDelete,
  }
}
