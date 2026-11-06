import { afterEach, describe, expect, it, vi } from "vitest"

describe("CountUp import compatibility", () => {
  afterEach(() => {
    vi.doUnmock("react-countup")
    vi.resetModules()
  })

  it.each(["component", "module"])(
    "preserves the component identity from a %s default import",
    async (shape) => {
      const component = () => null
      vi.doMock("react-countup", () => ({
        default: shape === "module" ? { default: component } : component,
      }))
      const { default: CountUp } = await import("~/lib/countup")
      expect(CountUp).toBe(component)
    },
  )
})
