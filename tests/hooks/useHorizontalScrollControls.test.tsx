import { act, fireEvent, render } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useHorizontalScrollControls,
  type HorizontalScrollControlsOptions,
} from "~/hooks/useHorizontalScrollControls"

type HorizontalScrollControlsResult = ReturnType<
  typeof useHorizontalScrollControls<HTMLDivElement>
>

const TEST_IDS = {
  scroller: "scroller",
} as const

function getChildTestId(index: number) {
  return `child-${index}`
}

function HorizontalScrollControlsHarness({
  options,
  childCount = 0,
  onReady,
}: {
  options?: HorizontalScrollControlsOptions
  childCount?: number
  onReady: (controls: HorizontalScrollControlsResult) => void
}) {
  const controls = useHorizontalScrollControls<HTMLDivElement>(options)

  useEffect(() => {
    onReady(controls)
  }, [controls, onReady])

  return (
    <div data-testid={TEST_IDS.scroller} ref={controls.scrollRef}>
      {Array.from({ length: childCount }, (_, index) => (
        <div key={index} data-testid={getChildTestId(index)} />
      ))}
    </div>
  )
}

function setScrollMetrics(
  element: HTMLElement,
  {
    clientWidth,
    scrollWidth,
    scrollLeft,
  }: {
    clientWidth: number
    scrollWidth: number
    scrollLeft: number
  },
) {
  Object.defineProperty(element, "clientWidth", {
    configurable: true,
    value: clientWidth,
  })
  Object.defineProperty(element, "scrollWidth", {
    configurable: true,
    value: scrollWidth,
  })
  Object.defineProperty(element, "scrollLeft", {
    configurable: true,
    writable: true,
    value: scrollLeft,
  })
}

describe("useHorizontalScrollControls", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("tracks scrollability, coalesces repeated scroll updates, and cleans up pending observers", () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    const resizeObserverInstances: Array<{ callback: () => void }> = []

    class MockResizeObserver {
      callback: () => void

      constructor(callback: () => void) {
        this.callback = callback
        resizeObserverInstances.push(this)
      }

      observe = observe
      disconnect = disconnect
    }

    vi.stubGlobal("ResizeObserver", MockResizeObserver as any)

    const pendingRafCallbacks = new Map<number, FrameRequestCallback>()
    let nextRafId = 1

    const requestAnimationFrameSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        const id = nextRafId++
        pendingRafCallbacks.set(id, callback)
        return id
      })
    const cancelAnimationFrameSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation((id: number) => {
        pendingRafCallbacks.delete(id)
      })

    let controls!: HorizontalScrollControlsResult
    const { getByTestId, unmount } = render(
      <HorizontalScrollControlsHarness
        onReady={(value) => {
          controls = value
        }}
      />,
    )

    const scroller = getByTestId(TEST_IDS.scroller)
    setScrollMetrics(scroller, {
      clientWidth: 120,
      scrollWidth: 360,
      scrollLeft: 90,
    })

    act(() => {
      controls.updateScrollState()
    })

    expect(controls.canScrollLeft).toBe(true)
    expect(controls.canScrollRight).toBe(true)
    expect(observe).toHaveBeenCalledWith(scroller)

    fireEvent.scroll(scroller)
    fireEvent.scroll(scroller)

    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)
    expect(resizeObserverInstances).toHaveLength(1)

    unmount()

    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1)
  })

  it("translates wheel gestures into bounded horizontal scrolling only when overflow exists", () => {
    let controls!: HorizontalScrollControlsResult
    const { getByTestId } = render(
      <HorizontalScrollControlsHarness
        options={{ enableWheelScroll: true }}
        onReady={(value) => {
          controls = value
        }}
      />,
    )

    const scroller = getByTestId(TEST_IDS.scroller)

    setScrollMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 100,
      scrollLeft: 0,
    })

    const noOverflowWheelEvent = new WheelEvent("wheel", {
      deltaY: 40,
      cancelable: true,
    })
    const noOverflowPreventDefault = vi.fn()
    Object.defineProperty(noOverflowWheelEvent, "preventDefault", {
      configurable: true,
      value: noOverflowPreventDefault,
    })
    scroller.dispatchEvent(noOverflowWheelEvent)

    expect(noOverflowPreventDefault).not.toHaveBeenCalled()
    expect(controls.canScrollLeft).toBe(false)

    setScrollMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 300,
      scrollLeft: 10,
    })

    const horizontalWheelEvent = new WheelEvent("wheel", {
      deltaX: 60,
      deltaY: 10,
      cancelable: true,
    })
    const horizontalPreventDefault = vi.fn()
    Object.defineProperty(horizontalWheelEvent, "preventDefault", {
      configurable: true,
      value: horizontalPreventDefault,
    })
    scroller.dispatchEvent(horizontalWheelEvent)

    expect(horizontalPreventDefault).toHaveBeenCalledTimes(1)
    expect(scroller.scrollLeft).toBe(70)

    const zeroWheelEvent = new WheelEvent("wheel", {
      deltaX: 0,
      deltaY: 0,
      cancelable: true,
    })
    const zeroPreventDefault = vi.fn()
    Object.defineProperty(zeroWheelEvent, "preventDefault", {
      configurable: true,
      value: zeroPreventDefault,
    })
    scroller.dispatchEvent(zeroWheelEvent)

    expect(zeroPreventDefault).not.toHaveBeenCalled()
    expect(scroller.scrollLeft).toBe(70)

    setScrollMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 300,
      scrollLeft: 200,
    })

    const cappedWheelEvent = new WheelEvent("wheel", {
      deltaX: 0,
      deltaY: 30,
      cancelable: true,
    })
    const cappedPreventDefault = vi.fn()
    Object.defineProperty(cappedWheelEvent, "preventDefault", {
      configurable: true,
      value: cappedPreventDefault,
    })
    scroller.dispatchEvent(cappedWheelEvent)

    expect(cappedPreventDefault).not.toHaveBeenCalled()
    expect(scroller.scrollLeft).toBe(200)
  })

  it("scrolls by the computed minimum step when scrollBy is available", () => {
    let controls!: HorizontalScrollControlsResult
    const { getByTestId } = render(
      <HorizontalScrollControlsHarness
        onReady={(value) => {
          controls = value
        }}
      />,
    )

    const scroller = getByTestId(TEST_IDS.scroller)
    setScrollMetrics(scroller, {
      clientWidth: 200,
      scrollWidth: 500,
      scrollLeft: 40,
    })

    const scrollBy = vi.fn()
    Object.defineProperty(scroller, "scrollBy", {
      configurable: true,
      value: scrollBy,
    })

    act(() => {
      controls.scrollLeft()
      controls.scrollRight()
    })

    expect(scrollBy).toHaveBeenNthCalledWith(1, {
      left: -160,
      behavior: "auto",
    })
    expect(scrollBy).toHaveBeenNthCalledWith(2, {
      left: 160,
      behavior: "auto",
    })
  })

  it("falls back to scrollTo for step scrolling and centers valid children while ignoring invalid indexes", () => {
    let controls!: HorizontalScrollControlsResult
    const { getByTestId } = render(
      <HorizontalScrollControlsHarness
        childCount={2}
        options={{ scrollStepPx: 90 }}
        onReady={(value) => {
          controls = value
        }}
      />,
    )

    const scroller = getByTestId(TEST_IDS.scroller)
    setScrollMetrics(scroller, {
      clientWidth: 200,
      scrollWidth: 600,
      scrollLeft: 50,
    })
    Object.defineProperty(scroller, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 200,
        bottom: 40,
        width: 200,
        height: 40,
      }),
    })

    const scrollTo = vi.fn()
    Object.defineProperty(scroller, "scrollBy", {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(scroller, "scrollTo", {
      configurable: true,
      value: scrollTo,
    })

    const child0 = getByTestId(getChildTestId(0))
    const child1 = getByTestId(getChildTestId(1))
    Object.defineProperty(child0, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 10,
        top: 0,
        right: 70,
        bottom: 30,
        width: 60,
        height: 30,
      }),
    })
    Object.defineProperty(child1, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 220,
        top: 0,
        right: 320,
        bottom: 30,
        width: 100,
        height: 30,
      }),
    })

    act(() => {
      controls.scrollRight()
    })

    expect(scrollTo).toHaveBeenNthCalledWith(1, {
      left: 140,
      behavior: "auto",
    })

    act(() => {
      controls.scrollChildIntoCenter(-1)
      controls.scrollChildIntoCenter(1)
    })

    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(scrollTo).toHaveBeenLastCalledWith({
      left: 220,
      behavior: "smooth",
    })

    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
      })),
    )
    act(() => {
      controls.scrollChildIntoCenter(1)
    })
    expect(scrollTo).toHaveBeenLastCalledWith({
      left: 220,
      behavior: "instant",
    })
  })

  it("falls back to mutating scrollLeft directly when scroll APIs are unavailable", () => {
    let controls!: HorizontalScrollControlsResult
    const { getByTestId } = render(
      <HorizontalScrollControlsHarness
        childCount={1}
        options={{ scrollStepPx: 90 }}
        onReady={(value) => {
          controls = value
        }}
      />,
    )

    const scroller = getByTestId(TEST_IDS.scroller)
    setScrollMetrics(scroller, {
      clientWidth: 100,
      scrollWidth: 400,
      scrollLeft: 10,
    })
    Object.defineProperty(scroller, "scrollBy", {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(scroller, "scrollTo", {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(scroller, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 100,
        bottom: 40,
        width: 100,
        height: 40,
      }),
    })

    const child0 = getByTestId(getChildTestId(0))
    Object.defineProperty(child0, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 20,
        top: 0,
        right: 80,
        bottom: 30,
        width: 60,
        height: 30,
      }),
    })

    act(() => {
      controls.scrollRight()
    })

    expect(scroller.scrollLeft).toBe(100)
    expect(controls.canScrollLeft).toBe(true)
    expect(controls.canScrollRight).toBe(true)

    act(() => {
      controls.scrollChildIntoCenter(0)
    })

    expect(scroller.scrollLeft).toBe(100)
  })
})
