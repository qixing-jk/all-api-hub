import { useCallback, useRef, useState } from "react"
import type { RefObject } from "react"

import { ACCOUNT_KEY_RESOURCE_EDITOR_MODES as editorModes } from "~/features/KeyManagement/constants"
import type {
  ActiveResourceBoundary,
  EditorOpeningState,
  EditorOpenRequest,
  EditorState,
} from "~/features/KeyManagement/resources/workflows/accountKeyResourceControllerTypes"
import { mergeEditorValuesForScopeChange } from "~/features/KeyManagement/resources/workflows/accountKeyResourceWorkflowSupport"
import { useAccountKeyResourceEditorOptionsWorkflow } from "~/features/KeyManagement/resources/workflows/useAccountKeyResourceEditorOptionsWorkflow"
import type { CreatedRuntimeSecret } from "~/services/accounts/createdRuntimeSecret"
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
  return {
    readEditor,
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
    editorStateRef,
    terminalCloseEditor,
    terminalCloseEditorRef,
    editorOpening,
    editorRef,
    editorBoundaryRef,
    editorGeneration,
    editorInstanceId,
    editorOpeningAttemptId,
    editorWorkflowSequence,
    editorOpeningRef,
    editorOpeningRequestRef,
    transitionEditor,
    transitionTerminalCloseEditor,
    transitionEditorOpening,
    abortEditorFieldLoads,
  }
}
export type AccountKeyResourceEditorStateOwner = ReturnType<
  typeof useAccountKeyResourceEditorState
>
