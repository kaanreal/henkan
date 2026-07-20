$ErrorActionPreference = 'Stop'
$url        = '{{INSTALLER_URL}}'
$checksum   = '{{INSTALLER_SHA}}'
$checksumType = 'sha256'
Install-ChocolateyPackage 'henkan' 'exe' '/S' $url -checksum $checksum -checksumType $checksumType
