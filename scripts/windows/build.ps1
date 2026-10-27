$ErrorActionPreference = 'Stop'
$bridgeRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$bridgeSources = Get-Content (Join-Path $PSScriptRoot 'runtime-sources.json') -Raw | ConvertFrom-Json
$bridgeOutput = Join-Path $bridgeRoot 'assets/windows'
$bridgeTemp = Join-Path ([IO.Path]::GetTempPath()) ('ap-bridge-build-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $bridgeOutput, $bridgeTemp | Out-Null
try {
    foreach ($bridgeDependency in @('node', 'webview2')) {
        $bridgeSource = $bridgeSources.$bridgeDependency
        $bridgeArchive = Join-Path $bridgeTemp "$bridgeDependency.zip"
        Invoke-WebRequest -UseBasicParsing -Uri $bridgeSource.url -OutFile $bridgeArchive
        if ((Get-FileHash $bridgeArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $bridgeSource.sha256) { throw "SHA256 stimmt nicht: $bridgeDependency" }
        Expand-Archive -Path $bridgeArchive -DestinationPath (Join-Path $bridgeTemp $bridgeDependency)
    }
    Copy-Item (Join-Path $bridgeTemp "node/node-v$($bridgeSources.node.version)-win-x64/node.exe") $bridgeOutput
    Copy-Item (Join-Path $bridgeTemp "node/node-v$($bridgeSources.node.version)-win-x64/LICENSE") (Join-Path $bridgeOutput 'NODE-LICENSE.txt')
    foreach ($bridgeDll in @('Core', 'WinForms')) { Copy-Item (Join-Path $bridgeTemp "webview2/lib/net462/Microsoft.Web.WebView2.$bridgeDll.dll") $bridgeOutput }
    Copy-Item (Join-Path $bridgeTemp 'webview2/runtimes/win-x64/native/WebView2Loader.dll') $bridgeOutput
    Copy-Item (Join-Path $bridgeTemp 'webview2/LICENSE.txt') (Join-Path $bridgeOutput 'WEBVIEW2-LICENSE.txt')
    Copy-Item (Join-Path $PSScriptRoot 'runtime-sources.json') $bridgeOutput
    $bridgePackage = Get-Content (Join-Path $bridgeRoot 'package.json') -Raw | ConvertFrom-Json
    $bridgeVersion = Join-Path $bridgeTemp 'Version.cs'
    Set-Content -Encoding UTF8 -Path $bridgeVersion -Value "using System.Reflection; [assembly: AssemblyTitle(`"AP Chaos Bridge`")] [assembly: AssemblyProduct(`"AP Chaos Bridge`")] [assembly: AssemblyVersion(`"$($bridgePackage.version).0`")] [assembly: AssemblyFileVersion(`"$($bridgePackage.version).0`")]"
    $bridgeCompiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $bridgeCompiler /nologo /target:winexe /platform:x64 /optimize+ /utf8output /langversion:5 /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/reference:$bridgeOutput/Microsoft.Web.WebView2.Core.dll" "/reference:$bridgeOutput/Microsoft.Web.WebView2.WinForms.dll" "/win32manifest:$PSScriptRoot/app.manifest" "/win32icon:$PSScriptRoot/bridge.ico" "/out:$bridgeOutput/AP-Chaos-Bridge.exe" (Join-Path $PSScriptRoot 'Bridge.cs') $bridgeVersion
    if ($LASTEXITCODE -ne 0) { throw 'Windows-Programm konnte nicht kompiliert werden.' }
    Write-Host "Windows-Fenster, Tray und portable Laufzeit gebaut: $bridgeOutput"
} finally { Remove-Item -LiteralPath $bridgeTemp -Recurse -Force }
