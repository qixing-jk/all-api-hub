import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createNewApiModelPricing } from "~/services/apiAdapters/newApi/modelPricing"
import { MODEL_VENDOR_EVIDENCE_KINDS } from "~/services/models/modelDescriptor"
import { AuthTypeEnum } from "~/types"

const { fetchModelPricingMock } = vi.hoisted(() => ({
  fetchModelPricingMock: vi.fn(),
}))

vi.mock("~/services/apiService/newApiFamily/default/modelPricing", () => ({
  defaultModelPricingImplementation: {
    fetchModelPricing: fetchModelPricingMock,
  },
}))

vi.mock("~/services/apiService/newApiFamily/variants/oneHub", () => ({
  fetchModelPricing: vi.fn(),
}))

const request = {
  baseUrl: "https://pricing.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "user-1",
    accessToken: "access-token",
  },
}

const modelRow = {
  model_name: "example-model",
  quota_type: 0,
  model_ratio: 1,
  model_price: 0,
  completion_ratio: 1,
  enable_groups: [],
  supported_endpoint_types: [],
}

const pricingResponse = (extensions: Record<string, unknown> = {}) => ({
  data: [modelRow],
  group_ratio: {},
  success: true,
  usable_group: {},
  ...extensions,
})

describe("New API model pricing adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("joins a valid deployment vendor registry without leaking native fields", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...modelRow, vendor_id: 1 }],
        vendors: [
          {
            id: 1,
            name: " Example Publisher ",
            description: "Deployment-defined category",
            icon: "https://assets.example.invalid/vendor.svg",
          },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual({
      ...modelRow,
      vendorEvidence: {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
        name: "Example Publisher",
        externalId: "1",
      },
    })
    expect(result).not.toHaveProperty("vendors")
    expect(result.data[0]).not.toHaveProperty("vendor_id")
  })

  it.each([
    ["missing registry", undefined],
    ["non-array registry", { 1: "Example Publisher" }],
  ])("keeps valid pricing when the %s cannot be joined", async (_, vendors) => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...modelRow, vendor_id: 1 }],
        ...(vendors === undefined ? {} : { vendors }),
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(modelRow)
  })

  it("ignores malformed registry entries and malformed row vendor ids", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          { ...modelRow, vendor_id: 1.5 },
          { ...modelRow, model_name: "second-model", vendor_id: "2" },
        ],
        vendors: [
          null,
          "invalid",
          { id: 1.5, name: "Fractional id" },
          { id: Number.POSITIVE_INFINITY, name: "Infinite id" },
          { id: 2, name: " " },
          { id: 3, name: 42 },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data).toEqual([
      modelRow,
      { ...modelRow, model_name: "second-model" },
    ])
  })

  it.each([
    [
      { id: 1, name: "Example Publisher" },
      { id: 1, name: "Other Publisher" },
    ],
    [
      { id: 1, name: "Other Publisher" },
      { id: 1, name: "Example Publisher" },
    ],
  ])("treats duplicate valid vendor ids as ambiguous", async (...vendors) => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...modelRow, vendor_id: 1 }],
        vendors,
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(modelRow)
  })

  it("ignores unknown row vendor ids", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...modelRow, vendor_id: 99 }],
        vendors: [{ id: 1, name: "Example Publisher" }],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(modelRow)
  })

  it("removes malformed pre-existing vendor evidence when no native join applies", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...modelRow,
            vendorEvidence: {
              kind: "not-a-kind",
              name: "  ",
              externalId: 42,
            },
          },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(modelRow)
  })

  it("strips pre-existing remote vendor evidence when no native join applies", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...modelRow,
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
              name: " Example Publisher ",
              externalId: " publisher-id ",
            },
          },
        ],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(modelRow)
  })

  it("prefers a valid native registry join over pre-existing canonical evidence", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [
          {
            ...modelRow,
            vendor_id: 1,
            vendorEvidence: {
              kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
              name: "Legacy Publisher",
            },
          },
        ],
        vendors: [{ id: 1, name: "Deployment Category" }],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0].vendorEvidence).toEqual({
      kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
      name: "Deployment Category",
      externalId: "1",
    })
  })

  it("does not mutate the raw native response while normalizing it", async () => {
    const rawResponse = pricingResponse({
      data: [
        {
          ...modelRow,
          vendor_id: 1,
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Legacy Publisher",
          },
        },
      ],
      vendors: [{ id: 1, name: "Deployment Category" }],
    })
    const originalSnapshot = structuredClone(rawResponse)
    fetchModelPricingMock.mockResolvedValueOnce(rawResponse)

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(rawResponse).toEqual(originalSnapshot)
    expect(result).not.toBe(rawResponse)
    expect(result.data[0]).not.toBe(rawResponse.data[0])
  })

  it.each([
    ["envelope", Object.create(pricingResponse())],
    [
      "row",
      pricingResponse({
        data: [Object.create(modelRow)],
      }),
    ],
  ])("rejects a prototype-backed pricing %s", async (_, response) => {
    fetchModelPricingMock.mockResolvedValueOnce(response)

    await expect(
      createNewApiModelPricing(SITE_TYPES.NEW_API).fetchPricing(request),
    ).rejects.toThrow("Invalid New API model pricing response")
  })

  it("ignores prototype-backed native registry entries", async () => {
    fetchModelPricingMock.mockResolvedValueOnce(
      pricingResponse({
        data: [{ ...modelRow, vendor_id: 1 }],
        vendors: [Object.create({ id: 1, name: "Inherited Category" })],
      }),
    )

    const result = await createNewApiModelPricing(
      SITE_TYPES.NEW_API,
    ).fetchPricing(request)

    expect(result.data[0]).toEqual(modelRow)
  })

  it("preserves canonical base fields and source metadata while stripping remote publisher claims", async () => {
    const remoteResponse = pricingResponse({
      data: [
        {
          ...modelRow,
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Example Publisher",
          },
        },
      ],
      group_ratio: { standard: 1 },
      usable_group: { standard: "Standard" },
      model_list_source: { kind: "catalog-fallback" },
    })
    fetchModelPricingMock.mockResolvedValueOnce(remoteResponse)

    await expect(
      createNewApiModelPricing(SITE_TYPES.NEW_API).fetchPricing(request),
    ).resolves.toEqual({
      data: [modelRow],
      group_ratio: { standard: 1 },
      success: true,
      usable_group: { standard: "Standard" },
      model_list_source: { kind: "catalog-fallback" },
    })
  })

  it.each([
    null,
    [],
    {},
    { data: {} },
    { data: [], group_ratio: {}, success: true },
    { data: [], group_ratio: [], success: true, usable_group: {} },
    { data: [], group_ratio: {}, success: "yes", usable_group: {} },
    { data: [null], group_ratio: {}, success: true, usable_group: {} },
  ])("rejects a fundamentally invalid base response", async (response) => {
    fetchModelPricingMock.mockResolvedValueOnce(response)

    await expect(
      createNewApiModelPricing(SITE_TYPES.NEW_API).fetchPricing(request),
    ).rejects.toThrow("Invalid New API model pricing response")
  })
})
