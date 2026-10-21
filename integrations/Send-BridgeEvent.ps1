param(
    [Parameter(Mandatory=$true)][string]$EventId,
    [ValidateSet('donation','sub','resub','gift_sub','cheer','channel_points','manual')][string]$Type = 'manual',
    [string]$UserName = 'Lokaler Test',
    [int]$Units = 1,
    [int]$AmountCents = 0,
    [string]$Action = '',
    [string]$RewardId = '',
    [switch]$TestEvent,
    [int]$BridgePort = 17381
)
$ErrorActionPreference = 'Stop'
$bridgeKeyFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'data\integration-key.txt'
$bridgeKey = (Get-Content -LiteralPath $bridgeKeyFile -Raw).Trim()
$bridgePayload = @{
    id = $EventId; type = $Type; user = $UserName; units = $Units
    amountCents = $AmountCents; action = $Action; rewardId = $RewardId
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); test = [bool]$TestEvent
} | ConvertTo-Json -Compress
$bridgeResponse = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$BridgePort/api/ingest" -Headers @{ Authorization = "Bearer $bridgeKey" } -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($bridgePayload))
$bridgeResponse | ConvertTo-Json -Depth 8
