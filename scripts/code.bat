@echo off
setlocal

title VSCode Dev

pushd %~dp0\..

set "NAMESHORT="
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do if not defined NAMESHORT set "NAMESHORT=%%~a"
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
set CODE=".build\electron\%NAMESHORT%"
set "CODE_ABS=%CD%\.build\electron\%NAMESHORT%"
if not exist %CODE% if exist ".build\electron\TurboFile.exe" (
	set "NAMESHORT=TurboFile.exe"
	set CODE=".build\electron\TurboFile.exe"
	set "CODE_ABS=%CD%\.build\electron\TurboFile.exe"
)
if not exist %CODE% (
	for %%F in (".build\electron\*.exe") do if not exist %CODE% (
		set "NAMESHORT=%%~nxF"
		set CODE="%%~fF"
		set "CODE_ABS=%%~fF"
	)
)

if not "%TURBOFILE_KEEP_RUNNING_DEV%"=="1" (
	call :stopRunningDevInstance
)

:: Get electron, compile, built-in extensions
if "%VSCODE_SKIP_PRELAUNCH%"=="" (
	node build/lib/preLaunch.ts
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

:stopRunningDevInstance
powershell -NoProfile -ExecutionPolicy Bypass -Command "$target = [System.IO.Path]::GetFullPath('%CODE_ABS%'); Get-CimInstance Win32_Process -Filter \"Name='%NAMESHORT%'\" | Where-Object { $_.ExecutablePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq $target) } | ForEach-Object { Write-Host ('Stopping existing dev process ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force }"
exit /b 0
