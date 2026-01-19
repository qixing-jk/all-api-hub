import type { CSSProperties } from "react"
import { useEffect, useMemo, useRef } from "react"

import { echarts, type EChartsOption, type SetOptionOpts } from "./echarts"

export type EChartRenderer = "canvas" | "svg"

export type EChartEventHandlers = Record<string, (params: unknown) => void>

export interface EChartProps {
  option: EChartsOption
  className?: string
  style?: CSSProperties
  renderer?: EChartRenderer
  setOptionOpts?: SetOptionOpts
  onEvents?: EChartEventHandlers
}

/**
 * Minimal React wrapper for Apache ECharts.
 *
 * Responsibilities:
 * - init once the container is mounted
 * - setOption updates on option changes (full replace by default)
 * - resize on container changes (ResizeObserver) + window resize
 * - dispose on unmount to avoid leaks
 */
export function EChart(props: EChartProps) {
  const {
    option,
    className,
    style,
    renderer = "canvas",
    setOptionOpts,
    onEvents,
  } = props

  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<ReturnType<typeof echarts.init> | null>(null)

  const resolvedStyle = useMemo<CSSProperties>(() => {
    return {
      width: "100%",
      height: "100%",
      ...style,
    }
  }, [style])

  const resolvedSetOptionOpts = useMemo<SetOptionOpts>(() => {
    return {
      notMerge: true,
      lazyUpdate: true,
      ...setOptionOpts,
    }
  }, [setOptionOpts])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const instance = echarts.init(container, undefined, { renderer })
    instanceRef.current = instance

    return () => {
      instanceRef.current = null
      instance.dispose()
    }
  }, [renderer])

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance) return
    instance.setOption(option, resolvedSetOptionOpts)
  }, [option, resolvedSetOptionOpts])

  useEffect(() => {
    const container = containerRef.current
    const instance = instanceRef.current
    if (!container || !instance) return

    const handleResize = () => {
      instance.resize()
    }

    const resizeObserver = new ResizeObserver(() => handleResize())
    resizeObserver.observe(container)
    window.addEventListener("resize", handleResize)

    return () => {
      resizeObserver.disconnect()
      window.removeEventListener("resize", handleResize)
    }
  }, [renderer])

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance || !onEvents) return

    const entries = Object.entries(onEvents)
    for (const [eventName, handler] of entries) {
      instance.on(eventName, handler as any)
    }

    return () => {
      for (const [eventName, handler] of entries) {
        instance.off(eventName, handler as any)
      }
    }
  }, [onEvents])

  return <div ref={containerRef} className={className} style={resolvedStyle} />
}
