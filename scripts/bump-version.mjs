#!/usr/bin/env node
// Usage: node scripts/bump-version.mjs 1.0.1 [minAppVersion]
// Updates manifest.json and versions.json. Then commit, tag and push:
//   git commit -am "Release 1.0.1" && git tag 1.0.1 && git push && git push origin 1.0.1
import { readFileSync, writeFileSync } from "node:fs";

const [version, minApp] = process.argv.slice(2);
if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("Usage: node scripts/bump-version.mjs <x.y.z> [minAppVersion]");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;
if (minApp) manifest.minAppVersion = minApp;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

console.log(`Bumped to ${version} (minAppVersion ${manifest.minAppVersion}).`);
console.log(`Next: git commit -am "Release ${version}" && git tag ${version} && git push && git push origin ${version}`);
