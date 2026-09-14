import { beforeEach, describe, expect, it, vi } from "vitest"

import { EChart } from "~/components/charts/EChart"
import { THEME_ATTRIBUTES, THEME_PRESET } from "~/constants/theme"
import { render, waitFor } from "~~/tests/test-utils/render"

const { echartsInitMock } = vi.hoisted(() => ({
  echartsInitMock: vi.fn(),
}))

vi.mock("~/components/charts/echarts", () => ({
  echarts: {
    init: echartsInitMock,
  },
}))

vi.mock("~/components/charts/chartColors", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/components/charts/chartColors")>()
  return { ...actual, readChartColors: vi.fn(() => ({})) }
})

type MockEChartInstance = {
  setOption: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
}

class MockResizeObserver {
  static instances: MockResizeObserver[] = []

  callback: ResizeObserverCallback
  observe = vi.fn()
  disconnect = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  trigger() {
    this.callback([], this as unknown as ResizeObserver)
  }

  static reset() {
    MockResizeObserver.instances = []
  }
}

describe("EChart", () => {
  beforeEach(() => {
    echartsInitMock.mockReset()
    MockResizeObserver.reset()
    vi.stubGlobal("ResizeObserver", MockResizeObserver)
  })

  const createInstance = (): MockEChartInstance => ({
    setOption: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  })

  it("recolors on root changes without replacing the chart or resetting interactions", async () => {
    const instance = createInstance()
    echartsInitMock.mockReturnValueOnce(instance)
    const { unmount } = render(
      <EChart option={{ series: [{ type: "line", data: [1, 2] }] }} />,
    )
    await waitFor(() => expect(instance.setOption).toHaveBeenCalledTimes(1))
    document.documentElement.style.setProperty("--chart-1", "#ff00ff")
    await waitFor(() => expect(instance.setOption).toHaveBeenCalledTimes(2))
    expect(instance.setOption).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({ notMerge: false }),
    )
    expect(echartsInitMock).toHaveBeenCalledTimes(1)
    document.documentElement.setAttribute(
      THEME_ATTRIBUTES.PRESET,
      THEME_PRESET.ANTHROPIC,
    )
    await waitFor(() => expect(instance.setOption).toHaveBeenCalledTimes(3))
    unmount()
    document.documentElement.style.removeProperty("--chart-1")
    document.documentElement.removeAttribute(THEME_ATTRIBUTES.PRESET)
    expect(instance.dispose).toHaveBeenCalledOnce()
  })

  it("initializes the chart with merged setOption defaults", async () => {
    const instance = createInstance()
    echartsInitMock.mockReturnValueOnce(instance)

    render(
      <EChart
        option={{ series: [{ type: "line", data: [1, 2, 3] }] }}
        setOptionOpts={{ lazyUpdate: false, silent: true }}
        style={{ height: 240 }}
      />,
    )

    await waitFor(() => {
      expect(echartsInitMock).toHaveBeenCalledWith(
        expect.any(HTMLDivElement),
        expect.objectContaining({ tooltip: expect.any(Object) }),
        { renderer: "canvas" },
      )
      expect(instance.setOption).toHaveBeenCalledWith(
        expect.objectContaining({
          series: [{ type: "line", data: [1, 2, 3] }],
        }),
        {
          notMerge: true,
          lazyUpdate: false,
          silent: true,
        },
      )
    })
  })

  it("recreates the chart when the renderer changes and rebinds events", async () => {
    const firstInstance = createInstance()
    const secondInstance = createInstance()
    echartsInitMock
      .mockReturnValueOnce(firstInstance)
      .mockReturnValueOnce(secondInstance)

    const firstClick = vi.fn()
    const secondLegend = vi.fn()
    const { rerender } = render(
      <EChart option={{}} onEvents={{ click: firstClick }} />,
    )

    await waitFor(() => {
      expect(firstInstance.on).toHaveBeenCalledWith("click", firstClick)
    })

    rerender(
      <EChart
        option={{ series: [{ type: "bar", data: [5] }] }}
        renderer="svg"
        onEvents={{ legendselectchanged: secondLegend }}
      />,
    )

    await waitFor(() => {
      expect(firstInstance.off).toHaveBeenCalledWith("click", firstClick)
      expect(firstInstance.dispose).toHaveBeenCalledTimes(1)
      expect(echartsInitMock).toHaveBeenLastCalledWith(
        expect.any(HTMLDivElement),
        expect.objectContaining({ tooltip: expect.any(Object) }),
        { renderer: "svg" },
      )
      expect(secondInstance.on).toHaveBeenCalledWith(
        "legendselectchanged",
        secondLegend,
      )
    })
  })

  it("resizes for observer and window events and removes listeners on unmount", async () => {
    const instance = createInstance()
    echartsInitMock.mockReturnValueOnce(instance)

    const { unmount } = render(<EChart option={{}} />)

    await waitFor(() => {
      expect(MockResizeObserver.instances).toHaveLength(1)
    })

    MockResizeObserver.instances[0]?.trigger()
    window.dispatchEvent(new Event("resize"))

    await waitFor(() => {
      expect(instance.resize).toHaveBeenCalledTimes(2)
    })

    unmount()

    expect(MockResizeObserver.instances[0]?.disconnect).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event("resize"))
    expect(instance.resize).toHaveBeenCalledTimes(2)
    expect(instance.dispose).toHaveBeenCalledTimes(1)
  })
})
