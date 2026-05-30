/**
 * Generates dist/package.json so the dist/ folder is usable as a standalone
 * package (e.g. `file:../package/dist` in a consumer's package.json).
 *
 * All paths are relative to dist/ — no "dist/" prefix needed.
 */

import { writeFileSync } from "fs";
import pkg from "../package.json";

const distPkg = {
  name: pkg.name,
  version: pkg.version,
  description: pkg.description,
  author: pkg.author,
  license: pkg.license,
  main: "./lib.js",
  types: "./lib.d.ts",
  exports: {
    ".": {
      import: "./lib.js",
      types: "./lib.d.ts",
    },
    "./server": {
      import: "./core/server.js",
      types: "./core/server.d.ts",
    },
  },
  bin: {
    "jira-autofix": "./index.js",
    "jira-autofix-fetch": "./stages/fetch.js",
    "jira-autofix-fix": "./stages/fix.js",
    "jira-autofix-open-prs": "./stages/openPrs.js",
  },
  dependencies: pkg.dependencies,
  peerDependencies: pkg.peerDependencies,
  engines: pkg.engines,
};

writeFileSync("dist/package.json", JSON.stringify(distPkg, null, 2) + "\n", "utf8");
console.log("✓  dist/package.json generated");
