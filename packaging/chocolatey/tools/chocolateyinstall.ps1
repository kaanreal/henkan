$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/kaanreal/henkan/releases/download/v1.9.0/Henkan-v1.9.0-windows-setup.exe'
  checksum64     = '7372f521d7ca76caa6768e9f7c15db6d07432d71a98f9e70f701317ff68f99ea'
  checksumType64 = 'sha256'
  softwareName   = 'Henkan*'
  silentArgs     = '/S'
  validExitCodes = @(0, 3010, 1641)
}

Install-ChocolateyPackage @packageArgs
