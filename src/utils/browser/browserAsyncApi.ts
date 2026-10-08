/**
 * Native Chrome still has callback-only APIs below some Promise-support
 * milestones. Keep Firefox/native browser Promise calls separate, and consume
 * runtime.lastError inside the Chrome callback while it is available.
 */
export function runBrowserAsyncApi<T>(
  promiseCall: () => Promise<T>,
  callbackCall: (callback: (value: T) => void) => Promise<T> | void,
): Promise<T> {
  const nativeChrome = (globalThis as any).chrome
  if (!nativeChrome || browser !== nativeChrome) {
    return promiseCall()
  }

  return runCallbackOrPromise(
    callbackCall,
    () => nativeChrome.runtime?.lastError,
  )
}

/** Settles a callback/Promise hybrid once and consumes lastError inside its callback. */
export function runCallbackOrPromise<T>(
  invoke: (callback: (value: T) => void) => Promise<T> | void,
  readLastError: () => { message?: string } | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const pending = invoke((value) => {
      const error = readLastError()
      if (error) reject(new Error(error.message))
      else resolve(value)
    })
    pending?.then(resolve, reject)
  })
}
