import { runCallbackOrPromise } from "~/utils/browser/browserAsyncApi"

type RuntimeUpdateCheckStatus = "throttled" | "no_update" | "update_available"

type RuntimeUpdateCheckResult = {
  status: RuntimeUpdateCheckStatus
  version?: string
}

type RuntimeRequestUpdateCheck = (
  callback?: (
    status: RuntimeUpdateCheckStatus,
    details?: { version?: string },
  ) => void,
) => Promise<RuntimeUpdateCheckResult | RuntimeUpdateCheckStatus> | void

/** Checks the browser-managed update channel across callback, Promise and hybrid hosts. */
export async function requestRuntimeUpdateCheck(): Promise<RuntimeUpdateCheckResult | null> {
  const requestUpdateCheck =
    ((globalThis as any).browser?.runtime?.requestUpdateCheck as
      | RuntimeRequestUpdateCheck
      | undefined) ??
    ((globalThis as any).chrome?.runtime?.requestUpdateCheck as
      | RuntimeRequestUpdateCheck
      | undefined)
  if (typeof requestUpdateCheck !== "function") return null
  return runCallbackOrPromise<RuntimeUpdateCheckResult>(
    (callback) => {
      const pending = requestUpdateCheck((status, details) =>
        callback({ status, version: details?.version }),
      )
      if (pending && typeof pending.then === "function")
        return pending.then((result) =>
          typeof result === "string" ? { status: result } : result,
        )
    },
    () =>
      (globalThis as any).browser?.runtime?.lastError ??
      (globalThis as any).chrome?.runtime?.lastError,
  )
}
