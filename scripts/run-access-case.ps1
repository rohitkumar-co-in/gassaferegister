param(
    [Parameter(Mandatory=$true)][string]$CaseFile,
    [Parameter(Mandatory=$true)][ValidatePattern('^0\.0\.\d+$')][string]$BuildNumber,
    [switch]$PlanOnly
)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
$cliPath = Join-Path (Split-Path -Parent $projectPath) 'node_modules\apify-cli\dist\apify.js'
$case = Get-Content -LiteralPath $CaseFile -Raw | ConvertFrom-Json
if ($case.name -notmatch '^[a-z0-9-]{1,60}$' -or $case.input.mode -notin @('probe','scrape','offlineTest')) { throw 'Invalid case' }
if ($case.input.mode -ne 'offlineTest' -and ($case.input.useUkResidentialProxy -ne $true -or $case.input.proxyService -ne 'residential' -or $case.input.proxyCountry -ne 'GB')) { throw 'Live tests require Apify residential proxies restricted to GB.' }
if ($case.input.mode -eq 'scrape') {
    if ($case.input.maxResults -ne 1 -or $case.input.maxPages -ne 1 -or $case.input.maxRuntimeSeconds -gt 90 -or $case.input.maxTransferMegabytes -gt 10 -or $case.input.maxNetworkRequests -gt 300) { throw 'Development tests require one business, one page, <=90 seconds, <=10 MiB and <=300 requests.' }
}
if ($PlanOnly) { $case | ConvertTo-Json -Depth 8; exit 0 }
$resultsPath = Join-Path $projectPath 'experiment-results'
New-Item -ItemType Directory -Force -Path $resultsPath | Out-Null
$resultFile = Join-Path $resultsPath ($case.name + '.json')
function Api([string]$Endpoint) {
    $value = & node $cliPath api $Endpoint
    if ($LASTEXITCODE -ne 0) { throw 'Apify read failed' }
    $parsed = $value | ConvertFrom-Json
    if ($null -ne $parsed.data) { return $parsed.data }
    return $parsed
}
if (Test-Path -LiteralPath $resultFile) {
    $previous = Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
    if ($previous.status -in @('SUCCEEDED','FAILED','TIMED-OUT','ABORTED')) { $previous | ConvertTo-Json -Depth 8; exit 0 }
    $runId = $previous.runId
} else {
    $startEndpoint = 'actors/7tSEDg7eo5c6gxyFL/runs?build=' + $BuildNumber + '&memory=1024&timeout=120'
    $start = $case.input | ConvertTo-Json -Depth 8 | & node $cliPath api POST $startEndpoint --body -
    if ($LASTEXITCODE -ne 0) { throw 'Run was not started successfully' }
    $run = ($start | ConvertFrom-Json).data
    $runId = $run.id
    [pscustomobject]@{case=$case.name;runId=$runId;status=$run.status} | ConvertTo-Json | Set-Content -LiteralPath $resultFile
    Write-Output ('Started ' + $case.name + ': ' + $runId)
}
$deadline = [DateTimeOffset]::UtcNow.AddSeconds(160)
do {
    Start-Sleep -Seconds 10
    $run = Api ('actor-runs/' + $runId)
    Write-Output ($case.name + ': ' + $run.status)
    $observedCost = ($run.usageUsd.PSObject.Properties | Measure-Object -Property Value -Sum).Sum
    if ($observedCost -ge 0.12 -and $run.status -notin @('SUCCEEDED','FAILED','TIMED-OUT','ABORTED')) {
        & node $cliPath api POST ('actor-runs/' + $runId + '/abort') | Out-Null
        throw 'Reported cost reached the conservative $0.12 stop threshold; abort requested. Inspect this same run, do not restart.'
    }

    if ([DateTimeOffset]::UtcNow -gt $deadline -and $run.status -notin @('SUCCEEDED','FAILED','TIMED-OUT','ABORTED')) {
        & node $cliPath api POST ('actor-runs/' + $runId + '/abort') | Out-Null
        throw 'Supervisor deadline reached; abort requested. Re-run this case to inspect the same run.'
    }
} while ($run.status -notin @('SUCCEEDED','FAILED','TIMED-OUT','ABORTED'))
$summary = Api ('key-value-stores/' + $run.defaultKeyValueStoreId + '/records/RUN-SUMMARY')
$cost = ($run.usageUsd.PSObject.Properties | Measure-Object -Property Value -Sum).Sum
$result = [pscustomobject]@{case=$case.name;runId=$runId;status=$run.status;datasetId=$run.defaultDatasetId;storeId=$run.defaultKeyValueStoreId;reportedCostUsd=$cost;summary=$summary}
$result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $resultFile
$result | ConvertTo-Json -Depth 10
