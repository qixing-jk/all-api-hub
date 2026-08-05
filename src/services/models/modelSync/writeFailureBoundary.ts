export type ModelSyncWriteFailureBoundary = {
  capture(error: unknown): void
  matches(error: unknown): boolean
}

/** Tracks one write failure without retaining identity beyond its operation. */
export const createModelSyncWriteFailureBoundary =
  (): ModelSyncWriteFailureBoundary => {
    let captured = false
    let capturedError: unknown

    return {
      capture(error) {
        if (captured) return
        captured = true
        capturedError = error
      },
      matches(error) {
        return captured && Object.is(capturedError, error)
      },
    }
  }
