import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getNativeKeyResourceEditorPresentation } from "~/features/KeyManagement/presentation/nativeKeyResourceFieldPolicy"
import { resolveResourceFieldPolicy } from "~/features/ResourceEditor/resourceFieldPolicy"
import { createAIHubMixKeyEditor } from "~/services/apiAdapters/aihubmix/keyResourceEditor"
import { createNewApiKeyEditor } from "~/services/apiAdapters/newApi/keyResourceEditor"
import { resolveNewApiFamilyTokenTransport } from "~/services/apiAdapters/newApi/tokenTransport"
import { createSub2ApiKeyEditor } from "~/services/apiAdapters/sub2api/keyResourceEditor"
import { createVoApiV2KeyEditor } from "~/services/apiAdapters/voapiV2/keyResourceEditor"
import { AuthTypeEnum } from "~/types"

const request = {
  baseUrl: "https://example.invalid",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    accessToken: "example",
    userId: 1,
  },
}

describe("native key editor field policies", () => {
  it.each([undefined, "Model specific key"])(
    "prefills the selected group name and preserves an explicit name hint %s",
    (nameHint) => {
      const intent = { preferredGroup: "Priority", nameHint }
      const groups = [{ id: 11, displayName: "Priority" }]
      const editors = [
        createNewApiKeyEditor(
          SITE_TYPES.NEW_API,
          request,
          resolveNewApiFamilyTokenTransport(SITE_TYPES.NEW_API),
          undefined,
          intent,
        ),
        createSub2ApiKeyEditor(
          request,
          undefined,
          intent,
          groups.map((group) => ({ ...group, description: "", ratio: 1 })),
        ),
        createVoApiV2KeyEditor(
          request,
          undefined,
          intent,
          groups.map((group) => ({ ...group, requirementKey: "Priority" })),
        ),
      ]
      for (const editor of editors) {
        expect(editor.initialValues.name).toBe(
          nameHint ?? "Priority group (auto)",
        )
      }
    },
  )

  it("keeps group IDs out of generated names when option labels are unavailable", () => {
    const presentation = getNativeKeyResourceEditorPresentation(
      SITE_TYPES.SUB2API,
      "create",
    )
    expect(
      presentation.getAutomaticName?.({ group_id: "11" }, {}),
    ).toBeUndefined()
    expect(
      presentation.getAutomaticName?.(
        { group_id: "11" },
        {
          group_id: [{ value: "11" }],
        },
      ),
    ).toBeUndefined()
  })

  it("does not treat a workspace as a token group", () => {
    expect(
      getNativeKeyResourceEditorPresentation(SITE_TYPES.OPENROUTER, "create")
        .getAutomaticName,
    ).toBeUndefined()
  })

  it.each(["create", "edit"] as const)(
    "renders every supported provider's %s projection",
    (mode) => {
      const editors = [
        ...[SITE_TYPES.NEW_API, SITE_TYPES.ONE_API, SITE_TYPES.MODELFLARE].map(
          (siteType) => ({
            siteType,
            editor: createNewApiKeyEditor(
              siteType,
              request,
              resolveNewApiFamilyTokenTransport(siteType),
            ),
          }),
        ),
        {
          siteType: SITE_TYPES.AIHUBMIX,
          editor: createAIHubMixKeyEditor(request),
        },
        {
          siteType: SITE_TYPES.VO_API_V2,
          editor: createVoApiV2KeyEditor(request),
        },
        {
          siteType: SITE_TYPES.SUB2API,
          editor: createSub2ApiKeyEditor(
            request,
            mode === "edit"
              ? {
                  id: 1,
                  name: "Example",
                  key: "masked",
                  group_name: "",
                  status: "active",
                }
              : undefined,
          ),
        },
      ]
      for (const { siteType, editor } of editors) {
        const presentation = getNativeKeyResourceEditorPresentation(
          siteType,
          mode,
        )
        expect(
          () =>
            resolveResourceFieldPolicy(
              editor.fields,
              presentation.policy,
              presentation.sectionOrder,
            ),
          siteType,
        ).not.toThrow()
      }
    },
  )
})

it("does not infer OpenRouter behavior when the owner is absent or unknown", () => {
  for (const siteType of [undefined, "unknown-provider", SITE_TYPES.NEW_API]) {
    const presentation = getNativeKeyResourceEditorPresentation(
      siteType,
      "create",
    )
    expect(presentation.summary).toBeUndefined()
    expect(presentation.requireFreshOptions).toBeUndefined()
    expect(presentation.getOptionFeedback).toBeUndefined()
  }
})
