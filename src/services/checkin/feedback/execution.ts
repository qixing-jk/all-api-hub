import { autoCheckinStorage } from "~/services/checkin/autoCheckin/storage"

import {
  FEEDBACK_EXECUTION_RECORDS,
  FEEDBACK_EXECUTION_SOURCES,
} from "./executionTypes"
import type { CheckInFeedbackSnapshot } from "./report"

export type FeedbackExecutionEvidence = Pick<
  CheckInFeedbackSnapshot,
  "execution" | "executionRecord" | "executionSource"
>

/** Reads evidence without conflating a failed storage read with absent history. */
export async function readFeedbackExecution(
  accountId: string,
  provided?: CheckInFeedbackSnapshot["execution"],
): Promise<FeedbackExecutionEvidence> {
  if (provided)
    return {
      execution: provided,
      executionSource: FEEDBACK_EXECUTION_SOURCES.ProvidedResult,
    }
  try {
    const status = await autoCheckinStorage.getStatus({ throwOnError: true })
    return {
      execution: status?.perAccount?.[accountId],
      executionRecord: FEEDBACK_EXECUTION_RECORDS.NoHistory,
      executionSource: FEEDBACK_EXECUTION_SOURCES.SavedHistory,
    }
  } catch {
    return {
      executionRecord: FEEDBACK_EXECUTION_RECORDS.ReadFailed,
      executionSource: FEEDBACK_EXECUTION_SOURCES.SavedHistory,
    }
  }
}
