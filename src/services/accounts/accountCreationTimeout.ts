import { t } from "~/utils/i18n/core"

export const MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS = 20000

const ACCOUNT_DATA_FETCH_TIMEOUT_ERROR_NAME = "AccountDataFetchTimeoutError"

/** Creates the localized error used when manual account data refresh times out. */
function createAccountDataFetchTimeoutError(): Error {
  const error = new Error(
    t("messages:errors.operation.accountDataFetchTimeout", {
      seconds: Math.ceil(MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS / 1000),
    }),
  )
  error.name = ACCOUNT_DATA_FETCH_TIMEOUT_ERROR_NAME
  return error
}

/** Bounds manual-add data refresh without cancelling the underlying request. */
export async function withManualAccountDataFetchTimeout<T>(
  promise: Promise<T>,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(createAccountDataFetchTimeoutError())
        }, MANUAL_ADD_ACCOUNT_DATA_FETCH_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
    }
  }
}
