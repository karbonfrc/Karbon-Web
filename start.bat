@echo off
setlocal
cd /d "%~dp0"
set "KARBON_PORT=8000"
if not "%PORT%"=="" set "KARBON_PORT=%PORT%"

:: Reuse a Karbon server that's already running on the selected port.
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:%KARBON_PORT%/api/health' -TimeoutSec 2; if ($r.ok -eq $true -and $r.maxBytes -eq 3221225472 -and $r.ttlSeconds -eq 1200) { exit 0 } } catch { }; exit 1" >nul 2>&1
if %errorlevel% equ 0 goto :open_site

:: If another app owns the port, choose the next free port from 8000-8099.
for /f "delims=" %%P in ('powershell -NoProfile -Command "$port=%KARBON_PORT%; while ($port -lt 8100) { $client=[System.Net.Sockets.TcpClient]::new(); try { $client.Connect(''127.0.0.1'', $port); $client.Dispose(); $port++ } catch { $client.Dispose(); break } }; Write-Output $port"') do set "KARBON_PORT=%%P"
if %KARBON_PORT% geq 8100 (
  echo No free port found between 8000 and 8099.
  pause
  exit /b 1
)
set "PORT=%KARBON_PORT%"
echo Starting Karbon transfer site on port %KARBON_PORT%...

:open_site
set "KARBON_IP="
for /f "delims=" %%I in ('powershell -NoProfile -Command "$ip=Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias Wi-Fi* -ErrorAction SilentlyContinue ^| Where-Object { $_.IPAddress -notlike 169.254.* } ^| Select-Object -First 1 -ExpandProperty IPAddress; if (-not $ip) { $ip=Get-NetIPAddress -AddressFamily IPv4 ^| Where-Object { $_.IPAddress -notlike 127.* -and $_.IPAddress -notlike 169.254.* } ^| Select-Object -First 1 -ExpandProperty IPAddress }; Write-Output $ip"') do set "KARBON_IP=%%I"
if "%KARBON_IP%"=="" set "KARBON_IP=localhost"
echo Karbon transfer site: http://%KARBON_IP%:%KARBON_PORT%/
netsh advfirewall firewall show rule name="Karbon transfer site" >nul 2>&1
if errorlevel 1 (
  echo Windows Firewall may block other devices on your Wi-Fi.
  echo If they cannot open the link, allow Node.js on Private networks in the firewall prompt or Windows Security.
)
start "Karbon" "http://%KARBON_IP%:%KARBON_PORT%/"
powershell -NoProfile -Command "try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:%KARBON_PORT%/api/health' -TimeoutSec 2; if ($r.ok -eq $true -and $r.maxBytes -eq 3221225472 -and $r.ttlSeconds -eq 1200) { Write-Host 'Karbon server is already running.'; exit 0 } } catch { }; exit 1" >nul 2>&1
if %errorlevel% equ 0 goto :done
node server.js
:done
pause
