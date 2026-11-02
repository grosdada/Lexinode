; Installateur Windows de Lexinode (Inno Setup 6). Compilé par desktop/build.js : il prépare d'abord build\ (appli, node, lanceur, icône).
#ifndef AppVersion
  #define AppVersion "1.2.0"
#endif

[Setup]
AppId={{B7A1C5D2-6E0F-4C58-9D3A-51B1F0A7E4C9}
AppName=Lexinode
AppVersion={#AppVersion}
AppVerName=Lexinode {#AppVersion}
AppPublisher=Lexinode
DefaultDirName={autopf}\Lexinode
DefaultGroupName=Lexinode
DisableProgramGroupPage=yes
; installation par utilisateur : aucun droit d'administrateur requis
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupIconFile=build\lexinode.ico
UninstallDisplayIcon={app}\Lexinode.exe
OutputDir=dist
OutputBaseFilename=Lexinode-Setup-{#AppVersion}

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "build\Lexinode.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "build\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs
Source: "build\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Lexinode"; Filename: "{app}\Lexinode.exe"
Name: "{autodesktop}\Lexinode"; Filename: "{app}\Lexinode.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Lexinode.exe"; Description: "{cm:LaunchProgram,Lexinode}"; Flags: nowait postinstall skipifsilent
