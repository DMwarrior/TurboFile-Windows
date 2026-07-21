param(
	[string] $Configuration = 'Release',
	[switch] $DragSourceOnly
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $repoRoot 'resources\turbofile\drag-ext\TurboFileDragExt.cpp'
$dragSource = Join-Path $repoRoot 'resources\turbofile\drag-ext\TurboFileDragSource.cpp'
$outDir = Join-Path $repoRoot 'resources\turbofile\drag-ext\x64'
$dll = Join-Path $outDir 'TurboFileDragExt.dll'
$exe = Join-Path $outDir 'TurboFileDragSource.exe'
$obj = Join-Path $outDir 'TurboFileDragExt.obj'
$dragSourceObj = Join-Path $outDir 'TurboFileDragSource.obj'

if (!(Test-Path $source)) {
	throw "Missing source file: $source"
}
if (!(Test-Path $dragSource)) {
	throw "Missing source file: $dragSource"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (!(Test-Path $vswhere)) {
	throw 'Visual Studio Build Tools were not found. Install MSVC x64 build tools first.'
}

$vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vsPath) {
	throw 'Visual Studio Build Tools with MSVC x64 tools were not found.'
}

$vcvars = Join-Path $vsPath 'Common7\Tools\VsDevCmd.bat'
if (!(Test-Path $vcvars)) {
	throw "Missing VsDevCmd.bat: $vcvars"
}

$optimization = if ($Configuration -ieq 'Debug') { '/Od /Zi' } else { '/O2' }
if (!$DragSourceOnly) {
	$command = "`"$vcvars`" -arch=x64 -host_arch=x64 >nul && cl.exe /nologo /LD /EHsc $optimization /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN `"$source`" /Fe:`"$dll`" /Fo:`"$obj`" /link /NOLOGO /EXPORT:DllGetClassObject,PRIVATE /EXPORT:DllCanUnloadNow,PRIVATE shell32.lib ole32.lib uuid.lib"

	cmd.exe /d /s /c $command
	if ($LASTEXITCODE -ne 0) {
		throw "TurboFile drag extension build failed with exit code $LASTEXITCODE."
	}
}

$dragSourceCommand = "`"$vcvars`" -arch=x64 -host_arch=x64 >nul && cl.exe /nologo /EHsc $optimization /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN `"$dragSource`" /Fe:`"$exe`" /Fo:`"$dragSourceObj`" /link /NOLOGO /SUBSYSTEM:WINDOWS shell32.lib ole32.lib user32.lib uuid.lib"
cmd.exe /d /s /c $dragSourceCommand
if ($LASTEXITCODE -ne 0) {
	throw "TurboFile drag source helper build failed with exit code $LASTEXITCODE."
}

Remove-Item -Force -ErrorAction SilentlyContinue `
	(Join-Path $outDir 'TurboFileDragExt.obj'), `
	(Join-Path $outDir 'TurboFileDragExt.exp'), `
	(Join-Path $outDir 'TurboFileDragExt.lib'), `
	$dragSourceObj

if ($DragSourceOnly) {
	Write-Host "Built $exe"
} else {
	Write-Host "Built $dll and $exe"
}
