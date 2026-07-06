const MAX_MODELS = 2000
const MAX_MAPPINGS = 500
const MAX_MODEL_NAME_LENGTH = 200

const normalizeModelName = (value) => {
  const model = String(value || "").trim()
  if (!model) return ""
  if (model.length > MAX_MODEL_NAME_LENGTH) {
    throw new Error("模型名称过长")
  }
  if (model.includes(",")) {
    throw new Error(`模型名称不能包含逗号：${model}`)
  }
  return model
}

const normalizeModelList = (values) => {
  const result = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const model = normalizeModelName(value)
    if (!model || seen.has(model)) continue
    seen.add(model)
    result.push(model)
    if (result.length > MAX_MODELS) throw new Error("模型数量超过安全上限")
  }
  return result
}

export function buildProviderPrefixMappings(models) {
  const candidates = new Map()
  for (const actualModel of normalizeModelList(models)) {
    const slashIndex = actualModel.indexOf("/")
    if (slashIndex < 1 || slashIndex === actualModel.length - 1) continue
    const standardModel = actualModel.slice(slashIndex + 1)
    const targets = candidates.get(standardModel) || []
    targets.push(actualModel)
    candidates.set(standardModel, targets)
  }

  return [...candidates.entries()]
    .filter(([, targets]) => targets.length === 1)
    .map(([standardModel, [actualModel]]) => ({ standardModel, actualModel }))
}

export function buildModelPlan({
  fetchedModels,
  manualModels,
  mappings,
  hideMappedActualModels = false,
  allowMappedStandardModels = false,
}) {
  const actualModels = normalizeModelList([
    ...normalizeModelList(fetchedModels),
    ...normalizeModelList(manualModels),
  ])
  const actualModelSet = new Set(actualModels)
  const modelMapping = {}

  if (!Array.isArray(mappings)) throw new Error("模型映射格式不正确")
  if (mappings.length > MAX_MAPPINGS)
    throw new Error("模型映射数量超过安全上限")

  for (const entry of mappings) {
    const standardModel = normalizeModelName(entry?.standardModel)
    const actualModel = normalizeModelName(entry?.actualModel)
    if (!standardModel && !actualModel) continue
    if (!standardModel || !actualModel)
      throw new Error("模型映射两边都必须填写")
    if (!actualModelSet.has(actualModel)) {
      throw new Error(`映射目标不在已发现或手动模型中：${actualModel}`)
    }
    if (standardModel === actualModel) continue
    if (!allowMappedStandardModels && actualModelSet.has(standardModel)) {
      throw new Error(`标准名称与已有实际模型冲突：${standardModel}`)
    }
    if (
      modelMapping[standardModel] &&
      modelMapping[standardModel] !== actualModel
    ) {
      throw new Error(`标准名称存在多个映射目标：${standardModel}`)
    }
    modelMapping[standardModel] = actualModel
  }

  const mappedTargets = new Set(Object.values(modelMapping))
  const visibleActualModels = hideMappedActualModels
    ? actualModels.filter((model) => !mappedTargets.has(model))
    : actualModels
  const models = normalizeModelList([
    ...visibleActualModels,
    ...Object.keys(modelMapping),
  ])
  return { models, modelMapping }
}
