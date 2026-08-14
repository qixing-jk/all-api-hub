#!/usr/bin/env node
import { appendFileSync } from "node:fs"

import {
  filterRealSiteE2eMatrix,
  partitionRealSiteE2eMatrix,
} from "./real-site-e2e-matrix.mjs"

const category = process.argv[2] ?? "all"
const target = process.argv[3] ?? "all"
const include = filterRealSiteE2eMatrix(category, target)
const matrix = JSON.stringify({ include })
const partitioned = partitionRealSiteE2eMatrix(include)
const outputFile = process.env.GITHUB_OUTPUT

if (outputFile) {
  appendFileSync(outputFile, `matrix=${matrix}\n`, "utf8")
  appendFileSync(
    outputFile,
    `parallel_matrix=${JSON.stringify({ include: partitioned.parallel })}\n`,
    "utf8",
  )
  appendFileSync(
    outputFile,
    `new_api_matrix=${JSON.stringify({ include: partitioned.newApi })}\n`,
    "utf8",
  )
  appendFileSync(
    outputFile,
    `sub2api_matrix=${JSON.stringify({ include: partitioned.sub2api })}\n`,
    "utf8",
  )
  appendFileSync(
    outputFile,
    `has_parallel=${partitioned.parallel.length > 0}\n`,
    "utf8",
  )
  appendFileSync(
    outputFile,
    `has_new_api=${partitioned.newApi.length > 0}\n`,
    "utf8",
  )
  appendFileSync(
    outputFile,
    `has_sub2api=${partitioned.sub2api.length > 0}\n`,
    "utf8",
  )
} else {
  console.log(matrix)
}
