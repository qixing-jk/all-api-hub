export const NATIVE_RESOURCE_EDITOR_LOADING_REVEALS = {
  Delayed: "delayed",
  Immediate: "immediate",
} as const

export type NativeResourceEditorLoadingReveal =
  (typeof NATIVE_RESOURCE_EDITOR_LOADING_REVEALS)[keyof typeof NATIVE_RESOURCE_EDITOR_LOADING_REVEALS]

/** Provider-neutral launch state for an asynchronously prepared native editor. */
export type NativeResourceEditorOpeningState<TMode extends string, TFailure> =
  | { attemptId: number; status: "idle" }
  | {
      attemptId: number
      status: "loading"
      mode: TMode
      reveal: NativeResourceEditorLoadingReveal
    }
  | {
      attemptId: number
      status: "failure"
      mode: TMode
      failure: TFailure
    }
