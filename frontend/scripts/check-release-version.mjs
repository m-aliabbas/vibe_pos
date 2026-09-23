import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(frontendDir, "package.json"), "utf8"),
);
const packageLock = JSON.parse(
  fs.readFileSync(path.join(frontendDir, "package-lock.json"), "utf8"),
);
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(frontendDir, "src-tauri", "tauri.conf.json"), "utf8"),
);
const tauriMacConfig = JSON.parse(
  fs.readFileSync(path.join(frontendDir, "src-tauri", "tauri.conf_mac.json"), "utf8"),
);
const cargoToml = fs.readFileSync(
  path.join(frontendDir, "src-tauri", "Cargo.toml"),
  "utf8",
);
const cargoMacToml = fs.readFileSync(
  path.join(frontendDir, "src-tauri", "Cargo_mac.toml"),
  "utf8",
);
const cargoLock = fs.readFileSync(
  path.join(frontendDir, "src-tauri", "Cargo.lock"),
  "utf8",
);
const cargoMacLock = fs.readFileSync(
  path.join(frontendDir, "src-tauri", "Cargo_mac.lock"),
  "utf8",
);
const cargoVersion = cargoToml.match(
  /^version\s*=\s*"([^"]+)"\s*$/m,
)?.[1];
const cargoMacVersion = cargoMacToml.match(
  /^version\s*=\s*"([^"]+)"\s*$/m,
)?.[1];
const cargoLockVersion = cargoLock.match(
  /\[\[package\]\]\s+name\s*=\s*"pos-desktop"\s+version\s*=\s*"([^"]+)"/,
)?.[1];
const cargoMacLockVersion = cargoMacLock.match(
  /\[\[package\]\]\s+name\s*=\s*"pos-desktop"\s+version\s*=\s*"([^"]+)"/,
)?.[1];

const versions = {
  "frontend/package.json": packageJson.version,
  "frontend/package-lock.json": packageLock.packages?.[""]?.version,
  "frontend/src-tauri/tauri.conf.json": tauriConfig.version,
  "frontend/src-tauri/tauri.conf_mac.json": tauriMacConfig.version,
  "frontend/src-tauri/Cargo.toml": cargoVersion,
  "frontend/src-tauri/Cargo_mac.toml": cargoMacVersion,
  "frontend/src-tauri/Cargo.lock": cargoLockVersion,
  "frontend/src-tauri/Cargo_mac.lock": cargoMacLockVersion,
};
const uniqueVersions = new Set(Object.values(versions));

if ([...uniqueVersions].some((version) => !version) || uniqueVersions.size !== 1) {
  console.error("Release versions do not match:");
  for (const [file, version] of Object.entries(versions)) {
    console.error(`- ${file}: ${version ?? "missing"}`);
  }
  process.exit(1);
}

const version = packageJson.version;
const releaseTag = process.argv[2];
if (releaseTag && releaseTag !== `v${version}`) {
  console.error(`Release tag ${releaseTag} does not match application version v${version}.`);
  process.exit(1);
}

console.log(`VibePOS version ${version} is synchronized.`);
