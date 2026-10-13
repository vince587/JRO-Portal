const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "jmcs-portal-app");
const ELECTRON_DIST = path.join(ROOT, "node_modules", "electron", "dist");
const APP_DIR = path.join(OUT, "resources", "app");
const RESOURCES_DIR = path.join(OUT, "resources");
const API_SERVER_DIST = path.join(ROOT, "..", "api-server", "dist");
const API_SERVER_NODE_MODULES = path.join(ROOT, "..", "api-server", "node_modules");
const API_SERVER_ENV = path.join(ROOT, "..", "api-server", ".env");

// Clean
fs.rmSync(OUT, { recursive: true, force: true });

// Copy Electron binaries
fs.cpSync(ELECTRON_DIST, OUT, {
  recursive: true,
  filter: (src) => {
    const rel = path.relative(ELECTRON_DIST, src);
    return !rel.startsWith(path.join("resources", "default_app.asar"));
  },
});

// Copy app files
fs.mkdirSync(path.join(APP_DIR, "electron"), { recursive: true });
fs.cpSync(path.join(ROOT, "electron", "main.cjs"), path.join(APP_DIR, "electron", "main.cjs"));
fs.cpSync(path.join(ROOT, "electron", "preload.cjs"), path.join(APP_DIR, "electron", "preload.cjs"));
fs.cpSync(path.join(ROOT, "dist-website"), path.join(APP_DIR, "dist-website"), { recursive: true });

// Copy API server bundle, node_modules, and .env to resources/api-server/
// Sourcemaps are excluded: they quadruple the bundle size and are useless to end users.
const skipMaps = (src) => !src.endsWith(".map");
if (fs.existsSync(API_SERVER_DIST)) {
  fs.cpSync(API_SERVER_DIST, path.join(RESOURCES_DIR, "api-server"), { recursive: true, filter: skipMaps });
}
if (fs.existsSync(API_SERVER_NODE_MODULES)) {
  // Dev-only tooling (@esbuild, esbuild, @types, build scripts) never runs in the
  // packaged app; excluding them trims tens of megabytes.
  const skipDev = (src) => {
    if (src.endsWith(".map")) return false;
    const rel = path.relative(API_SERVER_NODE_MODULES, src);
    return !["@esbuild", "esbuild", "esbuild-plugin-pino", "cross-env", "@types", ".bin"]
      .some(seg => rel === seg || rel.startsWith(seg + path.sep));
  };
  fs.cpSync(API_SERVER_NODE_MODULES, path.join(RESOURCES_DIR, "api-server", "node_modules"), { recursive: true, filter: skipDev });
}
if (fs.existsSync(API_SERVER_ENV)) {
  fs.cpSync(API_SERVER_ENV, path.join(RESOURCES_DIR, "api-server", ".env"));
}

// Replace api-server/dist/public with dist-website contents so the API server serves the React app
const apiServerPublic = path.join(RESOURCES_DIR, "api-server", "dist", "public");
if (fs.existsSync(apiServerPublic)) {
  fs.rmSync(apiServerPublic, { recursive: true, force: true });
}
fs.cpSync(path.join(ROOT, "dist-website"), apiServerPublic, { recursive: true, filter: skipMaps });

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
const appPkg = { main: "electron/main.cjs", name: pkg.name, version: pkg.version };
fs.writeFileSync(path.join(APP_DIR, "package.json"), JSON.stringify(appPkg, null, 2));

console.log("\n=== Desktop app built ===");
console.log(`Location: ${OUT}`);
console.log(`Run: ${path.join(OUT, "electron.exe")}`);
