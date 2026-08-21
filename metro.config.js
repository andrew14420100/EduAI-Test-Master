const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const { exclusionList } = require("metro-config");

const config = getDefaultConfig(__dirname);

// Abilita il supporto per i symlink e le export di pnpm
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// Aggiunge la radice per la risoluzione dei moduli
config.watchFolders = [path.resolve(__dirname)];
// I file temporanei degli strumenti possono essere creati e rimossi mentre
// Metro sta scansionando il workspace; escludili per evitare watcher stantii.
config.resolver.blockList = exclusionList([
  /\/\.local\/secondary_skills(?:\/|$)/,
]);

module.exports = config;
