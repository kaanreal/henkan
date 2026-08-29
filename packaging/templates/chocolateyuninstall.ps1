$ErrorActionPreference = 'Stop'

[array]$install = Get-UninstallRegistryKey -SoftwareName 'Henkan*'
if ($install.Count -eq 0) {
  Write-Warning 'Henkan is already uninstalled.'
  return
}
if ($install.Count -ne 1) {
  throw "Expected one Henkan installation but found $($install.Count)."
}

$uninstallString = $install[0].UninstallString
if ($uninstallString -match '^"([^"]+)"') {
  $uninstaller = $Matches[1]
} else {
  $uninstaller = ($uninstallString -split '\s+', 2)[0]
}

Uninstall-ChocolateyPackage `
  -PackageName $env:ChocolateyPackageName `
  -FileType 'exe' `
  -SilentArgs '/S' `
  -File $uninstaller `
  -ValidExitCodes @(0, 3010, 1605, 1614, 1641)
