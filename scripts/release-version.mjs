import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packageJsonPath = path.join(rootDir, "package.json");
const tauriConfigPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");
const cargoLockPath = path.join(rootDir, "src-tauri", "Cargo.lock");
const localeDir = path.join(rootDir, "src", "i18n", "locales");

const rl = readline.createInterface({ input, output });
let messages;

function getCliLanguage() {
  const langIndex = process.argv.indexOf("--lang");
  if (langIndex === -1) {
    return null;
  }

  const value = process.argv[langIndex + 1];
  if (value === "zh" || value === "en") {
    return value;
  }

  throw new Error(messages ? t("releaseVersion.errors.invalidLang") : "Invalid --lang value. Use zh or en.");
}

function run(command) {
  return execSync(command, {
    cwd: rootDir,
    stdio: "pipe",
    encoding: "utf8",
  }).trim();
}

function runInteractive(command) {
  execSync(command, {
    cwd: rootDir,
    stdio: "inherit",
  });
}

async function ask(question) {
  const answer = await rl.question(question);
  return answer.trim();
}

function t(key, vars = {}) {
  const value = key.split(".").reduce((current, part) => current?.[part], messages);
  if (typeof value !== "string") {
    throw new Error(`Missing translation key: ${key}`);
  }

  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ""));
}

async function askYesNo(questionKey, defaultValue = false) {
  const suffix = defaultValue ? t("releaseVersion.prompts.yesNoDefaultYes") : t("releaseVersion.prompts.yesNoDefaultNo");
  const answer = (await ask(`${t(questionKey)}${suffix}`)).toLowerCase();

  if (!answer) {
    return defaultValue;
  }

  return answer === "y" || answer === "yes";
}

function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/);
  if (!match) {
    throw new Error(t("releaseVersion.errors.unsupportedVersion", { version }));
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    beta: match[4] ? Number(match[4]) : null,
  };
}

function formatVersion({ major, minor, patch, beta }) {
  const base = `${major}.${minor}.${patch}`;
  return beta == null ? base : `${base}-beta.${beta}`;
}

function getSuggestedVersions(currentVersion) {
  const parsed = parseVersion(currentVersion);
  const stable = { ...parsed, beta: null };
  const patch = { ...stable, patch: stable.patch + 1 };
  const minor = { major: stable.major, minor: stable.minor + 1, patch: 0, beta: null };
  const major = { major: stable.major + 1, minor: 0, patch: 0, beta: null };

  const suggestions = [
    { label: t("releaseVersion.options.patch"), version: formatVersion(patch) },
    { label: t("releaseVersion.options.minor"), version: formatVersion(minor) },
    { label: t("releaseVersion.options.major"), version: formatVersion(major) },
  ];

  if (parsed.beta != null) {
    suggestions.unshift({
      label: t("releaseVersion.options.promoteBeta"),
      version: formatVersion(stable),
    });
    suggestions.push({
      label: t("releaseVersion.options.nextBeta"),
      version: formatVersion({ ...stable, beta: parsed.beta + 1 }),
    });
  } else {
    suggestions.push({
      label: t("releaseVersion.options.nextPatchBeta"),
      version: formatVersion({ ...patch, beta: 1 }),
    });
  }

  return suggestions;
}

async function chooseVersion(currentVersion) {
  const suggestions = getSuggestedVersions(currentVersion);

  console.log(t("releaseVersion.messages.currentVersion", { version: currentVersion }));
  console.log(`\n${t("releaseVersion.messages.selectNextVersion")}`);
  suggestions.forEach((item, index) => {
    console.log(`${index + 1}. ${item.label} -> ${item.version}`);
  });
  console.log(`${suggestions.length + 1}. ${t("releaseVersion.options.custom")}`);

  const choice = await ask(t("releaseVersion.prompts.enterChoice", { max: suggestions.length + 1 }));
  const choiceNumber = Number(choice);

  if (choiceNumber >= 1 && choiceNumber <= suggestions.length) {
    return suggestions[choiceNumber - 1].version;
  }

  if (choiceNumber === suggestions.length + 1) {
    const customVersion = await ask(t("releaseVersion.prompts.enterCustomVersion"));
    parseVersion(customVersion);
    return customVersion;
  }

  console.log(t("releaseVersion.messages.invalidChoice"));
  return suggestions[0].version;
}

function getCargoVersion(cargoToml) {
  const match = cargoToml.match(/^(version\s*=\s*")([^"]+)("\s*)$/m);
  if (!match) {
    throw new Error(t("releaseVersion.errors.cargoVersionNotFound"));
  }

  return match[2];
}

function getCargoPackageName(cargoToml) {
  const match = cargoToml.match(/^name\s*=\s*"([^"]+)"\s*$/m);
  if (!match) {
    throw new Error(t("releaseVersion.errors.cargoPackageNameNotFound"));
  }

  return match[1];
}

function getCargoLockVersion(cargoLock, packageName) {
  const pattern = new RegExp(`(\\[\\[package\\]\\]\\s+name = "${packageName}"\\s+version = ")([^"]+)(")`);
  const match = cargoLock.match(pattern);
  if (!match) {
    throw new Error(t("releaseVersion.errors.cargoLockVersionNotFound"));
  }

  return match[2];
}

function ensureVersionsAreConsistent(packageVersion, tauriVersion, cargoVersion, cargoLockVersion) {
  if (
    packageVersion !== tauriVersion ||
    packageVersion !== cargoVersion ||
    packageVersion !== cargoLockVersion
  ) {
    throw new Error(
      t("releaseVersion.errors.versionMismatch", {
        packageVersion,
        tauriVersion,
        cargoVersion,
        cargoLockVersion,
      }),
    );
  }
}

function ensureMainBranch() {
  const branch = getCurrentBranch();
  if (branch !== "main") {
    throw new Error(t("releaseVersion.errors.branchNotMain", { branch }));
  }

  return branch;
}

function ensureRemoteTagDoesNotExist(tagName) {
  const existing = run(`git ls-remote --tags origin refs/tags/${tagName}`);
  if (existing) {
    throw new Error(t("releaseVersion.errors.remoteTagExists", { tag: tagName }));
  }
}

async function loadCurrentVersions() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
  const cargoToml = await readFile(cargoTomlPath, "utf8");
  const cargoLock = await readFile(cargoLockPath, "utf8");

  const packageVersion = packageJson.version;
  const tauriVersion = tauriConfig.version;
  const cargoVersion = getCargoVersion(cargoToml);
  const cargoPackageName = getCargoPackageName(cargoToml);
  const cargoLockVersion = getCargoLockVersion(cargoLock, cargoPackageName);

  if (typeof packageVersion !== "string" || packageVersion.length === 0) {
    throw new Error(t("releaseVersion.errors.packageVersionInvalid"));
  }

  if (typeof tauriVersion !== "string" || tauriVersion.length === 0) {
    throw new Error(t("releaseVersion.errors.tauriVersionInvalid"));
  }

  parseVersion(packageVersion);
  parseVersion(tauriVersion);
  parseVersion(cargoVersion);
  parseVersion(cargoLockVersion);
  ensureVersionsAreConsistent(packageVersion, tauriVersion, cargoVersion, cargoLockVersion);

  return { packageVersion, tauriVersion, cargoVersion, cargoLockVersion, cargoPackageName };
}

async function updateVersions(newVersion) {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
  packageJson.version = newVersion;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

  const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
  tauriConfig.version = newVersion;
  await writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`);

  const cargoToml = await readFile(cargoTomlPath, "utf8");
  let cargoVersionFound = false;
  const nextCargoToml = cargoToml.replace(/^(version\s*=\s*")[^"]+("\s*)$/m, (_, prefix, suffix) => {
    cargoVersionFound = true;
    return `${prefix}${newVersion}${suffix}`;
  });

  if (!cargoVersionFound) {
    throw new Error(t("releaseVersion.errors.cargoVersionNotFound"));
  }

  await writeFile(cargoTomlPath, nextCargoToml);

  const cargoLock = await readFile(cargoLockPath, "utf8");
  const cargoPackageName = getCargoPackageName(cargoToml);
  const cargoLockPattern = new RegExp(`(\\[\\[package\\]\\]\\s+name = "${cargoPackageName}"\\s+version = ")([^"]+)(")`);
  const nextCargoLock = cargoLock.replace(cargoLockPattern, `$1${newVersion}$3`);

  if (nextCargoLock === cargoLock) {
    throw new Error(t("releaseVersion.errors.cargoLockVersionNotFound"));
  }

  await writeFile(cargoLockPath, nextCargoLock);
}

function ensureCleanWorkingTree() {
  const output = run("git status --short");
  if (output) {
    throw new Error(t("releaseVersion.errors.workingTreeNotClean"));
  }
}

function ensureTagDoesNotExist(tagName) {
  const existing = run(`git tag --list ${tagName}`);
  if (existing) {
    throw new Error(t("releaseVersion.errors.tagExists", { tag: tagName }));
  }
}

function getCurrentBranch() {
  return run("git rev-parse --abbrev-ref HEAD");
}

async function loadMessages() {
  const cliLanguage = getCliLanguage();
  const envLang = process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_MESSAGES ?? "";
  const language = cliLanguage ?? (envLang.toLowerCase().startsWith("zh") ? "zh" : "en");
  const localePath = path.join(localeDir, `${language}.json`);
  const locale = JSON.parse(await readFile(localePath, "utf8"));
  messages = locale;
}

async function main() {
  try {
    await loadMessages();
    ensureCleanWorkingTree();
    const branch = ensureMainBranch();

    const { packageVersion: currentVersion } = await loadCurrentVersions();

    const nextVersion = await chooseVersion(currentVersion);
    const tagName = `v${nextVersion}`;
    ensureTagDoesNotExist(tagName);
    ensureRemoteTagDoesNotExist(tagName);

    console.log(`\n${t("releaseVersion.messages.summaryTitle")}`);
    console.log(t("releaseVersion.messages.summaryBranch", { branch }));
    console.log(t("releaseVersion.messages.summaryCurrentVersion", { version: currentVersion }));
    console.log(t("releaseVersion.messages.summaryNextVersion", { version: nextVersion }));
    console.log(t("releaseVersion.messages.summaryTag", { tag: tagName }));

    const confirmed = await askYesNo("releaseVersion.prompts.confirmRelease");
    if (!confirmed) {
      console.log(t("releaseVersion.messages.cancelled"));
      return;
    }

    await updateVersions(nextVersion);

    runInteractive("git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock");

    const stagedFiles = run("git diff --cached --name-only").split(/\r?\n/).filter(Boolean);
    const expectedFiles = [
      "package.json",
      "src-tauri/tauri.conf.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
    ];

    if (expectedFiles.some((file) => !stagedFiles.includes(file))) {
      throw new Error(t("releaseVersion.errors.releaseStagingIncomplete", { stagedFiles: stagedFiles.join(", ") }));
    }

    runInteractive(`git commit -m "chore: release ${nextVersion}"`);
    runInteractive(`git tag ${tagName}`);

    console.log(`\n${t("releaseVersion.messages.createdCommitAndTag")}`);

    const shouldPush = await askYesNo("releaseVersion.prompts.pushNow");
    if (shouldPush) {
      runInteractive(`git push origin ${branch}`);
      runInteractive(`git push origin ${tagName}`);
      console.log(t("releaseVersion.messages.pushCompleted"));
    } else {
      console.log(t("releaseVersion.messages.pushSkipped"));
      console.log(t("releaseVersion.messages.pushBranchLater", { branch }));
      console.log(t("releaseVersion.messages.pushTagLater", { tag: tagName }));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

await main();
