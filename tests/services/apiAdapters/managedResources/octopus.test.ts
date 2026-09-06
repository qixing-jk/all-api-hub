import { beforeEach, describe, expect, it, vi } from "vitest"

import { OCTOPUS_MANAGED_RESOURCE_FIELD_IDS as fields } from "~/constants/octopus"
import {
  octopusManagedResourceRegistration,
  openOctopusNativeResourceOperations,
} from "~/services/apiAdapters/managedResources/octopus"
import { OctopusMutationApiError } from "~/services/apiService/octopus"
import { ApiError } from "~/services/apiTransport/errors"
import {
  OCTOPUS_CHANNEL_DETAIL_AVAILABILITY,
  OctopusOutboundType,
  type OctopusChannel,
} from "~/types/octopus"

const mocks = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  listChannels: vi.fn(),
  getChannel: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  fetchRemoteModels: vi.fn(),
  usesChannelProtocolPaths: vi.fn(),
}))
vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferences: mocks.getPreferences },
}))
vi.mock("~/services/apiService/octopus", async (original) => ({
  ...(await original<typeof import("~/services/apiService/octopus")>()),
  ...mocks,
}))
const channel: OctopusChannel = {
  id: 7,
  name: "Example",
  type: 2,
  enabled: true,
  base_urls: [
    { url: "https://upstream.example.invalid", delay: 3 },
    { url: "https://backup.example.invalid" },
  ],
  keys: [
    { id: 9, enabled: false, channel_key: "sk-****" },
    { id: 10, enabled: true, channel_key: "other-secret" },
  ],
  model: "model-a",
  proxy: true,
  auto_sync: false,
  auto_group: 2,
  param_override: "{}",
}
describe("Octopus native resource", () => {
  it("keeps useful private read diagnostics while redacting known credentials", async () => {
    mocks.listChannels.mockRejectedValue(
      new ApiError(
        "Upstream temporarily busy: password-placeholder",
        503,
        undefined,
        undefined,
        "RATE_LIMITED",
      ),
    )
    const workspace = await octopusManagedResourceRegistration.open()
    await expect(workspace.list()).rejects.toMatchObject({
      failure: {
        code: "unavailable",
        message: "Upstream temporarily busy: [REDACTED]",
        upstreamCode: "RATE_LIMITED",
      },
    })
  })
  it.each([
    [
      true,
      "https://upstream.example.invalid/v1/",
      "https://upstream.example.invalid",
    ],
    [
      true,
      "https://upstream.example.invalid",
      "https://upstream.example.invalid",
    ],
    [
      true,
      "https://upstream.example.invalid/custom/v2",
      "https://upstream.example.invalid/custom/v2",
    ],
    [
      false,
      "https://upstream.example.invalid",
      "https://upstream.example.invalid/v1",
    ],
  ])(
    "adapts imported base URLs to protocol-path mode %s",
    async (protocolPaths, baseUrl, expected) => {
      mocks.usesChannelProtocolPaths.mockResolvedValue(protocolPaths)
      const operations = await openOctopusNativeResourceOperations()
      expect(
        await operations.prepareMigrationBaseUrl(
          baseUrl,
          OctopusOutboundType.OpenAIChat,
        ),
      ).toBe(expected)
    },
  )
  it.each(["/v1", "/api/v3"])(
    "keeps the Volcengine API prefix %s for unversioned protocol paths",
    async (path) => {
      mocks.usesChannelProtocolPaths.mockResolvedValue(true)
      const operations = await openOctopusNativeResourceOperations()
      expect(
        await operations.prepareMigrationBaseUrl(
          `https://upstream.example.invalid${path}/`,
          OctopusOutboundType.Volcengine,
        ),
      ).toBe(`https://upstream.example.invalid${path}`)
    },
  )
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.getPreferences.mockResolvedValue({
      octopus: {
        baseUrl: "http://hub.example.invalid",
        username: "admin",
        password: "password-placeholder",
      },
    })
    mocks.listChannels.mockResolvedValue([channel])
    mocks.getChannel.mockResolvedValue(channel)
    mocks.updateChannel.mockResolvedValue({
      success: true,
      data: { ...channel, name: "Renamed" },
    })
  })
  it("exposes native type and never exposes keys in facts", async () => {
    const workspace = await octopusManagedResourceRegistration.open()
    const page = await workspace.list()
    expect(page.items[0].fields).toContainEqual({
      fieldId: fields.Type,
      kind: "text",
      value: "2",
    })
    expect(JSON.stringify(page)).not.toContain("other-secret")
    expect(JSON.stringify(page)).not.toContain("sk-****")
  })
  it("updates only changed fields using the fresh native source", async () => {
    const workspace = await octopusManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    const editor = await workspace.openEditEditor(ref)
    await editor.submit({ ...editor.initialValues, [fields.Name]: "Renamed" })
    expect(mocks.updateChannel.mock.calls[0][1]).toEqual({
      id: 7,
      name: "Renamed",
      source: channel,
    })
  })
  it("keeps unknown native types editable without converting them", async () => {
    mocks.getChannel.mockResolvedValue({ ...channel, type: 90 })
    const workspace = await octopusManagedResourceRegistration.open()
    const editor = await workspace.openEditEditor(
      (await workspace.list()).items[0].ref,
    )
    expect(editor.initialValues[fields.Type]).toBe("90")
    expect(editor.validate(editor.initialValues)).toEqual({ valid: true })
  })
  it("treats create responses without identity as uncertain and prevents replay", async () => {
    mocks.createChannel.mockResolvedValue({ success: true, data: null })
    const editor = await (
      await octopusManagedResourceRegistration.open()
    ).openCreateEditor()
    const values = {
      ...editor.initialValues,
      [fields.Name]: "New",
      [fields.BaseUrl]: "http://upstream.example.invalid",
      [fields.Key]: { kind: "replace" as const, value: "secret-placeholder" },
    }
    expect((await editor.submit(values)).outcome).toBe("uncertain")
    await editor.submit(values)
    expect(mocks.createChannel).toHaveBeenCalledTimes(1)
  })
  it("rejects scope mismatches before reading or mutating", async () => {
    const workspace = await octopusManagedResourceRegistration.open()
    const ref = (await workspace.list()).items[0].ref
    await expect(
      workspace.get({ ...ref, scopeKey: "https://other.example.invalid" }),
    ).rejects.toMatchObject({ failure: { code: "validation_failed" } })
    expect(mocks.getChannel).not.toHaveBeenCalled()
  })
  it("keeps stats-only lists lazy and does not search fabricated protocol defaults", async () => {
    mocks.listChannels.mockResolvedValue([
      {
        ...channel,
        detailAvailability: OCTOPUS_CHANNEL_DETAIL_AVAILABILITY.Summary,
        type: 0,
        base_urls: [],
        keys: [],
      },
    ])
    const workspace = await octopusManagedResourceRegistration.open()
    const row = (await workspace.list()).items[0]
    expect(row.fields.some((field) => field.fieldId === fields.Type)).toBe(
      false,
    )
    expect(row.fields).toContainEqual({
      fieldId: fields.Key,
      kind: "secret",
      state: "permission-hidden",
    })
    expect(
      (await workspace.list({ search: "OpenAI Chat" })).items,
    ).toHaveLength(0)
    expect(mocks.getChannel).not.toHaveBeenCalled()
    const editor = await workspace.openEditEditor(row.ref)
    expect(editor.initialValues[fields.Type]).toBe("2")
  })
  it("loads a usable secret on demand and rejects masked credentials", async () => {
    const workspace = await octopusManagedResourceRegistration.open()
    const editor = await workspace.openEditEditor(
      (await workspace.list()).items[0].ref,
    )
    await expect(editor.loadSecret!(fields.Key)).rejects.toMatchObject({
      failure: { code: "unavailable" },
    })
    mocks.getChannel.mockResolvedValue({
      ...channel,
      keys: [{ enabled: true, channel_key: "secret-placeholder" }],
    })
    await expect(editor.loadSecret!(fields.Key)).resolves.toBe(
      "secret-placeholder",
    )
  })
  it("probes models with native type and an explicit replacement credential", async () => {
    mocks.fetchRemoteModels.mockResolvedValue(["model-b"])
    const workspace = await octopusManagedResourceRegistration.open()
    const editor = await workspace.openEditEditor(
      (await workspace.list()).items[0].ref,
    )
    expect(
      editor.fields.find((field) => field.fieldId === fields.Models),
    ).toMatchObject({
      optionLoader: {
        dependsOn: [fields.Type, fields.BaseUrl, fields.Key],
        trigger: "manual",
      },
    })
    const options = { signal: new AbortController().signal }
    expect(
      await editor.loadOptions!(
        fields.Models,
        {
          ...editor.initialValues,
          [fields.Key]: { kind: "replace", value: "secret-placeholder" },
        },
        options,
      ),
    ).toEqual([{ value: "model-b" }])
    expect(mocks.fetchRemoteModels.mock.calls[0][1]).toMatchObject({
      type: 2,
      key: "secret-placeholder",
      source: channel,
    })
    expect(mocks.fetchRemoteModels.mock.calls[0][2]).toBe(options)
  })
  it("preserves new secondary endpoints and credentials from the submit-time detail", async () => {
    const workspace = await octopusManagedResourceRegistration.open()
    const editor = await workspace.openEditEditor(
      (await workspace.list()).items[0].ref,
    )
    const latest = {
      ...channel,
      keys: [...channel.keys, { enabled: true, channel_key: "third-secret" }],
    }
    mocks.getChannel.mockResolvedValue(latest)
    await editor.submit({
      ...editor.initialValues,
      [fields.BaseUrl]: "https://new.example.invalid",
      [fields.Key]: { kind: "replace", value: "replacement-placeholder" },
    })
    expect(mocks.updateChannel.mock.calls[0][1]).toEqual({
      id: 7,
      baseUrl: "https://new.example.invalid",
      key: "replacement-placeholder",
      source: latest,
    })
  })
  it("retains uncertainty and redacts credentials after a dispatched server failure", async () => {
    mocks.updateChannel.mockRejectedValue(
      new OctopusMutationApiError(
        "Request failed other-secret password-placeholder",
        {
          dispatch: "dispatched",
          responseReceived: true,
          confirmedNonApplication: false,
          raw: { secret: "other-secret" },
          statusCode: 500,
        },
      ),
    )
    const workspace = await octopusManagedResourceRegistration.open()
    const editor = await workspace.openEditEditor(
      (await workspace.list()).items[0].ref,
    )
    const result = await editor.submit({
      ...editor.initialValues,
      [fields.Name]: "Renamed",
    })
    expect(result.outcome).toBe("uncertain")
    expect(JSON.stringify(result)).not.toContain("other-secret")
    expect(JSON.stringify(result)).not.toContain("password-placeholder")
    await editor.submit(editor.initialValues)
    expect(mocks.updateChannel).toHaveBeenCalledTimes(1)
  })
  it.each(["https://user:password@hub.example.invalid", "file:///example"])(
    "rejects unsafe configuration %s",
    async (baseUrl) => {
      mocks.getPreferences.mockResolvedValue({
        octopus: {
          baseUrl,
          username: "admin",
          password: "password-placeholder",
        },
      })
      await expect(
        octopusManagedResourceRegistration.open(),
      ).rejects.toMatchObject({ failure: { code: "invalid_configuration" } })
    },
  )
  it("rejects aborted submission before dispatch", async () => {
    const workspace = await octopusManagedResourceRegistration.open()
    const editor = await workspace.openEditEditor(
      (await workspace.list()).items[0].ref,
    )
    const controller = new AbortController()
    controller.abort()
    await expect(
      editor.submit(editor.initialValues, { signal: controller.signal }),
    ).rejects.toMatchObject({ failure: { code: "aborted" } })
    expect(mocks.updateChannel).not.toHaveBeenCalled()
  })
  it("preserves the provider-mapped import type", async () => {
    const workspace = await octopusManagedResourceRegistration.open()
    const editor = await workspace.openCreateEditor({
      seed: {
        kind: "managed-channel-import",
        name: "Imported",
        channelType: "2",
        enabled: true,
        baseUrl: "https://upstream.example.invalid",
        credential: "secret-placeholder",
        models: ["model-a"],
        notes: "",
        priority: 0,
        orderingWeight: 0,
      },
    })
    expect(editor.initialValues[fields.Type]).toBe("2")
  })
})
