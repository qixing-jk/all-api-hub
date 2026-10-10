import { useCallback, useEffect, useRef, useState } from "react"

import {
  ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes,
  ACCOUNT_KEY_RESOURCE_REQUEST_SLOTS as requestSlots,
} from "~/features/KeyManagement/constants"
import type { ActiveResourceBoundary } from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import {
  accountContextsMatch,
  awaitAbortable,
  captureAccountContext,
  completeKeyMutationAnalytics,
  keyManagementAnalyticsContext,
  toFailure,
  USER_KEY_MANAGEMENT_EXECUTION,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import { useAccountKeyEditorSubmission } from "~/features/KeyManagement/resources/workflows/useAccountKeyEditorSubmission"
import { useAccountKeyResourceEditorState } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceEditorState"
import { useAccountKeyResourceRequestLifecycle } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceRequestLifecycle"
import type { AccountKeyCreationResult } from "~/services/accounts/keys/accountKeyCreation"
import type { CreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { openAccountKeyResourceSession } from "~/services/accounts/keys/openAccountKeyResourceSession"
import {
  AccountKeyResourceError,
  type AccountKeyCreationIntent,
  type EditableResourceProjection,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import { collectAccountKeyResourceInventory } from "~/services/apiAdapters/nativeResources/accountKeyResourceInventory"
import { startProductAnalyticsAction } from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import { createLogger } from "~/utils/core/logger"

/** A foreground creation owns one account and editor; lists, routes and existing-key actions remain in management. */
export function useAccountKeyCreation({
  account,
  intent,
  onCreated,
}: {
  account: DisplaySiteData | undefined
  intent?: AccountKeyCreationIntent
  onCreated: (result: AccountKeyCreationResult) => void | Promise<void>
}) {
  const inputs = useRef({ account, intent, onCreated })
  inputs.current = { account, intent, onCreated }
  const snapshot = account ? [captureAccountContext(account)] : []
  const observed = useRef(snapshot)
  const revision = useRef(0)
  if (!accountContextsMatch(observed.current, snapshot)) {
    observed.current = snapshot
    revision.current += 1
  }
  const contextKey = `${revision.current}:${JSON.stringify(intent)}`
  const [createdSecret, setCreatedSecret] =
    useState<CreatedRuntimeSecret | null>(null)
  const createdSecretRef = useRef<CreatedRuntimeSecret | null>(null)
  const editorState = useAccountKeyResourceEditorState(createdSecretRef)
  const {
    requests,
    requireFreshRead,
    acceptFreshRead,
    isFreshReadRequiredForBoundary,
  } = useAccountKeyResourceRequestLifecycle()
  const owner = useRef<{ boundary: ActiveResourceBoundary } | null>(null)
  const finished = useRef(false)
  const pendingSubmission = useRef<Promise<void> | null>(null)
  const [submissionRevision, setSubmissionRevision] = useState(0)
  const openedContextKey = useRef<string | null>(null)
  const uncertainBoundary = useRef<ActiveResourceBoundary | null>(null)
  const markUncertain = useCallback(
    (boundary: ActiveResourceBoundary) => {
      uncertainBoundary.current = boundary
      requireFreshRead(boundary)
    },
    [requireFreshRead],
  )
  const {
    beginOpening,
    isOpeningCurrent,
    acceptOpening,
    transitionEditorOpening,
    dispose,
    resetView,
    readRetryRequest,
    cancelOpening,
    close,
    readEditor,
    transitionEditor,
    captureReloadState,
    projectRehydration,
    acceptRehydration,
  } = editorState

  const open = useCallback(
    async (retryAttemptId?: number) => {
      const { account, intent } = inputs.current
      if (!account || finished.current || createdSecretRef.current) return
      const attempt = beginOpening(
        {
          mode: editorModes.Create,
        },
        () => requests.cancel(requestSlots.Action),
        retryAttemptId,
      )
      if (attempt === null) return
      const controller = new AbortController()
      requests.assign(requestSlots.Opening, controller)
      const version = requests.version()
      try {
        const session = await awaitAbortable(
          openAccountKeyResourceSession(
            account,
            USER_KEY_MANAGEMENT_EXECUTION,
            { signal: controller.signal },
          ),
          controller.signal,
        )
        if (!session) throw new AccountKeyResourceError({ code: "unavailable" })
        const scope = await awaitAbortable(
          session.resolveDefaultScope({ signal: controller.signal }),
          controller.signal,
        )
        const boundary = {
          accountId: account.id,
          siteType: account.siteType,
          scopeKey: scope.scopeKey,
          routeKey: scope.routeKey,
        }
        const native = await awaitAbortable(
          session.openCreateEditor(
            scope.scopeKey,
            { signal: controller.signal },
            intent,
          ),
          controller.signal,
        )
        if (version !== requests.version() || !isOpeningCurrent(attempt)) return
        owner.current = { boundary }
        acceptOpening(attempt, native, boundary, editorModes.Create)
      } catch (error) {
        if (
          version !== requests.version() ||
          !isOpeningCurrent(attempt) ||
          controller.signal.aborted
        )
          return
        transitionEditorOpening({
          attemptId: attempt,
          status: "failure",
          mode: editorModes.Create,
          failure: toFailure(error),
        })
      } finally {
        requests.release(requestSlots.Opening, controller)
      }
    },
    [
      beginOpening,
      requests,
      isOpeningCurrent,
      acceptOpening,
      transitionEditorOpening,
    ],
  )

  useEffect(
    () => () => {
      requests.dispose()
      requests.setInventoryLoading(false)
      dispose()
      openedContextKey.current = null
    },
    [requests, dispose],
  )

  useEffect(() => {
    // Reads can be replaced, but a dispatched write still owns its outcome.
    if (
      !finished.current &&
      !createdSecretRef.current &&
      !pendingSubmission.current &&
      openedContextKey.current !== contextKey
    ) {
      openedContextKey.current = contextKey
      requests.advance()
      dispose()
      owner.current = null
      resetView()
      void open()
    }
    return () => {
      requests.cancel(requestSlots.Opening)
      requests.cancel(requestSlots.Inventory)
      requests.setInventoryLoading(false)
    }
  }, [contextKey, submissionRevision, open, resetView, requests, dispose])

  const recoverUncertain = useCallback(
    async (boundary: ActiveResourceBoundary) => {
      const { account, intent } = inputs.current
      const state = captureReloadState(true, boundary.accountId)
      if (
        !account ||
        account.id !== boundary.accountId ||
        state.editorId === undefined ||
        requests.isInventoryLoading()
      )
        return
      const version = requests.version()
      const controller = new AbortController()
      requests.assign(requestSlots.Inventory, controller)
      requests.setInventoryLoading(true)
      try {
        const session = await awaitAbortable(
          openAccountKeyResourceSession(
            account,
            USER_KEY_MANAGEMENT_EXECUTION,
            { signal: controller.signal },
          ),
          controller.signal,
        )
        if (!session) throw new AccountKeyResourceError({ code: "unavailable" })
        const collection = await awaitAbortable(
          session.openCollection(boundary.scopeKey, {
            signal: controller.signal,
          }),
          controller.signal,
        )
        await awaitAbortable(
          collectAccountKeyResourceInventory(collection, {
            signal: controller.signal,
          }),
          controller.signal,
        )
        const native = await awaitAbortable(
          session.openCreateEditor(
            boundary.scopeKey,
            { signal: controller.signal },
            intent,
          ),
          controller.signal,
        )
        if (
          version !== requests.version() ||
          controller.signal.aborted ||
          readEditor()?.editorId !== state.editorId
        )
          return
        const projection = projectRehydration(native, boundary, state.editorId)
        owner.current = { boundary }
        acceptRehydration(projection, boundary)
        acceptFreshRead(boundary)
        uncertainBoundary.current = null
      } catch (error) {
        if (version === requests.version() && !controller.signal.aborted)
          transitionEditor((previous) =>
            previous ? { ...previous, feedback: toFailure(error) } : previous,
          )
      } finally {
        if (requests.owns(requestSlots.Inventory, controller))
          requests.setInventoryLoading(false)
        requests.release(requestSlots.Inventory, controller)
      }
    },
    [
      captureReloadState,
      requests,
      readEditor,
      projectRehydration,
      acceptRehydration,
      acceptFreshRead,
      transitionEditor,
    ],
  )

  const submit = useAccountKeyEditorSubmission({
    editorState,
    requests,
    requireFreshRead: markUncertain,
    mutationAnalyticsMode: PRODUCT_ANALYTICS_MODE_IDS.Single,
    resolveContext: () => {
      const current = owner.current
      if (
        !current ||
        finished.current ||
        createdSecretRef.current ||
        requests.isInventoryLoading() ||
        isFreshReadRequiredForBoundary(current.boundary)
      )
        return null
      return {
        boundary: current.boundary,
        resolveDestination: (native, values) => {
          // The accepted native editor validates its own destination; no management scope inventory is needed.
          const scopeKey = native.resolveDestinationScopeKey(values)
          return { ...current.boundary, scopeKey, routeKey: scopeKey }
        },
      }
    },
    onUncertain: recoverUncertain,
    onSubmitted: async (result) => {
      finished.current = true
      createdSecretRef.current = result.createdSecret ?? null
      setCreatedSecret(createdSecretRef.current)
      try {
        await inputs.current.onCreated({
          ...result,
          ref: result.facts?.ref ?? null,
        })
      } catch (error) {
        createLogger("AccountKeyCreation").error(
          "Created key handoff failed",
          error,
        )
      }
    },
  })
  const recordSecretAction = (
    actionId:
      | typeof PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey
      | typeof PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
    result: "success" | "failure",
  ) => {
    const tracker = startProductAnalyticsAction(
      keyManagementAnalyticsContext(
        actionId,
        PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRowActions,
      ),
    )
    completeKeyMutationAnalytics(
      tracker,
      result === "success"
        ? PRODUCT_ANALYTICS_RESULTS.Success
        : PRODUCT_ANALYTICS_RESULTS.Failure,
      PRODUCT_ANALYTICS_MODE_IDS.Single,
      createdSecret?.correlation.kind === "account-key-resource"
        ? createdSecret.correlation.ref.siteType
        : undefined,
    )
  }
  return {
    editor: editorState.editor,
    terminalCloseEditor: editorState.terminalCloseEditor,
    editorOpening: editorState.editorOpening,
    focusWorkflowId: editorState.focusWorkflowId,
    loadEditorOptions: editorState.loadEditorOptions,
    settleTerminalClose: editorState.settleTerminalClose,
    retryEditorOpening: (attempt: number) => {
      if (readRetryRequest(attempt)) void open(attempt)
    },
    cancelEditorOpening: (attempt: number) =>
      cancelOpening(attempt, () => requests.cancel(requestSlots.Opening)),
    closeEditor: (id: number) => {
      requests.cancel(requestSlots.Action)
      close(id)
    },
    setEditorValues: (id: number, values: EditableResourceProjection) =>
      transitionEditor((previous) =>
        previous?.editorId === id ? { ...previous, values } : previous,
      ),
    submitEditor: async (id: number, values: EditableResourceProjection) => {
      if (pendingSubmission.current) return pendingSubmission.current
      const version = requests.version()
      const run = (async () => {
        const boundary = owner.current?.boundary
        const blocked = uncertainBoundary.current
        if (
          boundary &&
          blocked?.accountId === boundary.accountId &&
          blocked.siteType === boundary.siteType
        ) {
          await recoverUncertain(blocked)
          return
        }
        await submit(id, values)
      })().finally(() => {
        pendingSubmission.current = null
        if (version === requests.version())
          setSubmissionRevision((previous) => previous + 1)
      })
      pendingSubmission.current = run
      return run
    },
    createdSecret,
    closeCreatedSecret: () => {
      createdSecretRef.current = null
      setCreatedSecret(null)
      editorState.setFocusWorkflowId(null)
    },
    recordCreatedSecretCopyResult: (result: "success" | "failure") =>
      recordSecretAction(
        PRODUCT_ANALYTICS_ACTION_IDS.CopyAccountTokenKey,
        result,
      ),
    recordCreatedSecretSaveResult: (result: "success" | "failure") =>
      recordSecretAction(
        PRODUCT_ANALYTICS_ACTION_IDS.SaveAccountTokenToApiCredentialProfile,
        result,
      ),
  }
}
