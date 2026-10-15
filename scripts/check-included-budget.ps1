param(
    [ValidateRange(0.01, 1.00)]
    [decimal]$PlannedUsageUsd = 0.15
)

# Read-only preflight. This script never builds, runs Actors, uses proxies, or changes account limits.
$ErrorActionPreference = 'Stop'
$actorProject = Split-Path -Parent $PSScriptRoot
$workspaceDirectory = Split-Path -Parent $actorProject
$cliEntrypoint = Join-Path $workspaceDirectory 'node_modules\apify-cli\dist\apify.js'

function Read-ApifyJson([string]$Endpoint) {
    $responseText = & node $cliEntrypoint api $Endpoint
    if ($LASTEXITCODE -ne 0) { throw 'Read-only account check failed. Do not start billable work.' }
    return ($responseText | ConvertFrom-Json).data
}

$account = Read-ApifyJson 'users/me'
$limits = Read-ApifyJson 'users/me/limits'
$included = $account.plan.monthlyUsageCreditsUsd
$used = $limits.current.monthlyUsageUsd
$verifiedGrant = 0
$grantEvidence = Join-Path $actorProject 'CREATOR_CREDIT_EVIDENCE.json'
if (Test-Path -LiteralPath $grantEvidence) {
    $evidence = Get-Content -LiteralPath $grantEvidence -Raw | ConvertFrom-Json
    # This allowance spans six months. Only the first usage cycle can use a
    # current-cycle-only subtraction; later cycles require a fresh balance check.
    $sameFirstCycle = ([DateTimeOffset]$limits.monthlyUsageCycle.startAt) -eq ([DateTimeOffset]$evidence.firstUsageCycleStart)
    if ($evidence.username -eq $account.username -and $sameFirstCycle -and ([DateTimeOffset]::UtcNow -lt [DateTimeOffset]$evidence.expiresAt)) {
        $verifiedGrant = [decimal]$evidence.additionalUsageGrantUsd
    }
}

if ($null -eq $included -or $null -eq $used) {
    Write-Output 'BLOCKED: Included credit or current usage is unavailable. No billable action was started.'
    exit 2
}

$remaining = [decimal]$included + $verifiedGrant - [decimal]$used
$spendingLimitHeadroom = [decimal]$limits.limits.maxMonthlyUsageUsd - [decimal]$used
$remaining = [Math]::Min($remaining, $spendingLimitHeadroom)
$eligible = $remaining -ge $PlannedUsageUsd
[pscustomobject]@{
    includedMonthlyUsageCreditUsd = $included
    currentCycleUsageUsd = $used
    verifiedAdditionalCreatorGrantUsd = $verifiedGrant
    calculatedIncludedHeadroomUsd = [Math]::Max([decimal]0, [decimal]$remaining)
    plannedUsageUsd = $PlannedUsageUsd
    includedHeadroomEstablished = $eligible
    billableActionsStarted = $false
    note = 'Additional grant is supported by the user-provided subscription statement and restricted to its first usage cycle. Account spending limits are not credits. This read-only check is not a guaranteed dollar cap.'
} | ConvertTo-Json

if (-not $eligible) { exit 2 }
exit 0
