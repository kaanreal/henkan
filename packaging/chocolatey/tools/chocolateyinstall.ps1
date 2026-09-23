$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/kaanreal/henkan/releases/download/v1.8.2/Henkan-v1.8.2-windows-setup.exe'
  checksum64     = '4a1b3ae62abf1a78cd35473727c7cd22f050e4105c629874a8fb616d4164ae38'
  checksumType64 = 'sha256'
  softwareName   = 'Henkan*'
  silentArgs     = '/S'
  validExitCodes = @(0, 3010, 1641)
}

Install-ChocolateyPackage @packageArgs
