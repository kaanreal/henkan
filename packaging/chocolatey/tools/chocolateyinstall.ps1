$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/kaanreal/henkan/releases/download/v1.8.3/Henkan-v1.8.3-windows-setup.exe'
  checksum64     = 'ab28e7309500fabcd61e0de3be7ce7806490f52a60465f8d009abab769b8401f'
  checksumType64 = 'sha256'
  softwareName   = 'Henkan*'
  silentArgs     = '/S'
  validExitCodes = @(0, 3010, 1641)
}

Install-ChocolateyPackage @packageArgs
