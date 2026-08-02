import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  BROWSER_FOCUS_STATES,
  BROWSER_FOCUS_TRANSITIONS,
  createBrowserFocusObservation,
  createBrowserFocusTransitionTracker,
  readBrowserFocusState,
} from "~/utils/browser/browserFocus"

const originalBrowser = (globalThis as any).browser
const originalChrome = Reflect.get(globalThis, "chrome")

afterEach(() => {
  ;(globalThis as any).browser = originalBrowser
  Reflect.set(globalThis, "chrome", originalChrome)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("readBrowserFocusState", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as any).browser = undefined
    Reflect.set(globalThis, "chrome", undefined)
  })

  it.each([
    [{ id: 1, focused: true }, BROWSER_FOCUS_STATES.Focused],
    [{ id: 2, focused: false }, BROWSER_FOCUS_STATES.Unfocused],
  ])("maps available last-focused windows to %s", async (window, expected) => {
    const getLastFocused = vi.fn().mockResolvedValue(window)
    ;(globalThis as any).browser = { windows: { getLastFocused } }

    await expect(readBrowserFocusState()).resolves.toBe(expected)
    expect(getLastFocused).toHaveBeenCalledWith({})
  })

  it("uses Firefox last-focused snapshots when the API returns a valid state", async () => {
    const getLastFocused = vi.fn().mockResolvedValue({ id: 1, focused: false })
    ;(globalThis as any).browser = {
      runtime: { getURL: () => "moz-extension://example.invalid/" },
      windows: { getLastFocused },
    }

    await expect(readBrowserFocusState()).resolves.toBe(
      BROWSER_FOCUS_STATES.Unfocused,
    )
    expect(getLastFocused).toHaveBeenCalledWith({})
  })

  it.each([
    { browserValue: undefined, description: "a missing browser API" },
    { browserValue: { windows: {} }, description: "a missing getLastFocused" },
    {
      browserValue: {
        windows: { getLastFocused: vi.fn().mockResolvedValue(undefined) },
      },
      description: "no window",
    },
    {
      browserValue: {
        windows: {
          getLastFocused: vi.fn().mockResolvedValue({ focused: true }),
        },
      },
      description: "a missing id",
    },
    {
      browserValue: {
        windows: { getLastFocused: vi.fn().mockResolvedValue({ id: 1 }) },
      },
      description: "a missing focused flag",
    },
    {
      browserValue: {
        windows: {
          getLastFocused: vi.fn().mockResolvedValue({ id: "1", focused: true }),
        },
      },
      description: "a malformed id",
    },
    {
      browserValue: {
        windows: {
          getLastFocused: vi.fn().mockResolvedValue({ id: 1, focused: "true" }),
        },
      },
      description: "a malformed focused flag",
    },
  ])("returns unknown for $description", async ({ browserValue }) => {
    ;(globalThis as any).browser = browserValue

    await expect(readBrowserFocusState()).resolves.toBe(
      BROWSER_FOCUS_STATES.Unknown,
    )
  })

  it("returns unknown when getLastFocused rejects", async () => {
    ;(globalThis as any).browser = {
      windows: {
        getLastFocused: vi.fn().mockRejectedValue(new Error("unavailable")),
      },
    }

    await expect(readBrowserFocusState()).resolves.toBe(
      BROWSER_FOCUS_STATES.Unknown,
    )
  })

  it("returns unknown when getLastFocused never settles", async () => {
    vi.useFakeTimers()
    ;(globalThis as any).browser = {
      windows: {
        getLastFocused: vi.fn(() => new Promise(() => {})),
      },
    }

    const result = readBrowserFocusState()
    await vi.runAllTimersAsync()

    await expect(result).resolves.toBe(BROWSER_FOCUS_STATES.Unknown)
  })

  it("absorbs a getLastFocused rejection that arrives after timeout", async () => {
    vi.useFakeTimers()
    let rejectRead: ((reason: Error) => void) | undefined
    ;(globalThis as any).browser = {
      windows: {
        getLastFocused: vi.fn(
          () =>
            new Promise((_resolve, reject) => {
              rejectRead = reject
            }),
        ),
      },
    }

    const result = readBrowserFocusState()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe(BROWSER_FOCUS_STATES.Unknown)

    rejectRead?.(new Error("late shutdown"))
    await Promise.resolve()
  })

  it("returns unknown for a malformed primitive result", async () => {
    ;(globalThis as any).browser = {
      windows: { getLastFocused: vi.fn().mockResolvedValue("invalid") },
    }

    await expect(readBrowserFocusState()).resolves.toBe(
      BROWSER_FOCUS_STATES.Unknown,
    )
  })

  it("reads and observes focus through a Chrome-only windows API", async () => {
    let listener: ((windowId: number) => void) | undefined
    const getLastFocused = vi.fn().mockResolvedValue({ id: 1, focused: true })
    const addListener = vi.fn((value: (windowId: number) => void) => {
      listener = value
    })
    const removeListener = vi.fn()

    Reflect.set(globalThis, "browser", undefined)
    Reflect.set(globalThis, "chrome", {
      windows: {
        getLastFocused,
        onFocusChanged: { addListener, removeListener },
      },
    })

    await expect(readBrowserFocusState()).resolves.toBe(
      BROWSER_FOCUS_STATES.Focused,
    )

    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Unfocused,
    )
    listener?.(1)

    await expect(observation.finish()).resolves.toEqual({
      start: BROWSER_FOCUS_STATES.Unfocused,
      transition: BROWSER_FOCUS_TRANSITIONS.Foregrounded,
      end: BROWSER_FOCUS_STATES.Focused,
    })
  })
})

describe("createBrowserFocusTransitionTracker", () => {
  it.each([
    [
      BROWSER_FOCUS_STATES.Focused,
      [],
      BROWSER_FOCUS_STATES.Focused,
      BROWSER_FOCUS_TRANSITIONS.RemainedFocused,
    ],
    [
      BROWSER_FOCUS_STATES.Unfocused,
      [],
      BROWSER_FOCUS_STATES.Unfocused,
      BROWSER_FOCUS_TRANSITIONS.RemainedUnfocused,
    ],
    [
      BROWSER_FOCUS_STATES.Unfocused,
      [BROWSER_FOCUS_STATES.Focused],
      BROWSER_FOCUS_STATES.Focused,
      BROWSER_FOCUS_TRANSITIONS.Foregrounded,
    ],
    [
      BROWSER_FOCUS_STATES.Focused,
      [BROWSER_FOCUS_STATES.Unfocused],
      BROWSER_FOCUS_STATES.Unfocused,
      BROWSER_FOCUS_TRANSITIONS.Backgrounded,
    ],
    [
      BROWSER_FOCUS_STATES.Focused,
      [BROWSER_FOCUS_STATES.Unfocused, BROWSER_FOCUS_STATES.Focused],
      BROWSER_FOCUS_STATES.Focused,
      BROWSER_FOCUS_TRANSITIONS.Mixed,
    ],
    [
      BROWSER_FOCUS_STATES.Unfocused,
      [BROWSER_FOCUS_STATES.Focused, BROWSER_FOCUS_STATES.Unfocused],
      BROWSER_FOCUS_STATES.Unfocused,
      BROWSER_FOCUS_TRANSITIONS.Mixed,
    ],
  ])(
    "reduces focus changes to the expected transition",
    (start, states, end, expected) => {
      const tracker = createBrowserFocusTransitionTracker(start)
      states.forEach((state) => tracker.note(state))

      expect(tracker.finish(end)).toBe(expected)
    },
  )

  it("returns unknown for unknown endpoints", () => {
    expect(
      createBrowserFocusTransitionTracker(BROWSER_FOCUS_STATES.Unknown).finish(
        BROWSER_FOCUS_STATES.Focused,
      ),
    ).toBe(BROWSER_FOCUS_TRANSITIONS.Unknown)
    expect(
      createBrowserFocusTransitionTracker(BROWSER_FOCUS_STATES.Focused).finish(
        BROWSER_FOCUS_STATES.Unknown,
      ),
    ).toBe(BROWSER_FOCUS_TRANSITIONS.Unknown)
  })

  it("ignores repeated known states", () => {
    const tracker = createBrowserFocusTransitionTracker(
      BROWSER_FOCUS_STATES.Focused,
    )
    tracker.note(BROWSER_FOCUS_STATES.Focused)
    tracker.note(BROWSER_FOCUS_STATES.Unfocused)
    tracker.note(BROWSER_FOCUS_STATES.Unfocused)

    expect(tracker.finish(BROWSER_FOCUS_STATES.Unfocused)).toBe(
      BROWSER_FOCUS_TRANSITIONS.Backgrounded,
    )
  })

  it("does not turn an unknown note into a direction", () => {
    const tracker = createBrowserFocusTransitionTracker(
      BROWSER_FOCUS_STATES.Focused,
    )
    tracker.note(BROWSER_FOCUS_STATES.Unknown)

    expect(tracker.finish(BROWSER_FOCUS_STATES.Focused)).toBe(
      BROWSER_FOCUS_TRANSITIONS.RemainedFocused,
    )
  })

  it("keeps the first finished transition stable", () => {
    const tracker = createBrowserFocusTransitionTracker(
      BROWSER_FOCUS_STATES.Focused,
    )

    expect(tracker.finish(BROWSER_FOCUS_STATES.Unfocused)).toBe(
      BROWSER_FOCUS_TRANSITIONS.Backgrounded,
    )
    expect(tracker.finish(BROWSER_FOCUS_STATES.Focused)).toBe(
      BROWSER_FOCUS_TRANSITIONS.Backgrounded,
    )
  })
})

describe("createBrowserFocusObservation", () => {
  let listener: ((windowId: number) => void) | undefined
  let getLastFocused: ReturnType<typeof vi.fn>
  let addListener: ReturnType<typeof vi.fn>
  let removeListener: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.restoreAllMocks()
    listener = undefined
    getLastFocused = vi.fn().mockResolvedValue({ id: 1, focused: true })
    addListener = vi.fn((value) => {
      listener = value
    })
    removeListener = vi.fn()
    ;(globalThis as any).browser = {
      windows: {
        getLastFocused,
        onFocusChanged: { addListener, removeListener },
        WINDOW_ID_NONE: -1,
      },
    }
  })

  it("maps no-focused-window and normal focus events without exposing window IDs", async () => {
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )
    listener?.(-1)
    listener?.(42)

    await expect(observation.finish()).resolves.toEqual({
      start: BROWSER_FOCUS_STATES.Focused,
      transition: BROWSER_FOCUS_TRANSITIONS.Mixed,
      end: BROWSER_FOCUS_STATES.Focused,
    })
  })

  it("ignores malformed focus events without inventing a transition", async () => {
    getLastFocused.mockResolvedValueOnce({ id: 1, focused: false })
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Unfocused,
    )

    listener?.("invalid-window-id" as never)

    await expect(observation.finish()).resolves.toEqual({
      start: BROWSER_FOCUS_STATES.Unfocused,
      transition: BROWSER_FOCUS_TRANSITIONS.RemainedUnfocused,
      end: BROWSER_FOCUS_STATES.Unfocused,
    })
  })

  it("removes its listener before reading the end state and shares concurrent finishes", async () => {
    const calls: string[] = []
    removeListener.mockImplementation(() => {
      calls.push("remove")
    })
    getLastFocused.mockImplementation(() => {
      calls.push("read")
      return Promise.resolve({ id: 1, focused: true })
    })
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )

    const first = observation.finish()
    const second = observation.finish()

    expect(second).toBe(first)
    const result = await first
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(["remove", "read"])
    expect(result).toBe(await second)
  })

  it("is safe to cancel repeatedly and reports an unknown transition after cancellation", async () => {
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )
    observation.cancel()
    observation.cancel()

    await expect(observation.finish()).resolves.toEqual({
      start: BROWSER_FOCUS_STATES.Focused,
      transition: BROWSER_FOCUS_TRANSITIONS.Unknown,
      end: BROWSER_FOCUS_STATES.Focused,
    })
    expect(removeListener).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      browserValue: {
        windows: {
          getLastFocused: vi.fn().mockResolvedValue({ id: 1, focused: true }),
        },
      },
      description: "the listener API is unavailable",
    },
    {
      browserValue: {
        windows: {
          getLastFocused: vi.fn().mockResolvedValue({ id: 1, focused: true }),
          onFocusChanged: {
            addListener: vi.fn(() => {
              throw new Error("unavailable")
            }),
            removeListener: vi.fn(),
          },
        },
      },
      description: "listener registration fails",
    },
  ])(
    "returns an unknown transition when $description",
    async ({ browserValue }) => {
      ;(globalThis as any).browser = browserValue
      const observation = createBrowserFocusObservation(
        BROWSER_FOCUS_STATES.Focused,
      )

      await expect(observation.finish()).resolves.toEqual({
        start: BROWSER_FOCUS_STATES.Focused,
        transition: BROWSER_FOCUS_TRANSITIONS.Unknown,
        end: BROWSER_FOCUS_STATES.Focused,
      })
    },
  )

  it("returns unknown end and transition when the end read rejects", async () => {
    getLastFocused.mockRejectedValueOnce(new Error("shutdown"))
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )

    await expect(observation.finish()).resolves.toEqual({
      start: BROWSER_FOCUS_STATES.Focused,
      transition: BROWSER_FOCUS_TRANSITIONS.Unknown,
      end: BROWSER_FOCUS_STATES.Unknown,
    })
  })

  it("finishes with an unknown end when the end read never settles", async () => {
    vi.useFakeTimers()
    getLastFocused.mockImplementation(() => new Promise(() => {}))
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )

    const finish = observation.finish()
    await vi.runAllTimersAsync()

    await expect(finish).resolves.toEqual({
      start: BROWSER_FOCUS_STATES.Focused,
      transition: BROWSER_FOCUS_TRANSITIONS.Unknown,
      end: BROWSER_FOCUS_STATES.Unknown,
    })
    expect(removeListener).toHaveBeenCalledTimes(1)
  })

  it("absorbs listener removal failure as an incomplete observation", async () => {
    removeListener.mockImplementation(() => {
      throw new Error("shutdown")
    })
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )

    await expect(observation.finish()).resolves.toEqual({
      start: BROWSER_FOCUS_STATES.Focused,
      transition: BROWSER_FOCUS_TRANSITIONS.Unknown,
      end: BROWSER_FOCUS_STATES.Focused,
    })
  })

  it("retries failed listener removal without retaining a subscription", async () => {
    const listeners = new Set<(windowId: number) => void>()
    let removalAttempts = 0
    const removeFocusListener = (value: (windowId: number) => void) => {
      removalAttempts += 1
      if (removalAttempts === 1) {
        throw new Error("temporary removal failure")
      }
      listeners.delete(value)
    }

    ;(globalThis as any).browser = {
      windows: {
        getLastFocused: vi.fn().mockResolvedValue({ id: 1, focused: true }),
        onFocusChanged: {
          addListener: (value: (windowId: number) => void) =>
            listeners.add(value),
          removeListener: removeFocusListener,
        },
      },
    }
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )

    await expect(observation.finish()).resolves.toMatchObject({
      transition: BROWSER_FOCUS_TRANSITIONS.Unknown,
    })
    expect(removalAttempts).toBe(2)
    expect(listeners.size).toBe(0)
  })

  it("retries cancellation cleanup without reading browser focus", () => {
    const listeners = new Set<(windowId: number) => void>()
    const getLastFocused = vi.fn()
    let removalAttempts = 0

    ;(globalThis as any).browser = {
      windows: {
        getLastFocused,
        onFocusChanged: {
          addListener: (value: (windowId: number) => void) =>
            listeners.add(value),
          removeListener: (value: (windowId: number) => void) => {
            removalAttempts += 1
            if (removalAttempts === 1) {
              throw new Error("temporary removal failure")
            }
            listeners.delete(value)
          },
        },
      },
    }
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )

    observation.cancel()
    expect(listeners.size).toBe(1)
    observation.cancel()

    expect(removalAttempts).toBe(2)
    expect(listeners.size).toBe(0)
    expect(getLastFocused).not.toHaveBeenCalled()
  })

  it("ignores synchronous focus events delivered after finish begins", async () => {
    let listener: ((windowId: number) => void) | undefined
    const listeners = new Set<(windowId: number) => void>()

    ;(globalThis as any).browser = {
      windows: {
        getLastFocused: vi.fn().mockResolvedValue({ id: 1, focused: true }),
        onFocusChanged: {
          addListener: (value: (windowId: number) => void) => {
            listener = value
            listeners.add(value)
          },
          removeListener: (value: (windowId: number) => void) =>
            listeners.delete(value),
        },
        WINDOW_ID_NONE: -1,
      },
    }
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )

    const finish = observation.finish()
    listener?.(-1)

    await expect(finish).resolves.toEqual({
      start: BROWSER_FOCUS_STATES.Focused,
      transition: BROWSER_FOCUS_TRANSITIONS.RemainedFocused,
      end: BROWSER_FOCUS_STATES.Focused,
    })
    expect(listeners.size).toBe(0)
  })

  it("shares the finish promise with synchronous reentrant listener cleanup", async () => {
    let reentrantFinish: Promise<unknown> | undefined
    let endReadCount = 0

    ;(globalThis as any).browser = {
      windows: {
        getLastFocused: () => {
          endReadCount += 1
          return Promise.resolve({ id: 1, focused: true })
        },
        onFocusChanged: {
          addListener: () => {},
          removeListener: () => {
            reentrantFinish = observation.finish()
          },
        },
      },
    }
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )

    const firstFinish = observation.finish()
    const result = await firstFinish

    expect(reentrantFinish).toBe(firstFinish)
    expect(await reentrantFinish).toBe(result)
    expect(endReadCount).toBe(1)
  })

  it("remains incomplete when cancelled during a pending end read", async () => {
    const listeners = new Set<(windowId: number) => void>()
    let resolveEnd:
      | ((window: { id: number; focused: boolean }) => void)
      | undefined
    ;(globalThis as any).browser = {
      windows: {
        getLastFocused: () =>
          new Promise<{ id: number; focused: boolean }>((resolve) => {
            resolveEnd = resolve
          }),
        onFocusChanged: {
          addListener: (value: (windowId: number) => void) =>
            listeners.add(value),
          removeListener: (value: (windowId: number) => void) =>
            listeners.delete(value),
        },
      },
    }
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )

    const finish = observation.finish()
    await Promise.resolve()
    observation.cancel()
    resolveEnd?.({ id: 1, focused: true })

    await expect(finish).resolves.toMatchObject({
      transition: BROWSER_FOCUS_TRANSITIONS.Unknown,
    })
    expect(listeners.size).toBe(0)
  })

  it("uses the typed no-focused-window constant when it differs from -1", async () => {
    ;(globalThis as any).browser.windows.WINDOW_ID_NONE = -99
    const observation = createBrowserFocusObservation(
      BROWSER_FOCUS_STATES.Focused,
    )
    listener?.(-99)

    await expect(observation.finish()).resolves.toMatchObject({
      transition: BROWSER_FOCUS_TRANSITIONS.Mixed,
    })
  })
})
