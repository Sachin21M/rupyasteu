const fs = require("fs");
const path = require("path");
const target = path.join(__dirname, "..", "node_modules", "fontfaceobserver", "fontfaceobserver.standalone.js");
const noop = `/* Font Face Observer v2.3.0 - patched to no-op for Expo web compatibility */
(function(){function D(a,c,b){this.family=a;this.style=(c||{}).style||"normal";this.weight=(c||{}).weight||"normal";this.stretch=(c||{}).stretch||"normal";this.context=b||window}D.prototype.load=function(a,c){var b=this;return new Promise(function(resolve){resolve(b)});};"object"===typeof module?module.exports=D:(window.FontFaceObserver=D,window.FontFaceObserver.prototype.load=D.prototype.load);}());`;
try {
  fs.writeFileSync(target, noop, "utf8");
  console.log("fontfaceobserver patched successfully");
} catch (e) {
  console.warn("fontfaceobserver patch skipped:", e.message);
}
