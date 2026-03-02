const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.resolver.extraNodeModules = {
  "react-is": path.resolve(__dirname, "node_modules/react-is"),
  "fontfaceobserver": path.resolve(__dirname, "lib/fontfaceobserver-noop.js"),
};

module.exports = config;
