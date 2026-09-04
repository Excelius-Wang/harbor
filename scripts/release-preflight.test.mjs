import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { REQUIRED_SIGNING_ENV } from "./release-preflight.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
const preflightScript = path.join(scriptDir, "release-preflight.mjs");

const temporaryRoots = [];

async function createFixture(overrides = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "harbor-release-preflight-test-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "src-tauri"), { recursive: true });

  const version = overrides.packageVersion ?? "1.2.3";
  const repository = overrides.packageRepository ?? "https://github.com/Excelius-Wang/harbor.git";
  const packageJson = {
    name: "harbor",
    version,
    repository: { type: "git", url: repository },
  };
  const tauriConfig = {
    productName: "Harbor",
    version: overrides.tauriVersion ?? version,
    identifier: "com.harbor.desktop",
    plugins: {
      updater: {
        pubkey: overrides.updaterPubkey ?? "__TAURI_UPDATER_PUBKEY__",
        endpoints: [overrides.updaterEndpoint ?? "__TAURI_UPDATER_ENDPOINT__"],
      },
    },
    bundle: {
      active: true,
      targets: "all",
      createUpdaterArtifacts: overrides.createUpdaterArtifacts ?? true,
    },
  };
  const cargoVersion = overrides.cargoVersion ?? version;
  const cargoRepository = overrides.cargoRepository ?? "https://github.com/Excelius-Wang/harbor";
  const cargoLockVersion = overrides.cargoLockVersion ?? cargoVersion;

  await writeFile(path.join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(
    path.join(root, "src-tauri", "tauri.conf.json"),
    `${JSON.stringify(tauriConfig, null, 2)}\n`
  );
  await writeFile(
    path.join(root, "src-tauri", "Cargo.toml"),
    `[package]\nname = "harbor"\nversion = "${cargoVersion}"\nrepository = "${cargoRepository}"\n`
  );
  await writeFile(
    path.join(root, "src-tauri", "Cargo.lock"),
    `[[package]]\nname = "harbor"\nversion = "${cargoLockVersion}"\n`
  );

  return root;
}

function releaseEnv(overrides = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !REQUIRED_SIGNING_ENV.includes(name))
  );

  for (const name of REQUIRED_SIGNING_ENV) {
    env[name] = `secret-sentinel-${name}`;
  }

  return {
    ...env,
    GITHUB_REF_TYPE: "tag",
    GITHUB_REF_NAME: "v1.2.3",
    GITHUB_REPOSITORY: "Excelius-Wang/harbor",
    ...overrides,
  };
}

function runPreflight(root, env = releaseEnv()) {
  return spawnSync(process.execPath, [preflightScript, "--root", root], {
    cwd: projectRoot,
    env,
    encoding: "utf8",
  });
}

function combinedOutput(result) {
  return `${result.stdout}\n${result.stderr}`;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("release preflight CLI", () => {
  it("uses exit code 2 for unsupported arguments", () => {
    const result = spawnSync(process.execPath, [preflightScript, "--unknown"], {
      cwd: projectRoot,
      env: releaseEnv(),
      encoding: "utf8",
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage: release-preflight");
  });

  it("accepts a consistent macOS release without printing secret values", async () => {
    const root = await createFixture();

    const result = runPreflight(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release-preflight: ok v1.2.3 Excelius-Wang/harbor macOS");
    expect(combinedOutput(result)).not.toContain("secret-sentinel-");
  });

  it("uses exit code 10 for inconsistent application versions", async () => {
    const root = await createFixture({ cargoLockVersion: "1.2.2" });

    const result = runPreflight(root);

    expect(result.status).toBe(10);
    expect(result.stderr).toContain("version mismatch");
  });

  it("uses exit code 11 when the pushed tag does not exactly match the version", async () => {
    const root = await createFixture();

    const result = runPreflight(root, releaseEnv({ GITHUB_REF_NAME: "v1.2.4" }));

    expect(result.status).toBe(11);
    expect(result.stderr).toContain("expected tag v1.2.3");
  });

  it("uses exit code 12 when GitHub and manifest repository identities differ", async () => {
    const root = await createFixture({ cargoRepository: "https://github.com/other/harbor" });

    const result = runPreflight(root);

    expect(result.status).toBe(12);
    expect(result.stderr).toContain("repository mismatch");
  });

  it("uses exit code 13 when updater release configuration is incomplete", async () => {
    const root = await createFixture({ createUpdaterArtifacts: false });

    const result = runPreflight(root);

    expect(result.status).toBe(13);
    expect(result.stderr).toContain("createUpdaterArtifacts");
  });

  it("uses exit code 14 and prints only names when signing variables are missing", async () => {
    const root = await createFixture();
    const env = releaseEnv({ APPLE_PASSWORD: "", TAURI_SIGNING_PRIVATE_KEY: "" });

    const result = runPreflight(root, env);

    expect(result.status).toBe(14);
    expect(result.stderr).toContain("APPLE_PASSWORD");
    expect(result.stderr).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(combinedOutput(result)).not.toContain("secret-sentinel-");
  });
});

describe("macOS release workflow", () => {
  it("runs the preflight before building one universal macOS release draft", async () => {
    const workflow = await readFile(
      path.join(projectRoot, ".github", "workflows", "release.yml"),
      "utf8"
    );
    const packageJson = JSON.parse(await readFile(path.join(projectRoot, "package.json"), "utf8"));

    expect(workflow).toContain("runs-on: macos-latest");
    expect(workflow).toContain("pnpm release:preflight");
    const preflightIndex = workflow.indexOf("pnpm release:preflight");
    const importIndex = workflow.indexOf("Import Apple Developer certificate");
    const buildIndex = workflow.indexOf("tauri-apps/tauri-action");
    const cleanupIndex = workflow.indexOf("Delete Apple signing keychain");
    expect(preflightIndex).toBeLessThan(importIndex);
    expect(importIndex).toBeLessThan(buildIndex);
    expect(buildIndex).toBeLessThan(cleanupIndex);
    expect(workflow).toContain("security import");
    expect(workflow).toContain("APPLE_SIGNING_IDENTITY: ${{ env.APPLE_SIGNING_IDENTITY }}");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain("security delete-keychain");
    expect(workflow).toContain('rm -f "${RUNNER_TEMP}/harbor-signing.p12"');
    expect(workflow).toContain("--target universal-apple-darwin --bundles dmg");
    expect(workflow).not.toContain("--bundles dmg,updater");
    expect(workflow).toContain("releaseDraft: true");
    expect(workflow).toContain("prerelease: ${{ contains(github.ref_name, '-beta.') }}");
    expect(workflow).not.toMatch(/windows-latest|ubuntu-/);
    expect(packageJson.scripts["tauri:build"]).toBe("dotenv -c -- tauri build --bundles dmg");

    for (const name of REQUIRED_SIGNING_ENV) {
      expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`);
    }
  });
});
