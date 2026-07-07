const { app, shell } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// Lightweight self-updater backed by GitHub Releases (no electron-updater /
// code-signing needed). checkForUpdates() reads the latest release; if it is
// newer than the running build, the renderer offers to download the matching
// platform asset and install it. Ported from the Lithium project.

const REPO_OWNER = 'LKosters';
const REPO_NAME = 'Mercury';
const UA = 'Mercury-Updater';

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    https
      .get(
        {
          hostname: 'api.github.com',
          path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`,
          headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode === 404) {
              return reject(new Error('No releases published yet.'));
            }
            if (res.statusCode !== 200) {
              return reject(new Error(`GitHub API returned ${res.statusCode}`));
            }
            try {
              resolve(JSON.parse(data));
            } catch (err) {
              reject(err);
            }
          });
        }
      )
      .on('error', reject);
  });
}

// Returns 1 if latest > current, -1 if older, 0 if equal. Ignores any leading
// "v" and compares dotted numeric segments.
function compareVersions(current, latest) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  const c = parse(current);
  const l = parse(latest);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (lv > cv) return 1;
    if (lv < cv) return -1;
  }
  return 0;
}

function platformAssetPattern() {
  switch (process.platform) {
    case 'darwin':
      return /\.dmg$/i;
    case 'win32':
      return /\.exe$/i;
    case 'linux':
      return /\.AppImage$/i;
    default:
      return null;
  }
}

async function checkForUpdates() {
  const release = await fetchLatestRelease();
  const latestVersion = String(release.tag_name || '').replace(/^v/, '');
  const currentVersion = app.getVersion();
  const updateAvailable = compareVersions(currentVersion, latestVersion) > 0;

  const pattern = platformAssetPattern();
  const asset = pattern ? (release.assets || []).find((a) => pattern.test(a.name)) : null;

  return {
    currentVersion,
    latestVersion,
    updateAvailable,
    releaseUrl: release.html_url,
    downloadUrl: asset ? asset.browser_download_url : null,
    assetName: asset ? asset.name : null,
    assetSize: asset ? asset.size : 0,
    releaseName: release.name || release.tag_name,
    publishedAt: release.published_at,
  };
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (target) => {
      const proto = target.startsWith('https') ? https : http;
      proto
        .get(target, { headers: { 'User-Agent': UA } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume(); // drain the redirect body
            return follow(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          }
          const total = parseInt(res.headers['content-length'], 10) || 0;
          let received = 0;
          const file = fs.createWriteStream(destPath);
          res.on('data', (chunk) => {
            received += chunk.length;
            if (total > 0 && onProgress) onProgress(Math.round((received / total) * 100));
          });
          res.pipe(file);
          file.on('finish', () => file.close(() => resolve(destPath)));
          file.on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        })
        .on('error', reject);
    };
    follow(url);
  });
}

function installUpdate(filePath) {
  switch (process.platform) {
    case 'darwin':
      // Strip quarantine so Gatekeeper doesn't flag the unsigned DMG as
      // "damaged", then open it for the user to drag into Applications.
      exec(`/usr/bin/xattr -dr com.apple.quarantine "${filePath}" 2>/dev/null; open "${filePath}"`, () => {
        setTimeout(() => app.quit(), 1000);
      });
      break;
    case 'win32':
      exec(`start "" "${filePath}"`, () => {
        setTimeout(() => app.quit(), 1000);
      });
      break;
    case 'linux':
      fs.chmodSync(filePath, 0o755);
      exec(`"${filePath}" &`, () => {
        setTimeout(() => app.quit(), 1000);
      });
      break;
  }
}

async function downloadAndInstall({ downloadUrl, assetName }, onProgress) {
  if (!downloadUrl || !assetName) {
    throw new Error('No downloadable installer for this platform in the release.');
  }
  const destPath = path.join(app.getPath('temp'), assetName);
  await downloadFile(downloadUrl, destPath, onProgress);
  installUpdate(destPath); // quits the app shortly after launching the installer
  return { success: true };
}

function openRelease(url) {
  if (url) shell.openExternal(url);
  return true;
}

module.exports = { checkForUpdates, downloadAndInstall, openRelease };
