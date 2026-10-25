import { createHash, createPublicKey, sign as signBytes } from "node:crypto"
import { readFile } from "node:fs/promises"

import { DISTRIBUTION_CHANNEL } from "../src/utils/core/distributionChannel.ts"

/** Chrome derives an extension id from the first 16 bytes of the key hash. */
const CRX_ID_BYTES = 16
/** Chrome encodes each id nibble as `a`-`p` instead of `0`-`f`. */
const CRX_ID_FIRST_CHAR_CODE = 0x61
const CRX_ID_PATTERN = /^[a-p]{32}$/
const DOTTED_VERSION_PATTERN = /^\d+(?:\.\d+)*$/

/** CRX3 container: magic, format version, then the protobuf header length. */
const CRX_MAGIC = "Cr24"
const CRX_FORMAT_VERSION = 3
/** Prefix that domain-separates the signed payload from any other key use. */
const CRX_SIGNATURE_PREFIX = "CRX3 SignedData\x00"

const REPOSITORY = "qixing-jk/all-api-hub"

const CRX_UPDATE_MANIFEST_ASSET_NAME = "updates.xml"

const CRX_ASSET_NAMES = Object.freeze({
  [DISTRIBUTION_CHANNEL.GithubRelease]: "all-api-hub-chrome.crx",
  [DISTRIBUTION_CHANNEL.GithubNightly]: "all-api-hub-nightly-chrome.crx",
})

export const CRX_ENV_VARS = Object.freeze({
  PrivateKeyPem: "AAH_CRX_PRIVATE_KEY_PEM",
  PrivateKeyBase64: "AAH_CRX_PRIVATE_KEY_BASE64",
  PrivateKeyPath: "AAH_CRX_PRIVATE_KEY_PATH",
  RequireCrxSelfUpdate: "AAH_REQUIRE_CRX_SELF_UPDATE",
  SelfUpdateUrl: "AAH_SELF_UPDATE_URL",
  BuildTime: "AAH_CRX_BUILD_TIME",
})

/** Only channels whose builds embed `update_url` can serve a manifest. */
export const SELF_UPDATE_CHANNELS = new Set([
  DISTRIBUTION_CHANNEL.GithubRelease,
  DISTRIBUTION_CHANNEL.GithubNightly,
])

/** Resolve the release download path prefix for a rolling self-update channel. */
function getReleaseDownloadPrefix(channel) {
  if (!SELF_UPDATE_CHANNELS.has(channel)) {
    throw new Error(
      `Invalid self-update channel "${channel}": expected one of ${[...SELF_UPDATE_CHANNELS].join(", ")}`,
    )
  }

  return channel === DISTRIBUTION_CHANNEL.GithubNightly
    ? "download/nightly"
    : "latest/download"
}

/**
 * Resolve the manifest URL baked into a self-updating build.
 *
 * Both paths are stable per channel: `releases/latest` always resolves to the
 * newest non-prerelease release, and the `nightly` tag is force-moved on every
 * build. Baking a version into the URL would strand installed copies.
 */
export function getCrxSelfUpdateUrl(channel) {
  return `https://github.com/${REPOSITORY}/releases/${getReleaseDownloadPrefix(channel)}/${getCrxUpdateManifestAssetName(channel)}`
}

/** The manifest keeps a fixed asset name so the baked `update_url` stays valid. */
export function getCrxUpdateManifestAssetName(channel) {
  if (!SELF_UPDATE_CHANNELS.has(channel)) {
    throw new Error(
      `Invalid self-update channel "${channel}": expected one of ${[...SELF_UPDATE_CHANNELS].join(", ")}`,
    )
  }

  return CRX_UPDATE_MANIFEST_ASSET_NAME
}

/**
 * Resolve the release asset name for a signed CRX.
 *
 * Stable builds use a version-less name so `releases/latest/download/` resolves
 * to the newest one; the `nightly` tag already has a fixed name per channel.
 */
export function getCrxAssetName(channel) {
  const assetName = CRX_ASSET_NAMES[channel]
  if (assetName) return assetName

  throw new Error(
    `Invalid self-update channel "${channel}": expected one of ${[...SELF_UPDATE_CHANNELS].join(", ")}`,
  )
}

/** Absolute download URL advertised in the update manifest. */
export function getCrxCodebaseUrl(channel) {
  return `https://github.com/${REPOSITORY}/releases/${getReleaseDownloadPrefix(channel)}/${getCrxAssetName(channel)}`
}

/** Export the SPKI DER public key from the private key PEM with helpful errors. */
function getPublicKeyDer(privateKeyPem) {
  try {
    return createPublicKey(privateKeyPem).export({
      type: "spki",
      format: "der",
    })
  } catch (error) {
    throw new Error(
      `Could not read the CRX private key: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Derive the Chromium extension id for a signing key.
 *
 * Chrome hashes the DER SPKI public key, keeps the first 16 bytes and maps each
 * byte to `a`-`p`. The id must stay stable across releases or installed copies
 * will not see updates.
 */
export function deriveCrxExtensionId(privateKeyPem) {
  const publicKeyDer = getPublicKeyDer(privateKeyPem)

  const idHex = createHash("sha256")
    .update(publicKeyDer)
    .digest("hex")
    .slice(0, CRX_ID_BYTES * 2)

  return Array.from(idHex, (nibble) =>
    String.fromCharCode(CRX_ID_FIRST_CHAR_CODE + Number.parseInt(nibble, 16)),
  ).join("")
}

/**
 * Build the Chromium update manifest (`updates.xml`) served at `update_url`.
 *
 * Chrome compares the advertised `version` against the installed one before
 * downloading `codebase`, so both must match the published CRX exactly.
 */
export function buildCrxUpdateManifest(options) {
  const { extensionId, version, codebase } = options

  if (typeof extensionId !== "string" || !CRX_ID_PATTERN.test(extensionId)) {
    throw new Error(
      `Invalid extension id "${extensionId}": expected 32 characters in a-p`,
    )
  }
  if (typeof version !== "string" || !DOTTED_VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid version "${version}": expected a dotted number`)
  }
  if (typeof codebase !== "string" || !codebase.startsWith("https://")) {
    throw new Error(`Invalid codebase "${codebase}": expected an https URL`)
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gupdate xmlns="http://www.google.com/update2/response" protocol="2.0">',
    `  <app appid="${extensionId}">`,
    `    <updatecheck codebase="${codebase}" version="${version}" />`,
    "  </app>",
    "</gupdate>",
    "",
  ].join("\n")
}

/**
 * Check whether any CRX signing key source is provided in environment variables.
 */
export function hasCrxPrivateKey(env = process.env) {
  return Boolean(
    env[CRX_ENV_VARS.PrivateKeyPem]?.trim() ||
      env[CRX_ENV_VARS.PrivateKeyBase64]?.trim() ||
      env[CRX_ENV_VARS.PrivateKeyPath]?.trim(),
  )
}

/**
 * Read the PEM private key used to sign CRX packages.
 *
 * CI passes it base64-encoded so newlines survive secret storage; a path is
 * also accepted for local runs.
 */
export async function readCrxPrivateKey(env = process.env) {
  const pem = env[CRX_ENV_VARS.PrivateKeyPem]?.trim()
  if (pem) {
    return pem
  }

  const encoded = env[CRX_ENV_VARS.PrivateKeyBase64]?.trim()
  if (encoded) {
    return Buffer.from(encoded, "base64").toString("utf8")
  }

  const keyPath = env[CRX_ENV_VARS.PrivateKeyPath]?.trim()
  if (keyPath) {
    return await readFile(keyPath, "utf8")
  }

  throw new Error(
    `A CRX signing key is required: set ${CRX_ENV_VARS.PrivateKeyBase64} or ${CRX_ENV_VARS.PrivateKeyPath}`,
  )
}

/** Encode a protobuf varint. */
function encodeVarint(value) {
  const bytes = []
  let remaining = value
  while (remaining > 0x7f) {
    bytes.push((remaining & 0x7f) | 0x80)
    remaining = Math.floor(remaining / 128)
  }
  bytes.push(remaining)
  return Buffer.from(bytes)
}

/** Encode a length-delimited protobuf field. */
function encodeBytesField(fieldNumber, value) {
  return Buffer.concat([
    encodeVarint((fieldNumber << 3) | 2),
    encodeVarint(value.length),
    value,
  ])
}

/**
 * Package extension bytes into a signed CRX3 container.
 *
 * The container is `Cr24`, the format version, the header length, a protobuf
 * `CrxFileHeader`, then the ZIP. The signature covers
 * `CRX3 SignedData\0` + header length + `signed_header_data` + ZIP, which binds
 * the payload to this extension id and nothing else.
 */
export function packCrx3({ zipBuffer, privateKeyPem }) {
  const publicKeyDer = getPublicKeyDer(privateKeyPem)
  const crxId = createHash("sha256")
    .update(publicKeyDer)
    .digest()
    .subarray(0, CRX_ID_BYTES)

  // SignedData { optional bytes crx_id = 1; }
  const signedHeaderData = encodeBytesField(1, crxId)
  const signedHeaderSize = Buffer.alloc(4)
  signedHeaderSize.writeUInt32LE(signedHeaderData.length, 0)

  const signature = signBytes(
    "sha256",
    Buffer.concat([
      Buffer.from(CRX_SIGNATURE_PREFIX, "utf8"),
      signedHeaderSize,
      signedHeaderData,
      zipBuffer,
    ]),
    privateKeyPem,
  )

  // AsymmetricKeyProof { public_key = 1; signature = 2; }
  const proof = Buffer.concat([
    encodeBytesField(1, publicKeyDer),
    encodeBytesField(2, signature),
  ])

  // CrxFileHeader { sha256_with_rsa = 2; signed_header_data = 10000; }
  const header = Buffer.concat([
    encodeBytesField(2, proof),
    encodeBytesField(10000, signedHeaderData),
  ])

  const prefix = Buffer.alloc(12)
  prefix.write(CRX_MAGIC, 0, "ascii")
  prefix.writeUInt32LE(CRX_FORMAT_VERSION, 4)
  prefix.writeUInt32LE(header.length, 8)

  return Buffer.concat([prefix, header, zipBuffer])
}
