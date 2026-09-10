import "./apiCheckModalHostMocks"

import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { dispatchOpenApiCheckModal } from "~/entrypoints/content/webAiApiCheck/events"
import { getWebAiApiCheckProbeTestId } from "~/entrypoints/content/webAiApiCheck/testIds"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"

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
        getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RunProbe)[0][1],
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
})
