import { homedir } from "node:os"
import { join } from "node:path"

export const DATA_DIR =
  process.env.DATAEYESAI_DATA_DIR || join(homedir(), ".config", "dataeyesai")
