import type { AxonHubConfig } from "~/types/axonHubConfig"

export const normalizeBaseUrl = (baseUrl: string) =>
  baseUrl.trim().replace(/\/+$/, "")

export const cacheKeyForConfig = (config: AxonHubConfig) =>
  `${normalizeBaseUrl(config.baseUrl)}|${config.email.trim().toLowerCase()}`
