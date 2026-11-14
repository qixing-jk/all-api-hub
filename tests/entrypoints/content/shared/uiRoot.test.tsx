import { waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ContentScriptContext } from "wxt/utils/content-script-context"

import { CONTENT_UI_HOST_TAG } from "~/entrypoints/content/shared/contentUi"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

const {
  createRootMock,
  createShadowRootUiMock,
  loggerWarnMock,
  ensureContentI18nReadyMock,
  mockContentReactRoot,
  contentModuleReadyMock,
} = vi.hoisted(() => ({
  createRootMock: vi.fn(),
  createShadowRootUiMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  ensureContentI18nReadyMock: vi.fn(),
  mockContentReactRoot: vi.fn(() => null),
  contentModuleReadyMock: vi.fn(),
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

/** Only invalidation is read here; WXT UI creation is mocked below. */
function createContentContext() {
  return { isInvalid: false } as ContentScriptContext & { isInvalid: boolean }
}

describe("uiRoot", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    ensureContentI18nReadyMock.mockResolvedValue(undefined)
    contentModuleReadyMock.mockResolvedValue(undefined)
    vi.doMock("~/entrypoints/content/shared/ContentReactRoot", async () => {
      await contentModuleReadyMock()
      return { ContentReactRoot: mockContentReactRoot }
    })
  })

  it("skips an already expired context before loading language or UI", async () => {
    const { ensureRedemptionToastUi, setContentScriptContext } =
      await import("~/entrypoints/content/shared/uiRoot")
    const ctx = createContentContext()
    ctx.isInvalid = true
    setContentScriptContext(ctx)
    await ensureRedemptionToastUi()
    expect(ensureContentI18nReadyMock).not.toHaveBeenCalled()
    expect(createShadowRootUiMock).not.toHaveBeenCalled()
  })

  it.each(["expired", "replaced"])(
    "does not create UI when its context is %s during module loading",
    async (change) => {
      let finishModule!: () => void
      contentModuleReadyMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishModule = resolve
        }),
      )
      const { ensureRedemptionToastUi, setContentScriptContext } =
        await import("~/entrypoints/content/shared/uiRoot")
      const ctx = createContentContext()
      setContentScriptContext(ctx)
      const pending = ensureRedemptionToastUi()
      await waitFor(() => expect(contentModuleReadyMock).toHaveBeenCalledOnce())
      if (change === "expired") ctx.isInvalid = true
      else setContentScriptContext(createContentContext())
      finishModule()
      await pending
      expect(createShadowRootUiMock).not.toHaveBeenCalled()
      expect(createRootMock).not.toHaveBeenCalled()
    },
  )

  it("warns and does not try to mount when the content-script context has not been set", async () => {
    const { ensureRedemptionToastUi } =
      await import("~/entrypoints/content/shared/uiRoot")

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

    const { ensureRedemptionToastUi, setContentScriptContext } =
      await import("~/entrypoints/content/shared/uiRoot")

    setContentScriptContext(createContentContext())

    await ensureRedemptionToastUi()

    expect(ensureContentI18nReadyMock).toHaveBeenCalledTimes(1)
    expect(ensureContentI18nReadyMock.mock.invocationCallOrder[0]).toBeLessThan(
      atIndex(createShadowRootUiMock.mock.invocationCallOrder, 0),
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

    const { ensureRedemptionToastUi, setContentScriptContext } =
      await import("~/entrypoints/content/shared/uiRoot")

    const ctx = createContentContext()
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

  it("keeps the shared content host attached after page DOM replacement and stops after removal", async () => {
    const host = document.createElement(CONTENT_UI_HOST_TAG)
    const container = document.createElement("div")
    const root = { render: vi.fn(), unmount: vi.fn() }
    let remove!: (value: typeof root) => void
    createRootMock.mockReturnValue(root)
    createShadowRootUiMock.mockImplementation(async (_ctx, options) => {
      remove = options.onRemove
      return {
        shadowHost: host,
        mount: () => {
          document.body.append(host)
          options.onMount(container)
        },
      }
    })
    const { ensureRedemptionToastUi, setContentScriptContext } =
      await import("~/entrypoints/content/shared/uiRoot")
    setContentScriptContext(createContentContext())
    await ensureRedemptionToastUi()
    host.remove()
    await waitFor(() => expect(host.isConnected).toBe(true))
    remove(root)
    host.remove()
    await Promise.resolve()
    expect(host.isConnected).toBe(false)
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

    const { ensureRedemptionToastUi, setContentScriptContext } =
      await import("~/entrypoints/content/shared/uiRoot")

    setContentScriptContext(createContentContext())

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

  it("discards a UI created after its content context expires and allows a fresh context to mount", async () => {
    const { ensureRedemptionToastUi, setContentScriptContext } =
      await import("~/entrypoints/content/shared/uiRoot")
    const ctx = createContentContext()
    const mount = vi.fn()
    const remove = vi.fn()
    let finishCreation!: () => void
    createShadowRootUiMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCreation = () => resolve({ mount, remove })
        }),
    )
    setContentScriptContext(ctx)
    const pending = ensureRedemptionToastUi()
    await waitFor(() => expect(createShadowRootUiMock).toHaveBeenCalledOnce())
    ctx.isInvalid = true
    finishCreation()
    await pending

    expect(mount).not.toHaveBeenCalled()
    expect(remove).toHaveBeenCalledOnce()
    expect(createRootMock).not.toHaveBeenCalled()

    setContentScriptContext(createContentContext())
    createShadowRootUiMock.mockResolvedValueOnce({ mount, remove })
    await ensureRedemptionToastUi()
    expect(mount).toHaveBeenCalledOnce()
  })

  it.each(["expired", "replaced"])(
    "does not start creating UI when the context is %s while language is loading",
    async (change) => {
      const { ensureRedemptionToastUi, setContentScriptContext } =
        await import("~/entrypoints/content/shared/uiRoot")
      const ctx = createContentContext()
      let finishLanguage!: () => void
      ensureContentI18nReadyMock.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishLanguage = resolve
        }),
      )
      createShadowRootUiMock.mockResolvedValue({
        mount: vi.fn(),
        remove: vi.fn(),
      })
      setContentScriptContext(ctx)
      const pending = ensureRedemptionToastUi()
      if (change === "expired") {
        ctx.isInvalid = true
      } else {
        setContentScriptContext(createContentContext())
      }
      finishLanguage()
      await pending
      expect(createShadowRootUiMock).not.toHaveBeenCalled()
      expect(createRootMock).not.toHaveBeenCalled()
    },
  )
})
