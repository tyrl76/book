[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ApkPath,
    [string]$SshTarget = 'root@34.64.97.191',
    [string]$RemoteDirectory = '/opt/bookgyeol/repo/deploy/vm/downloads',
    [string]$PublicBaseUrl = 'https://34-64-97-191.sslip.io/download',
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$ExpectedSignerSha256 = 'a2b69d86db7e2f394e153b883fcc71da02d046031f4fb7ee8dfb608d925dd0bf',
    [switch]$SkipWeb
)

$ErrorActionPreference = 'Stop'
$resolvedApk = (Resolve-Path -LiteralPath $ApkPath).Path
$sdkRoot = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$apkAnalyzer = Join-Path $sdkRoot 'cmdline-tools\latest\bin\apkanalyzer.bat'
$apkSigner = Join-Path $sdkRoot 'build-tools\36.0.0\apksigner.bat'

if (-not $JavaHome) {
    $javaCandidates = @(
        (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr'),
        (Join-Path $env:LOCALAPPDATA 'Temp\bookgyeol-jdk21\jdk-21.0.12.1+1')
    )
    $JavaHome = $javaCandidates | Where-Object { Test-Path -LiteralPath (Join-Path $_ 'bin\java.exe') } | Select-Object -First 1
}
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\java.exe'))) {
    throw 'Java 21을 찾을 수 없습니다. -JavaHome 매개변수로 JDK 경로를 지정해 주세요.'
}
$env:JAVA_HOME = $JavaHome
$env:Path = "$(Join-Path $JavaHome 'bin');$env:Path"

if (-not (Test-Path -LiteralPath $apkAnalyzer)) {
    throw "apkanalyzer를 찾을 수 없습니다: $apkAnalyzer"
}
if (-not (Test-Path -LiteralPath $apkSigner)) {
    throw "apksigner를 찾을 수 없습니다: $apkSigner"
}

$applicationId = (& $apkAnalyzer manifest application-id $resolvedApk).Trim()
$versionCode = [int](& $apkAnalyzer manifest version-code $resolvedApk).Trim()
$versionName = (& $apkAnalyzer manifest version-name $resolvedApk).Trim()
if ($LASTEXITCODE -ne 0 -or $applicationId -ne 'com.bookgyeol.app') {
    throw "책결 APK가 아니거나 APK 정보를 읽지 못했습니다: $applicationId"
}

$signatureOutput = & $apkSigner verify --verbose --print-certs $resolvedApk
if ($LASTEXITCODE -ne 0) {
    throw 'APK 서명 검증에 실패했습니다.'
}
$signerLine = $signatureOutput | Select-String 'Signer #1 certificate SHA-256 digest:' | Select-Object -First 1
$signerSha256 = if ($signerLine) { $signerLine.Line.Split(':', 2)[1].Trim().ToLowerInvariant() } else { '' }
if ($signerSha256 -ne $ExpectedSignerSha256.ToLowerInvariant()) {
    throw "기존 책결 앱과 서명 키가 다릅니다. 실제 지문: $signerSha256"
}

$apkItem = Get-Item -LiteralPath $resolvedApk
$sha256 = (Get-FileHash -LiteralPath $resolvedApk -Algorithm SHA256).Hash.ToLowerInvariant()
$metadata = [ordered]@{
    applicationId = $applicationId
    versionName = $versionName
    versionCode = $versionCode
    sizeBytes = $apkItem.Length
    sha256 = $sha256
    publishedAt = (Get-Date).ToUniversalTime().ToString('o')
}

try {
    $currentRelease = Invoke-RestMethod -Uri "$PublicBaseUrl/version.json?ts=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" -Headers @{ 'Cache-Control' = 'no-cache' }
    if ($currentRelease.sha256 -ne $sha256 -and $versionCode -le [int]$currentRelease.versionCode) {
        throw "새 APK의 versionCode($versionCode)가 현재 배포 버전($($currentRelease.versionCode))보다 높아야 합니다."
    }
}
catch {
    if ($_.Exception.Message -like '새 APK의 versionCode*') { throw }
    Write-Verbose '아직 배포된 버전 정보가 없어 최초 게시로 진행합니다.'
}

$temporaryMetadata = Join-Path ([System.IO.Path]::GetTempPath()) "bookgyeol-version-$([guid]::NewGuid().ToString('N')).json"
try {
    [System.IO.File]::WriteAllText($temporaryMetadata, ($metadata | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))

    $remoteApk = '/tmp/bookgyeol-latest.apk.upload'
    $remoteMetadata = '/tmp/bookgyeol-version.json.upload'
    & scp $resolvedApk "${SshTarget}:$remoteApk"
    if ($LASTEXITCODE -ne 0) { throw 'APK 업로드에 실패했습니다.' }
    & scp $temporaryMetadata "${SshTarget}:$remoteMetadata"
    if ($LASTEXITCODE -ne 0) { throw '버전 정보 업로드에 실패했습니다.' }

    $publishCommand = "install -d -m 755 '$RemoteDirectory' && install -m 644 '$remoteApk' '$RemoteDirectory/bookgyeol-latest.apk.new' && install -m 644 '$remoteMetadata' '$RemoteDirectory/version.json.new' && mv -f '$RemoteDirectory/bookgyeol-latest.apk.new' '$RemoteDirectory/bookgyeol-latest.apk' && mv -f '$RemoteDirectory/version.json.new' '$RemoteDirectory/version.json' && rm -f '$remoteApk' '$remoteMetadata'"
    & ssh $SshTarget $publishCommand
    if ($LASTEXITCODE -ne 0) { throw '서버 파일 교체에 실패했습니다.' }

    $response = Invoke-WebRequest -Uri "$PublicBaseUrl/bookgyeol-latest.apk" -Method Head -Headers @{ 'Cache-Control' = 'no-cache' }
    if ($response.StatusCode -ne 200) { throw "다운로드 검증 실패: HTTP $($response.StatusCode)" }

    Write-Host "게시 완료: $PublicBaseUrl/"
    Write-Host "APK 주소: $PublicBaseUrl/bookgyeol-latest.apk"
    Write-Host "버전: $versionName ($versionCode)"
    Write-Host "SHA-256: $sha256"

    if (-not $SkipWeb) {
        & (Join-Path $PSScriptRoot 'publish-web.ps1') -SshTarget $SshTarget
        if ($LASTEXITCODE -ne 0) { throw '웹앱 게시에 실패했습니다.' }
    }
}
finally {
    if (Test-Path -LiteralPath $temporaryMetadata) {
        Remove-Item -LiteralPath $temporaryMetadata -Force
    }
}
