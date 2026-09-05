import { CLOUD_SYNC_PROVIDERS, type CloudSyncProvider } from "~/types/cloudSync"
import type { WebDAVSettings } from "~/types/webdav"

import {
  createEncryptedGithubGistBackup,
  downloadGithubGistBackup,
  getGithubGistSyncConfig,
  isGithubGistError,
  testGithubGistConnection,
  uploadGithubGistBackup,
  type GitHubGistRemote,
} from "./githubGistService"
import {
  downloadBackup,
  testWebdavConnection,
  uploadBackup,
} from "./webdavService"

export interface CloudSyncRemote {
  provider: CloudSyncProvider
  gistId?: string
  revision?: string
  htmlUrl?: string
  rawContent?: string
}

/** Resolve the active provider, keeping old settings on the WebDAV path. */
export function getCloudSyncProvider(
  settings: WebDAVSettings,
): CloudSyncProvider {
  return settings.provider === CLOUD_SYNC_PROVIDERS.GITHUB_GIST
    ? CLOUD_SYNC_PROVIDERS.GITHUB_GIST
    : CLOUD_SYNC_PROVIDERS.WEBDAV
}

/** Test the currently selected cloud provider connection. */
export async function testCloudSyncConnection(settings: WebDAVSettings) {
  if (getCloudSyncProvider(settings) === CLOUD_SYNC_PROVIDERS.GITHUB_GIST) {
    return testGithubGistConnection(getGithubGistSyncConfig(settings))
  }
  const config = {
    url: settings.url,
    username: settings.username,
    password: settings.password,
  }
  return testWebdavConnection(
    config.url || config.username || config.password ? config : undefined,
  )
}

/** Download and normalize provider metadata for a sync operation. */
export async function downloadCloudSyncBackup(
  settings: WebDAVSettings,
  options?: { prepareForWrite?: boolean },
) {
  if (getCloudSyncProvider(settings) === CLOUD_SYNC_PROVIDERS.GITHUB_GIST) {
    const result = await downloadGithubGistBackup(
      getGithubGistSyncConfig(settings),
    )
    return {
      content: result.content,
      remote: {
        provider: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
        gistId: result.remote.gistId,
        revision: result.remote.revision,
        htmlUrl: result.remote.htmlUrl,
        rawContent: result.remote.rawContent,
      } satisfies CloudSyncRemote,
    }
  }

  const config = {
    url: settings.url,
    username: settings.username,
    password: settings.password,
  }
  return {
    content: await downloadBackup(
      config.url || config.username || config.password ? config : undefined,
      options,
    ),
    remote: { provider: CLOUD_SYNC_PROVIDERS.WEBDAV } satisfies CloudSyncRemote,
  }
}

/** Upload a plaintext backup through the currently selected provider. */
export async function uploadCloudSyncBackup(
  content: string,
  settings: WebDAVSettings,
  expectedRevision?: string,
) {
  if (getCloudSyncProvider(settings) === CLOUD_SYNC_PROVIDERS.GITHUB_GIST) {
    const remote = await uploadGithubGistBackup(
      content,
      getGithubGistSyncConfig(settings),
      expectedRevision,
    )
    return {
      provider: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
      gistId: remote.gistId,
      revision: remote.revision,
      htmlUrl: remote.htmlUrl,
      rawContent: remote.rawContent,
    } satisfies CloudSyncRemote
  }

  const config = {
    url: settings.url,
    username: settings.username,
    password: settings.password,
  }
  await uploadBackup(
    content,
    config.url || config.username || config.password ? config : undefined,
  )
  return { provider: CLOUD_SYNC_PROVIDERS.WEBDAV } satisfies CloudSyncRemote
}

/** Create the first encrypted backup for a provider that supports creation. */
export async function createCloudSyncBackup(
  content: string,
  settings: WebDAVSettings,
): Promise<CloudSyncRemote> {
  if (getCloudSyncProvider(settings) !== CLOUD_SYNC_PROVIDERS.GITHUB_GIST) {
    throw new Error("Only GitHub Gist supports explicit creation")
  }
  const remote: GitHubGistRemote = await createEncryptedGithubGistBackup(
    content,
    getGithubGistSyncConfig(settings),
  )
  return {
    provider: CLOUD_SYNC_PROVIDERS.GITHUB_GIST,
    gistId: remote.gistId,
    revision: remote.revision,
    htmlUrl: remote.htmlUrl,
    rawContent: remote.rawContent,
  }
}

export { isGithubGistError }
