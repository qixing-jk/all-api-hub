export interface LocalEnvOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  envFile?: string
}

export interface LocalEnvSources {
  files: string[]
  sharedDir: string | null
}

/**
 * Load shared local configuration below checkout files and existing env values.
 * @param options Checkout and environment to load.
 * @returns Loaded source paths and selected shared directory.
 */
export function loadLocalEnv(options?: LocalEnvOptions): LocalEnvSources
