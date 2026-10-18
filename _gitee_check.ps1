param(
    [string[]]$Names,
    [switch]$WithGitHub
)
$ErrorActionPreference = "Continue"
. "C:\Users\personal\Desktop\opensource-market\_gitee_lib.ps1"
$r = Get-GiteeRepos -Names $Names
foreach ($i in $r) {
    $line = "$($i.full_name) | lang=$($i.language) | stars=$($i.stars) | lic=$($i.license) | pushed=$($i.pushed_at) | forks=$($i.forks) | issues=$($i.open_issues) | url=$($i.url)"
    "----"
    $line
    $d = if ($i.description) { $i.description } else { "" }
    if ($d.Length -gt 300) { $d = $d.Substring(0,300) }
    "DESC: $d"
    if ($WithGitHub -and $i.full_name -and $i.stars) {
        $gh = Get-GitHubRepo -FullName $i.full_name
        if ($gh) { "GH: stars=$($gh.stars) lic=$($gh.license) branch=$($gh.branch) url=$($gh.url)" } else { "GH: none" }
    }
}
