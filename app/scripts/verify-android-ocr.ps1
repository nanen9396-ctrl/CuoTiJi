param(
    [string[]]$PackagePaths = @(
        'android/app/build/outputs/apk/release/app-release.apk',
        'android/app/build/outputs/bundle/release/app-release.aab'
    )
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$appDirectory = Split-Path -Parent $PSScriptRoot
$ocrDirectory = Join-Path $appDirectory 'public/ocr/v1'
$ocrFiles = @(Get-ChildItem -LiteralPath $ocrDirectory -Recurse -File)
if ($ocrFiles.Count -eq 0) { throw 'No prepared OCR assets found. Run pnpm run prepare:ocr first.' }

foreach ($packagePath in $PackagePaths) {
    $absolutePackage = if ([IO.Path]::IsPathRooted($packagePath)) { $packagePath } else { Join-Path $appDirectory $packagePath }
    $prefix = if ([IO.Path]::GetExtension($absolutePackage) -eq '.apk') { 'assets/public/ocr/v1/' } else { 'base/assets/public/ocr/v1/' }
    $archive = [IO.Compression.ZipFile]::OpenRead($absolutePackage)
    try {
        foreach ($ocrFile in $ocrFiles) {
            $relativeName = $ocrFile.FullName.Substring($ocrDirectory.Length + 1).Replace('\', '/')
            $entry = $archive.GetEntry($prefix + $relativeName)
            if ($null -eq $entry) { throw "Missing packaged OCR asset: $prefix$relativeName in $absolutePackage" }
            $inputStream = $entry.Open()
            $hasher = [Security.Cryptography.SHA256]::Create()
            try {
                $actual = [BitConverter]::ToString($hasher.ComputeHash($inputStream)).Replace('-', '')
                $expected = (Get-FileHash -LiteralPath $ocrFile.FullName -Algorithm SHA256).Hash
                if ($actual -ne $expected) { throw "Packaged OCR asset differs: $relativeName in $absolutePackage" }
            } finally {
                $inputStream.Dispose()
                $hasher.Dispose()
            }
        }
        Write-Output "Verified $($ocrFiles.Count) OCR assets byte-for-byte in $absolutePackage"
    } finally {
        $archive.Dispose()
    }
}
