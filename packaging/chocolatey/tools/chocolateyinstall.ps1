$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/kaanreal/henkan/releases/download/v1.7.0/Henkan-v1.7.0-windows-setup.exe'
  checksum64     = '1d85a034422cb4a7cd0486959966a91c126bef249707ac28552bd7c7b854d844'
  checksumType64 = 'sha256'
  softwareName   = 'Henkan*'
  silentArgs     = '/S'
  validExitCodes = @(0, 3010, 1641)
}

Install-ChocolateyPackage @packageArgs
