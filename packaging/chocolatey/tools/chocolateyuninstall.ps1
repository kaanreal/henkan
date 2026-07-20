$ErrorActionPreference = 'Stop'

$packageName = $env:ChocolateyPackageName
$softwareName = 'Henkan*'

[array]$key = Get-UninstallRegistryKey -SoftwareName $softwareName

if ($key.Count -eq 1) {
  $key | ForEach-Object {
    $silentArgs = "$($_.PSChildName) /S"
    if ($_.UninstallString) {
      $silentArgs = "$($_.UninstallString) /S"
    }
    Uninstall-ChocolateyPackage -PackageName $packageName `
                                -FileType 'exe' `
                                -SilentArgs $silentArgs `
                                -ValidExitCodes @(0, 3010, 1605, 1614, 1641)
  }
} elseif ($key.Count -eq 0) {
  Write-Warning "$packageName has been already uninstalled by other means."
} elseif ($key.Count -gt 1) {
  Write-Warning "$key.Count matches found, which will cause issues. Please uninstall manually."
}
