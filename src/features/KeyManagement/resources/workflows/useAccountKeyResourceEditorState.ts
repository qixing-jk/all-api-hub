import type { RefObject } from "react"
import { useCallback, useRef, useState } from "react"

import { ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes } from "~/features/KeyManagement/constants"
import type {
  ActiveResourceBoundary,
  EditorMode,
  EditorOpeningState,
  EditorOpenRequest,
  EditorState,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import { mergeEditorValuesForScopeChange } from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import { useAccountKeyResourceEditorOptionsWorkflow } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceEditorOptionsWorkflow"
import { NATIVE_RESOURCE_EDITOR_LOADING_REVEALS } from "~/features/ResourceEditor/opening/nativeResourceEditorOpeningState"
import type { CreatedRuntimeSecret } from "~/services/accounts/keys/createdRuntimeSecret"
import { type AccountKeyResourceEditor } from "~/services/apiAdapters/contracts/accountKeyResource"

/** Owns editor state and its authoritative asynchronous projections. */
export function useAccountKeyResourceEditorState(
  createdSecretRef: RefObject<CreatedRuntimeSecret | null>,
) {
  const [focusWorkflowId, setFocusWorkflowId] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState>(null)
  const editorStateRef = useRef<EditorState>(editor)
  editorStateRef.current = editor
  // The closing shell survives refresh until Modal settles focus. It is not an active native editor.
  const [terminalCloseEditor, setTerminalCloseEditor] =
    useState<EditorState>(null)
  const terminalCloseEditorRef = useRef<EditorState>(terminalCloseEditor)
  terminalCloseEditorRef.current = terminalCloseEditor
  const [editorOpening, setEditorOpening] = useState<EditorOpeningState>({
    attemptId: 0,
    status: "idle",
  })
  const editorRef = useRef<AccountKeyResourceEditor | null>(null)
  const editorBoundaryRef = useRef<ActiveResourceBoundary | null>(null)
  const editorFieldGenerations = useRef<Record<string, number>>({})
  const editorFieldDependencySignatures = useRef(new Map<string, string>())
  const editorGeneration = useRef(0)
  const editorInstanceId = useRef(0)
  const editorOpeningAttemptId = useRef(0)
  const editorWorkflowSequence = useRef(0)
  const editorOpeningRef = useRef<EditorOpeningState>(editorOpening)
  editorOpeningRef.current = editorOpening
  const editorOpeningRequestRef = useRef<EditorOpenRequest | null>(null)
  const editorFieldAbortControllers = useRef(new Map<string, AbortController>())
  // Async completions can precede a React commit: update the authoritative projection synchronously.
  const transitionEditor = useCallback(
    (transition: (current: EditorState) => EditorState) => {
      const next = transition(editorStateRef.current)
      editorStateRef.current = next
      setEditor(next)
      return next
    },
    [],
  )
  const transitionTerminalCloseEditor = useCallback((next: EditorState) => {
    terminalCloseEditorRef.current = next
    setTerminalCloseEditor(next)
  }, [])
  const transitionEditorOpening = useCallback((next: EditorOpeningState) => {
    editorOpeningRef.current = next
    setEditorOpening(next)
  }, [])
  const abortEditorFieldLoads = useCallback(() => {
    editorGeneration.current += 1
    editorFieldAbortControllers.current.forEach((controller) =>
      controller.abort(),
    )
    editorFieldAbortControllers.current.clear()
    editorFieldGenerations.current = {}
    editorFieldDependencySignatures.current.clear()
  }, [])
  const clearNativeOwner = useCallback(() => {
    editorRef.current = null
    editorBoundaryRef.current = null
  }, [])
  const resetView = useCallback(
    ({
      preserveCreatedSecret = false,
    }: { preserveCreatedSecret?: boolean } = {}) => {
      editorOpeningRequestRef.current = null
      transitionEditorOpening({
        attemptId: editorOpeningAttemptId.current,
        status: "idle",
      })
      transitionEditor(() => null)
      if (!preserveCreatedSecret) {
        transitionTerminalCloseEditor(null)
        setFocusWorkflowId(null)
      }
    },
    [transitionEditorOpening, transitionEditor, transitionTerminalCloseEditor],
  )
  const dispose = useCallback(() => {
    abortEditorFieldLoads()
    clearNativeOwner()
  }, [abortEditorFieldLoads, clearNativeOwner])
  const { loadEditorOptions } = useAccountKeyResourceEditorOptionsWorkflow({
    runtime: {
      editorStateRef,
      editorRef,
      createdSecretRef,
      editorGeneration,
      editorFieldGenerations,
      editorFieldAbortControllers,
      editorFieldDependencySignatures,
    },
    actions: { transitionEditor },
  })
  const readEditor = useCallback(() => editorStateRef.current, [])
  const captureReloadState = useCallback(
    (preserve: boolean | undefined, accountId: string) => {
      const current = preserve ? editorStateRef.current : null
      const boundary = editorBoundaryRef.current
      return {
        editorId: current?.editorId,
        preserveEditor:
          current?.mode === editorModes.Create &&
          !current.terminalClose &&
          boundary?.accountId === accountId,
      }
    },
    [],
  )
  const resetForSecretRefresh = useCallback(() => {
    const terminal = editorStateRef.current ?? terminalCloseEditorRef.current
    abortEditorFieldLoads()
    editorRef.current = null
    transitionEditor(() => null)
    if (!terminal?.terminalRetainsFocusWorkflow) setFocusWorkflowId(null)
  }, [abortEditorFieldLoads, transitionEditor])
  const projectRehydration = useCallback(
    (
      nativeEditor: AccountKeyResourceEditor,
      boundary: ActiveResourceBoundary,
      preservedEditorId: number,
    ) => {
      const current = editorStateRef.current
      if (
        current?.mode !== editorModes.Create ||
        current.editorId !== preservedEditorId
      )
        return null
      const state: Exclude<EditorState, null> = {
        // A replacement native contract owns a new dialog and dynamic option cache.
        editorId: ++editorInstanceId.current,
        siteType: boundary.siteType,
        mode: editorModes.Create,
        fields: nativeEditor.fields,
        initialValues: nativeEditor.initialValues,
        values: mergeEditorValuesForScopeChange(current.values, nativeEditor),
        optionsByField: {},
        optionFailuresByField: {},
        loadingFieldIds: [],
        feedback: null,
      }
      return { nativeEditor, state }
    },
    [],
  )
  const acceptRehydration = useCallback(
    (
      projection: ReturnType<typeof projectRehydration>,
      boundary: ActiveResourceBoundary,
    ) => {
      editorRef.current = projection?.nativeEditor ?? null
      editorBoundaryRef.current = projection ? boundary : null
      if (projection) transitionEditor(() => projection.state)
    },
    [transitionEditor],
  )
  const beginOpening = useCallback(
    (
      request: EditorOpenRequest,
      cancelAction: () => void,
      retryAttemptId?: number,
    ) => {
      const previous = editorOpeningRef.current
      if (
        retryAttemptId !== undefined
          ? previous.status !== "failure" ||
            previous.attemptId !== retryAttemptId
          : previous.status === "loading"
      )
        return null
      abortEditorFieldLoads()
      cancelAction()
      clearNativeOwner()
      transitionEditor(() => null)
      if (retryAttemptId === undefined)
        setFocusWorkflowId(
          `account-key-resource-editor-${++editorWorkflowSequence.current}`,
        )
      const attemptId = ++editorOpeningAttemptId.current
      editorOpeningRequestRef.current = request
      transitionEditorOpening({
        attemptId,
        status: "loading",
        mode: request.mode,
        reveal:
          retryAttemptId === undefined
            ? NATIVE_RESOURCE_EDITOR_LOADING_REVEALS.Delayed
            : NATIVE_RESOURCE_EDITOR_LOADING_REVEALS.Immediate,
      })
      return attemptId
    },
    [
      abortEditorFieldLoads,
      clearNativeOwner,
      transitionEditor,
      transitionEditorOpening,
    ],
  )
  const isOpeningCurrent = useCallback(
    (attemptId: number) =>
      editorOpeningRef.current.status === "loading" &&
      editorOpeningRef.current.attemptId === attemptId,
    [],
  )
  const acceptOpening = useCallback(
    (
      attemptId: number,
      nativeEditor: AccountKeyResourceEditor,
      boundary: ActiveResourceBoundary,
      mode: EditorMode,
    ) => {
      if (!isOpeningCurrent(attemptId)) return
      editorRef.current = nativeEditor
      editorBoundaryRef.current = boundary
      transitionEditor(() => ({
        editorId: ++editorInstanceId.current,
        siteType: boundary.siteType,
        mode,
        fields: nativeEditor.fields,
        initialValues: nativeEditor.initialValues,
        values: nativeEditor.initialValues,
        optionsByField: {},
        optionFailuresByField: {},
        loadingFieldIds: [],
        feedback: null,
      }))
      editorOpeningRequestRef.current = null
      transitionEditorOpening({ attemptId, status: "idle" })
    },
    [isOpeningCurrent, transitionEditor, transitionEditorOpening],
  )
  const readRetryRequest = useCallback(
    (attemptId: number) =>
      editorOpeningRef.current.status === "failure" &&
      editorOpeningRef.current.attemptId === attemptId
        ? editorOpeningRequestRef.current
        : null,
    [],
  )
  const cancelOpening = useCallback(
    (attemptId: number, cancelAction: () => void) => {
      const opening = editorOpeningRef.current
      if (
        opening.attemptId !== attemptId ||
        (opening.status !== "loading" && opening.status !== "failure")
      )
        return false
      const nextAttemptId = ++editorOpeningAttemptId.current
      cancelAction()
      editorOpeningRequestRef.current = null
      transitionEditorOpening({ attemptId: nextAttemptId, status: "idle" })
      setFocusWorkflowId(null)
      return true
    },
    [transitionEditorOpening],
  )
  const close = useCallback(
    (editorId: number) => {
      const current = editorStateRef.current
      if (current?.editorId !== editorId) return
      abortEditorFieldLoads()
      clearNativeOwner()
      editorOpeningRequestRef.current = null
      transitionEditorOpening({
        attemptId: editorOpeningAttemptId.current,
        status: "idle",
      })
      transitionEditor(() => null)
      if (!current.terminalRetainsFocusWorkflow) setFocusWorkflowId(null)
    },
    [
      abortEditorFieldLoads,
      clearNativeOwner,
      transitionEditorOpening,
      transitionEditor,
    ],
  )
  const captureSubmission = useCallback(() => {
    const version = editorGeneration.current
    const state = editorStateRef.current
    return {
      nativeEditor: editorRef.current,
      state,
      boundary: editorBoundaryRef.current,
      isCurrent: () =>
        editorGeneration.current === version &&
        editorStateRef.current?.editorId === state?.editorId,
    }
  }, [])
  const completeSubmission = useCallback(
    (editorId: number, retainsFocus: boolean) => {
      const current = editorStateRef.current
      if (current?.editorId !== editorId) return
      transitionTerminalCloseEditor({
        ...current,
        terminalClose: true,
        terminalRetainsFocusWorkflow: retainsFocus,
      })
      clearNativeOwner()
      transitionEditor(() => null)
    },
    [transitionTerminalCloseEditor, clearNativeOwner, transitionEditor],
  )
  const settleTerminalClose = useCallback(
    (editorId: number) => {
      if (terminalCloseEditorRef.current?.editorId === editorId)
        transitionTerminalCloseEditor(null)
    },
    [transitionTerminalCloseEditor],
  )
  return {
    readEditor,
    beginOpening,
    isOpeningCurrent,
    acceptOpening,
    readRetryRequest,
    cancelOpening,
    close,
    captureSubmission,
    completeSubmission,
    settleTerminalClose,
    captureReloadState,
    resetForSecretRefresh,
    projectRehydration,
    acceptRehydration,
    focusWorkflowId,
    setFocusWorkflowId,
    clearNativeOwner,
    resetView,
    dispose,
    loadEditorOptions,
    editor,
    terminalCloseEditor,
    editorOpening,
    transitionEditor,
    transitionEditorOpening,
    abortEditorFieldLoads,
  }
}
export type AccountKeyResourceEditorStateOwner = ReturnType<
  typeof useAccountKeyResourceEditorState
>
