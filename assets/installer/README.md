Installer theming (optional)

Place any of the following image files in this folder to brand the NSIS wizard. If a file is missing, the default NSIS images are used.

- welcome.png: 164x314 px. Appears on the left of the Welcome/Finish pages.
- finish.png: 164x314 px. Appears on the left of Uninstall/Finish pages.
- header.png: 150x57 px. Appears in the header area of all pages.

Notes
- Keep file names exactly as listed.
- Files live under `assets/installer/` because `electron-builder.json` sets `buildResources` to `assets`.
- The NSIS include (`build/installer-themed.nsh`) references these images via `BUILD_RESOURCES_DIR`.
- To enable theming, ensure `electron-builder.json` points `nsis.include` to `build/installer-themed.nsh`.


