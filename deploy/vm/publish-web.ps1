[CmdletBinding()]
param(
    [string]$SshTarget = 'root@34.64.97.191',
    [string]$RemoteDirectory = '/opt/bookgyeol/repo/deploy/vm/web-deploy',
    [string]$PublicAppUrl = 'https://34-64-97-191.sslip.io/app',
    [string]$ApiUrl = 'https://34-64-97-191.sslip.io'
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$mobileRoot = Join-Path $repositoryRoot 'apps\mobile'
$distDirectory = Join-Path $mobileRoot 'dist'
$releaseID = "$(Get-Date -Format 'yyyyMMdd-HHmmss')-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) "bookgyeol-web-$releaseID.tar.gz"
$previousApiUrl = $env:EXPO_PUBLIC_API_URL

try {
    $env:EXPO_PUBLIC_API_URL = $ApiUrl
    Push-Location $mobileRoot
    try {
        & pnpm exec expo export --platform web --clear
        if ($LASTEXITCODE -ne 0) { throw 'Expo Web 빌드에 실패했습니다.' }
    }
    finally {
        Pop-Location
    }

    $indexPath = Join-Path $distDirectory 'index.html'
    if (-not (Test-Path -LiteralPath $indexPath)) {
        throw "웹 빌드의 index.html을 찾을 수 없습니다: $indexPath"
    }
    $indexContent = Get-Content -Raw -LiteralPath $indexPath
    if ($indexContent -notmatch '/app/_expo/') {
        throw '웹 빌드 자산 경로가 /app 기준으로 생성되지 않았습니다.'
    }
    if ($indexContent -match 'http://127\.0\.0\.1:8080|http://10\.0\.2\.2:8080') {
        throw '웹 빌드에 로컬 API 주소가 포함되어 있습니다.'
    }

    & tar -czf $archivePath -C $distDirectory .
    if ($LASTEXITCODE -ne 0) { throw '웹 빌드 압축에 실패했습니다.' }

    $remoteArchive = "/tmp/bookgyeol-web-$releaseID.tar.gz"
    & scp $archivePath "${SshTarget}:$remoteArchive"
    if ($LASTEXITCODE -ne 0) { throw '웹 빌드 업로드에 실패했습니다.' }

    $publishCommand = "set -eu; install -d -m 755 '$RemoteDirectory/releases/$releaseID'; tar -xzf '$remoteArchive' -C '$RemoteDirectory/releases/$releaseID'; test -f '$RemoteDirectory/releases/$releaseID/index.html'; ln -sfn 'releases/$releaseID' '$RemoteDirectory/current.next'; mv -Tf '$RemoteDirectory/current.next' '$RemoteDirectory/current'; rm -f '$remoteArchive'"
    & ssh $SshTarget $publishCommand
    if ($LASTEXITCODE -ne 0) { throw '서버 웹 릴리스 전환에 실패했습니다.' }

    $homeResponse = Invoke-WebRequest -Uri "$PublicAppUrl/" -Headers @{ 'Cache-Control' = 'no-cache' }
    $signInResponse = Invoke-WebRequest -Uri "$PublicAppUrl/sign-in" -Headers @{ 'Cache-Control' = 'no-cache' }
    if ($homeResponse.StatusCode -ne 200 -or $signInResponse.StatusCode -ne 200) {
        throw "웹앱 응답 검증에 실패했습니다: home=$($homeResponse.StatusCode), sign-in=$($signInResponse.StatusCode)"
    }
    if ($homeResponse.Content -notmatch '/app/_expo/') {
        throw '배포된 웹앱이 /app 자산 경로를 사용하지 않습니다.'
    }

    Write-Host "웹앱 게시 완료: $PublicAppUrl/"
    Write-Host "웹 릴리스: $releaseID"
}
finally {
    $env:EXPO_PUBLIC_API_URL = $previousApiUrl
    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
}
