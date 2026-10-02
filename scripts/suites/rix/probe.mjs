#!/usr/bin/env node
import { loadLocalEnv } from "../../utils/local-env.mjs"

/**
 * Pure protocol probe for Rix API deployments (5.x or 6.x).
 * Runs directly via Node.js fetch with zero browser/CDP overhead.
 */
export async function runRixProbe({ targetUrl, timeoutMs = 10000 }) {
  const normalizedUrl = targetUrl.replace(/\/+$/, "")
  console.log(`\n🔍 开始针对目标站点进行协议级网络探测: ${normalizedUrl}`)

  // 1. 探测 /api/status 结构指纹
  const statusRes = await fetch(`${normalizedUrl}/api/status`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!statusRes.ok) {
    throw new Error(
      `GET /api/status 探测失败: HTTP ${statusRes.status} ${statusRes.statusText}`,
    )
  }
  const statusJson = await statusRes.json()
  const statusData = statusJson.data || statusJson

  const versionMsg = String(statusData.rix_version_message || "")
  const is6x = versionMsg.startsWith("6")
  const is5x = versionMsg.startsWith("5")
  const isRixStructural =
    Boolean(statusData.rix_version_message) ||
    Boolean(statusData.rixapi_license_type) ||
    statusData.rix_license_enabled === true

  console.log("  [Status 指纹响应]:", {
    system_name: statusData.system_name,
    version: statusData.version,
    rix_version_message: statusData.rix_version_message,
    rixapi_license_type: statusData.rixapi_license_type,
    enable_checkin: statusData.enable_checkin,
  })

  // 2. 探测 /api/pricing 模型清单与方言格式
  let modelCount = 0
  let pricingDialect = "unknown"
  let sampleModel = null

  try {
    const pricingRes = await fetch(`${normalizedUrl}/api/pricing`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs + 5000),
    })
    if (pricingRes.ok) {
      const pricingJson = await pricingRes.json()
      const pricingData = pricingJson.data || pricingJson
      const modelInfo = pricingData.model_info

      if (Array.isArray(modelInfo)) {
        modelCount = modelInfo.length
        sampleModel = modelInfo[0]
        pricingDialect = sampleModel?.price_config
          ? "6.x-price_config"
          : "ratio-array"
      } else if (modelInfo && typeof modelInfo === "object") {
        const keys = Object.keys(modelInfo)
        modelCount = keys.length
        sampleModel = modelInfo[keys[0]]
        pricingDialect = "5.x-price_info"
      }
    }
  } catch (err) {
    console.warn(`  ⚠️ /api/pricing 探测异常: ${err.message}`)
  }

  console.log("  [Pricing 定价指纹]:", {
    pricingDialect,
    modelCount,
    sampleModelName: sampleModel?.model_name || sampleModel?.id || "N/A",
  })

  const ok = isRixStructural && modelCount > 0
  return {
    ok,
    status: statusData,
    pricingDialect,
    version: versionMsg || statusData.version || "unknown",
    is6x,
    is5x,
    modelCount,
  }
}

// 允许单独作为 CLI 运行: node scripts/suites/rix/probe.mjs [url]
if (process.argv[1] && process.argv[1].endsWith("probe.mjs")) {
  loadLocalEnv()
  const target =
    process.argv[2] ||
    process.env.TARGET_RIX_URL ||
    "https://platform.ephone.ai"
  runRixProbe({ targetUrl: target })
    .then((res) => {
      console.log(
        "\n✅ 探测完成:",
        res.ok ? "符合 Rix API 结构契约" : "未完全命中",
      )
    })
    .catch((err) => {
      console.error("\n❌ 探测失败:", err.message)
      process.exit(1)
    })
}
