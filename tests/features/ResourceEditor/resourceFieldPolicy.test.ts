import { describe, expect, it } from "vitest"

import {
  defineResourceEditorFieldPolicy,
  resolveResourceFieldPolicy,
} from "~/features/ResourceEditor/resourceFieldPolicy"

describe("resource field policy", () => {
  it("fails closed when a descriptor is not classified", () => {
    expect(() =>
      resolveResourceFieldPolicy(
        [{ fieldId: "name", type: "text" }],
        { fields: [], hiddenFields: [] },
        { basic: 0 },
      ),
    ).toThrow("resource field policy mismatch")
  })

  it.each([
    {
      caseName: "a field that is both rendered and hidden",
      descriptors: [{ fieldId: "name", type: "text" as const }],
      policy: {
        fields: [
          {
            fieldId: "name",
            section: "basic",
            order: 10,
            renderer: "text" as const,
            resolveLabel: (): string => "Name",
          },
        ],
        hiddenFields: [{ fieldId: "name", reason: "read-only" as const }],
      },
    },
    {
      caseName: "an unclassified descriptor",
      descriptors: [
        { fieldId: "name", type: "text" as const },
        { fieldId: "extra", type: "text" as const },
      ],
      policy: {
        fields: [
          {
            fieldId: "name",
            section: "basic",
            order: 10,
            renderer: "text" as const,
            resolveLabel: (): string => "Name",
          },
        ],
        hiddenFields: [],
      },
    },
    {
      caseName: "a renderer that conflicts with the descriptor type",
      descriptors: [{ fieldId: "name", type: "number" as const }],
      policy: {
        fields: [
          {
            fieldId: "name",
            section: "basic",
            order: 10,
            renderer: "text" as const,
            resolveLabel: (): string => "Name",
          },
        ],
        hiddenFields: [],
      },
    },
  ])("fails closed for $caseName", ({ descriptors, policy }) => {
    expect(() =>
      resolveResourceFieldPolicy(descriptors, policy, { basic: 0 }),
    ).toThrow("resource field policy mismatch")
  })

  it("orders classified fields by section and then numeric field order", () => {
    const resolved = resolveResourceFieldPolicy(
      [
        { fieldId: "advanced", type: "text" },
        { fieldId: "basicLater", type: "text" },
        { fieldId: "basicFirst", type: "text" },
      ],
      {
        fields: [
          {
            fieldId: "advanced",
            section: "advanced",
            order: 1,
            renderer: "text",
            resolveLabel: () => "Advanced",
          },
          {
            fieldId: "basicLater",
            section: "basic",
            order: 20,
            renderer: "text",
            resolveLabel: () => "Basic later",
          },
          {
            fieldId: "basicFirst",
            section: "basic",
            order: 10,
            renderer: "text",
            resolveLabel: () => "Basic first",
          },
        ],
        hiddenFields: [],
      },
      { basic: 0, advanced: 1 },
    )

    expect(resolved.fields.map(({ descriptor }) => descriptor.fieldId)).toEqual(
      ["basicFirst", "basicLater", "advanced"],
    )
  })

  it("rejects a nullable option label unless the descriptor is a nullable single select", () => {
    const policy = defineResourceEditorFieldPolicy({
      fields: [
        {
          fieldId: "creator",
          section: "basic",
          order: 10,
          renderer: "select",
          resolveLabel: () => "Creator",
          resolveNullableOptionLabel: () => "No creator",
        },
      ],
      hiddenFields: [],
    })

    expect(() =>
      resolveResourceFieldPolicy(
        [
          {
            fieldId: "creator",
            type: "select",
            nullable: false,
            options: [],
          },
        ],
        policy,
        { basic: 0 },
      ),
    ).toThrow("resource field policy mismatch")

    expect(() =>
      defineResourceEditorFieldPolicy({
        fields: [
          {
            fieldId: "notes",
            section: "basic",
            order: 10,
            renderer: "textarea",
            resolveLabel: () => "Notes",
            // Runtime validation protects untyped policy sources too.
            resolveNullableOptionLabel: (() => "None") as never,
          },
        ],
        hiddenFields: [],
      }),
    ).toThrow("invalid resource field policy")
  })
})
