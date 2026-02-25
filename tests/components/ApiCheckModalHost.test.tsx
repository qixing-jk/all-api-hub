import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ApiCheckModalHost } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckModalHost"
import {
  API_CHECK_MODAL_HOST_READY_EVENT,
  dispatchOpenApiCheckModal,
  type ApiCheckOpenModalDetail,
} from "~/entrypoints/content/webAiApiCheck/events"
import { render } from "~/tests/test-utils/render"
import { sendRuntimeMessage } from "~/utils/browserApi"

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: vi.fn(),
  }
})

describe("ApiCheckModalHost", () => {
  beforeEach(() => {
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      return { success: false }
    })
  })

  const renderSubject = () => render(<ApiCheckModalHost />)

  const openModal = async (
    detailOverrides?: Partial<ApiCheckOpenModalDetail>,
  ) => {
    const defaultDetail: ApiCheckOpenModalDetail = {
      sourceText: "",
      pageUrl: "https://example.com",
      trigger: "contextMenu",
    }

    const hostReady = new Promise<void>((resolve) => {
      window.addEventListener(
        API_CHECK_MODAL_HOST_READY_EVENT,
        () => resolve(),
        { once: true },
      )
    })

    renderSubject()
    await hostReady

    await act(async () => {
      dispatchOpenApiCheckModal({ ...defaultDetail, ...detailOverrides })
    })
  }

  it("opens with empty inputs for manual trigger without selection", async () => {
    await openModal()

    const modal = await screen.findByTestId("api-check-modal")
    expect(modal).toBeInTheDocument()

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement
    const apiKeyInput = screen.getByPlaceholderText(
      "sk-...",
    ) as HTMLInputElement

    expect(baseUrlInput.value).toBe("")
    expect(apiKeyInput.value).toBe("")
  })

  it("auto-extract fills baseUrl + apiKey from pasted text", async () => {
    const user = userEvent.setup()
    await openModal()

    const textarea = await screen.findByPlaceholderText(
      "webAiApiCheck:modal.sourceText.placeholder",
    )

    await user.type(
      textarea,
      "Base URL: https://proxy.example.com/api/v1\nAPI Key: sk-abcdef1234567890",
    )

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement
    const apiKeyInput = screen.getByPlaceholderText(
      "sk-...",
    ) as HTMLInputElement

    await waitFor(() => {
      expect(baseUrlInput.value).toBe("https://proxy.example.com/api")
      expect(apiKeyInput.value).toBe("sk-abcdef1234567890")
    })
  })

  it("auto-fetches models and preselects the first model id", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: ["m1", "m2"] }
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.type(baseUrlInput, "https://proxy.example.com/api")
    await user.type(apiKeyInput, "sk-abcdef1234567890")

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-abcdef1234567890",
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId("api-check-model-id")).toHaveTextContent("m1")
    })

    await user.click(screen.getByTestId("api-check-model-id"))
    await user.click(await screen.findByText("m2"))

    await waitFor(() => {
      expect(screen.getByTestId("api-check-model-id")).toHaveTextContent("m2")
    })
  })

  it("test displays sanitized errors returned from background", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
        return {
          success: true,
          result: {
            id: message.probeId,
            status: "fail",
            latencyMs: 0,
            summary: "Unauthorized: [REDACTED]",
          },
        }
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.type(baseUrlInput, "https://proxy.example.com/api")
    await user.type(apiKeyInput, "sk-secret-xyz")

    const probeCard = await screen.findByTestId(
      "api-check-probe-text-generation",
    )

    await user.click(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    )

    expect(
      await within(probeCard).findByText("Unauthorized: [REDACTED]"),
    ).toBeInTheDocument()
  })

  it("saves credentials to API profiles", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
        return {
          success: true,
          result: {
            id: message.probeId,
            status: "success",
            latencyMs: 1,
            summary: "OK",
          },
        }
      }
      if (message.action === RuntimeActionIds.ApiCheckSaveProfile) {
        return {
          success: true,
          profileId: "p-1",
          name: "proxy.example.com (OpenAI-compatible)",
          apiType: message.apiType,
          baseUrl: "https://proxy.example.com/api",
        }
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.type(baseUrlInput, "https://proxy.example.com/api")
    await user.type(apiKeyInput, "sk-secret-xyz")

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-secret-xyz",
      })
    })

    const saveButton = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.saveToProfiles",
    })

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })

    await user.click(saveButton)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckSaveProfile,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-secret-xyz",
        pageUrl: "https://example.com",
      })
    })
  })

  it("allows saving credentials while tests are running", async () => {
    const user = userEvent.setup()

    let resolveModelsProbe: ((value: unknown) => void) | null = null

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }

      if (
        message.action === RuntimeActionIds.ApiCheckRunProbe &&
        message.probeId === "models"
      ) {
        return await new Promise((resolve) => {
          resolveModelsProbe = resolve
        })
      }

      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
        return {
          success: true,
          result: {
            id: message.probeId,
            status: "pass",
            latencyMs: 1,
            summary: "OK",
          },
        }
      }

      if (message.action === RuntimeActionIds.ApiCheckSaveProfile) {
        return {
          success: true,
          profileId: "p-1",
          name: "proxy.example.com (OpenAI-compatible)",
          apiType: message.apiType,
          baseUrl: message.baseUrl,
        }
      }

      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.type(baseUrlInput, "https://proxy.example.com/api")
    await user.type(apiKeyInput, "sk-secret-xyz")

    const saveButton = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.saveToProfiles",
    })

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })

    await user.click(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    )

    await waitFor(() => {
      expect(typeof resolveModelsProbe).toBe("function")
      expect(saveButton).not.toBeDisabled()
    })

    const resolveProbe = resolveModelsProbe as ((value: unknown) => void) | null
    if (!resolveProbe) {
      throw new Error("Expected models probe resolver to be available")
    }

    resolveProbe({
      success: true,
      result: {
        id: "models",
        status: "pass",
        latencyMs: 1,
        summary: "OK",
      },
    })

    await user.click(saveButton)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckSaveProfile,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-secret-xyz",
        pageUrl: "https://example.com",
      })
    })
  })
})
