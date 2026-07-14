import { describe, expect, it } from "vitest"

import { identifyProvider } from "~/services/models/utils/modelProviders"

describe("modelProviders utils", () => {
  describe("identifyProvider", () => {
    it("detects the two non-default protocol families", () => {
      expect(identifyProvider("claude-3-opus")).toBe("Claude")
      expect(identifyProvider("GEMINI-PRO")).toBe("Gemini")
    })

    it("preserves the reviewed Neptune compatibility boundary", () => {
      expect(identifyProvider("neptune")).toBe("Claude")
      expect(identifyProvider("vendor/neptune-3")).toBe("Claude")
      expect(identifyProvider("xneptuney")).toBe("Unknown")
    })

    it("uses Unknown for the OpenAI-compatible fallback", () => {
      expect(identifyProvider("gpt-4o")).toBe("Unknown")
      expect(identifyProvider("qwen-max")).toBe("Unknown")
      expect(identifyProvider("random-name")).toBe("Unknown")
      expect(identifyProvider("")).toBe("Unknown")
    })

    it("does not classify embedded protocol-name fragments", () => {
      expect(identifyProvider("copying-model")).toBe("Unknown")
      expect(identifyProvider("songsonnetfragment")).toBe("Unknown")
      expect(identifyProvider("mygeminimodel")).toBe("Unknown")
    })
  })
})
