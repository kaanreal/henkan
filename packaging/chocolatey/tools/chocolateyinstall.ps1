$ErrorActionPreference = 'Stop'

$packageArgs = @{
  packageName    = $env:ChocolateyPackageName
  fileType       = 'exe'
  url64bit       = 'https://github.com/kaanreal/henkan/releases/download/v1.7.0/Henkan-v1.7.0-windows-setup.exe'
  checksum64     = 'a988e8ca59c297308226bf3b4f116ffcf2799bcc8ef7ce80be1cf0cffcae61ee'
  checksumType64 = 'sha256'
  softwareName   = 'Henkan*'
  silentArgs     = '/S'
  validExitCodes = @(0, 3010, 1641)
}

Install-ChocolateyPackage @packageArgs
