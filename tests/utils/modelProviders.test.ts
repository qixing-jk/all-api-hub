import { describe, expect, it } from "vitest"

import type { ProviderConfig } from "~/utils/modelProviders"
import {
  filterModelsByProvider,
  getAllProviders,
  getProviderConfig,
  identifyProvider,
  PROVIDER_CONFIGS
} from "~/utils/modelProviders"

describe("modelProviders utils", () => {
  describe("identifyProvider", () => {
    describe("OpenAI models", () => {
      it("should identify GPT models", () => {
        expect(identifyProvider("gpt-4")).toBe("OpenAI")
        expect(identifyProvider("gpt-3.5-turbo")).toBe("OpenAI")
        expect(identifyProvider("GPT-4o")).toBe("OpenAI")
      })

      it("should identify o-series models", () => {
        expect(identifyProvider("o1")).toBe("OpenAI")
        expect(identifyProvider("o1-preview")).toBe("OpenAI")
        expect(identifyProvider("o3")).toBe("OpenAI")
        expect(identifyProvider("o3-mini")).toBe("OpenAI")
      })

      it("should identify Whisper models", () => {
        expect(identifyProvider("whisper-1")).toBe("OpenAI")
        expect(identifyProvider("whisper-large")).toBe("OpenAI")
      })

      it("should identify text-embedding models", () => {
        expect(identifyProvider("text-embedding-ada-002")).toBe("OpenAI")
        expect(identifyProvider("text-embedding-3-small")).toBe("OpenAI")
      })
    })

    describe("Claude models", () => {
      it("should identify Claude models", () => {
        expect(identifyProvider("claude-3-opus")).toBe("Claude")
        expect(identifyProvider("claude-2.1")).toBe("Claude")
        expect(identifyProvider("claude-instant")).toBe("Claude")
      })

      it("should identify by variant names", () => {
        expect(identifyProvider("sonnet-3.5")).toBe("Claude")
        expect(identifyProvider("haiku-3")).toBe("Claude")
        expect(identifyProvider("opus-4")).toBe("Claude")
        expect(identifyProvider("neptune")).toBe("Claude")
      })
    })

    describe("Gemini models", () => {
      it("should identify Gemini models", () => {
        expect(identifyProvider("gemini-pro")).toBe("Gemini")
        expect(identifyProvider("gemini-1.5-flash")).toBe("Gemini")
        expect(identifyProvider("gemini-ultra")).toBe("Gemini")
      })

      it("should be case insensitive", () => {
        expect(identifyProvider("GEMINI-PRO")).toBe("Gemini")
      })
    })

    describe("Grok models", () => {
      it("should identify Grok models", () => {
        expect(identifyProvider("grok-1")).toBe("Grok")
        expect(identifyProvider("grok-2")).toBe("Grok")
      })
    })

    describe("Qwen (阿里) models", () => {
      it("should identify Qwen models", () => {
        expect(identifyProvider("qwen-max")).toBe("Qwen")
        expect(identifyProvider("qwen-turbo")).toBe("Qwen")
        expect(identifyProvider("qwen-plus")).toBe("Qwen")
      })
    })

    describe("DeepSeek models", () => {
      it("should identify DeepSeek models", () => {
        expect(identifyProvider("deepseek-chat")).toBe("DeepSeek")
        expect(identifyProvider("deepseek-coder")).toBe("DeepSeek")
      })
    })

    describe("Mistral models", () => {
      it("should identify Mistral models", () => {
        expect(identifyProvider("mistral-7b")).toBe("Mistral")
        expect(identifyProvider("mistral-large")).toBe("Mistral")
      })

      it("should identify Mistral variants", () => {
        expect(identifyProvider("mixtral-8x7b")).toBe("Mistral")
        expect(identifyProvider("magistral")).toBe("Mistral")
        expect(identifyProvider("codestral")).toBe("Mistral")
        expect(identifyProvider("pixtral")).toBe("Mistral")
        expect(identifyProvider("devstral")).toBe("Mistral")
        expect(identifyProvider("Voxtral")).toBe("Mistral")
        expect(identifyProvider("ministral")).toBe("Mistral")
      })
    })

    describe("Moonshot models", () => {
      it("should identify Moonshot models", () => {
        expect(identifyProvider("moonshot-v1")).toBe("Moonshot")
      })

      it("should identify Kimi models", () => {
        expect(identifyProvider("kimi-chat")).toBe("Moonshot")
      })
    })

    describe("Azure models", () => {
      it("should identify Azure models", () => {
        // Azure pattern is /azure/i
        // Note: "azure-gpt-4" would match OpenAI first due to "gpt"
        // Use model names that only contain "azure"
        expect(identifyProvider("azure-model")).toBe("Azure")
        expect(identifyProvider("azure-deployment")).toBe("Azure")
        expect(identifyProvider("custom-azure-endpoint")).toBe("Azure")
      })
    })

    describe("ZhipuAI (智谱) models", () => {
      it("should identify GLM models", () => {
        expect(identifyProvider("glm-4")).toBe("ZhipuAI")
        expect(identifyProvider("glm-3-turbo")).toBe("ZhipuAI")
      })
    })

    describe("DeepMind models", () => {
      it("should identify Gemma models", () => {
        expect(identifyProvider("gemma-7b")).toBe("DeepMind")
        expect(identifyProvider("gemma-2b")).toBe("DeepMind")
      })

      it("should identify Imagen models", () => {
        expect(identifyProvider("imagen-2")).toBe("DeepMind")
      })
    })

    describe("Ollama models", () => {
      it("should identify Llama models", () => {
        expect(identifyProvider("llama-2-7b")).toBe("Ollama")
        expect(identifyProvider("llama-3-8b")).toBe("Ollama")
      })
    })

    describe("Tencent (腾讯) models", () => {
      it("should identify Tencent models", () => {
        expect(identifyProvider("Tencent-hunyuan")).toBe("Tencent")
      })

      it("should identify Hunyuan models", () => {
        expect(identifyProvider("hunyuan-lite")).toBe("Tencent")
        expect(identifyProvider("hunyuan-standard")).toBe("Tencent")
      })
    })

    describe("Baidu (百度) models", () => {
      it("should identify Baidu models", () => {
        expect(identifyProvider("Baidu-ERNIE")).toBe("Baidu")
      })

      it("should identify ERNIE models", () => {
        expect(identifyProvider("ERNIE-Bot-4")).toBe("Baidu")
        expect(identifyProvider("ernie-3.5")).toBe("Baidu")
      })
    })

    describe("Yi (零一万物) models", () => {
      it("should identify Yi models", () => {
        expect(identifyProvider("yi-34b")).toBe("yi")
        expect(identifyProvider("yi-6b")).toBe("yi")
      })

      it("should identify 01-ai models", () => {
        expect(identifyProvider("01-ai-yi-large")).toBe("yi")
      })
    })

    describe("Baichuan (百川) models", () => {
      it("should identify Baichuan models", () => {
        expect(identifyProvider("baichuan-13b")).toBe("Baichuan")
        expect(identifyProvider("baichuan-7b")).toBe("Baichuan")
      })
    })

    describe("Cohere models", () => {
      it("should identify Command models", () => {
        expect(identifyProvider("command-r")).toBe("Cohere")
        expect(identifyProvider("command-light")).toBe("Cohere")
      })

      it("should identify c4ai models", () => {
        expect(identifyProvider("c4ai-aya")).toBe("Cohere")
      })
    })

    describe("Unknown models", () => {
      it("should return Unknown for unrecognized models", () => {
        expect(identifyProvider("unknown-model-xyz")).toBe("Unknown")
        expect(identifyProvider("random-name")).toBe("Unknown")
      })

      it("should return Unknown for empty string", () => {
        expect(identifyProvider("")).toBe("Unknown")
      })
    })

    describe("Case insensitivity", () => {
      it("should be case insensitive for all providers", () => {
        expect(identifyProvider("GPT-4")).toBe("OpenAI")
        expect(identifyProvider("CLAUDE-3")).toBe("Claude")
        expect(identifyProvider("QWEN-MAX")).toBe("Qwen")
        expect(identifyProvider("DEEPSEEK-CHAT")).toBe("DeepSeek")
      })
    })

    describe("Pattern precedence", () => {
      it("should match first matching provider", () => {
        // If a model name could match multiple patterns, it should return the first match
        const result = identifyProvider("gemma") // Could be Gemini or DeepMind
        expect(result).toMatch(/Gemini|DeepMind/)
      })
    })
  })

  describe("getProviderConfig", () => {
    it("should return config for recognized provider", () => {
      const config = getProviderConfig("gpt-4")
      expect(config).toBeDefined()
      expect(config.name).toBe("OpenAI")
      expect(config.icon).toBeDefined()
      expect(config.color).toBe("text-green-600")
      expect(config.bgColor).toBe("bg-green-50")
    })

    it("should return Unknown config for unrecognized model", () => {
      const config = getProviderConfig("unknown-model")
      expect(config.name).toBe("Unknown")
      expect(config.color).toBe("text-gray-600")
      expect(config.bgColor).toBe("bg-gray-50")
    })

    it("should have consistent config structure", () => {
      const config = getProviderConfig("claude-3")
      expect(config).toHaveProperty("name")
      expect(config).toHaveProperty("icon")
      expect(config).toHaveProperty("patterns")
      expect(config).toHaveProperty("color")
      expect(config).toHaveProperty("bgColor")
    })

    it("should return different configs for different providers", () => {
      const openAIConfig = getProviderConfig("gpt-4")
      const claudeConfig = getProviderConfig("claude-3")
      expect(openAIConfig.name).not.toBe(claudeConfig.name)
      expect(openAIConfig.color).not.toBe(claudeConfig.color)
    })
  })

  describe("getAllProviders", () => {
    it("should return array of provider types", () => {
      const providers = getAllProviders()
      expect(Array.isArray(providers)).toBe(true)
      expect(providers.length).toBeGreaterThan(0)
    })

    it("should not include Unknown in the list", () => {
      const providers = getAllProviders()
      expect(providers).not.toContain("Unknown")
    })

    it("should include all major providers", () => {
      const providers = getAllProviders()
      expect(providers).toContain("OpenAI")
      expect(providers).toContain("Claude")
      expect(providers).toContain("Gemini")
      expect(providers).toContain("DeepSeek")
      expect(providers).toContain("Mistral")
    })

    it("should match PROVIDER_CONFIGS keys except Unknown", () => {
      const providers = getAllProviders()
      const configKeys = Object.keys(PROVIDER_CONFIGS).filter(
        (key) => key !== "Unknown"
      )
      expect(providers).toEqual(configKeys)
    })
  })

  describe("filterModelsByProvider", () => {
    interface TestModel {
      model_name: string
      id: string
    }

    const models: TestModel[] = [
      { model_name: "gpt-4", id: "1" },
      { model_name: "gpt-3.5-turbo", id: "2" },
      { model_name: "claude-3-opus", id: "3" },
      { model_name: "claude-2", id: "4" },
      { model_name: "gemini-pro", id: "5" },
      { model_name: "deepseek-chat", id: "6" },
      { model_name: "unknown-model", id: "7" }
    ]

    it("should return all models when provider is 'all'", () => {
      const filtered = filterModelsByProvider(models, "all")
      expect(filtered).toHaveLength(models.length)
      expect(filtered).toEqual(models)
    })

    it("should filter OpenAI models", () => {
      const filtered = filterModelsByProvider(models, "OpenAI")
      expect(filtered).toHaveLength(2)
      expect(filtered.map((m) => m.id)).toEqual(["1", "2"])
    })

    it("should filter Claude models", () => {
      const filtered = filterModelsByProvider(models, "Claude")
      expect(filtered).toHaveLength(2)
      expect(filtered.map((m) => m.id)).toEqual(["3", "4"])
    })

    it("should filter single provider models", () => {
      const filtered = filterModelsByProvider(models, "Gemini")
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe("5")
    })

    it("should return empty array when no models match", () => {
      const filtered = filterModelsByProvider(models, "Mistral")
      expect(filtered).toHaveLength(0)
    })

    it("should filter Unknown models", () => {
      const filtered = filterModelsByProvider(models, "Unknown")
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe("7")
    })

    it("should handle empty model list", () => {
      const filtered = filterModelsByProvider([], "OpenAI")
      expect(filtered).toHaveLength(0)
    })

    it("should preserve model properties", () => {
      const filtered = filterModelsByProvider(models, "OpenAI")
      expect(filtered[0]).toHaveProperty("model_name")
      expect(filtered[0]).toHaveProperty("id")
    })

    it("should work with different model types", () => {
      interface ExtendedModel {
        model_name: string
        price: number
        enabled: boolean
      }

      const extendedModels: ExtendedModel[] = [
        { model_name: "gpt-4", price: 0.03, enabled: true },
        { model_name: "claude-3", price: 0.015, enabled: false }
      ]

      const filtered = filterModelsByProvider(extendedModels, "OpenAI")
      expect(filtered).toHaveLength(1)
      expect(filtered[0].price).toBe(0.03)
      expect(filtered[0].enabled).toBe(true)
    })
  })

  describe("PROVIDER_CONFIGS structure", () => {
    it("should have valid config for each provider", () => {
      Object.entries(PROVIDER_CONFIGS).forEach(([key, config]) => {
        expect(config).toHaveProperty("name")
        expect(config).toHaveProperty("icon")
        expect(config).toHaveProperty("patterns")
        expect(config).toHaveProperty("color")
        expect(config).toHaveProperty("bgColor")

        expect(typeof config.name).toBe("string")
        // React components from @lobehub/icons can be objects or functions
        expect(["function", "object"]).toContain(typeof config.icon)
        expect(Array.isArray(config.patterns)).toBe(true)
        expect(typeof config.color).toBe("string")
        expect(typeof config.bgColor).toBe("string")

        // Verify icon is defined
        expect(config.icon).toBeDefined()
        if (key === "Unknown") {
          // Unknown provider has a function that returns null
          if (typeof config.icon === "function") {
            expect(config.icon()).toBeNull()
          }
        }
      })
    })

    it("should have valid Tailwind color classes", () => {
      Object.values(PROVIDER_CONFIGS).forEach((config) => {
        expect(config.color).toMatch(/^text-\w+-\d+$/)
        expect(config.bgColor).toMatch(/^bg-\w+-\d+$/)
      })
    })

    it("should have RegExp patterns", () => {
      Object.entries(PROVIDER_CONFIGS).forEach(([key, config]) => {
        if (key === "Unknown") {
          expect(config.patterns).toHaveLength(0)
        } else {
          expect(config.patterns.length).toBeGreaterThan(0)
          config.patterns.forEach((pattern) => {
            expect(pattern).toBeInstanceOf(RegExp)
          })
        }
      })
    })

    it("should have unique provider names", () => {
      const names = Object.values(PROVIDER_CONFIGS).map((c) => c.name)
      const uniqueNames = new Set(names)
      expect(uniqueNames.size).toBe(names.length)
    })
  })
})
