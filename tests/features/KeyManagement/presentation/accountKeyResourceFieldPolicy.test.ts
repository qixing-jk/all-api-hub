import fs from "node:fs/promises"
import path from "node:path"
import { describe, expect, it } from "vitest"

import {
  getOpenRouterKeyResourceFieldPolicy,
  OPENROUTER_KEY_EDITOR_SECTION_ORDER,
  resolveOpenRouterKeyResourceFieldPolicy,
} from "~/features/KeyManagement/presentation/accountKeyResourceFieldPolicy"
import type { ResourceFieldDescriptor } from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  OPENROUTER_KEY_FIELD_IDS,
  OPENROUTER_KEY_LIMIT_MODES,
} from "~/services/apiAdapters/openrouter/keyResourceFields"

const fields = OPENROUTER_KEY_FIELD_IDS

describe("OpenRouter key resource field policy", () => {
  it("classifies create fields in the product-owned section order", () => {
    const createPolicy = getOpenRouterKeyResourceFieldPolicy("create")

    expect(createPolicy.fields.map(({ fieldId }) => fieldId)).toEqual([
      fields.Name,
      fields.Workspace,
      fields.Creator,
      fields.LimitMode,
      fields.Limit,
      fields.LimitReset,
      fields.ExpiresAt,
      fields.IncludeByokInLimit,
    ])
    expect(OPENROUTER_KEY_EDITOR_SECTION_ORDER).toEqual({
      basic: 0,
      spending: 1,
      lifecycle: 2,
      advanced: 3,
    })
  })

  it("classifies edit fields in the product-owned order with the editable disabled state", () => {
    const editPolicy = getOpenRouterKeyResourceFieldPolicy("edit")

    expect(editPolicy.fields.map(({ fieldId }) => fieldId)).toEqual([
      fields.Name,
      fields.Workspace,
      fields.Creator,
      fields.LimitMode,
      fields.Limit,
      fields.LimitReset,
      fields.ExpiresAt,
      fields.Disabled,
      fields.IncludeByokInLimit,
    ])
    expect(
      editPolicy.fields
        .find(({ fieldId }) => fieldId === fields.Limit)
        ?.visibleWhen?.({
          [fields.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Limited,
        }),
    ).toBe(true)
    expect(
      editPolicy.fields
        .find(({ fieldId }) => fieldId === fields.Limit)
        ?.visibleWhen?.({
          [fields.LimitMode]: OPENROUTER_KEY_LIMIT_MODES.Unlimited,
        }),
    ).toBe(false)
  })

  it("uses edit-specific immutable-field help and keeps USD visible in every supported locale", async () => {
    const editPolicy = getOpenRouterKeyResourceFieldPolicy("edit")
    const translate = ((key: string) => key) as never

    expect(
      editPolicy.fields
        .find(({ fieldId }) => fieldId === fields.Workspace)
        ?.resolveHelp?.(translate),
    ).toBe("keyManagement:openRouter.editor.fields.workspace.editHelp")
    expect(
      editPolicy.fields
        .find(({ fieldId }) => fieldId === fields.Creator)
        ?.resolveHelp?.(translate),
    ).toBe("keyManagement:openRouter.editor.fields.creator.editHelp")
    expect(
      editPolicy.fields
        .find(({ fieldId }) => fieldId === fields.ExpiresAt)
        ?.resolveHelp?.(translate),
    ).toBe("keyManagement:openRouter.editor.fields.expiresAt.editHelp")

    for (const locale of ["en", "es-419", "ja", "vi", "zh-CN", "zh-TW"]) {
      const resource = JSON.parse(
        await fs.readFile(
          path.join(
            process.cwd(),
            "src",
            "locales",
            locale,
            "keyManagement.json",
          ),
          "utf8",
        ),
      ) as {
        openRouter: {
          editor: {
            fields: {
              limit: { help: string }
              workspace: { editHelp: string }
              creator: { editHelp: string }
              expiresAt: { editHelp: string }
            }
            summaryRules: { limit: string; expiresAt: string }
            summary: string
            title: { create: string; edit: string }
          }
        }
      }

      expect(resource.openRouter.editor.fields.limit.help).toContain("USD")
      expect(resource.openRouter.editor.summaryRules.limit).toContain("USD")
      expect(resource.openRouter.editor.summaryRules.limit).toContain(
        "{{limit}}",
      )
      expect(
        resource.openRouter.editor.summaryRules.limit.replace("{{limit}}", "0"),
      ).toContain("0 USD")
      expect(
        resource.openRouter.editor.summaryRules.limit.replace(
          "{{limit}}",
          "20",
        ),
      ).toContain("20 USD")
      expect(resource.openRouter.editor.summaryRules.expiresAt).toContain("UTC")
      expect(resource.openRouter.editor.fields.workspace.editHelp).not.toBe("")
      expect(resource.openRouter.editor.fields.creator.editHelp).not.toBe("")
      expect(resource.openRouter.editor.fields.expiresAt.editHelp).not.toBe("")
      expect(resource.openRouter.editor.summary).toContain("API")
      expect(resource.openRouter.editor.title.create).toContain("API")
      expect(resource.openRouter.editor.title.edit).toContain("API")
    }
  })

  it("rejects unclassified, duplicated, and renderer-mismatched adapter descriptors", () => {
    const descriptors: ResourceFieldDescriptor[] = [
      { fieldId: fields.Name, type: "text" },
      { fieldId: fields.Workspace, type: "select", options: [] },
      { fieldId: fields.Creator, type: "select", options: [] },
      { fieldId: fields.LimitMode, type: "select", options: [] },
      { fieldId: fields.Limit, type: "number" },
      { fieldId: fields.LimitReset, type: "select", options: [] },
      { fieldId: fields.ExpiresAt, type: "date-time" },
      { fieldId: fields.IncludeByokInLimit, type: "boolean" },
    ]

    expect(() =>
      resolveOpenRouterKeyResourceFieldPolicy(
        [...descriptors, { fieldId: "unclassified", type: "text" }],
        "create",
      ),
    ).toThrow("resource field policy mismatch")
    expect(() =>
      resolveOpenRouterKeyResourceFieldPolicy(
        [...descriptors, descriptors[0]!],
        "create",
      ),
    ).toThrow("resource field policy mismatch")
    expect(() =>
      resolveOpenRouterKeyResourceFieldPolicy(
        descriptors.map((descriptor) =>
          descriptor.fieldId === fields.Name
            ? { fieldId: descriptor.fieldId, type: "number" as const }
            : descriptor,
        ),
        "create",
      ),
    ).toThrow("resource field policy mismatch")
  })
})
