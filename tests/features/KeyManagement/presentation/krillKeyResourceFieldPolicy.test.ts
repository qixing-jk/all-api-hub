import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { ACCOUNT_KEY_RESOURCE_EDITOR_MODES as modes } from "~/features/KeyManagement/constants"
import { getNativeKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/nativeKeyResourceFieldPolicy"
import { resolveResourceFieldPolicy } from "~/features/ResourceEditor/model/resourceFieldPolicy"
import { createKrillKeyEditor } from "~/services/apiAdapters/krill/keyEditor"

describe("Krill native editor presentation", () => {
  it("opens the name-only create editor without edit-only policy fields", () => {
    const fields = [{ fieldId: "name", type: "text" as const, nullable: true }]
    const presentation = getNativeKeyResourceEditorPresentation(
      "krill",
      modes.Create,
      { fields },
    )
    expect(() =>
      resolveResourceFieldPolicy(
        fields,
        presentation.policy,
        presentation.sectionOrder,
      ),
    ).not.toThrow()
  })

  it.each([false, true])(
    "opens edit with conditional IP bypass: %s",
    (ipWhitelistGrey) => {
      const editor = createKrillKeyEditor({
        channels: [],
        detail: {
          name: "",
          channelIds: [],
          allowBalanceFallback: true,
          ipWhitelist: null,
          ipWhitelistGrey,
        },
      })
      const presentation = getNativeKeyResourceEditorPresentation(
        "krill",
        modes.Edit,
        { fields: editor.fields },
      )
      const t = ((key: string) => key) as TFunction
      const fields = presentation.policy.fields
      expect(
        fields.find((field) => field.fieldId === "channels")?.resolveLabel(t),
      ).toBe("keyManagement:native.editor.krill.channels")
      expect(
        fields.find((field) => field.fieldId === "channels")?.resolveHelp?.(t),
      ).toBe("keyManagement:native.editor.krill.channelsHelp")
      expect(
        fields
          .find((field) => field.fieldId === "allow_balance_fallback")
          ?.resolveLabel(t),
      ).toBe("keyManagement:native.editor.allowWallet")
      expect(
        fields
          .find((field) => field.fieldId === "allow_balance_fallback")
          ?.resolveHelp?.(t),
      ).toBe("keyManagement:native.editor.allowWalletHelp")
      if (ipWhitelistGrey) {
        const bypass = fields.find(
          (field) => field.fieldId === "ip_whitelist_disabled",
        )!
        expect(bypass.resolveLabel(t)).toBe(
          "keyManagement:native.editor.krill.allowAnyIp",
        )
        expect(bypass.resolveHelp?.(t)).toBe(
          "keyManagement:native.editor.krill.allowAnyIpHelp",
        )
      }
      expect(() =>
        resolveResourceFieldPolicy(
          editor.fields,
          presentation.policy,
          presentation.sectionOrder,
        ),
      ).not.toThrow()
    },
  )
})
