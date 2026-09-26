import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  addDevFixtureApiCredentials,
  clearDevFixtureApiCredentials,
  countDevFixtureApiCredentials,
} from "~/features/DevPanel/fixtureApiCredentials"
import { useFixtureApiCredentialsDevSection } from "~/features/DevPanel/sections/fixtureApiCredentialsSection"
import toast from "~/lib/notify"

vi.mock("~/features/DevPanel/fixtureApiCredentials", () => ({
  addDevFixtureApiCredentials: vi.fn(),
  clearDevFixtureApiCredentials: vi.fn(),
  countDevFixtureApiCredentials: vi.fn(),
}))

vi.mock("~/lib/notify", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

const addFixtures = vi.mocked(addDevFixtureApiCredentials)
const clearFixtures = vi.mocked(clearDevFixtureApiCredentials)
const countFixtures = vi.mocked(countDevFixtureApiCredentials)
const notify = vi.mocked(toast)

function action(
  section: ReturnType<typeof useFixtureApiCredentialsDevSection>,
  id: string,
) {
  const found = section.actions.find((item) => item.id === id)
  if (!found) throw new Error(`Missing fixture action: ${id}`)
  return found
}

describe("credential fixture dev section", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    countFixtures.mockReset().mockResolvedValue(0)
    addFixtures.mockReset().mockResolvedValue(1)
    clearFixtures.mockReset().mockResolvedValue(0)
  })

  it("adds a fixture and refreshes the displayed count", async () => {
    countFixtures.mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    const { result } = renderHook(() =>
      useFixtureApiCredentialsDevSection(true),
    )

    await waitFor(() =>
      expect(action(result.current, "clear").label).toContain("(0)"),
    )
    await act(async () => action(result.current, "add-one").run())

    expect(addFixtures).toHaveBeenCalledExactlyOnceWith(1)
    expect(notify.success).toHaveBeenCalledWith(
      "Dev: added 1 fixture credential(s)",
    )
    expect(action(result.current, "clear").label).toContain("(1)")
    expect(action(result.current, "clear").disabled).toBe(false)
  })

  it("clears only registered fixtures and disables cleanup once empty", async () => {
    countFixtures.mockResolvedValueOnce(2).mockResolvedValueOnce(0)
    clearFixtures.mockResolvedValueOnce(2)
    const { result } = renderHook(() =>
      useFixtureApiCredentialsDevSection(true),
    )

    await waitFor(() =>
      expect(action(result.current, "clear").label).toContain("(2)"),
    )
    await act(async () => action(result.current, "clear").run())

    expect(clearFixtures).toHaveBeenCalledExactlyOnceWith()
    expect(notify.success).toHaveBeenCalledWith(
      "Dev: removed 2 fixture credential(s)",
    )
    expect(action(result.current, "clear").label).toContain("(0)")
    expect(action(result.current, "clear").disabled).toBe(true)
  })

  it("reports failed additions and leaves the actions available for retry", async () => {
    addFixtures.mockRejectedValueOnce(new Error("storage unavailable"))
    const { result } = renderHook(() =>
      useFixtureApiCredentialsDevSection(true),
    )

    await waitFor(() =>
      expect(action(result.current, "clear").label).toContain("(0)"),
    )
    await act(async () => action(result.current, "add-one").run())

    expect(notify.error).toHaveBeenCalledWith(
      "Dev: failed to add fixture credentials: storage unavailable",
    )
    expect(action(result.current, "add-one").disabled).toBe(false)
  })

  it("reports a count failure without showing a false zero", async () => {
    countFixtures.mockRejectedValueOnce(new Error("registry unavailable"))
    const { result } = renderHook(() =>
      useFixtureApiCredentialsDevSection(true),
    )

    await waitFor(() =>
      expect(notify.error).toHaveBeenCalledWith(
        "Dev: failed to count fixture credentials: registry unavailable",
      ),
    )
    expect(action(result.current, "clear").label).toBe(
      "Dev: Clear fixture credentials",
    )
  })
})
