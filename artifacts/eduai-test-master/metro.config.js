const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Abilita il supporto per i symlink e le export di pnpm
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// Aggiunge la radice per la risoluzione dei moduli
config.watchFolders = [path.resolve(__dirname)];

module.exports = config;
