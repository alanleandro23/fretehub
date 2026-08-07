param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [Parameter(Mandatory = $true)]
    [string]$Description,

    [string]$MinimumVersion = '',

    [switch]$RequiresDatabaseMigration,

    [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,

    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $output = & git -C $ProjectRoot @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Git falhou: $($output -join [Environment]::NewLine)"
    }
    return ($output -join "`n").Trim()
}

if (-not (Test-Path (Join-Path $ProjectRoot '.git'))) {
    throw "ProjectRoot não é um repositório Git: $ProjectRoot"
}

$branch = Invoke-Git rev-parse --abbrev-ref HEAD
if ($branch -ne 'main') {
    throw "Gere releases a partir da branch main. Branch atual: $branch"
}

$dirty = Invoke-Git status --porcelain
if ($dirty) {
    throw "Existem alterações não commitadas. Faça commit antes de gerar o pacote.`n$dirty"
}

$targetCommit = Invoke-Git rev-parse HEAD
if ($targetCommit -notmatch '^[0-9a-f]{40}$') {
    throw 'Não foi possível determinar o commit alvo.'
}

if (-not $MinimumVersion) {
    $packageJson = Get-Content (Join-Path $ProjectRoot 'backend\package.json') -Raw | ConvertFrom-Json
    $MinimumVersion = [string]$packageJson.version
}
if ($MinimumVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw "MinimumVersion inválida: $MinimumVersion"
}

if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $ProjectRoot 'releases'
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$temp = Join-Path ([IO.Path]::GetTempPath()) ("fretehub-release-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temp | Out-Null

try {
    $bundle = Join-Path $temp 'fretehub.bundle'
    & git -C $ProjectRoot bundle create $bundle main
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar fretehub.bundle.' }

    & git -C $ProjectRoot bundle verify $bundle | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Falha na validação do Git bundle.' }

    $manifest = [ordered]@{
        application = 'fretehub'
        packageFormat = 1
        version = $Version
        minimumVersion = $MinimumVersion
        targetCommit = $targetCommit
        requiresDatabaseMigration = [bool]$RequiresDatabaseMigration
        description = $Description
        createdAt = [DateTime]::UtcNow.ToString('o')
    }

    $manifestPath = Join-Path $temp 'manifest.json'
    $json = $manifest | ConvertTo-Json -Depth 5
    [IO.File]::WriteAllText($manifestPath, $json, (New-Object Text.UTF8Encoding($false)))

    $safeVersion = $Version -replace '[^0-9A-Za-z._-]', '_'
    $output = Join-Path $OutputDirectory "FreteHub_Update_v$safeVersion.zip"
    if (Test-Path $output) { Remove-Item $output -Force }

    Compress-Archive -Path $manifestPath, $bundle -DestinationPath $output -CompressionLevel Optimal

    $sha = (Get-FileHash -Algorithm SHA256 $output).Hash.ToLowerInvariant()

    Write-Host ''
    Write-Host 'PACOTE DE ATUALIZAÇÃO CRIADO' -ForegroundColor Green
    Write-Host "Versão:        $Version"
    Write-Host "Versão mínima: $MinimumVersion"
    Write-Host "Commit:        $targetCommit"
    Write-Host "Migration:     $([bool]$RequiresDatabaseMigration)"
    Write-Host "Arquivo:       $output"
    Write-Host "SHA-256:       $sha"
}
finally {
    Remove-Item $temp -Recurse -Force -ErrorAction SilentlyContinue
}
