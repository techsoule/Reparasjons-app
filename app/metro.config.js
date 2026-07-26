const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../shared');

const config = getDefaultConfig(projectRoot);

// Del kode med ../shared (fordelingsalgoritme, validering, domenelogikk)
config.watchFolders = [sharedRoot];
config.resolver.extraNodeModules = {
  '@shared': sharedRoot,
};
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];

module.exports = config;
