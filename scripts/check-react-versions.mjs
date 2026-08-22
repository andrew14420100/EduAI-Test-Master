#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const lockfilePath = join(root, "pnpm-lock.yaml");
const workspaceConfigPath = join(root, "pnpm-workspace.yaml");
const workspaces = [
  { name: "mobile app", path: "package.json" },
  { name: "component sandbox", path: "artifacts/mockup-sandbox/package.json" },
];
const packages = ["react", "react-dom", "@types/react", "@types/react-dom"];

function fail(message) {
  console.error(`React version check failed: ${message}`);
  process.exitCode = 1;
}

function manifestDependency(manifest, packageName) {
  return manifest.dependencies?.[packageName] ??
    manifest.devDependencies?.[packageName] ??
    manifest.peerDependencies?.[packageName];
}

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

function parseCatalogVersions(lockfile) {
  const catalogStart = lockfile.indexOf("catalogs:\n");
  if (catalogStart < 0) throw new Error("pnpm-lock.yaml has no catalogs section.");
  const catalogEnd = lockfile.indexOf("\nimporters:\n", catalogStart);
  const catalog = lockfile.slice(catalogStart, catalogEnd < 0 ? lockfile.length : catalogEnd);
  const versions = new Map();
  const entryPattern =
    /^    (?:'([^']+)'|([^:]+)):\n      specifier: ([^\n]+)\n      version: ([^\n]+)/gm;
  for (const match of catalog.matchAll(entryPattern)) {
    versions.set(match[1] ?? match[2], {
      specifier: unquote(match[3]),
      version: unquote(match[4]),
    });
  }
  return versions;
}

function parseWorkspaceCatalog(workspaceConfig) {
  const catalogStart = workspaceConfig.indexOf("catalog:\n");
  if (catalogStart < 0) throw new Error("pnpm-workspace.yaml has no catalog section.");
  const catalog = workspaceConfig.slice(catalogStart);
  const versions = new Map();
  const entryPattern = /^  (?:'([^']+)'|([^:\n]+)): ([^\n]+)/gm;
  for (const match of catalog.matchAll(entryPattern)) {
    versions.set(match[1] ?? match[2], unquote(match[3]));
  }
  return versions;
}

function parseImporter(lockfile, importerName) {
  const heading = importerName === "." ? "  .:" : `  ${importerName}:`;
  const start = lockfile.indexOf(`\n${heading}\n`);
  if (start < 0) throw new Error(`pnpm-lock.yaml has no importer for ${importerName}.`);
  const bodyStart = start + heading.length + 2;
  const nextImporter = lockfile.slice(bodyStart).search(/\n  \S.*:\n/);
  const body = lockfile.slice(bodyStart, nextImporter < 0 ? lockfile.length : bodyStart + nextImporter);
  const entries = new Map();
  const entryPattern =
    /^      (?:'([^']+)'|([^:]+)):\n        specifier: ([^\n]+)\n        version: ([^\n]+)/gm;
  for (const match of body.matchAll(entryPattern)) {
    entries.set(match[1] ?? match[2], {
      specifier: unquote(match[3]),
      version: unquote(match[4]),
    });
  }
  return entries;
}

const lockfile = readFileSync(lockfilePath, "utf8");
const workspaceCatalog = parseWorkspaceCatalog(readFileSync(workspaceConfigPath, "utf8"));
const catalog = parseCatalogVersions(lockfile);
const resolved = new Map();

for (const packageName of packages) {
  const workspaceSpecifier = workspaceCatalog.get(packageName);
  const lockCatalogEntry = catalog.get(packageName);
  if (!workspaceSpecifier) {
    fail(`pnpm-workspace.yaml is missing ${packageName} from the shared catalog.`);
  } else if (!lockCatalogEntry || workspaceSpecifier !== lockCatalogEntry.specifier) {
    fail(`the lockfile catalog for ${packageName} is stale (workspace: ${workspaceSpecifier}, lockfile: ${lockCatalogEntry?.specifier ?? "missing"}).`);
  }
}

for (const workspace of workspaces) {
  const manifest = JSON.parse(readFileSync(join(root, workspace.path), "utf8"));
  const importer = parseImporter(lockfile, workspace.path === "package.json" ? "." : "artifacts/mockup-sandbox");

  for (const packageName of packages) {
    const manifestSpecifier = manifestDependency(manifest, packageName);
    if (manifestSpecifier !== "catalog:") {
      fail(`${workspace.name} must declare ${packageName} as "catalog:" (found ${JSON.stringify(manifestSpecifier)}).`);
      continue;
    }

    const catalogEntry = catalog.get(packageName);
    if (!catalogEntry) {
      fail(`the shared catalog is missing ${packageName}.`);
      continue;
    }

    const lockEntry = importer.get(packageName);
    if (!lockEntry) {
      fail(`the lockfile importer for ${workspace.name} is missing ${packageName}.`);
      continue;
    }
    if (lockEntry.specifier !== "catalog:") {
      fail(`${workspace.name} lockfile entry for ${packageName} is not using "catalog:".`);
    }

    const version = lockEntry.version.split("(", 1)[0];
    if (version !== catalogEntry.version) {
      fail(`${workspace.name} resolves ${packageName}@${version}, but the catalog resolves ${packageName}@${catalogEntry.version}.`);
    }
    if (!resolved.has(packageName)) resolved.set(packageName, version);
    else if (resolved.get(packageName) !== version) {
      fail(`${packageName} resolves to different versions across React workspaces.`);
    }
  }
}

const reactVersion = resolved.get("react");
const reactDomVersion = resolved.get("react-dom");
if (reactVersion && reactDomVersion && reactVersion !== reactDomVersion) {
  fail(`react@${reactVersion} and react-dom@${reactDomVersion} must match.`);
}
const reactTypesVersion = resolved.get("@types/react");
const reactDomTypesVersion = resolved.get("@types/react-dom");
if (reactVersion && reactTypesVersion && reactVersion.split(".").slice(0, 2).join(".") !== reactTypesVersion.split(".").slice(0, 2).join(".")) {
  fail(`react@${reactVersion} and @types/react@${reactTypesVersion} must share major and minor versions.`);
}
if (reactVersion && reactDomTypesVersion && reactVersion.split(".").slice(0, 2).join(".") !== reactDomTypesVersion.split(".").slice(0, 2).join(".")) {
  fail(`react@${reactVersion} and @types/react-dom@${reactDomTypesVersion} must share major and minor versions.`);
}

if (!process.exitCode) {
  console.log(`React version check passed: ${reactVersion} / ${reactDomVersion} with matching type packages.`);
}