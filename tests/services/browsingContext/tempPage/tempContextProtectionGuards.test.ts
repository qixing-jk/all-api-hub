import { beforeEach, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { checkTempContextProtectionGuards } from "~/services/browsingContext/tempPage/tempContextProtectionGuards"
import { sendTabMessageWithRetry } from "~/utils/browser/runtimeMessages"

vi.mock("~/utils/browser/runtimeMessages", () => ({
  sendTabMessageWithRetry: vi.fn(),
}))
beforeEach(() => vi.resetAllMocks())

it("waits for an Aliyun challenge to clear even when other guards pass", async () => {
  let blocked = true
  vi.mocked(sendTabMessageWithRetry).mockImplementation(
    async (_id, request) => ({
      success: true,
      passed:
        (request as { action: string }).action ===
        RuntimeActionIds.ContentCheckAliyunGuard
          ? !blocked
          : true,
    }),
  )
  await expect(
    checkTempContextProtectionGuards({ tabId: 1 }),
  ).resolves.toMatchObject({
    passed: false,
    aliyunPassed: false,
    verificationRequired: true,
  })
  blocked = false
  await expect(
    checkTempContextProtectionGuards({ tabId: 1 }),
  ).resolves.toMatchObject({
    passed: true,
    aliyunPassed: true,
    verificationRequired: false,
  })
})

it.each([
  undefined,
  { success: true, passed: "yes" },
  { success: false, passed: true },
])(
  "does not accept an unavailable or malformed guard response",
  async (reply) => {
    vi.mocked(sendTabMessageWithRetry).mockImplementation(
      async (_id, request) =>
        (request as { action: string }).action ===
        RuntimeActionIds.ContentCheckAliyunGuard
          ? reply
          : { success: true, passed: true },
    )
    await expect(
      checkTempContextProtectionGuards({ tabId: 1 }),
    ).resolves.toMatchObject({ passed: false, verificationRequired: false })
  },
)
