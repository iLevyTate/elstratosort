# Releasing StratoSort

This guide documents the release process and best practices for Windows builds. It is designed to
ensure releases are reproducible, include bundled runtimes, and publish checksums + clear notes.

> **Release scope:** This release process applies to `elstratosort` (StratoSort Stack/StratoStack).
> If StratoSort Core/StratoCore is published as a separate repository, it should use its own release
> workflow and version stream.

## Release Checklist (Windows)

1. **Update versions**
   - Bump `version` in `package.json`
   - Update `CHANGELOG.md` under **[Unreleased]**
2. **Verify runtime manifest**
   - Review `assets/runtime/runtime-manifest.json`
   - Ensure download URLs are correct
   - Populate `sha256` values for runtime binaries when available
3. **Stage bundled runtimes**
   - `npm run setup:runtime`
   - `npm run setup:runtime:check`
4. **Build & smoke test**
   - `npm run dist:win`
   - Install the generated `StratoSort-Setup-*.exe`
   - Confirm AI Dependencies modal shows **Bundled** for Ollama/Python/Tesseract
   - Confirm “Download Base Models” works (models are not bundled)
5. **Generate checksums**
   - The workflow generates `checksums.sha256` automatically
   - If building locally, generate with:
     ```powershell
     Get-ChildItem release/build -File |
       Where-Object { $_.Name -match 'StratoSort-.*|latest\\.yml|\\.blockmap' } |
       ForEach-Object {
         $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
         "$hash *$($_.Name)"
       } | Out-File release/build/checksums.sha256 -Encoding ASCII
     ```
6. **Release notes**
   - Summarize major changes
   - Explicitly note: bundled runtimes are included; models download after install
   - Link to `CHANGELOG.md` for full detail
   - The release workflow pulls the matching `CHANGELOG.md` section into the release body

## Tag-Triggered Releases (Recommended)

1. Create the tag:
   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
2. The **Release** workflow will:
   - Run `npm run setup:runtime`
   - Build the Windows installer
   - Publish artifacts + `checksums.sha256`

## Publishing Notes

- Release publishing is handled by GitHub Actions workflows.
- Local builds use `--publish never` and do not upload artifacts.
- `electron-builder.json` publish metadata is used for update metadata, not for CI publishing.

## Manual Windows Build (Local)

```powershell
npm ci
npm run setup:runtime
npm run dist:win
```

Artifacts are under `release/build/`:

- `StratoSort-Setup-*.exe`
- `StratoSort-*-win-*.exe` (portable)
- `latest.yml`
- `*.blockmap`
- `checksums.sha256`

## Notes on Bundled Runtimes

- Bundled runtimes live under `assets/runtime/` at build time and are copied to the installer via
  `electron-builder.json` `extraResources`.
- Models are **not** bundled. The app provides a one‑click model download in the AI Dependencies
  modal and the existing Welcome flow remains unchanged.
- Use the manifest (`assets/runtime/runtime-manifest.json`) as the single source of truth for
  runtime URLs + checksums.
