import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"

import "./apiCheckModalHostMocks"

import {
  act,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { dispatchOpenApiCheckModal } from "~/features/WebAiApiCheck/content/events"
import { useApiCheckModalViewModel } from "~/features/WebAiApiCheck/content/modal/useApiCheckModalViewModel"
import {
  getWebAiApiCheckProbeTestId,
  WEB_AI_API_CHECK_TEST_IDS,
} from "~/features/WebAiApiCheck/content/testIds"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { atIndex } from "~~/tests/test-utils/indexedAccess"

import {
  createDeferred,
  getApiCheckMessageCalls,
  openModal,
  pasteIntoField,
  setupApiCheckModalHostTest,
  waitForSelectedModelId,
} from "./apiCheckModalHostTestSupport"

describe("web API verification modes", () => {
  setupApiCheckModalHostTest()

  it("sends the agent workspace mode and cancels the same background run", async () => {
    const pending = createDeferred<any>()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.RunPelican)
          return pending.promise
        if (type === WebAiApiCheckMessageTypes.FetchModels)
          return { success: true, modelIds: ["model"] }
        return { success: true }
      },
    )
    const { result } = renderHook(useApiCheckModalViewModel)
    act(() =>
      dispatchOpenApiCheckModal({
        trigger: "contextMenu",
        pageUrl: "https://example.invalid",
        sourceText: "",
      }),
    )
    act(() => {
      result.current.actions.updateBaseUrl("https://example.invalid")
      result.current.actions.setApiKey("synthetic-key")
      result.current.actions.setModelId("model")
    })
    await waitFor(() => expect(result.current.view.modelId).toBe("model"))
    act(() =>
      result.current.view.verificationTools.setPelicanExecutionMode("agent"),
    )
    act(() => result.current.view.verificationTools.runPelican())
    await waitFor(() =>
      expect(
        getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RunPelican),
      ).toHaveLength(1),
    )
    const request = getApiCheckMessageCalls(
      WebAiApiCheckMessageTypes.RunPelican,
    )[0]![1] as any
    expect(request).toMatchObject({
      executionMode: "agent",
      runId: expect.any(String),
      requestProfile: "default",
    })
    act(() => result.current.view.verificationTools.stopPelican())
    await waitFor(() =>
      expect(
        getApiCheckMessageCalls(WebAiApiCheckMessageTypes.CancelRunProbe),
      ).toContainEqual([
        WebAiApiCheckMessageTypes.CancelRunProbe,
        { runId: request.runId },
      ]),
    )
    await act(async () => pending.resolve({ success: false, error: "Aborted" }))
    await waitFor(() => expect(result.current.view.canClose).toBe(true))
  })

  it("ignores enhanced simulation changes while a page probe is active", async () => {
    const pending = createDeferred<any>()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels)
          return { success: true, modelIds: ["model"] }
        if (type === WebAiApiCheckMessageTypes.RunProbe) return pending.promise
        return { success: false }
      },
    )
    const { result } = renderHook(useApiCheckModalViewModel)
    act(() =>
      dispatchOpenApiCheckModal({
        trigger: "contextMenu",
        pageUrl: "https://example.invalid",
        sourceText: "",
      }),
    )
    act(() => {
      result.current.actions.updateBaseUrl("https://example.invalid")
      result.current.actions.setApiKey("synthetic-key")
      result.current.actions.setRequestProfile(
        API_VERIFICATION_REQUEST_PROFILES.Codex,
      )
      result.current.actions.setModelId("model")
    })
    act(() => result.current.actions.runProbe("models"))
    await waitFor(() => expect(result.current.view.canClose).toBe(false))
    act(() => result.current.actions.setRequestProfileEnhanced(true))
    expect(result.current.view.requestProfileEnhanced).toBe(false)
    await act(async () => {
      pending.resolve({
        success: true,
        result: {
          id: "models",
          status: "pass",
          latencyMs: 1,
          summary: "OK",
        },
      })
    })
    await waitFor(() => expect(result.current.view.canClose).toBe(true))
    act(() =>
      result.current.actions.setRequestProfile(
        API_VERIFICATION_REQUEST_PROFILES.Default,
      ),
    )
    expect(result.current.view.apiType).toBe("openai")
    expect(result.current.view.requestProfileEnhanced).toBe(false)
  })

  it("lets a page text test select a CLI request profile through the modal portal", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, request: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels)
          return { success: true, modelIds: ["gpt-test"] }
        if (type === WebAiApiCheckMessageTypes.RunProbe)
          return {
            success: true,
            result: {
              id: request.probeId,
              status: "pass",
              latencyMs: 1,
              summary: "OK",
              requestProfile: request.requestProfile,
            },
          }
        return { success: false }
      },
    )
    await openModal()
    await pasteIntoField(
      user,
      screen.getByPlaceholderText("https://example.com/api"),
      "https://proxy.example.com/api",
    )
    await pasteIntoField(
      user,
      screen.getByPlaceholderText("sk-..."),
      "sk-page-test",
    )
    await waitForSelectedModelId("gpt-test")
    await user.click(screen.getByRole("combobox", { name: /requestProfile/ }))
    const option = await screen.findByRole("option", { name: /codex/ })
    expect(
      document.querySelector('[data-slot="api-check-portal-container"]'),
    ).toContainElement(option)
    await user.click(option)
    const enhanced = screen.getByRole("switch", { name: /enhancedLabel/ })
    expect(enhanced).not.toBeChecked()
    await user.click(enhanced)
    const probe = screen.getByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )
    await user.click(
      within(probe).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )
    await waitFor(() =>
      expect(
        getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RunProbe),
      ).toContainEqual([
        WebAiApiCheckMessageTypes.RunProbe,
        expect.objectContaining({
          apiType: "openai",
          requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
          requestProfileEnhanced: true,
          probeId: "text-generation",
        }),
      ]),
    )
  })

  it.each(["failed response", "rejected message"])(
    "retains generation modes after a %s without labeling model-list results",
    async (failure) => {
      const user = userEvent.setup()
      vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
        async (type: any) => {
          if (type === WebAiApiCheckMessageTypes.FetchModels) {
            return { success: true, modelIds: ["mode-test"] }
          }
          if (
            type === WebAiApiCheckMessageTypes.RunProbe &&
            failure === "rejected message"
          ) {
            throw new Error("Message unavailable")
          }
          return { success: false }
        },
      )

      await openModal()
      await pasteIntoField(
        user,
        screen.getByPlaceholderText("https://example.com/api"),
        "https://proxy.example.com/api",
      )
      await pasteIntoField(
        user,
        screen.getByPlaceholderText("sk-..."),
        "sk-test-mode-fixture",
      )
      await waitForSelectedModelId("mode-test")
      const modeSelect = screen.getByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.mode",
      })
      await user.click(modeSelect)
      await user.click(
        screen.getByRole("option", {
          name: "aiApiVerification:verifyDialog.modes.nonStreaming",
        }),
      )
      await user.click(
        screen.getByRole("button", {
          name: "webAiApiCheck:modal.actions.test",
        }),
      )

      await waitFor(() => {
        expect(
          getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RunProbe),
        ).toHaveLength(5)
        expect(modeSelect).toBeEnabled()
      })
      const textProbe = screen.getByTestId(
        getWebAiApiCheckProbeTestId("text-generation"),
      )
      expect(
        within(textProbe).getByText(
          "webAiApiCheck:modal.errors.runProbeFailed",
        ),
      ).toBeVisible()
      expect(
        within(textProbe).getByText(
          "aiApiVerification:verifyDialog.modes.nonStreaming",
        ),
      ).toBeVisible()
      expect(
        within(
          screen.getByTestId(getWebAiApiCheckProbeTestId("models")),
        ).queryByText("aiApiVerification:verifyDialog.modes.nonStreaming"),
      ).not.toBeInTheDocument()
    },
  )

  it("selects API types from the project control inside the page modal portal", async () => {
    const user = userEvent.setup()
    await openModal()

    const apiTypeSelect = screen.getByRole("combobox", {
      name: "webAiApiCheck:modal.fields.apiType",
    })
    await user.click(apiTypeSelect)
    const anthropicOption = await screen.findByRole("option", {
      name: "Anthropic",
    })
    expect(
      document.querySelector('[data-slot="api-check-portal-container"]'),
    ).toContainElement(anthropicOption)
    await user.click(anthropicOption)
    expect(apiTypeSelect).toHaveTextContent(/^Anthropic$/)
  })

  it.each([false, true])(
    "keeps the selected mode through execution and recorded results (run all: %s)",
    async (runAll) => {
      const user = userEvent.setup()
      const probeGate = createDeferred<void>()
      vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
        async (type: any, request: any) => {
          if (type === WebAiApiCheckMessageTypes.FetchModels) {
            return { success: true, modelIds: ["mode-test"] }
          }
          if (type === WebAiApiCheckMessageTypes.RunProbe) {
            await probeGate.promise
            return {
              success: true,
              result: {
                id: request.probeId,
                ...(request.probeId === "models" ? {} : { mode: request.mode }),
                status: "pass",
                latencyMs: 1,
                summary: "Mode fixture passed",
              },
            }
          }
          return { success: false }
        },
      )

      await openModal()
      await pasteIntoField(
        user,
        screen.getByPlaceholderText("https://example.com/api"),
        "https://proxy.example.com/api",
      )
      await pasteIntoField(
        user,
        screen.getByPlaceholderText("sk-..."),
        "sk-test-mode-fixture",
      )
      await waitForSelectedModelId("mode-test")

      const modeSelect = screen.getByRole("combobox", {
        name: "aiApiVerification:verifyDialog.meta.mode",
      })
      expect(modeSelect).toHaveTextContent(
        "aiApiVerification:verifyDialog.modes.streaming",
      )
      await user.click(modeSelect)
      const nonStreamingOption = screen.getByRole("option", {
        name: "aiApiVerification:verifyDialog.modes.nonStreaming",
      })
      expect(
        document.querySelector('[data-slot="api-check-portal-container"]'),
      ).toContainElement(nonStreamingOption)
      await user.click(nonStreamingOption)

      const textProbe = screen.getByTestId(
        getWebAiApiCheckProbeTestId("text-generation"),
      )
      await user.click(
        runAll
          ? screen.getByRole("button", {
              name: "webAiApiCheck:modal.actions.test",
            })
          : within(textProbe).getByRole("button", {
              name: "webAiApiCheck:modal.actions.runOne",
            }),
      )

      await waitFor(() => {
        expect(
          getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RunProbe),
        ).toHaveLength(1)
      })
      expect(
        screen.getByRole("combobox", {
          name: "webAiApiCheck:modal.fields.apiType",
        }),
      ).toBeDisabled()
      expect(modeSelect).toBeDisabled()
      expect(
        atIndex(
          getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RunProbe),
          0,
        )[1],
      ).toMatchObject({ mode: "non-streaming" })

      await act(async () => {
        probeGate.resolve()
      })
      expect(
        await within(textProbe).findByText("Mode fixture passed"),
      ).toBeVisible()
      await waitFor(() => expect(modeSelect).toBeEnabled())

      const probeRequests = getApiCheckMessageCalls(
        WebAiApiCheckMessageTypes.RunProbe,
      )
      expect(probeRequests).toHaveLength(runAll ? 5 : 1)
      for (const [, request] of probeRequests) {
        expect(request).toMatchObject({ mode: "non-streaming" })
      }

      await user.click(modeSelect)
      await user.click(
        screen.getByRole("option", {
          name: "aiApiVerification:verifyDialog.modes.streaming",
        }),
      )
      expect(
        within(textProbe).getByText(
          "aiApiVerification:verifyDialog.modes.nonStreaming",
        ),
      ).toBeVisible()
      expect(
        within(
          screen.getByTestId(getWebAiApiCheckProbeTestId("models")),
        ).queryByText("aiApiVerification:verifyDialog.modes.nonStreaming"),
      ).not.toBeInTheDocument()

      await user.click(modeSelect)
      await user.click(
        screen.getByRole("option", {
          name: "aiApiVerification:verifyDialog.modes.nonStreaming",
        }),
      )
      await user.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )
      await act(async () => {
        dispatchOpenApiCheckModal({
          sourceText: "",
          pageUrl: "https://example.com",
          trigger: "contextMenu",
        })
      })
      expect(
        screen.getByRole("combobox", {
          name: "aiApiVerification:verifyDialog.meta.mode",
        }),
      ).toHaveTextContent("aiApiVerification:verifyDialog.modes.streaming")
    },
  )

  it("displays modality notices for image and video models", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["flux-schnell", "sora-1"] }
        }
        return { success: false }
      },
    )

    await openModal()
    await pasteIntoField(
      user,
      screen.getByPlaceholderText("https://example.com/api"),
      "https://proxy.example.com/api",
    )
    await pasteIntoField(
      user,
      screen.getByPlaceholderText("sk-..."),
      "sk-test-mode-modality",
    )
    await waitForSelectedModelId("flux-schnell")
    expect(
      screen.getByText("aiApiVerification:verifyDialog.modalityNotice.image"),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId))
    await user.click(await screen.findByText("sora-1"))
    await waitForSelectedModelId("sora-1")

    expect(
      screen.getByText("aiApiVerification:verifyDialog.modalityNotice.video"),
    ).toBeInTheDocument()
  })
})
