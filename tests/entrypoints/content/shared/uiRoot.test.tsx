import { waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CONTENT_UI_HOST_TAG } from "~/entrypoints/content/shared/contentUi"

const {
  createRootMock,
  createShadowRootUiMock,
  loggerWarnMock,
  ensureContentI18nReadyMock,
  mockContentReactRoot,
} = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  createShadowRootUiMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  ensureContentI18nReadyMock: vi.fn(),
  mockContentReactRoot: vi.fn(() => null),
}))

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}))

vi.mock("wxt/utils/content-script-context", () => ({
  ContentScriptContext: class ContentScriptContext {},
}))

vi.mock("wxt/utils/content-script-ui/shadow-root", () => ({
  createShadowRootUi: createShadowRootUiMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    warn: loggerWarnMock,
  }),
}))

vi.mock("~/utils/i18n/content", () => ({
  ensureContentI18nReady: ensureContentI18nReadyMock,
}))

vi.mock("~/entrypoints/content/shared/ContentReactRoot", () => ({
  ContentReactRoot: mockContentReactRoot,
}))

describe("uiRoot", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    ensureContentI18nReadyMock.mockResolvedValue(undefined)
  })

  it("warns and does not try to mount when the content-script context has not been set", async () => {
    const { ensureRedemptionToastUi } = await import(
      "~/entrypoints/content/shared/uiRoot"
    )

    await ensureRedemptionToastUi()

    expect(loggerWarnMock).toHaveBeenCalledWith(
      "ContentScriptContext not set, cannot mount UI",
    )
    expect(createShadowRootUiMock).not.toHaveBeenCalled()
    expect(createRootMock).not.toHaveBeenCalled()
  })

  it("waits for persisted UI language readiness before rendering the shared content UI", async () => {
    const container = document.createElement("div")
    const root = {
      render: vi.fn(),
      unmount: vi.fn(),
    }
    const mountMock = vi.fn()

    createRootMock.mockReturnValue(root)
    createShadowRootUiMock.mockImplementation(async (_ctx, options) => {
      mountMock.mockImplementation(() => {
        options.onMount(container)
      })
      return {
        mount: mountMock,
      }
    })

    const { ensureRedemptionToastUi, setContentScriptContext } = await import(
      "~/entrypoints/content/shared/uiRoot"
    )

    setContentScriptContext({ contentScript: "ctx" } as any)

    await ensureRedemptionToastUi()

    expect(ensureContentI18nReadyMock).toHaveBeenCalledTimes(1)
    expect(ensureContentI18nReadyMock.mock.invocationCallOrder[0]).toBeLessThan(
      createShadowRootUiMock.mock.invocationCallOrder[0],
    )
    expect(root.render).toHaveBeenCalledTimes(1)
  })

  it("mounts the shared content UI once, skips repeat mounts while active, and remounts after removal", async () => {
    const container = document.createElement("div")
    type MockRoot = {
      render: ReturnType<typeof vi.fn>
      unmount: ReturnType<typeof vi.fn>
    }
    const root = {
      render: vi.fn(),
      unmount: vi.fn(),
    } satisfies MockRoot
    const mountMock = vi.fn()
    let removeHandler: ((root: MockRoot | undefined) => void) | undefined

    createRootMock.mockReturnValue(root)
    createShadowRootUiMock.mockImplementation(async (_ctx, options) => {
      removeHandler = options.onRemove
      mountMock.mockImplementation(() => {
        options.onMount(container)
      })
      return {
        mount: mountMock,
      }
    })

    const { ensureRedemptionToastUi, setContentScriptContext } = await import(
      "~/entrypoints/content/shared/uiRoot"
    )

    const ctx = { contentScript: "ctx" } as any
    setContentScriptContext(ctx)

    await ensureRedemptionToastUi()

    expect(createShadowRootUiMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        name: CONTENT_UI_HOST_TAG,
        position: "overlay",
        zIndex: 2147483647,
        anchor: "body",
        onMount: expect.any(Function),
        onRemove: expect.any(Function),
      }),
    )
    expect(mountMock).toHaveBeenCalledTimes(1)
    expect(createRootMock).toHaveBeenCalledWith(container)
    expect(root.render).toHaveBeenCalledTimes(1)

    const renderedTree = root.render.mock.calls[0]?.[0]
    expect(React.isValidElement(renderedTree)).toBe(true)
    expect((renderedTree as React.ReactElement).type).toBe(mockContentReactRoot)

    await ensureRedemptionToastUi()

    expect(createShadowRootUiMock).toHaveBeenCalledTimes(1)
    expect(createRootMock).toHaveBeenCalledTimes(1)

    expect(removeHandler).toBeTypeOf("function")
    removeHandler?.(root)

    expect(root.unmount).toHaveBeenCalledTimes(1)

    await ensureRedemptionToastUi()

    expect(createShadowRootUiMock).toHaveBeenCalledTimes(2)
    expect(createRootMock).toHaveBeenCalledTimes(2)
  })

  it("reuses the in-flight mounting promise so concurrent callers do not mount twice", async () => {
    const container = document.createElement("div")
    type MockRoot = {
      render: ReturnType<typeof vi.fn>
      unmount: ReturnType<typeof vi.fn>
    }
    const root = {
      render: vi.fn(),
      unmount: vi.fn(),
    } satisfies MockRoot
    const mountMock = vi.fn()
    let releaseUiCreation: (() => void) | undefined

    createRootMock.mockReturnValue(root)
    createShadowRootUiMock.mockImplementation(
      async (_ctx, options) =>
        await new Promise((resolve) => {
          releaseUiCreation = () => {
            mountMock.mockImplementation(() => {
              options.onMount(container)
            })
            resolve({ mount: mountMock })
          }
        }),
    )

    const { ensureRedemptionToastUi, setContentScriptContext } = await import(
      "~/entrypoints/content/shared/uiRoot"
    )

    setContentScriptContext({ contentScript: "ctx" } as any)

    const firstMount = ensureRedemptionToastUi()
    const secondMount = ensureRedemptionToastUi()

    await waitFor(() => {
      expect(createShadowRootUiMock).toHaveBeenCalledTimes(1)
    })

    releaseUiCreation?.()

    await Promise.all([firstMount, secondMount])

    expect(mountMock).toHaveBeenCalledTimes(1)
    expect(createRootMock).toHaveBeenCalledTimes(1)
    expect(root.render).toHaveBeenCalledTimes(1)
  })
})
