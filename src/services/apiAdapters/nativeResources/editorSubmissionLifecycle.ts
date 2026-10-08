/** Owns concurrent submissions and terminal closure without interpreting results. */
export function createEditorSubmissionLifecycle<
  TValues,
  TOptions,
  TResult,
>(options: {
  onClosed(): Promise<TResult>
  execute(
    values: TValues,
    operationOptions: TOptions | undefined,
    close: () => void,
  ): Promise<TResult>
}) {
  let closed = false
  let inflight: Promise<TResult> | undefined

  const submit = (values: TValues, operationOptions?: TOptions) => {
    if (inflight !== undefined) return inflight
    if (closed) return options.onClosed()

    const run = options.execute(values, operationOptions, () => {
      closed = true
    })
    const tracked = run.finally(() => {
      if (inflight === tracked) inflight = undefined
    })
    inflight = tracked
    return tracked
  }

  return { submit }
}
