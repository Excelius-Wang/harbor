import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const EXIT_CODES = Object.freeze({
  usage: 2,
  version: 10,
  tag: 11,
  repository: 12,
  configuration: 13,
  signingEnvironment: 14,
});

export const REQUIRED_SIGNING_ENV = Object.freeze([
  "TAURI_SIGNING_PUBLIC_KEY",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "APPLE_CERTIFICATE",
  "APPLE_CERTIFICATE_PASSWORD",
  "KEYCHAIN_PASSWORD",
  "APPLE_ID",
  "APPLE_PASSWORD",
  "APPLE_TEAM_ID",
]);

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/;
const UPDATER_PUBLIC_KEY_PLACEHOLDER = "__TAURI_UPDATER_PUBKEY__";
const UPDATER_ENDPOINT_PLACEHOLDER = "__TAURI_UPDATER_ENDPOINT__";

class PreflightError extends Error {
  constructor(exitCode, message) {
    super(message);
    this.name = "PreflightError";
    this.exitCode = exitCode;
  }
}

function parseArguments(argv, defaultRoot) {
  if (argv.length === 0) {
    return defaultRoot;
  }

  if (argv.length === 2 && argv[0] === "--root" && argv[1]) {
    return path.resolve(argv[1]);
  }

  throw new PreflightError(EXIT_CODES.usage, "usage: release-preflight [--root <directory>]");
}

async function readText(root, relativePath, exitCode) {
  try {
    return await readFile(path.join(root, relativePath), "utf8");
  } catch {
    throw new PreflightError(exitCode, `cannot read ${relativePath}`);
  }
}

async function readJson(root, relativePath, exitCode) {
  const content = await readText(root, relativePath, exitCode);

  try {
    return JSON.parse(content);
  } catch {
    throw new PreflightError(exitCode, `invalid JSON in ${relativePath}`);
  }
}

function tomlSection(content, sectionName, relativePath, exitCode) {
  const escapedSectionName = sectionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\[${escapedSectionName}\\]\\s*$`, "m").exec(content);
  if (!match) {
    throw new PreflightError(exitCode, `missing [${sectionName}] in ${relativePath}`);
  }

  const start = match.index + match[0].length;
  const nextSection = content.slice(start).search(/^\s*\[/m);
  return nextSection === -1 ? content.slice(start) : content.slice(start, start + nextSection);
}

function tomlString(section, field, relativePath, exitCode) {
  const match = section.match(new RegExp(`^${field}\\s*=\\s*"([^"]+)"\\s*$`, "m"));
  if (!match) {
    throw new PreflightError(exitCode, `missing ${field} in ${relativePath}`);
  }

  return match[1];
}

function cargoLockVersion(cargoLock, packageName) {
  const packageBlocks = cargoLock.split(/^\[\[package\]\]\s*$/m).slice(1);
  for (const block of packageBlocks) {
    if (tomlString(block, "name", "src-tauri/Cargo.lock", EXIT_CODES.version) === packageName) {
      return tomlString(block, "version", "src-tauri/Cargo.lock", EXIT_CODES.version);
    }
  }

  throw new PreflightError(EXIT_CODES.version, `missing ${packageName} in src-tauri/Cargo.lock`);
}

function requireVersion(value, source) {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new PreflightError(EXIT_CODES.version, `unsupported version in ${source}`);
  }

  return value;
}

function repositoryIdentity(value, source) {
  if (typeof value !== "string") {
    throw new PreflightError(EXIT_CODES.repository, `missing repository in ${source}`);
  }

  const match = value
    .trim()
    .match(
      /^(?:https:\/\/github\.com\/|git@github\.com:|github:)([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i
    );
  if (!match) {
    throw new PreflightError(EXIT_CODES.repository, `unsupported GitHub repository in ${source}`);
  }

  return `${match[1]}/${match[2]}`;
}

function ensureVersions(packageJson, tauriConfig, cargoToml, cargoLock) {
  const cargoPackage = tomlSection(
    cargoToml,
    "package",
    "src-tauri/Cargo.toml",
    EXIT_CODES.version
  );
  const packageName = tomlString(cargoPackage, "name", "src-tauri/Cargo.toml", EXIT_CODES.version);
  const versions = {
    "package.json": requireVersion(packageJson.version, "package.json"),
    "src-tauri/tauri.conf.json": requireVersion(tauriConfig.version, "src-tauri/tauri.conf.json"),
    "src-tauri/Cargo.toml": requireVersion(
      tomlString(cargoPackage, "version", "src-tauri/Cargo.toml", EXIT_CODES.version),
      "src-tauri/Cargo.toml"
    ),
    "src-tauri/Cargo.lock": requireVersion(
      cargoLockVersion(cargoLock, packageName),
      "src-tauri/Cargo.lock"
    ),
  };
  if (new Set(Object.values(versions)).size !== 1) {
    const summary = Object.entries(versions)
      .map(([source, version]) => `${source}=${version}`)
      .join(", ");
    throw new PreflightError(EXIT_CODES.version, `version mismatch: ${summary}`);
  }

  return { version: versions["package.json"], cargoPackage };
}

function ensureTag(version, env) {
  const expectedTag = `v${version}`;
  if (env.GITHUB_REF_TYPE !== "tag" || env.GITHUB_REF_NAME !== expectedTag) {
    throw new PreflightError(
      EXIT_CODES.tag,
      `expected tag ${expectedTag}; received ${env.GITHUB_REF_TYPE || "unknown"} ${env.GITHUB_REF_NAME || "unset"}`
    );
  }
}

function ensureRepository(packageJson, cargoPackage, env) {
  const packageRepository = repositoryIdentity(
    typeof packageJson.repository === "string"
      ? packageJson.repository
      : packageJson.repository?.url,
    "package.json"
  );
  const cargoRepository = repositoryIdentity(
    tomlString(cargoPackage, "repository", "src-tauri/Cargo.toml", EXIT_CODES.repository),
    "src-tauri/Cargo.toml"
  );
  const githubRepository = repositoryIdentity(
    `github:${env.GITHUB_REPOSITORY ?? ""}`,
    "GITHUB_REPOSITORY"
  );
  const identities = [packageRepository, cargoRepository, githubRepository];
  if (new Set(identities.map((identity) => identity.toLowerCase())).size !== 1) {
    throw new PreflightError(
      EXIT_CODES.repository,
      `repository mismatch: package.json=${packageRepository}, src-tauri/Cargo.toml=${cargoRepository}, GITHUB_REPOSITORY=${githubRepository}`
    );
  }

  return packageRepository;
}

function ensureReleaseConfiguration(tauriConfig) {
  const updater = tauriConfig.plugins?.updater;
  const endpoints = updater?.endpoints;
  const failures = [];

  if (tauriConfig.bundle?.active !== true) failures.push("bundle.active must be true");
  if (tauriConfig.bundle?.createUpdaterArtifacts !== true) {
    failures.push("bundle.createUpdaterArtifacts must be true");
  }
  if (updater?.pubkey !== UPDATER_PUBLIC_KEY_PLACEHOLDER) {
    failures.push(`plugins.updater.pubkey must be ${UPDATER_PUBLIC_KEY_PLACEHOLDER}`);
  }
  if (
    !Array.isArray(endpoints) ||
    endpoints.length !== 1 ||
    endpoints[0] !== UPDATER_ENDPOINT_PLACEHOLDER
  ) {
    failures.push(`plugins.updater.endpoints must contain only ${UPDATER_ENDPOINT_PLACEHOLDER}`);
  }

  if (failures.length > 0) {
    throw new PreflightError(
      EXIT_CODES.configuration,
      `release configuration invalid: ${failures.join("; ")}`
    );
  }
}

function ensureSigningEnvironment(env) {
  const missing = REQUIRED_SIGNING_ENV.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new PreflightError(
      EXIT_CODES.signingEnvironment,
      `missing signing environment variables: ${missing.sort().join(", ")}`
    );
  }
}

export async function runPreflight({ root, env }) {
  const [packageJson, tauriConfig, cargoToml, cargoLock] = await Promise.all([
    readJson(root, "package.json", EXIT_CODES.version),
    readJson(root, "src-tauri/tauri.conf.json", EXIT_CODES.configuration),
    readText(root, "src-tauri/Cargo.toml", EXIT_CODES.version),
    readText(root, "src-tauri/Cargo.lock", EXIT_CODES.version),
  ]);

  const { version, cargoPackage } = ensureVersions(packageJson, tauriConfig, cargoToml, cargoLock);
  ensureTag(version, env);
  const repository = ensureRepository(packageJson, cargoPackage, env);
  ensureReleaseConfiguration(tauriConfig);
  ensureSigningEnvironment(env);

  return { repository, version };
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));

  try {
    const root = parseArguments(process.argv.slice(2), path.resolve(scriptDir, ".."));
    const result = await runPreflight({ root, env: process.env });
    console.log(`release-preflight: ok v${result.version} ${result.repository} macOS`);
  } catch (error) {
    const exitCode = error instanceof PreflightError ? error.exitCode : 1;
    const message = error instanceof Error ? error.message : "unexpected preflight failure";
    console.error(`release-preflight: failed [${exitCode}] ${message}`);
    process.exitCode = exitCode;
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  await main();
}
