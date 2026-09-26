import { act, render, screen } from "@testing-library/react"
import { forwardRef, lazy, type HTMLAttributes, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { OptionsPageTransition } from "~/features/OptionsMenu/OptionsPageTransition"

const motionMocks = vi.hoisted(() => ({
  animate: vi.fn(),
  reducedMotion: vi.fn(() => false),
  finishPresenceExit: null as null | (() => void),
}))

vi.mock("framer-motion/mini", () => ({
  useAnimate: () => [null, motionMocks.animate],
}))

vi.mock("framer-motion", async () => {
  const React = await import("react")
  const MotionDiv = forwardRef<
    HTMLDivElement,
    HTMLAttributes<HTMLDivElement> & {
      animate?: unknown
      exit?: unknown
      initial?: unknown
      transition?: unknown
    }
  >(
    (
      {
        animate: _animate,
        exit: _exit,
        initial: _initial,
        transition: _transition,
        ...props
      },
      ref,
    ) => React.createElement("div", { ...props, ref }),
  )

  function AnimatePresence({
    children,
    onExitComplete,
  }: {
    children: ReactNode
    onExitComplete?: () => void
  }) {
    const [rendered, setRendered] = React.useState(children)
    const latestExit = React.useRef(onExitComplete)
    latestExit.current = onExitComplete

    React.useEffect(() => {
      if (children) {
        setRendered(children)
      } else if (rendered) {
        motionMocks.finishPresenceExit = () => {
          setRendered(null)
          latestExit.current?.()
        }
      }
    }, [children, rendered])

    return rendered
  }

  return {
    AnimatePresence,
    motion: { div: MotionDiv },
    useReducedMotion: () => motionMocks.reducedMotion(),
  }
})

interface TestControl extends PromiseLike<void> {
  cancel: ReturnType<typeof vi.fn>
  finish: () => void
  stop: ReturnType<typeof vi.fn>
}

const controls: TestControl[] = []
let animationFrames = new Map<number, FrameRequestCallback>()
let nextFrameId = 0
const mutationObservers: FakeMutationObserver[] = []

class FakeMutationObserver implements MutationObserver {
  private readonly callback: MutationCallback
  disconnect = vi.fn()
  observe = vi.fn()

  constructor(callback: MutationCallback) {
    this.callback = callback
    mutationObservers.push(this)
  }

  takeRecords(): MutationRecord[] {
    return []
  }

  trigger() {
    this.callback([], this)
  }
}

function createControl(
  target: HTMLElement,
  frames: Record<string, Array<string | number>>,
): TestControl {
  let finishPromise!: () => void
  const promise = new Promise<void>((resolve) => {
    finishPromise = resolve
  })
  const finish = () => {
    if (frames.opacity) target.style.opacity = String(frames.opacity.at(-1))
    if (frames.transform)
      target.style.transform = String(frames.transform.at(-1))
    finishPromise()
  }
  const control = {
    then: promise.then.bind(promise),
    cancel: vi.fn(),
    finish,
    stop: vi.fn(finish),
  } as TestControl
  controls.push(control)
  return control
}

function TestPage({
  label,
  hidden = false,
}: {
  label: string
  hidden?: boolean
}) {
  return (
    <section
      data-page-motion-item
      data-testid={`${label}-item`}
      style={{
        display: hidden ? "none" : "block",
        transform: "rotate(2deg)",
      }}
    >
      {label}
    </section>
  )
}

function renderPage(
  pageId: string,
  children: ReactNode,
  fallback: ReactNode = <div>Loading page</div>,
) {
  return render(
    <OptionsPageTransition pageId={pageId} fallback={fallback}>
      {children}
    </OptionsPageTransition>,
  )
}

async function flushReadyAndFrames() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  while (animationFrames.size > 0) {
    const frames = [...animationFrames.values()]
    animationFrames.clear()
    await act(async () => {
      frames.forEach((callback) => callback(0))
    })
  }
}

beforeEach(() => {
  controls.length = 0
  mutationObservers.length = 0
  animationFrames = new Map()
  nextFrameId = 0
  motionMocks.finishPresenceExit = null
  motionMocks.reducedMotion.mockReturnValue(false)
  motionMocks.animate.mockReset().mockImplementation(createControl)
  vi.stubGlobal("MutationObserver", FakeMutationObserver)
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextFrameId
    animationFrames.set(id, callback)
    return id
  })
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    animationFrames.delete(id)
  })
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const top = this.hasAttribute("data-offscreen")
        ? window.innerHeight + 30
        : this.hasAttribute("data-above")
          ? -60
          : Number(this.dataset.top ?? 0)
      const left = Number(this.dataset.left ?? 0)
      const tooSmall = this.hasAttribute("data-small")
      return {
        x: left,
        y: top,
        top,
        right: left + (tooSmall ? 0 : 120),
        bottom: top + 36,
        left,
        width: this.style.display === "none" || tooSmall ? 0 : 120,
        height: this.style.display === "none" ? 0 : 36,
        toJSON: () => ({}),
      } as DOMRect
    },
  )
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(
    function (this: HTMLElement) {
      return (this.style.display === "none"
        ? []
        : [this.getBoundingClientRect()]) as unknown as DOMRectList
    },
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("OptionsPageTransition", () => {
  it("enters in menu order and exits in the opposite direction before replacing the page", async () => {
    const { rerender } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <TestPage label="overview" />,
    )
    await flushReadyAndFrames()

    expect(motionMocks.animate).toHaveBeenCalledWith(
      screen.getByTestId("overview-item"),
      expect.objectContaining({
        opacity: [0, 1],
        transform: ["translate3d(0, 14px, 0) rotate(2deg)", "rotate(2deg)"],
      }),
      expect.objectContaining({ duration: 0.3, delay: 0 }),
    )
    const overviewItem = screen.getByTestId("overview-item")

    rerender(
      <OptionsPageTransition
        pageId={MENU_ITEM_IDS.ACCOUNT}
        fallback={<div>Loading page</div>}
      >
        <TestPage label="account" />
      </OptionsPageTransition>,
    )
    expect(overviewItem.closest("[aria-hidden]")).toHaveAttribute(
      "aria-hidden",
      "true",
    )
    await act(async () => {
      controls.at(-1)?.finish()
      await Promise.resolve()
    })
    await flushReadyAndFrames()
    expect(screen.getByText("account")).toBeInTheDocument()
    expect(motionMocks.animate).toHaveBeenCalledWith(
      overviewItem,
      expect.objectContaining({
        opacity: [1, 0],
        transform: ["rotate(2deg)", "translate3d(0, -14px, 0) rotate(2deg)"],
      }),
      expect.objectContaining({ duration: 0.17 }),
    )
  })

  it("keeps only the latest page when navigation changes during an exit", async () => {
    const { rerender } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <TestPage label="overview" />,
    )
    await flushReadyAndFrames()

    rerender(
      <OptionsPageTransition pageId={MENU_ITEM_IDS.ACCOUNT} fallback={null}>
        <TestPage label="account" />
      </OptionsPageTransition>,
    )
    rerender(
      <OptionsPageTransition pageId={MENU_ITEM_IDS.BOOKMARK} fallback={null}>
        <TestPage label="bookmark" />
      </OptionsPageTransition>,
    )
    await act(async () => {
      controls.at(-1)?.finish()
      await Promise.resolve()
    })
    await flushReadyAndFrames()

    expect(screen.queryByText("account")).not.toBeInTheDocument()
    expect(screen.getByText("bookmark")).toBeInTheDocument()
  })

  it("reverses exit and entry movement when navigating to an earlier menu page", async () => {
    const { rerender } = renderPage(
      MENU_ITEM_IDS.ACCOUNT,
      <TestPage label="account" />,
    )
    await flushReadyAndFrames()
    const accountItem = screen.getByTestId("account-item")

    rerender(
      <OptionsPageTransition pageId={MENU_ITEM_IDS.OVERVIEW} fallback={null}>
        <TestPage label="overview" />
      </OptionsPageTransition>,
    )
    await act(async () => {
      controls.at(-1)?.finish()
      await Promise.resolve()
    })
    await flushReadyAndFrames()

    expect(motionMocks.animate).toHaveBeenCalledWith(
      accountItem,
      expect.objectContaining({
        transform: ["rotate(2deg)", "translate3d(0, 14px, 0) rotate(2deg)"],
      }),
      expect.objectContaining({ duration: 0.17 }),
    )
    expect(motionMocks.animate).toHaveBeenCalledWith(
      screen.getByTestId("overview-item"),
      expect.objectContaining({
        transform: ["translate3d(0, -14px, 0) rotate(2deg)", "rotate(2deg)"],
      }),
      expect.objectContaining({ duration: 0.3 }),
    )
  })

  it("waits for lazy page content before preparing its entrance", async () => {
    let resolvePage!: (module: { default: () => ReactNode }) => void
    const LazyPage = lazy(
      () =>
        new Promise<{ default: () => ReactNode }>((resolve) => {
          resolvePage = resolve
        }),
    )
    renderPage(MENU_ITEM_IDS.OVERVIEW, <LazyPage />)
    await flushReadyAndFrames()
    expect(motionMocks.animate).not.toHaveBeenCalled()

    await act(async () => {
      resolvePage({ default: () => <TestPage label="lazy" /> })
      await Promise.resolve()
    })
    await flushReadyAndFrames()

    expect(screen.getByText("lazy")).toBeInTheDocument()
    expect(motionMocks.animate).toHaveBeenCalled()
  })

  it("selects visible motion groups and list rows in page order", async () => {
    renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <>
        <section data-page-motion-item data-testid="last" data-top="70" />
        <section data-page-motion-group>
          <section
            data-page-motion-item
            data-testid="group-later"
            data-top="50"
            data-left="20"
          />
          <section
            data-page-motion-item
            data-testid="group-earlier"
            data-top="50"
            data-left="2"
          />
          <section
            data-page-motion-item
            data-testid="offscreen"
            data-offscreen
          />
          <section data-page-motion-item data-testid="above" data-above />
          <section
            data-page-motion-item
            data-testid="hidden"
            style={{ visibility: "hidden" }}
          />
          <section
            data-page-motion-item
            data-testid="fixed"
            style={{ position: "fixed" }}
          />
          <section data-page-motion-item data-testid="small" data-small />
        </section>
        <div data-page-motion-list>
          <section
            data-page-motion-item
            data-testid="list-visible"
            data-top="0"
          />
          <section
            data-page-motion-item
            data-testid="list-offscreen"
            data-offscreen
          />
        </div>
        <div>
          <section
            data-page-motion-item
            data-testid="auto-right"
            data-top="30"
            data-left="20"
          />
          <section
            data-slot="card"
            data-testid="auto-left"
            data-top="30"
            data-left="2"
          />
        </div>
        <div data-page-motion-group>
          <div data-page-motion-group>
            <div data-page-motion-group>
              <div data-page-motion-group>
                <div data-testid="deep-group" data-top="15" />
              </div>
            </div>
          </div>
        </div>
        <svg data-testid="svg-root">
          <g />
        </svg>
      </>,
    )
    await flushReadyAndFrames()

    expect(
      motionMocks.animate.mock.calls.map(
        ([target]) => (target as HTMLElement).dataset.testid,
      ),
    ).toEqual([
      "list-visible",
      "deep-group",
      "auto-left",
      "auto-right",
      "group-earlier",
      "group-later",
      "last",
    ])
  })

  it("renders reduced-motion pages immediately without running animations", async () => {
    motionMocks.reducedMotion.mockReturnValue(true)
    const { rerender } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <TestPage label="overview" />,
    )
    await flushReadyAndFrames()

    expect(document.querySelector("[data-options-page-content]")).toHaveStyle({
      opacity: "1",
    })
    expect(motionMocks.animate).not.toHaveBeenCalled()

    rerender(
      <OptionsPageTransition pageId={MENU_ITEM_IDS.ACCOUNT} fallback={null}>
        <TestPage label="account" />
      </OptionsPageTransition>,
    )
    await flushReadyAndFrames()
    expect(screen.getByText("account")).toBeInTheDocument()
    expect(motionMocks.animate).not.toHaveBeenCalled()
  })

  it("waits for pending page data and the loader exit before starting entrance", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const pendingPage = (pending: boolean) => (
      <div data-options-page-pending={pending ? "" : undefined}>
        <TestPage label="pending" />
      </div>
    )
    const { rerender } = renderPage(MENU_ITEM_IDS.OVERVIEW, pendingPage(true))
    await flushReadyAndFrames()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(699)
    })
    expect(screen.queryByText("Loading page")).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(
      document.querySelector("[data-options-page-fallback]"),
    ).toBeInTheDocument()

    rerender(
      <OptionsPageTransition
        pageId={MENU_ITEM_IDS.OVERVIEW}
        fallback={<div>Loading page</div>}
      >
        {pendingPage(false)}
      </OptionsPageTransition>,
    )
    await act(async () => {
      mutationObservers.at(-1)?.trigger()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(
      document.querySelector("[data-options-page-fallback]"),
    ).toBeInTheDocument()
    expect(motionMocks.animate).not.toHaveBeenCalled()

    await act(async () => {
      motionMocks.finishPresenceExit?.()
      await Promise.resolve()
    })
    await flushReadyAndFrames()
    expect(
      document.querySelector("[data-options-page-fallback]"),
    ).not.toBeInTheDocument()
    expect(motionMocks.animate).toHaveBeenCalled()
  })

  it("waits briefly for a deferred visible list row before entering", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { rerender } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <div data-page-motion-wait-for="[data-page-motion-ready-item]">
        <TestPage label="list" />
      </div>,
    )
    await flushReadyAndFrames()
    expect(motionMocks.animate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBeGreaterThan(1)

    rerender(
      <OptionsPageTransition pageId={MENU_ITEM_IDS.OVERVIEW} fallback={null}>
        <div data-page-motion-wait-for="[data-page-motion-ready-item]">
          <TestPage label="list" />
          <span data-page-motion-ready-item />
        </div>
      </OptionsPageTransition>,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      mutationObservers.at(-1)?.trigger()
    })
    expect(vi.getTimerCount()).toBe(1)
    await flushReadyAndFrames()
    expect(motionMocks.animate).toHaveBeenCalled()
  })

  it("releases a deferred list wait after its bounded timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <div data-page-motion-wait-for="[data-page-motion-ready-item]">
        <TestPage label="bounded" />
      </div>,
    )
    await flushReadyAndFrames()
    expect(motionMocks.animate).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })
    await flushReadyAndFrames()
    expect(motionMocks.animate).toHaveBeenCalled()
  })

  it("cancels entrance animation when its target becomes hidden before exit", async () => {
    const { rerender } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <TestPage label="hidden" />,
    )
    await flushReadyAndFrames()
    const entrance = controls[0]!
    screen.getByTestId("hidden-item").style.display = "none"

    rerender(
      <OptionsPageTransition pageId={MENU_ITEM_IDS.ACCOUNT} fallback={null}>
        <TestPage label="next" />
      </OptionsPageTransition>,
    )

    expect(entrance.cancel).toHaveBeenCalled()
    expect(entrance.stop).not.toHaveBeenCalled()
    await flushReadyAndFrames()
    expect(screen.getByText("next")).toBeInTheDocument()
  })

  it("cleans up pending timers, observers, frames, and controls on unmount", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { unmount } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <div data-page-motion-wait-for="[data-page-motion-ready-item]">
        <TestPage label="pending" />
      </div>,
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(vi.getTimerCount()).toBe(2)
    const observer = mutationObservers.at(-1)!

    unmount()

    expect(observer.disconnect).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(animationFrames.size).toBe(0)
  })

  it("leaves a page waiting for a deferred row without keeping its readiness timer", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { rerender } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <div data-page-motion-wait-for="[data-page-motion-ready-item]">
        <TestPage label="waiting" />
      </div>,
    )
    await flushReadyAndFrames()
    const observer = mutationObservers.at(-1)!
    rerender(
      <OptionsPageTransition pageId={MENU_ITEM_IDS.ACCOUNT} fallback={null}>
        <TestPage label="next" />
      </OptionsPageTransition>,
    )
    await flushReadyAndFrames()
    expect(observer.disconnect).toHaveBeenCalled()
    expect(screen.queryByText("waiting")).not.toBeInTheDocument()
    expect(screen.getByText("next")).toBeInTheDocument()
    // Only the new page's delayed-loader timer remains.
    expect(vi.getTimerCount()).toBe(1)
  })

  it("cancels a queued entrance when navigation happens before its first frame", async () => {
    const { rerender } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <TestPage label="queued" />,
    )
    await act(async () => {
      await Promise.resolve()
    })
    const oldFrame = [...animationFrames.keys()][0]!
    expect(animationFrames.has(oldFrame)).toBe(true)
    rerender(
      <OptionsPageTransition pageId={MENU_ITEM_IDS.ACCOUNT} fallback={null}>
        <TestPage label="next" />
      </OptionsPageTransition>,
    )
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(oldFrame)
    await flushReadyAndFrames()
    expect(
      motionMocks.animate.mock.calls.map(([target]) => target.textContent),
    ).toEqual(["next"])
  })

  it("finishes a stalled exit once and ignores its later animation completion", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const { rerender } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <TestPage label="old" />,
    )
    await flushReadyAndFrames()
    rerender(
      <OptionsPageTransition pageId={MENU_ITEM_IDS.ACCOUNT} fallback={null}>
        <TestPage label="next" />
      </OptionsPageTransition>,
    )
    const departure = controls.at(-1)!
    expect(screen.queryByText("next")).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350)
    })
    await flushReadyAndFrames()
    const nextItem = screen.getByText("next")
    await act(async () => {
      departure.finish()
      await Promise.resolve()
    })
    expect(screen.getByText("next")).toBe(nextItem)
    expect(screen.queryByText("old")).not.toBeInTheDocument()
  })

  it("cancels active entrance controls and restores base styles on unmount", async () => {
    const { unmount } = renderPage(
      MENU_ITEM_IDS.OVERVIEW,
      <TestPage label="active" />,
    )
    await flushReadyAndFrames()
    const item = screen.getByText("active")
    const entrance = controls.at(-1)!
    unmount()
    expect(entrance.cancel).toHaveBeenCalled()
    expect(item.style.transform).toBe("rotate(2deg)")
    expect(item.style.opacity).toBe("1")
  })
})
