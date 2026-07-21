; ============================================================
; Internal Portal — Inno Setup Installer
; ============================================================

#define MyAppName "Internal Portal"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "JMCS"
#define MyAppURL "https://jmcs.ph"

[Setup]
AppId={{B7A1C2E3-4F5D-6A7B-8C9D-0E1F2A3B4C5D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=.\dist
OutputBaseFilename=Internal-Portal-Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\portal\dist-website\*"; DestDir: "{app}\www"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\portal\electron\*"; DestDir: "{app}\electron"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\DISCLAIMER.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\electron\electron.exe"; WorkingDir: "{app}\www"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\electron\electron.exe"; WorkingDir: "{app}\www"

[Run]
Filename: "{app}\electron\electron.exe"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Registry]
; Register the jmcs:// protocol so web links can launch the desktop app.
Root: HKCR; Subkey: "jmcs"; ValueType: string; ValueName: ""; ValueData: "URL:JMCS Portal Protocol"; Flags: uninsdeletekey
Root: HKCR; Subkey: "jmcs"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCR; Subkey: "jmcs\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\electron\electron.exe,0"
Root: HKCR; Subkey: "jmcs\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\electron\electron.exe"" ""%1"""