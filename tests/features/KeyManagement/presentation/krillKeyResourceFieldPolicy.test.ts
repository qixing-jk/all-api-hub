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
