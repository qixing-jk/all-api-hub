import { act, renderHook, waitFor } from "@testing-library/react"
import { I18nextProvider } from "react-i18next"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useFeedbackDetails } from "~/features/CheckInFeedback/useFeedbackDetails"
import type { FeedbackExecutionEvidence } from "~/services/checkin/feedback/execution"
import {
  FEEDBACK_EXECUTION_RECORDS,
  FEEDBACK_EXECUTION_SOURCES,
} from "~/services/checkin/feedback/executionTypes"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { testI18n } from "~~/tests/test-utils/i18n"

const snapshot = {
  baseUrl: "https://example.com",
  siteType: SITE_TYPES.NEW_API,
  checkIn: buildCheckInConfig(),
}
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={testI18n}>{children}</I18nextProvider>
)

afterEach(() => vi.unstubAllGlobals())

describe("feedback details", () => {
  it("coalesces overlapping reloads and replaces diagnostic overrides only after evidence arrives", async () => {
    let resolve!: (value: FeedbackExecutionEvidence) => void
    const reload = vi.fn(
      () =>
        new Promise<FeedbackExecutionEvidence>((done) => {
          resolve = done
        }),
    )
    const { result } = renderHook(
      () => useFeedbackDetails(snapshot, undefined, reload),
      { wrapper },
    )
    act(() => result.current.setDetails("Authored diagnostic details"))
    let pending!: Promise<void>
    act(() => {
      pending = result.current.handleReloadExecution()
    })
    await act(async () => {
      await result.current.handleReloadExecution()
    })
    expect(reload).toHaveBeenCalledOnce()
    expect(result.current.details).toBe("Authored diagnostic details")
    expect(result.current.reloading).toBe(true)
    await act(async () => {
      resolve({
        executionRecord: FEEDBACK_EXECUTION_RECORDS.ReadFailed,
        executionSource: FEEDBACK_EXECUTION_SOURCES.SavedHistory,
      })
      await pending
    })
    expect(result.current.recordState).toBe(
      FEEDBACK_EXECUTION_RECORDS.ReadFailed,
    )
    expect(result.current.reloading).toBe(false)
    expect(result.current.details).not.toBe("Authored diagnostic details")
  })

  it("keeps authored details while optional browser metadata finishes", async () => {
    let resolve!: (info: { name: string; version: string }) => void
    vi.stubGlobal("browser", {
      runtime: {
        getBrowserInfo: () =>
          new Promise((done) => {
            resolve = done
          }),
      },
    })
    const { result } = renderHook(() => useFeedbackDetails(snapshot), {
      wrapper,
    })
    act(() => result.current.setDetails("My diagnostic details"))
    await act(async () => resolve({ name: "Firefox", version: "132.0.2" }))
    await waitFor(() =>
      expect(result.current.browserInfo).toBe("Firefox 132.0.2"),
    )
    expect(result.current.details).toBe("My diagnostic details")
  })
})
