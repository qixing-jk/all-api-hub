import { beforeEach, expect, it, vi } from "vitest"

import {
  clearNewApiCredentialPagesForTests,
  resolveNewApiCredentialPage,
} from "~/services/apiAdapters/newApi/variantOperations/credentialPage"

const { fetchApi, inspect } = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  inspect: vi.fn(),
}))
vi.mock("~/services/apiTransport/request", () => ({ fetchApi }))
vi.mock(
  "~/services/apiAdapters/newApi/variantOperations/renderedCredentialPage",
  () => ({ inspectRenderedCredentialPage: inspect }),
)
beforeEach(() => {
  clearNewApiCredentialPagesForTests()
  fetchApi.mockReset().mockRejectedValue(new Error("unavailable"))
  inspect.mockReset()
})
const execution = {
  version: 2,
  kind: "user_command",
  command: "detect_account",
  surface: "options",
} as const
it("keeps rendering behind conclusive network evidence", async () => {
  fetchApi
    .mockResolvedValueOnce('<script src="/assets/index.js"></script>')
    .mockResolvedValueOnce('"/_authenticated/profile/"')
  await expect(
    resolveNewApiCredentialPage(
      "https://example.test",
      "/security#security-access",
      execution,
    ),
  ).resolves.toBe("/profile")
  expect(inspect).not.toHaveBeenCalled()
})
it("tries the next rendered page only after an explicit page-not-found result", async () => {
  inspect.mockResolvedValueOnce("not_found").mockResolvedValueOnce("credential")
  await expect(
    resolveNewApiCredentialPage(
      "https://example.test",
      "/security#security-access",
      execution,
    ),
  ).resolves.toBe("/profile")
  expect(inspect.mock.calls.map((c) => c[0])).toEqual([
    "https://example.test/security#security-access",
    "https://example.test/profile",
  ])
})
it("does not misclassify an unknown rendered result or open another page", async () => {
  inspect.mockResolvedValueOnce("unknown")
  await expect(
    resolveNewApiCredentialPage(
      "https://example.test",
      "/security#security-access",
      execution,
    ),
  ).resolves.toBe("/security#security-access")
  expect(inspect).toHaveBeenCalledTimes(1)
})
it("does not open a temporary page without explicit caller intent", async () => {
  await resolveNewApiCredentialPage(
    "https://example.test",
    "/security#security-access",
  )
  expect(inspect).not.toHaveBeenCalled()
})

it("caches rendered positive evidence so later clicks stay quiet", async () => {
  inspect.mockResolvedValueOnce("credential")
  await resolveNewApiCredentialPage(
    "https://example.test",
    "/security",
    execution,
  )
  await resolveNewApiCredentialPage(
    "https://example.test",
    "/security",
    execution,
  )
  expect(fetchApi).toHaveBeenCalledTimes(1)
  expect(inspect).toHaveBeenCalledTimes(1)
})

it("reuses a pending network warmup when the user opens the token page", async () => {
  let respond!: (html: string) => void
  fetchApi
    .mockReturnValueOnce(
      new Promise<string>((resolve) => {
        respond = resolve
      }),
    )
    .mockResolvedValueOnce('"/_authenticated/profile/"')
  const warmup = resolveNewApiCredentialPage(
    "https://example.test",
    "/security",
  )
  const click = resolveNewApiCredentialPage(
    "https://example.test/",
    "/security",
    execution,
  )
  expect(fetchApi).toHaveBeenCalledTimes(1)
  respond('<script src="/assets/index.js"></script>')
  await expect(warmup).resolves.toBe("/profile")
  await expect(click).resolves.toBe("/profile")
  expect(fetchApi).toHaveBeenCalledTimes(2)
  expect(inspect).not.toHaveBeenCalled()
})
