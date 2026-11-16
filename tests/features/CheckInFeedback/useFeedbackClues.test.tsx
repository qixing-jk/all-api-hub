import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useFeedbackClues } from "~/features/CheckInFeedback/useFeedbackClues"
import { collectFeedbackCluesInBrowser } from "~/services/checkin/feedback/scanClient"
import {
  FEEDBACK_SCAN_STATUSES,
  type CheckInFeedbackClues,
} from "~/services/checkin/feedback/scanTypes"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/services/checkin/feedback/scanClient", () => ({
  collectFeedbackCluesInBrowser: vi.fn(),
}))
afterEach(() => vi.clearAllMocks())

describe("feedback clue collection", () => {
  it.each(["success", "failure"] as const)(
    "aborts the previous site scan and ignores its late %s after the source changes",
    async (outcome) => {
      const previous = createDeferred<CheckInFeedbackClues>()
      vi.mocked(collectFeedbackCluesInBrowser)
        .mockReturnValueOnce(previous.promise)
        .mockResolvedValueOnce({
          status: FEEDBACK_SCAN_STATUSES.Completed,
          routes: ["/api/checkin"],
          statusQueries: [],
          authenticatedQueriesUnavailable: false,
        })
      const source = {
        baseUrl: "https://first.example.com",
        siteType: SITE_TYPES.NEW_API,
        checkIn: buildCheckInConfig(),
      }
      const { result, rerender } = renderHook(
        ({ snapshot }) => useFeedbackClues(snapshot),
        { initialProps: { snapshot: source } },
      )
      const signal = vi.mocked(collectFeedbackCluesInBrowser).mock.calls[0]![1]!
      rerender({
        snapshot: { ...source, baseUrl: "https://second.example.com" },
      })
      await waitFor(() =>
        expect(result.current.scanStatus).toBe(
          FEEDBACK_SCAN_STATUSES.Completed,
        ),
      )
      const accepted = result.current.clues
      expect(signal.aborted).toBe(true)
      await act(async () => {
        if (outcome === "failure")
          previous.reject(new Error("Previous site unavailable"))
        else
          previous.resolve({
            status: FEEDBACK_SCAN_STATUSES.Partial,
            routes: [],
            statusQueries: [],
            authenticatedQueriesUnavailable: true,
          })
      })
      expect(result.current.scanStatus).toBe(FEEDBACK_SCAN_STATUSES.Completed)
      expect(result.current.clues).toBe(accepted)
      expect(result.current.authUnavailable).toBe(false)
    },
  )
})
