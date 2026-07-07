$ErrorActionPreference = 'Stop'
$url        = '{{MSI_URL}}'
$checksum   = '{{MSI_SHA}}'
$checksumType = 'sha256'
Install-ChocolateyPackage 'henkan' 'msi' '/quiet /norestart' $url -checksum $checksum -checksumType $checksumType
