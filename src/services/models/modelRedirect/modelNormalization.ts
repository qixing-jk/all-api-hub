import { modelMetadataService } from "~/services/models/modelMetadata"
import { resolveCuratedModelVendor } from "~/services/models/modelVendor"
import { removeDateSuffix } from "~/services/models/utils/modelName"

/**
 * Extracts the undecorated model identity while retaining any date suffix.
 */
export function extractCoreModelIdentity(modelName: string): string {
  let coreIdentity = modelName

  // 提取真实模型名，提取最后一个/到结尾的内容
  const lastSlashIndex = coreIdentity.lastIndexOf("/")
  if (lastSlashIndex !== -1) {
    coreIdentity = coreIdentity.slice(lastSlashIndex + 1)
  }

  // 移除冒号后缀（常见的:free等非模型信息后缀）
  const colonIndex = coreIdentity.indexOf(":")
  if (colonIndex !== -1) {
    coreIdentity = coreIdentity.slice(0, colonIndex)
  }

  return coreIdentity
}

/**
 * Normalizes a raw model identifier to its core name by stripping known
 * vendor prefixes, path segments, non-model suffixes and date components.
 */
export function extractActualModel(modelName: string) {
  return removeDateSuffix(extractCoreModelIdentity(modelName))
}

export const renameModel = (
  model: string,
  includeVendor: boolean,
): string | undefined => {
  if (!model) return undefined

  const trimmedModelName = model.trim()
  if (!trimmedModelName) return undefined

  if (includeVendor) {
    // 检查/数量
    const slashCount = (trimmedModelName.match(/\//g) || []).length
    // 只有一个/且不含:（常见的后缀之一）
    if (slashCount === 1 && !trimmedModelName.includes(":")) {
      const parts = trimmedModelName.split("/")

      if (
        parts.length === 2 &&
        parts[0].trim() !== "" &&
        parts[1].trim() !== "" &&
        parts[0] !== "BigModel" &&
        !trimmedModelName.startsWith("Pro/")
      ) {
        return trimmedModelName
      }
    }
  }

  const actualModel = extractActualModel(trimmedModelName)

  // 查找标准化名称
  const metadata = modelMetadataService.findStandardModelName(actualModel)

  if (metadata) {
    // 找到标准化名称，使用标准名称
    // 如果标准名称本身包含 '/'（如 deepseek-ai/DeepSeek-V3.1），需要根据 includeVendor 决定是否保留厂商部分
    const { standardName, vendorName } = metadata

    // 标准名称本身包含厂商前缀
    if (standardName.includes("/")) {
      if (includeVendor) {
        // 需要厂商前缀，直接返回标准名称
        return standardName
      }
      // 不需要厂商前缀，只取模型名部分（最后一个 / 后面的部分）
      const slashIdx = standardName.lastIndexOf("/")
      if (slashIdx !== -1) {
        return standardName.slice(slashIdx + 1)
      }
      return standardName
    } else {
      // 标准名称不包含厂商前缀
      if (includeVendor && vendorName) {
        return `${vendorName}/${standardName}`
      }
      return standardName
    }
  }

  if (includeVendor) {
    const fallbackVendor = resolveCuratedModelVendor(actualModel)
    if (fallbackVendor.state === "candidate") {
      return `${fallbackVendor.labelCandidate}/${actualModel}`
    }
  }

  return actualModel
}
