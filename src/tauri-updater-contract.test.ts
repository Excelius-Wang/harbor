import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import packageJson from "../package.json";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cargoToml = readFileSync(path.join(projectRoot, "src-tauri", "Cargo.toml"), "utf8");
const cargoLock = readFileSync(path.join(projectRoot, "src-tauri", "Cargo.lock"), "utf8");
const tauriLib = readFileSync(path.join(projectRoot, "src-tauri", "src", "lib.rs"), "utf8");
const defaultCapability = JSON.parse(
  readFileSync(path.join(projectRoot, "src-tauri", "capabilities", "default.json"), "utf8")
);
const tauriConfig = JSON.parse(
  readFileSync(path.join(projectRoot, "src-tauri", "tauri.conf.json"), "utf8")
);

describe("Tauri updater contract", () => {
  it("keeps matching frontend and Rust plugins for update installation and relaunch", () => {
    expect(packageJson.dependencies["@tauri-apps/plugin-updater"]).toBeDefined();
    expect(packageJson.dependencies["@tauri-apps/plugin-process"]).toBeDefined();
    expect(cargoToml).toContain('tauri-plugin-updater = "2"');
    expect(cargoToml).toContain('tauri-plugin-process = "2"');
    expect(cargoLock).toContain('name = "tauri-plugin-updater"');
    expect(cargoLock).toContain('name = "tauri-plugin-process"');
  });

  it("registers updater and process together for release builds", () => {
    const releasePluginBlock = tauriLib.match(
      /#\[cfg\(all\(desktop,\s*not\(debug_assertions\)\)\)\]\s*let\s+builder\s*=\s*builder(?<plugins>[\s\S]*?);/
    );
    const releasePlugins = releasePluginBlock?.groups?.plugins ?? "";

    expect(releasePluginBlock).not.toBeNull();
    expect(releasePlugins).toContain("tauri_plugin_updater::Builder::new().build()");
    expect(releasePlugins).toContain("tauri_plugin_process::init()");
  });

  it("grants only the process capability needed to relaunch after installation", () => {
    expect(defaultCapability.windows).toEqual(["main", "about", "settings"]);
    expect(
      defaultCapability.permissions.some(
        (permission: string) =>
          permission.startsWith("updater:") || permission.startsWith("process:")
      )
    ).toBe(false);

    const mainCapability = JSON.parse(
      readFileSync(path.join(projectRoot, "src-tauri", "capabilities", "updater-main.json"), "utf8")
    );
    expect(mainCapability.windows).toEqual(["main"]);
    expect(mainCapability.permissions).toEqual([
      "updater:allow-check",
      "updater:allow-download-and-install",
      "process:allow-restart",
    ]);

    const aboutCapability = JSON.parse(
      readFileSync(
        path.join(projectRoot, "src-tauri", "capabilities", "updater-about.json"),
        "utf8"
      )
    );
    expect(aboutCapability.windows).toEqual(["about"]);
    expect(aboutCapability.permissions).toEqual(["updater:allow-check"]);
  });

  it("keeps the updater placeholders while limiting bundle configuration to macOS DMG", () => {
    expect(tauriConfig.plugins.updater).toEqual({
      pubkey: "__TAURI_UPDATER_PUBKEY__",
      endpoints: ["__TAURI_UPDATER_ENDPOINT__"],
    });
    expect(tauriConfig.bundle.active).toBe(true);
    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(true);
    expect(tauriConfig.bundle.targets).toEqual(["dmg"]);
    expect(tauriConfig.bundle.windows).toBeUndefined();
  });
});
