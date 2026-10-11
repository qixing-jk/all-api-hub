import { afterEach, describe, expect, it, vi } from "vitest"

import settings from "~/locales/en/settings.json"
import { readNewManagedSiteConnectionFeedback } from "~~/scripts/suites/managed-site/ui.mjs"

afterEach(() => vi.restoreAllMocks())

describe("managed-site connection feedback", () => {
  const copy = settings.managedSiteConnection

  const poll = (snapshots: string[][], previous: string[]) => {
    let now = 0
    let index = 0
    vi.spyOn(Date, "now").mockImplementation(() => now)
    const page = {
      waitForTimeout: async (milliseconds: number) => {
        now += milliseconds
      },
    }
    const locator = {
      allTextContents: vi.fn(
        async () => snapshots[Math.min(index++, snapshots.length - 1)] ?? [],
      ),
    }
    return readNewManagedSiteConnectionFeedback(page, locator, previous, 1000)
  }

  it("accepts repeated terminal feedback after progress replaced the previous result", async () => {
    await expect(
      poll(
        [[copy.success], [copy.saving], [copy.checking], [copy.success]],
        [copy.success],
      ),
    ).resolves.toEqual({ text: copy.success, observed: [copy.success] })
  })

  it("does not accept an old terminal notice that remains beside progress", async () => {
    await expect(
      poll(
        [
          [copy.saving, copy.success],
          [copy.checking, copy.success],
          [copy.success],
        ],
        [copy.success],
      ),
    ).resolves.toEqual({ text: "", observed: [copy.success] })
  })

  it("ignores an unchanged previous result without a progress transition", async () => {
    await expect(poll([[copy.success]], [copy.success])).resolves.toEqual({
      text: "",
      observed: [copy.success],
    })
  })

  it("accepts fresh terminal feedback when a quick check finishes between polls", async () => {
    await expect(poll([[copy.success]], [])).resolves.toEqual({
      text: copy.success,
      observed: [copy.success],
    })
  })
})
