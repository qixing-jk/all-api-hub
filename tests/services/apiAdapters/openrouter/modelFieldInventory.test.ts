import { describe, expect, it } from "vitest"

import {
  OPENROUTER_MODEL_FIELD_CLASSIFICATIONS,
  OPENROUTER_PINNED_MODEL_FIELD_PATHS,
} from "~/services/apiAdapters/openrouter/modelFieldInventory"

describe("OpenRouter documented model field inventory", () => {
  it("classifies every pinned documented field exactly once", () => {
    expect(Object.keys(OPENROUTER_MODEL_FIELD_CLASSIFICATIONS).sort()).toEqual(
      [...OPENROUTER_PINNED_MODEL_FIELD_PATHS].sort(),
    )
  })

  it("records a reviewable reason for every intentionally hidden field", () => {
    for (const classification of Object.values(
      OPENROUTER_MODEL_FIELD_CLASSIFICATIONS,
    )) {
      if (classification.category === "intentionally-hidden") {
        expect(classification.reason.trim()).not.toBe("")
      } else {
        expect(classification).not.toHaveProperty("reason")
      }
    }
  })
})
