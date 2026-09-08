$files = Get-ChildItem "C:\Users\win10\Desktop\cude.new\app" -Recurse -File -Include *.ts,*.tsx -ErrorAction SilentlyContinue
$found = $false
foreach($f in $files){
    $content = Get-Content $f.FullName -Raw
    $matches = [regex]::Matches($content, 'api[_-]?key\s*[:=]\s*["'']{1}([a-zA-Z0-9_-]{20,})["'']')
    foreach($match in $matches) {
        $value = $match.Groups[1].Value
        # Unit tests intentionally use recognisable fake credentials to verify
        # redaction; they are not deployable secrets.
        if($value -match 'not-a-real|000000|abcdefghijklmnopqrstuvwxyz') { continue }
        $found = $true
        Write-Host "Potential credential-shaped value in: $($f.FullName)"
    }
}
if(-not $found) { Write-Host "No credential-shaped values found in application sources." }
