import userEvent from "@testing-library/user-event"
import { expect, it, vi } from "vitest"

import { NanoGptCredentialGuide } from "~/features/AccountManagement/components/AccountDialog/form/NanoGptCredentialGuide"
import { parseNanoGptCredentials } from "~/services/apiService/nanogpt/credentials"
import { createTab } from "~/utils/browser/tabs"
import { render, screen } from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/tabs", () => ({ createTab: vi.fn() }))

it("preserves the inference draft while editing management credentials and recovers a failed tab open", async () => {
  const user = userEvent.setup()
  const onCredentialChange = vi.fn()
  render(
    <NanoGptCredentialGuide
      credential="inference-fixture"
      onCredentialChange={onCredentialChange}
    >
      <span>Inference draft</span>
    </NanoGptCredentialGuide>,
  )
  const input = await screen.findByLabelText(
    "accountDialog:nanoGptCredentials.managementToken",
  )
  expect(input).not.toBeRequired()
  await user.type(input, "m")
  expect(parseNanoGptCredentials(onCredentialChange.mock.calls[0]![0])).toEqual(
    { apiKey: "inference-fixture", managementToken: "m" },
  )
  vi.mocked(createTab).mockRejectedValueOnce(new Error("blocked"))
  await user.click(
    screen.getByRole("button", {
      name: "accountDialog:nanoGptCredentials.openManagement",
    }),
  )
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "accountDialog:nanoGptCredentials.openManagementFailed",
  )
  vi.mocked(createTab).mockResolvedValueOnce(undefined)
  await user.click(
    screen.getByRole("button", {
      name: "accountDialog:nanoGptCredentials.openManagement",
    }),
  )
  expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  expect(createTab).toHaveBeenLastCalledWith(
    "https://nano-gpt.com/settings#management-api-tokens",
    true,
  )
  expect(screen.getByText("Inference draft")).toBeVisible()
})
