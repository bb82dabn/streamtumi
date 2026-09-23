const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const repositoryRoot = path.resolve(projectRoot, "../..");
const contractsRoot = path.join(repositoryRoot, "packages/contracts");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [...new Set([...(config.watchFolders ?? []), contractsRoot])];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(repositoryRoot, "node_modules"),
];

module.exports = config;
