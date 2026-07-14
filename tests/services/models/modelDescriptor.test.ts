import { describe, expect, it } from "vitest"

import {
  MODEL_VENDOR_EVIDENCE_KINDS,
  normalizeModelDescriptors,
  type ModelVendorEvidence,
} from "~/services/models/modelDescriptor"

function publisher(name: string, externalId?: string): ModelVendorEvidence {
  return {
    kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
    name,
    ...(externalId === undefined ? {} : { externalId }),
  }
}

describe("normalizeModelDescriptors", () => {
  it("trims model ids and discards blank or non-string ids", () => {
    expect(
      normalizeModelDescriptors([
        { id: " model-a " },
        { id: "   " },
        { id: 42 },
        { id: null },
        {},
      ]),
    ).toEqual([{ id: "model-a" }])
  })

  it("deduplicates exact normalized ids without folding case", () => {
    expect(
      normalizeModelDescriptors([
        { id: "model-a" },
        { id: " model-a " },
        { id: "MODEL-A" },
      ]),
    ).toEqual([{ id: "model-a" }, { id: "MODEL-A" }])
  })

  it("retains identical normalized evidence for duplicate ids", () => {
    expect(
      normalizeModelDescriptors([
        { id: "model-a", vendorEvidence: publisher(" Example Lab ", " lab ") },
        { id: " model-a ", vendorEvidence: publisher("Example Lab", "lab") },
      ]),
    ).toEqual([
      {
        id: "model-a",
        vendorEvidence: publisher("Example Lab", "lab"),
      },
    ])
  })

  it("discards invalid evidence", () => {
    expect(
      normalizeModelDescriptors([
        {
          id: "invalid-kind",
          vendorEvidence: { kind: "provider", name: "Example Lab" },
        },
        {
          id: "blank-name",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "   ",
          },
        },
        {
          id: "non-string-name",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: 42,
          },
        },
        {
          id: "non-string-external-id",
          vendorEvidence: {
            kind: MODEL_VENDOR_EVIDENCE_KINDS.Publisher,
            name: "Example Lab",
            externalId: 42,
          },
        },
      ]),
    ).toEqual([
      { id: "invalid-kind" },
      { id: "blank-name" },
      { id: "non-string-name" },
      { id: "non-string-external-id" },
    ])
  })

  it("rejects arrays even when they expose an id property", () => {
    const arrayWithId = Object.assign([], { id: "model-a" })

    expect(normalizeModelDescriptors([arrayWithId])).toEqual([])
  })

  it.each([
    {
      field: "kind",
      first: publisher("Example Lab"),
      second: {
        kind: MODEL_VENDOR_EVIDENCE_KINDS.DeploymentCategory,
        name: "Example Lab",
      },
    },
    {
      field: "externalId",
      first: publisher("Example Lab", "publisher-a"),
      second: publisher("Example Lab", "publisher-b"),
    },
  ])(
    "removes evidence when duplicate ids disagree on $field",
    ({ first, second }) => {
      expect(
        normalizeModelDescriptors([
          { id: "model-a", vendorEvidence: first },
          { id: "model-a", vendorEvidence: second },
        ]),
      ).toEqual([{ id: "model-a" }])
    },
  )

  it("removes conflicting evidence independent of input order", () => {
    const input = [
      { id: " model-a ", vendorEvidence: publisher("Example Lab") },
      { id: "model-a", vendorEvidence: publisher("Other Lab") },
    ]

    expect(normalizeModelDescriptors(input)).toEqual([{ id: "model-a" }])
    expect(normalizeModelDescriptors(input)).toEqual(
      normalizeModelDescriptors([...input].reverse()),
    )
  })

  it("does not restore evidence after any valid occurrence conflicts", () => {
    expect(
      normalizeModelDescriptors([
        { id: "model-a", vendorEvidence: publisher("Example Lab") },
        { id: "model-a", vendorEvidence: publisher("Other Lab") },
        { id: "model-a", vendorEvidence: publisher("Example Lab") },
      ]),
    ).toEqual([{ id: "model-a" }])
  })
})
