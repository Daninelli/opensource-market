param()
$ErrorActionPreference = "Stop"
$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

function Get-GiteeRepos {
    param([string[]]$Names)
    $results = @()
    foreach ($n in $Names) {
        try {
            $r = Invoke-RestMethod -Uri "https://gitee.com/api/v5/repos/$n" -Headers @{"User-Agent"=$ua} -TimeoutSec 30
            $lic = $null
            if ($r.license) { if ($r.license -is [string]) { $lic = $r.license } else { $lic = $r.license.spdx_id; if (-not $lic) { $lic = $r.license.name } } }
            if (-not $lic) { $lic = "UNKNOWN" }
            $results += [pscustomobject]@{
                full_name = $r.full_name
                human_name = $r.human_name
                description = $r.description
                language = $r.language
                stars = $r.stargazers_count
                license = $lic
                pushed_at = $r.pushed_at
                updated_at = $r.updated_at
                open_issues = $r.open_issues_count
                forks = $r.forks_count
                url = $r.html_url
            }
        } catch {
            $results += [pscustomobject]@{ full_name = $n; description = "ERROR: $($_.Exception.Message)" }
        }
    }
    return $results
}

function Get-GitHubRepo {
    param([string]$FullName)
    try {
        $r = Invoke-RestMethod -Uri "https://api.github.com/repos/$FullName" -Headers @{"User-Agent"="dsh-collector"} -TimeoutSec 30
        $lic = $null
        if ($r.license) { if ($r.license -is [string]) { $lic = $r.license } else { $lic = $r.license.spdx_id; if (-not $lic) { $lic = $r.license.name } } }
        return [pscustomobject]@{ stars = $r.stargazers_count; license = $lic; branch = $r.default_branch; url = $r.html_url }
    } catch {
        return $null
    }
}
