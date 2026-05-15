@echo off
setlocal

title VSCode Dev

pushd %~dp0\..

call :resolveElectronExe

if not "%TURBOFILE_KEEP_RUNNING_DEV%"=="1" if defined CODE_ABS (
	call :stopRunningDevInstance
)

:: Get electron, compile, built-in extensions
if "%VSCODE_SKIP_PRELAUNCH%"=="" (
	node build/lib/preLaunch.ts
)

call :resolveElectronExe
if not defined CODE_ABS (
	echo Could not find Electron executable in .build\electron.
	goto end
)

:: Manage built-in extensions
if "%~1"=="--builtin" goto builtin

:: Configuration
set NODE_ENV=development
set VSCODE_DEV=1
set VSCODE_CLI=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

set DISABLE_TEST_EXTENSION="--disable-extension=vscode.vscode-api-tests"
for %%A in (%*) do (
	if "%%~A"=="--extensionTestsPath" (
		set DISABLE_TEST_EXTENSION=""
	)
)

:: Launch Code
%CODE% . %DISABLE_TEST_EXTENSION% %*
goto end

:builtin
%CODE% build/builtin

:end

popd

endlocal

exit /b %ERRORLEVEL%

:resolveElectronExe
set "NAMESHORT="
set "CODE="
set "CODE_ABS="
for /f "usebackq delims=" %%F in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$exe = Get-ChildItem -LiteralPath '.build\electron' -Filter '*.exe' -File -ErrorAction SilentlyContinue | Select-Object -First 1; if ($exe) { $exe.FullName }"`) do (
	set "CODE_ABS=%%F"
	set "NAMESHORT=%%~nxF"
	set CODE="%%F"
)
exit /b 0

:stopRunningDevInstance
powershell -NoProfile -ExecutionPolicy Bypass -Command "$target = [System.IO.Path]::GetFullPath('%CODE_ABS%'); Get-CimInstance Win32_Process -Filter \"Name='%NAMESHORT%'\" | Where-Object { $_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $target) } | ForEach-Object { Write-Host ('Stopping existing dev process ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }"
exit /b 0
