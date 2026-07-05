const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: watch workspace root so Metro sees packages/backend and packages/shared
config.watchFolders = [workspaceRoot];

// Resolve workspace packages from both local and root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.extraNodeModules = {
  '@convex': path.resolve(workspaceRoot, 'packages/backend/convex'),
  'nativewind': path.resolve(projectRoot, 'node_modules/nativewind'),
  'react-native-css-interop': path.resolve(projectRoot, 'node_modules/react-native-css-interop'),
};

module.exports = withNativeWind(config, { input: './global.css' });
