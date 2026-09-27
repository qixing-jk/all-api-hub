import { afterEach, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import * as aihubmix from "~/services/apiAdapters/aihubmix/catalog"
import { createAIHubMixKeyEditor } from "~/services/apiAdapters/aihubmix/keyResourceEditor"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiFamilyTokenTransport } from "~/services/apiAdapters/newApi/tokenTransport"
import { createSub2ApiKeyEditor } from "~/services/apiAdapters/sub2api/keyResourceEditor"
import { createVoApiV2KeyEditor } from "~/services/apiAdapters/voapiV2/keyResourceEditor"
import * as sub2api from "~/services/apiService/sub2api"
import * as voapi from "~/services/apiService/voapiV2"
import { AuthTypeEnum } from "~/types"

const request = {
  baseUrl: "https://example.invalid",
  auth: { authType: AuthTypeEnum.AccessToken, accessToken: "test" },
}
afterEach(() => vi.restoreAllMocks())

it("restricts Sub2API options and submitted group IDs to the creation intent", async () => {
  const groups = [
    { id: 1, displayName: "VIP", description: "Priority", ratio: 1 },
    { id: 2, displayName: "Other", description: "Other", ratio: 2 },
  ]
  const fetch = vi
    .spyOn(sub2api, "fetchSub2ApiGroupDescriptors")
    .mockResolvedValue(groups)
  const editor = createSub2ApiKeyEditor(
    request,
    undefined,
    { allowedGroups: ["VIP"] },
    groups,
  )
  expect(editor.initialValues.group_id).toBe("1")
  expect(
    editor.validate({ ...editor.initialValues, group_id: "2" }),
  ).toMatchObject({
    valid: false,
    issues: [{ fieldId: "group_id", code: "required" }],
  })
  const signal = new AbortController().signal
  await expect(
    editor.loadOptions!("group_id", editor.initialValues, { signal }),
  ).resolves.toEqual([
    { value: "1", displayLabel: "VIP", secondaryLabel: "Priority · #1" },
  ])
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({ abortSignal: signal }),
  )
  await expect(
    editor.loadOptions!("name", editor.initialValues),
  ).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledTimes(1)
})

it("restricts VoAPI options and every selected group to the creation intent", async () => {
  const groups = [
    { id: 1, displayName: "VIP", requirementKey: "VIP" },
    { id: 2, displayName: "Other", requirementKey: "Other" },
  ]
  const fetch = vi
    .spyOn(voapi, "fetchVoApiV2KeyGroupDescriptors")
    .mockResolvedValue(groups)
  const editor = createVoApiV2KeyEditor(
    request,
    undefined,
    { allowedGroups: ["VIP"] },
    groups,
  )
  expect(editor.initialValues.groups).toEqual(["1"])
  expect(
    editor.validate({
      ...editor.initialValues,
      groups: ["1", "2"],
      boundlessAmount: true,
    }),
  ).toMatchObject({
    valid: false,
    issues: [{ fieldId: "groups", code: "invalid_value" }],
  })
  const signal = new AbortController().signal
  await expect(
    editor.loadOptions!("groups", editor.initialValues, { signal }),
  ).resolves.toEqual([
    { value: "1", displayLabel: "VIP", secondaryLabel: "#1" },
  ])
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({ abortSignal: signal }),
  )
  await expect(
    editor.loadOptions!("note", editor.initialValues),
  ).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledTimes(1)
})

it("loads AIHubMix models with cancellation and converts expiry/quota only at submission", async () => {
  const fetch = vi
    .spyOn(aihubmix, "fetchAccountAvailableModels")
    .mockResolvedValue(["model-a"])
  const editor = createAIHubMixKeyEditor(request, {
    id: 1,
    name: "Key",
    unlimited_quota: false,
    remain_quota: 500000,
    expired_time: 1893456000,
  })
  const signal = new AbortController().signal
  await expect(
    editor.loadOptions!("models", editor.initialValues, { signal }),
  ).resolves.toEqual([{ value: "model-a", displayLabel: "model-a" }])
  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({ abortSignal: signal }),
  )
  await expect(
    editor.loadOptions!("name", editor.initialValues),
  ).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(
    editor.buildCommand({
      ...editor.initialValues,
      quotaUsd: 2,
      expires_at: "2030-01-01T00:00:00Z",
    }).values,
  ).toMatchObject({ remain_quota: 1000000, expired_time: 1893456000 })
})

it("loads only allowed New API groups and keeps the model catalogue separate", async () => {
  const transport = {
    ...resolveNewApiFamilyTokenTransport(SITE_TYPES.NEW_API),
    fetchUserGroups: vi.fn().mockResolvedValue({
      VIP: { desc: "Priority" },
      Other: { desc: "Other" },
    }),
    fetchAccountAvailableModels: vi.fn().mockResolvedValue(["model-a"]),
  }
  const editor = createNewApiKeyEditor(
    SITE_TYPES.NEW_API,
    request,
    transport,
    undefined,
    { allowedGroups: ["VIP"] },
  )
  expect(
    editor.validate({ ...editor.initialValues, group: "Other" }),
  ).toMatchObject({
    valid: false,
    issues: [{ fieldId: "group", code: "required" }],
  })
  const signal = new AbortController().signal
  await expect(
    editor.loadOptions!("group", editor.initialValues, { signal }),
  ).resolves.toEqual([
    { value: "VIP", displayLabel: "VIP", secondaryLabel: "Priority" },
  ])
  await expect(
    editor.loadOptions!("model_limits", editor.initialValues),
  ).resolves.toEqual([{ value: "model-a", displayLabel: "model-a" }])
  await expect(
    editor.loadOptions!("name", editor.initialValues),
  ).resolves.toEqual([])
  expect(transport.fetchUserGroups).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ abortSignal: signal }),
  )
  expect(transport.fetchAccountAvailableModels).toHaveBeenCalledTimes(1)
})
