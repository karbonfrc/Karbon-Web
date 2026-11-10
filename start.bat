@echo off
TITLE Karbon Server
cd /d "%~dp0"

:: Check for Administrator privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Administrative privileges required. Requesting elevation...
    powershell -Command "Start-Process '%~dpnx0' -Verb RunAs"
    exit /b
)

set "KARBON_PORT=8000"
if "%PORT%" neq "" set "KARBON_PORT=%PORT%"

echo Starting Karbon server on http://localhost:%KARBON_PORT%/ ...
start "" http://localhost:%KARBON_PORT%/

powershell -NoProfile -Command ^
    "$port = %KARBON_PORT%;" ^
    "$listener = New-Object System.Net.HttpListener;" ^
    "$listener.Prefixes.Add('http://localhost:' + $port + '/');" ^
    "$listener.Start();" ^
    "Write-Host ('Karbon server running on http://localhost:' + $port + '/ (Press Ctrl+C to stop)');" ^
    "while ($listener.IsListening) {" ^
    "    $context = $listener.GetContext();" ^
    "    $request = $context.Request;" ^
    "    $response = $context.Response;" ^
    "    $path = $request.Url.LocalPath;" ^
    "    if ($path -eq '/') { $path = '/index.html' }" ^
    "    $localPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath('.' + $path);" ^
    "    if ((Test-Path $localPath) -and (-not (Get-Item $localPath).PSIsContainer)) {" ^
    "        $bytes = [System.IO.File]::ReadAllBytes($localPath);" ^
    "        if ($localPath.EndsWith('.html') -or $localPath.EndsWith('.htm')) { $response.ContentType = 'text/html' }" ^
    "        elseif ($localPath.EndsWith('.js')) { $response.ContentType = 'text/javascript' }" ^
    "        elseif ($localPath.EndsWith('.css')) { $response.ContentType = 'text/css' }" ^
    "        elseif ($localPath.EndsWith('.png')) { $response.ContentType = 'image/png' }" ^
    "        elseif ($localPath.EndsWith('.jpg') -or $localPath.EndsWith('.jpeg')) { $response.ContentType = 'image/jpeg' }" ^
    "        else { $response.ContentType = 'application/octet-stream' }" ^
    "        $response.ContentLength64 = $bytes.Length;" ^
    "        $response.OutputStream.Write($bytes, 0, $bytes.Length);" ^
    "    } else {" ^
    "        $response.StatusCode = 404;" ^
    "        $msg = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found: ' + $path);" ^
    "        $response.OutputStream.Write($msg, 0, $msg.Length);" ^
    "    }" ^
    "    $response.OutputStream.Close();" ^
    "}"

pause