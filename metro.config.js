const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const noopPath = path.resolve(__dirname, "lib/fontfaceobserver-noop.js");

config.resolver.extraNodeModules = {
  "react-is": path.resolve(__dirname, "node_modules/react-is"),
  "fontfaceobserver": noopPath,
};

const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "fontfaceobserver" || moduleName.includes("fontfaceobserver")) {
    return { type: "sourceFile", filePath: noopPath };
  }
  if (origResolveRequest) {
    return origResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
