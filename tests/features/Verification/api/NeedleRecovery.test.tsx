import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { I18nextProvider } from "react-i18next"
import { expect, it, vi } from "vitest"

import { NeedlePanel } from "~/features/Verification/api/NeedlePanel"
import { useNeedleTest } from "~/features/Verification/api/useNeedleTest"
import en from "~/locales/en/aiApiVerification.json"
import { LONG_CONTEXT_ERROR_NAMES } from "~/services/verification/webAiApiCheck/longContextConstants"
import { createResourceTestI18n } from "~~/tests/test-utils/i18n"

it.each(["metadata", "checkpoint"])(
  "allows recovery from a %s failure through the panel",
  async (kind) => {
    const user = userEvent.setup()
    const i18n = await createResourceTestI18n({ en: { aiApiVerification: en } })
    const counter = { encoding: "o200k_base", estimated: true }
    const loadCounter = vi.fn().mockResolvedValue(counter)
    if (kind === "metadata")
      loadCounter.mockRejectedValueOnce(new Error("Unavailable"))
    const discard = vi
      .fn()
      .mockRejectedValueOnce(new Error("Storage unavailable"))
      .mockResolvedValueOnce(undefined)
    const runner = vi.fn().mockRejectedValue(
      Object.assign(new Error("Checkpoint unavailable"), {
        name: LONG_CONTEXT_ERROR_NAMES.NeedleCheckpoint,
      }),
    )
    function Harness() {
      const controller = useNeedleTest({
        enabled: true,
        blocked: false,
        contextKey: "recovery",
        modelId: "test",
        loadCounter,
        runner,
        resolveHistoryRequest: async () => null,
        resolveRequest: async () => ({
          baseUrl: "https://example.invalid",
          apiKey: "test",
          apiType: "openai-compatible",
          modelId: "test",
          mode: "non-streaming",
          requestProfile: "default",
          requestProfileEnhanced: false,
          secrets: [],
        }),
        discardCheckpoints: discard,
      })
      return (
        <NeedlePanel
          controller={controller}
          runCapacity={vi.fn()}
          canRunCapacity={false}
        />
      )
    }
    render(
      <I18nextProvider i18n={i18n}>
        <Harness />
      </I18nextProvider>,
    )
    if (kind === "metadata") {
      await user.click(
        await screen.findByRole("button", {
          name: en.verifyDialog.tools.needle.retry,
        }),
      )
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "Run needle test" }),
        ).toBeEnabled(),
      )
      expect(screen.queryByRole("alert")).not.toBeInTheDocument()
      expect(runner).not.toHaveBeenCalled()
    } else {
      const start = screen.getByRole("button", { name: "Run needle test" })
      await waitFor(() => expect(start).toBeEnabled())
      await user.click(start)
      await user.click(
        await screen.findByRole("button", {
          name: en.verifyDialog.tools.context.discard,
        }),
      )
      await waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Storage unavailable",
        ),
      )
      expect(runner).toHaveBeenCalledOnce()
      await user.click(
        screen.getByRole("button", {
          name: en.verifyDialog.tools.context.discard,
        }),
      )
      await waitFor(() =>
        expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
      )
      expect(discard).toHaveBeenCalledTimes(2)
      expect(runner).toHaveBeenCalledOnce()
    }
  },
)
