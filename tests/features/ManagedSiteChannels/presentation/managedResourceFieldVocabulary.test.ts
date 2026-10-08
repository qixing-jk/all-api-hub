import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"

import { NEW_API_MANAGED_RESOURCE_FIELD_IDS } from "~/constants/newApi"
import {
  OMNIROUTE_CONNECTION_TEST_STATUSES,
  OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS,
} from "~/constants/omniroute"
import {
  createManagedResourceFieldPolicyRegistry,
  getFieldValuePresentationFromDefinition,
  getManagedResourceFieldOptionLabel,
  requireFieldValuePresentation,
} from "~/features/ManagedSiteChannels/editor/managedResourceFieldPresentation"
import { newApiPresentation } from "~/features/ManagedSiteChannels/presentation/sites/newApi"
import { omniRoutePresentation } from "~/features/ManagedSiteChannels/presentation/sites/omniRoute"
import { CHANNEL_STATUS } from "~/types/newApi"

const t = ((key: string) => key) as TFunction
const definition = newApiPresentation.fieldPolicies[0]!

describe("managed resource field vocabulary contracts", () => {
  it("rejects duplicate registration instead of silently replacing a site's vocabulary", () => {
    expect(() =>
      createManagedResourceFieldPolicyRegistry([definition, definition]),
    ).toThrow("duplicate managed resource field policy")
  })

  it("allows plain fields without option vocabulary and rejects requiring missing vocabulary", () => {
    expect(
      getFieldValuePresentationFromDefinition(
        definition,
        NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name,
      ),
    ).toBeUndefined()
    expect(() =>
      requireFieldValuePresentation(
        definition,
        NEW_API_MANAGED_RESOURCE_FIELD_IDS.Name,
      ),
    ).toThrow("missing managed resource field vocabulary")
  })

  it("provides distinct labels for New API multi-key selection strategies", () => {
    const field = definition.modes.edit.fields.find(
      (item) => item.fieldId === "multiKeyMode",
    )!
    expect(getManagedResourceFieldOptionLabel(field, "random", t)).toBe(
      "managedSiteChannels:editor.multiKeyMode.random",
    )
    expect(getManagedResourceFieldOptionLabel(field, "polling", t)).toBe(
      "managedSiteChannels:editor.multiKeyMode.polling",
    )
  })

  it("distinguishes unknown status from a channel disabled automatically", () => {
    const field = definition.modes.edit.fields.find(
      (item) => item.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Status,
    )!
    expect(
      getManagedResourceFieldOptionLabel(
        field,
        String(CHANNEL_STATUS.Unknown),
        t,
      ),
    ).toBe("managedSiteChannels:statusLabels.unknown")
    expect(
      getManagedResourceFieldOptionLabel(
        field,
        String(CHANNEL_STATUS.AutoDisabled),
        t,
      ),
    ).toBe("managedSiteChannels:statusLabels.autoDisabled")
  })

  it("explains partial credential replacement for existing New API keys", () => {
    const field = definition.modes.edit.fields.find(
      (item) => item.fieldId === NEW_API_MANAGED_RESOURCE_FIELD_IDS.Key,
    )!
    expect(field.resolveCredentialListHelp?.(t)).toBe(
      "managedSiteChannels:editor.secret.partialReplacementHint",
    )
  })

  it("presents an untested OmniRoute connection as pending", () => {
    const field =
      omniRoutePresentation.table.semantics.fieldValuePresentations[
        OMNIROUTE_MANAGED_RESOURCE_FIELD_IDS.TestStatus
      ]
    expect(
      field.optionLabelResolvers[OMNIROUTE_CONNECTION_TEST_STATUSES.Unknown](t),
    ).toBe("managedSiteChannels:editor.options.omnirouteTestStatus.pending")
  })
})
