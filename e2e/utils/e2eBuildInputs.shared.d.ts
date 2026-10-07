export declare function readE2eBuildInputPaths(cwd: string): Promise<string[]>
export declare function createE2eBuildInputHash(
  cwd: string,
  inputPaths: readonly string[],
  options?: {
    env?: Record<string, string | undefined>
    nodeVersion?: string
    platform?: string
    arch?: string
  },
): Promise<string>
