// Copies installers produced by electron-builder from `portal/release/`
// into `portal/dist-website/downloads/` and writes a JSON manifest.
// The frontend fetches the manifest at runtime to discover the current
// installer filename per platform, so the download URL never has to be
// kept in sync with `productName` or `version` by hand.
//
// Run via `npm run copy-installer` or as the last step of `npm run electron:build`.
//
// Supports:
//   - Windows: <productName> Setup <version>.exe
//   - Mac:     <productName>-<version>.dmg

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const RELEASE_DIR = path.join(ROOT, "release");
const DOWNLOADS_DIR = path.join(ROOT, "dist-website", "downloads");
const MANIFEST_NAME = "installer.json";
const UPDATE_FEED_NAME = "latest.yml";

function isWindowsInstaller(filename, fullPath) {
  if (!/\.exe$/i.test(filename)) return false;
  if (/\.blockmap$/i.test(filename)) return false;
  if (!fullPath.startsWith(RELEASE_DIR)) return false;
  if (!/\bSetup\s+\d+\.\d+\.\d+\.exe$/i.test(filename)) return false;
  return true;
}

function isMacInstaller(filename, fullPath) {
  if (!/\.dmg$/i.test(filename)) return false;
  if (!fullPath.startsWith(RELEASE_DIR)) return false;
  return true;
}

function findInstallers() {
  if (!fs.existsSync(RELEASE_DIR)) {
    throw new Error(
      `Release directory not found at ${RELEASE_DIR}. Run \`npm run electron:build\` first.`
    );
  }

  const entries = fs
    .readdirSync(RELEASE_DIR, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => ({
      name: e.name,
      fullPath: path.join(RELEASE_DIR, e.name),
      mtimeMs: fs.statSync(path.join(RELEASE_DIR, e.name)).mtimeMs,
    }));

  const windows = entries
    .filter((e) => isWindowsInstaller(e.name, e.fullPath))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const mac = entries
    .filter((e) => isMacInstaller(e.name, e.fullPath))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return {
    windows: windows[0] || null,
    mac: mac[0] || null,
  };
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function main() {
  const installers = findInstallers();

  if (!installers.windows && !installers.mac) {
    throw new Error(
      `No installer found in ${RELEASE_DIR}. Expected .exe (Windows) or .dmg (Mac) files.`
    );
  }

  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

  // Clean stale exes from a previous build
  for (const name of fs.readdirSync(DOWNLOADS_DIR)) {
    if (/\.exe$/i.test(name)) {
      const isCurrent = installers.windows && name === installers.windows.name;
      if (!isCurrent) {
        console.log(`[copy-installer] removing stale ${name}`);
        fs.rmSync(path.join(DOWNLOADS_DIR, name), { force: true });
      }
    }
    if (/\.dmg$/i.test(name)) {
      const isCurrent = installers.mac && name === installers.mac.name;
      if (!isCurrent) {
        console.log(`[copy-installer] removing stale ${name}`);
        fs.rmSync(path.join(DOWNLOADS_DIR, name), { force: true });
      }
    }
  }

  // Clean stale auto-updater artifacts
  for (const name of fs.readdirSync(DOWNLOADS_DIR)) {
    if (/\.blockmap$/i.test(name)) {
      const isCurrent = installers.windows && name === `${installers.windows.name}.blockmap`;
      if (!isCurrent) {
        fs.rmSync(path.join(DOWNLOADS_DIR, name), { force: true });
      }
    }
  }

  const manifest = { ts: new Date().toISOString() };

  // Copy Windows installer
  if (installers.windows) {
    const installer = installers.windows;
    const target = path.join(DOWNLOADS_DIR, installer.name);
    fs.copyFileSync(installer.fullPath, target);

    // Copy auto-updater artifacts
    const feedSrc = path.join(RELEASE_DIR, UPDATE_FEED_NAME);
    if (fs.existsSync(feedSrc)) {
      fs.copyFileSync(feedSrc, path.join(DOWNLOADS_DIR, UPDATE_FEED_NAME));
      console.log(`[copy-installer] copied ${UPDATE_FEED_NAME} -> downloads/`);
    }

    const blockmapSrc = path.join(RELEASE_DIR, `${installer.name}.blockmap`);
    if (fs.existsSync(blockmapSrc)) {
      fs.copyFileSync(blockmapSrc, path.join(DOWNLOADS_DIR, `${installer.name}.blockmap`));
    }

    const size = fs.statSync(target).size;
    manifest.windows = {
      name: installer.name,
      size,
      sha256: await hashFile(target),
    };
    console.log(`[copy-installer] copied ${installer.name} (${(size / 1024 / 1024).toFixed(2)} MB) -> dist-website/downloads/`);
  }

  // Copy Mac installer
  if (installers.mac) {
    const installer = installers.mac;
    const target = path.join(DOWNLOADS_DIR, installer.name);
    fs.copyFileSync(installer.fullPath, target);

    const size = fs.statSync(target).size;
    manifest.mac = {
      name: installer.name,
      size,
      sha256: await hashFile(target),
    };
    console.log(`[copy-installer] copied ${installer.name} (${(size / 1024 / 1024).toFixed(2)} MB) -> dist-website/downloads/`);
  }

  fs.writeFileSync(
    path.join(DOWNLOADS_DIR, MANIFEST_NAME),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8"
  );
  console.log(`[copy-installer] wrote manifest: downloads/${MANIFEST_NAME}`);
}

main().catch((err) => {
  console.error(`[copy-installer] FAILED: ${err.message}`);
  process.exit(1);
});
