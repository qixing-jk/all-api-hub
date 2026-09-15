import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import ModelKeyDialog from "~/features/ModelList/components/ModelKeyDialog"
import { buildNewApiKeyCreationResult } from "~~/tests/test-utils/accountKeyFixtures"
import {
  buildSub2ApiAccount,
  buildSub2ApiToken,
} from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const mocks = vi.hoisted(() => ({
  inventory: vi.fn(),
  prepare: vi.fn(),
  create: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock("~/lib/notify", () => ({
  default: { success: mocks.success, error: mocks.error },
}))
vi.mock(
  "~/services/accounts/utils/apiServiceRequest",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/accounts/utils/apiServiceRequest")
    >()),
    fetchDisplayAccountRuntimeKeys: mocks.inventory,
  }),
)
vi.mock("~/services/accounts/accountKeyCreation", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("~/services/accounts/accountKeyCreation")
  >()),
  prepareDefaultAccountKeyCreation: mocks.prepare,
}))
vi.mock("~/features/TokenProvisioning/components/AddTokenDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Native group editor</div> : null,
}))
const account = buildSub2ApiAccount()

describe("ModelKeyDialog Sub2API native creation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.inventory.mockResolvedValue([])
    mocks.prepare.mockResolvedValue({ kind: "ready", create: mocks.create })
  })
  it("passes group intent to the provider and accepts confirmed native facts", async () => {
    mocks.create.mockResolvedValue(
      buildNewApiKeyCreationResult(
        account,
        buildSub2ApiToken({ group: "vip" }),
      ),
    )
    const user = userEvent.setup()
    render(
      <ModelKeyDialog
        isOpen
        onClose={() => {}}
        account={account}
        modelId="gpt-4"
        modelEnableGroups={["vip"]}
      />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1))
    expect(mocks.prepare).toHaveBeenCalledWith(
      account,
      expect.objectContaining({
        intent: {
          nameHint: "vip group (auto)",
          preferredGroup: "vip",
          allowedGroups: ["vip"],
        },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(mocks.success).toHaveBeenCalledWith(
      "modelList:keyDialog.createSuccess",
    )
    expect(
      screen.queryByText("keyManagement:oneTimeKey.title"),
    ).not.toBeInTheDocument()
  })
  it("opens the provider editor when the group requires user input", async () => {
    mocks.prepare.mockResolvedValue({ kind: "input-required" })
    const user = userEvent.setup()
    render(
      <ModelKeyDialog
        isOpen
        onClose={() => {}}
        account={account}
        modelId="gpt-4"
        modelEnableGroups={["vip"]}
      />,
    )
    await user.click(
      await screen.findByRole("button", {
        name: "modelList:keyDialog.createKey",
      }),
    )
    expect(await screen.findByText("Native group editor")).toBeVisible()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
