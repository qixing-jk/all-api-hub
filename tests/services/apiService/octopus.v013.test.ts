import { describe, expect, it } from "vitest"

import { OCTOPUS_API_OPERATIONS } from "~/services/apiService/octopus/operations"
import { octopusV013Contract } from "~/services/apiService/octopus/v013"
import { OctopusOutboundType } from "~/types/octopus"

const detailResponse = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  name: "Example channel",
  dialect: "generic",
  enabled: true,
  base_url: "https://upstream.example.invalid",
  openai_chat_completion_path: "/v1/chat/completions",
  openai_response_path: "/v1/responses",
  anthropic_message_path: "/v1/messages",
  keys: [{ name: "default", key: "credential-placeholder", enabled: true }],
  models: ["model-a"],
  grants: [{ model_name: "model-a", key_name: "default", protocols: 2 }],
  proxy: false,
  custom_header: [],
  param_override: "",
  channel_proxy: "",
  match_regex: "",
  ...overrides,
})

const statsResponse = (overrides: Record<string, unknown> = {}) => ({
  channel_id: 7,
  channel_name: "Example channel",
  enabled: true,
  input_token: 10,
  output_token: 4,
  input_cost: 0.25,
  output_cost: 0.5,
  wait_time: 1.5,
  request_success: 3,
  request_failed: 1,
  models: [{ model_id: 11, model_name: "model-a" }],
  ...overrides,
})

const parseRequestBody = (
  request: ReturnType<typeof octopusV013Contract.createRequest>,
) => JSON.parse(request.init.body as string) as Record<string, unknown>

describe("Octopus v0.13 contract", () => {
  it.each([
    {
      name: "OpenAI Responses",
      protocols: 4,
      expected: OctopusOutboundType.OpenAIResponse,
    },
    {
      name: "Anthropic Messages",
      protocols: 8,
      expected: OctopusOutboundType.Anthropic,
    },
    {
      name: "no recognized protocol",
      protocols: 0,
      expected: OctopusOutboundType.OpenAIChat,
    },
  ])("infers $name channel details", ({ protocols, expected }) => {
    expect(
      octopusV013Contract.normalizeChannel(
        detailResponse({
          grants: [{ model_name: "model-a", key_name: "default", protocols }],
        }),
      ).type,
    ).toBe(expected)
  })

  it("attaches matching stats and rejects mismatched channel identities", () => {
    const stats = octopusV013Contract.parseStatsList([statsResponse()])[0]

    expect(
      octopusV013Contract.normalizeChannel(detailResponse(), stats).stats,
    ).toMatchObject({ channel_id: 7, request_success: 3 })
    expect(() =>
      octopusV013Contract.normalizeChannel(detailResponse({ id: 8 }), stats),
    ).toThrow(/channel_id/)
  })

  it.each([
    {
      name: "a non-object detail",
      parse: () => octopusV013Contract.parseDetail(null),
      field: "response",
    },
    {
      name: "a non-integer detail id",
      parse: () => octopusV013Contract.parseDetail(detailResponse({ id: 1.5 })),
      field: "id",
    },
    {
      name: "a non-finite stats value",
      parse: () =>
        octopusV013Contract.parseStatsList([
          statsResponse({ input_cost: Number.POSITIVE_INFINITY }),
        ]),
      field: "input_cost",
    },
    {
      name: "a malformed stats model",
      parse: () =>
        octopusV013Contract.parseStatsList([statsResponse({ models: [null] })]),
      field: "models",
    },
  ])("rejects $name", ({ parse, field }) => {
    expect(parse).toThrow(new RegExp(field, "i"))
  })

  it.each([
    {
      type: OctopusOutboundType.OpenAIResponse,
      protocols: 4,
      chatPath: "/v1/chat/completions",
    },
    {
      type: OctopusOutboundType.Anthropic,
      protocols: 8,
      chatPath: "/v1/chat/completions",
    },
    {
      type: OctopusOutboundType.Volcengine,
      protocols: 2,
      chatPath: "/chat/completions",
    },
  ])(
    "encodes $type create requests with the matching protocol",
    ({ type, protocols, chatPath }) => {
      const body = parseRequestBody(
        octopusV013Contract.createRequest(
          {
            kind: OCTOPUS_API_OPERATIONS.CreateChannel,
            input: {
              name: "Example channel",
              type,
              baseUrl: "https://upstream.example.invalid",
              key: "credential-placeholder",
              model: "model-a, model-b",
              customModel: "model-b,model-c",
            },
          },
          {},
        ),
      )

      expect(body).toMatchObject({
        enabled: true,
        openai_chat_completion_path: chatPath,
        models: ["model-a", "model-b", "model-c"],
        grants: [
          {
            model_name: "model-a",
            key_name: "default",
            protocols,
          },
          {
            model_name: "model-b",
            key_name: "default",
            protocols,
          },
          {
            model_name: "model-c",
            key_name: "default",
            protocols,
          },
        ],
      })
    },
  )

  it("rejects channel types that v0.13 cannot encode", () => {
    expect(() =>
      octopusV013Contract.createRequest(
        {
          kind: OCTOPUS_API_OPERATIONS.CreateChannel,
          input: {
            name: "Unsupported",
            type: OctopusOutboundType.OpenAIEmbedding,
            baseUrl: "https://upstream.example.invalid",
            key: "credential-placeholder",
          },
        },
        {},
      ),
    ).toThrow(/cannot represent/i)
  })

  it("preserves models while updating an existing key and protocol", () => {
    const existing = octopusV013Contract.parseDetail(detailResponse())
    const body = parseRequestBody(
      octopusV013Contract.createRequest(
        {
          kind: OCTOPUS_API_OPERATIONS.UpdateChannel,
          input: {
            id: 7,
            type: OctopusOutboundType.Anthropic,
            key: "credential-updated",
          },
        },
        {},
        existing,
      ),
    )

    expect(body).toMatchObject({
      anthropic_message_path: "/v1/messages",
      keys: [{ name: "default", key: "credential-updated", enabled: true }],
      models: ["model-a"],
      grants: [{ model_name: "model-a", key_name: "default", protocols: 8 }],
    })
  })

  it("adds the first key while preserving grants during a partial update", () => {
    const existing = octopusV013Contract.parseDetail(
      detailResponse({ keys: [] }),
    )
    const body = parseRequestBody(
      octopusV013Contract.createRequest(
        {
          kind: OCTOPUS_API_OPERATIONS.UpdateChannel,
          input: { id: 7, key: "credential-added" },
        },
        {},
        existing,
      ),
    )

    expect(body).toMatchObject({
      keys: [{ name: "default", key: "credential-added", enabled: true }],
      models: ["model-a"],
      grants: [{ model_name: "model-a", key_name: "default", protocols: 2 }],
    })
  })

  it("does not invent grants when an update has no configured key", () => {
    const existing = octopusV013Contract.parseDetail(
      detailResponse({ keys: [], grants: [], models: [] }),
    )
    const body = parseRequestBody(
      octopusV013Contract.createRequest(
        {
          kind: OCTOPUS_API_OPERATIONS.UpdateChannel,
          input: { id: 7, model: "model-b" },
        },
        {},
        existing,
      ),
    )

    expect(body).toMatchObject({ models: ["model-b"], grants: [] })
  })

  it("requires current detail before encoding an update", () => {
    expect(() =>
      octopusV013Contract.createRequest(
        {
          kind: OCTOPUS_API_OPERATIONS.UpdateChannel,
          input: { id: 7, name: "Updated" },
        },
        {},
      ),
    ).toThrow(/requires current channel detail/i)
  })

  it("uses safe defaults for a remote-model probe without source metadata", () => {
    const body = parseRequestBody(
      octopusV013Contract.createRequest(
        {
          kind: OCTOPUS_API_OPERATIONS.FetchRemoteModels,
          input: {
            type: OctopusOutboundType.OpenAIChat,
            baseUrl: "https://upstream.example.invalid",
            key: "credential-placeholder",
          },
        },
        {},
      ),
    )

    expect(body).toEqual({
      channel: {
        name: "",
        dialect: "generic",
        enabled: true,
        base_url: "https://upstream.example.invalid",
        openai_chat_completion_path: "/v1/chat/completions",
        openai_response_path: "/v1/responses",
        anthropic_message_path: "/v1/messages",
        proxy: false,
        custom_header: [],
        param_override: "",
        channel_proxy: "",
        match_regex: "",
      },
      key: "credential-placeholder",
    })
  })

  it("maps every non-mutating and delete endpoint", () => {
    expect(
      octopusV013Contract.createRequest(
        { kind: OCTOPUS_API_OPERATIONS.ListChannels },
        {},
      ).endpoint,
    ).toBe("/api/v1/channel/stats")
    expect(
      octopusV013Contract.createRequest(
        { kind: OCTOPUS_API_OPERATIONS.DeleteChannel, channelId: 7 },
        {},
      ),
    ).toMatchObject({
      endpoint: "/api/v1/channel/delete/7",
      init: { method: "DELETE" },
    })
    expect(
      octopusV013Contract.createRequest(
        { kind: OCTOPUS_API_OPERATIONS.ListAvailableModels },
        {},
      ).endpoint,
    ).toBe("/api/v1/model/list")
    expect(
      octopusV013Contract.createRequest(
        { kind: OCTOPUS_API_OPERATIONS.ListGroups },
        {},
      ).endpoint,
    ).toBe("/api/v1/group/list")
  })

  it("normalizes mutation and remote-model responses", () => {
    expect(
      octopusV013Contract.normalizeResponse(
        { kind: OCTOPUS_API_OPERATIONS.CreateChannel, input: {} as never },
        null,
      ),
    ).toBeNull()
    expect(
      octopusV013Contract.normalizeResponse(
        { kind: OCTOPUS_API_OPERATIONS.UpdateChannel, input: {} as never },
        detailResponse(),
      ),
    ).toMatchObject({ id: 7, model: "model-a" })
    expect(
      octopusV013Contract.normalizeResponse(
        { kind: OCTOPUS_API_OPERATIONS.FetchRemoteModels, input: {} as never },
        [{ name: "model-a" }],
      ),
    ).toEqual(["model-a"])
    expect(
      octopusV013Contract.normalizeResponse(
        { kind: OCTOPUS_API_OPERATIONS.ListGroups },
        ["group-a"],
      ),
    ).toEqual(["group-a"])
  })

  it.each([null, [null], [{ name: 7 }]])(
    "rejects malformed remote-model responses %#",
    (response) => {
      expect(() =>
        octopusV013Contract.normalizeResponse(
          {
            kind: OCTOPUS_API_OPERATIONS.FetchRemoteModels,
            input: {} as never,
          },
          response,
        ),
      ).toThrow(/models|name/i)
    },
  )
})
