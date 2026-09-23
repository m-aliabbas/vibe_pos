import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error("Usage: npm run set:version -- 1.2.3");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(scriptDir, "..");
const tauriDir = path.join(frontendDir, "src-tauri");

function updateJson(relativePath, update) {
  const filePath = path.join(frontendDir, relativePath);
  const document = JSON.parse(fs.readFileSync(filePath, "utf8"));
  update(document);
  fs.writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
}

function replaceVersion(filePath, pattern, description) {
  const original = fs.readFileSync(filePath, "utf8");
  const updated = original.replace(pattern, `$1${version}$2`);
  if (updated === original) {
    throw new Error(`Could not update ${description}: ${filePath}`);
  }
  fs.writeFileSync(filePath, updated);
}

updateJson("package.json", (document) => {
  document.version = version;
});
updateJson("package-lock.json", (document) => {
  document.version = version;
  document.packages[""].version = version;
});
updateJson("src-tauri/tauri.conf.json", (document) => {
  document.version = version;
});
updateJson("src-tauri/tauri.conf_mac.json", (document) => {
  document.version = version;
});

for (const name of ["Cargo.toml", "Cargo_mac.toml"]) {
  replaceVersion(
    path.join(tauriDir, name),
    /(\[package\][\s\S]*?^version\s*=\s*")[^"]+("\s*$)/m,
    "Cargo package version",
  );
}

for (const name of ["Cargo.lock", "Cargo_mac.lock"]) {
  replaceVersion(
    path.join(tauriDir, name),
    /(\[\[package\]\]\s+name\s*=\s*"pos-desktop"\s+version\s*=\s*")[^"]+("\s*)/,
    "Cargo lock version",
  );
}

console.log(`Updated all VibePOS version files to ${version}.`);
