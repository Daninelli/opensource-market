# 带重试的 git push
#
# 国内访问 github.com 经常间歇性失败（TCP 重置、连接超时），
# 这个脚本会自动重试，失败间隔逐次拉长，避免手忙脚乱地反复敲命令。
#
# 用法：
#   .\tools\push.ps1                # 普通推送
#   .\tools\push.ps1 -Force         # 改写历史后强制推送（用 --force-with-lease）
#   .\tools\push.ps1 -Retries 10    # 最多重试 10 次

param(
    [int]$Retries = 6,
    [int]$DelaySeconds = 8,
    [switch]$Force
)

$ErrorActionPreference = "Continue"
Set-Location (Split-Path $PSScriptRoot -Parent)

# 确认有东西可推
$branch = git rev-parse --abbrev-ref HEAD
$ahead = [int](git rev-list --count "origin/$branch..$branch" 2>$null)
if ($ahead -eq 0 -and -not $Force) {
    Write-Host "本地与远程已同步，没有需要推送的提交。" -ForegroundColor Green
    exit 0
}

Write-Host "当前分支：$branch，待推送提交：$ahead 个" -ForegroundColor Cyan

$args = @("push", "origin", $branch)
if ($Force) { $args = @("push", "--force-with-lease", "origin", $branch) }

for ($i = 1; $i -le $Retries; $i++) {
    Write-Host ""
    Write-Host "[$i/$Retries] 正在推送..." -ForegroundColor Cyan

    $output = git @args 2>&1
    $code = $LASTEXITCODE
    $output | ForEach-Object { Write-Host "  $_" }

    if ($code -eq 0) {
        Write-Host ""
        Write-Host "推送成功。" -ForegroundColor Green
        exit 0
    }

    # 认证失败 / 被规则拒绝，重试也没用，直接停
    $text = $output -join " "
    if ($text -match "Authentication failed|Invalid username or token|rejected|Push Protection|non-fast-forward") {
        Write-Host ""
        Write-Host "推送被拒绝（认证或规则问题），重试无效，请按上面的提示处理。" -ForegroundColor Red
        exit 1
    }

    if ($i -lt $Retries) {
        $wait = $DelaySeconds * $i
        Write-Host "  网络问题，${wait} 秒后重试..." -ForegroundColor Yellow
        Start-Sleep -Seconds $wait
    }
}

Write-Host ""
Write-Host "重试 $Retries 次仍失败。可以稍后再试，或检查网络/代理设置。" -ForegroundColor Red
exit 1
