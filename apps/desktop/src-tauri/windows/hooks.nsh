; Extract engine.zip during install so first app launch is fast.
; (Shipping as one zip avoids NSIS MAX_PATH issues with deep pnpm trees.)
;
; Quietly stop a running ModelDesk before install/uninstall.
; Close-to-tray keeps modeldesk.exe alive; Tauri's CheckIfAppIsRunning would
; otherwise show "ModelDesk is running! Click OK to kill it".
; PRE* hooks run before that check — kill first so the dialog never appears.
;
; Keep engine.zip after install so a broken/half-deleted engine/ can be repaired
; on next launch (see ensure_engine_extracted in lib.rs).

!macro KillModelDeskQuiet
  DetailPrint "Stopping ModelDesk if it is still running..."
  ; /T kills the process tree (sidecar Node children).
  nsExec::ExecToLog 'taskkill /F /T /IM modeldesk.exe'
  Pop $R7
  Sleep 800
  nsExec::ExecToLog 'taskkill /F /T /IM modeldesk.exe'
  Pop $R7
  ; Orphan packaged node still holding better_sqlite3.node blocks RMDir/extract.
  nsExec::ExecToLog 'powershell -NoProfile -WindowStyle Hidden -Command "Get-CimInstance Win32_Process -Filter \"Name=''node.exe''\" | Where-Object { $_.ExecutablePath -match ''ModelDesk|modeldesk'' -or ($_.CommandLine -and $_.CommandLine -match ''ModelDesk|modeldesk|sidecar\.mjs'') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"'
  Pop $R7
  Sleep 1500
!macroend

!macro NSIS_HOOK_PREINSTALL
  !insertmacro KillModelDeskQuiet
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Extracting ModelDesk engine (one-time during install)..."
  SetDetailsPrint both

  StrCpy $R9 ""
  ${If} ${FileExists} "$INSTDIR\resources\engine.zip"
    StrCpy $R9 "$INSTDIR\resources\engine.zip"
  ${ElseIf} ${FileExists} "$INSTDIR\engine.zip"
    StrCpy $R9 "$INSTDIR\engine.zip"
  ${EndIf}

  ${If} $R9 != ""
    RMDir /r "$INSTDIR\engine"
    CreateDirectory "$INSTDIR\engine"
    ; tar.exe ships with Windows 10+; nsExec keeps the console hidden.
    nsExec::ExecToLog '"$SYSDIR\tar.exe" -xf "$R9" -C "$INSTDIR\engine"'
    Pop $R8
    ${If} $R8 == 0
    ${AndIf} ${FileExists} "$INSTDIR\engine\sidecar.mjs"
    ${AndIf} ${FileExists} "$INSTDIR\engine\web\apps\web\server.js"
    ${AndIf} ${FileExists} "$INSTDIR\engine\web\apps\web\.next\static"
    ${AndIf} ${FileExists} "$INSTDIR\engine\web\apps\web\.next\static\chunks"
      DetailPrint "Engine ready (UI assets verified)."
      ; Keep engine.zip so first-launch repair can re-extract if needed.
      ${If} ${FileExists} "$INSTDIR\engine\agents\install-bins.mjs"
      ${AndIf} ${FileExists} "$INSTDIR\engine\node\node.exe"
        DetailPrint "Installing ModelDesk CLI / MCP / Gateway commands..."
        nsExec::ExecToLog '"$INSTDIR\engine\node\node.exe" "$INSTDIR\engine\agents\install-bins.mjs" --engine-dir "$INSTDIR\engine" --add-path'
        Pop $R7
        ${If} $R7 == 0
          DetailPrint "Agent commands installed (ModelDesk\bin on User PATH)."
        ${Else}
          DetailPrint "Agent bin install returned $R7 (app will retry on first launch)."
        ${EndIf}
      ${EndIf}
    ${Else}
      DetailPrint "Engine extract incomplete (code=$R8) — app will retry on first launch."
    ${EndIf}
  ${Else}
    DetailPrint "engine.zip not found; app will extract on first launch."
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro KillModelDeskQuiet
  RMDir /r "$INSTDIR\engine"
!macroend
