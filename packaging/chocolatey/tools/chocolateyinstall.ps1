$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/kaanreal/henkan/releases/download/v1.6.1/Henkan-v1.6.1-windows-setup.exe'
  checksum64     = 'c5b5ac615190bbf2b9aee3c331dd62667bd84a933c4ebbc710bd350f16b4265b'
  checksumType64 = 'sha256'
  softwareName   = 'Henkan*'
  silentArgs     = '/S'
  validExitCodes = @(0, 3010, 1641)
}

Install-ChocolateyPackage @packageArgs
