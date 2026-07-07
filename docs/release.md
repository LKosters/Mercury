# Release & packaging

Builds signed-less installers for macOS, Windows, and Linux via **electron-builder**, driven by a tag-triggered GitHub Actions workflow that publishes a GitHub Release.

## Key files

| File | Role |
|---|---|
| `.github/workflows/release.yml` | CI: on `v*` tag → matrix build (mac/win/linux) → upload artifacts → create GitHub Release |
| `package.json` `build` block | electron-builder config: targets, icon, `appId`, output `productName` |
| `assets/icon.png` | 1024px source icon; electron-builder generates `.icns`/`.ico` per platform from it |

## How to cut a release

```bash
# bump "version" in package.json, commit, then:
git tag v0.1.0
git push origin v0.1.0
```

The workflow builds on `macos-latest`, `windows-2022`, and `ubuntu-latest` in parallel, then a final job downloads all artifacts and creates the Release with auto-generated notes. Outputs: `.dmg` (mac), `.exe` NSIS installer (win x64), `.AppImage` (linux x64).

Locally: `npm run build` (mac), `build:win`, `build:linux`, or `build:all`. Output lands in `dist/` (git-ignored).

## Specifics (do NOT regress)

- **`productName: "Mercury"` lives ONLY under the `build` key**, never top-level in `package.json` and never via `app.setName()`. electron-builder's `build.productName` brands the output app/installer ("Mercury.app", "Mercury Setup.exe") **without** changing `app.getName()`, which stays `email-app` — the name that keys the macOS Keychain for `safeStorage` password decryption. Promoting it to a top-level `productName` would rekey the Keychain and break decryption of all stored passwords. See [accounts.md](accounts.md) and hard rule #1.
- **No separate `electron-rebuild` step in CI.** electron-builder rebuilds the native `better-sqlite3` against the bundled Electron during packaging. (For local dev after an Electron bump you still run `npx electron-rebuild -f -w better-sqlite3` — see [mail-index.md](mail-index.md).)
- **The Python/setuptools step is required**: `node-gyp` needs `setuptools` on Python ≥3.12 (distutils was removed) to compile `better-sqlite3`.
- **Builds are unsigned** (`CSC_IDENTITY_AUTO_DISCOVERY: false`, mac `identity: null`). Users must right-click→Open on macOS and dismiss SmartScreen on Windows. No Apple Developer / code-signing certs are wired up yet.
- The `files` glob must include `assets/**/*` — the dock icon (`main.js`) and sidebar planet image (renderer) are loaded from `assets/` at runtime.

## Auto-update

The packaged app self-updates from these GitHub Releases (no electron-updater / code-signing). `src/main/updater.js` polls `GET /repos/LKosters/Mercury/releases/latest`, compares `tag_name` against `app.getVersion()`, and — if newer — offers the platform asset (`.dmg` / `.exe` / `.AppImage`) for one-click download+install. See [settings.md](settings.md) for the UI. Because the updater matches assets by extension, **release asset names must keep those extensions** — don't switch Windows to a `.msi` or Linux to `.deb`/`.rpm` without updating `platformAssetPattern()` in `updater.js`. The repo must be public (or the API needs auth) for the check to work.

## Change log

### 2026-07-07 — Auto-update (GitHub Releases)
**Changes:** added `src/main/updater.js` (check latest release, version-compare, download matching asset with progress, install: strip-quarantine+open DMG / run NSIS / chmod+launch AppImage), `updater:*` IPC, preload bridge, and a Settings → Updates panel + gear badge + startup auto-check. Ported from Lithium. Verified: boots clean, `updater:check` reaches the GitHub API (404 "no releases yet" until the first tag is pushed).

### 2026-07-07 — Initial release pipeline
**Changes:** added electron-builder `build` config + `build`/`build:win`/`build:linux`/`build:all` scripts to `package.json`; added `.github/workflows/release.yml` (tag `v*` → matrix build → GitHub Release), adapted from the Lithium project's workflow. Targets: dmg / nsis (x64) / AppImage (x64). `productName` kept under `build` only to preserve the `email-app` Keychain identity (hard rule #1).
**Not done / out of scope:** code signing & notarization (macOS), Windows Authenticode; auto-update (electron-updater); arm64 Windows/Linux and Linux `.deb`/`.rpm` targets.
