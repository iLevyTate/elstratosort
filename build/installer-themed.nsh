; StratoSort Themed Installer Hooks (NSIS / MUI2)
; Adds premium branding to the NSIS wizard using images in build resources:
; - assets/installer/header.png
; - assets/installer/welcome.png
; - assets/installer/finish.png
;
; Notes:
; - electron-builder sets BUILD_RESOURCES_DIR for us (points at configured buildResources dir).
; - We keep the existing custom install/uninstall hooks (marker + shortcuts).

; Enable a branded header image across pages
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "${BUILD_RESOURCES_DIR}\\installer\\header.png"

; Use branded sidebar images for Welcome/Finish pages
; electron-builder may pre-define these (default nsis3-metro.bmp) via command line.
; We must undef them before overriding to avoid "!define already defined" build failures.
!ifdef MUI_WELCOMEFINISHPAGE_BITMAP
  !undef MUI_WELCOMEFINISHPAGE_BITMAP
!endif
!ifdef MUI_UNWELCOMEFINISHPAGE_BITMAP
  !undef MUI_UNWELCOMEFINISHPAGE_BITMAP
!endif
!define MUI_WELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\\installer\\welcome.png"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "${BUILD_RESOURCES_DIR}\\installer\\finish.png"

; StratoSort Custom Installer Hooks
!macro customInstall
  ; Create a marker file to indicate first run
  FileOpen $0 "$INSTDIR\first-run.marker" w
  FileWrite $0 "This file indicates StratoSort needs to set up AI components on first launch"
  FileClose $0

  ; Create Start Menu shortcuts
  CreateDirectory "$SMPROGRAMS\StratoSort"
  CreateShortcut "$SMPROGRAMS\StratoSort\StratoSort.lnk" "$INSTDIR\StratoSort.exe"
  CreateShortcut "$SMPROGRAMS\StratoSort\Uninstall.lnk" "$INSTDIR\Uninstall.exe"

  ; Desktop shortcut is handled by electron-builder's createDesktopShortcut option
!macroend

!macro customUnInstall
  ; Remove shortcuts
  Delete "$SMPROGRAMS\StratoSort\StratoSort.lnk"
  Delete "$SMPROGRAMS\StratoSort\Uninstall.lnk"
  RMDir "$SMPROGRAMS\StratoSort"

  ; Clean up first-run marker
  Delete "$INSTDIR\first-run.marker"

  ; Ask about app data
  MessageBox MB_YESNO "Remove all StratoSort settings and data?" IDNO SkipAppData
    RMDir /r "$APPDATA\StratoSort"
  SkipAppData:
!macroend


