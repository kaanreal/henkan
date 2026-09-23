{
  appimageTools,
  fetchurl,
  lib,
}:

let
  pname = "henkan";
  version = "1.7.0";
  src = fetchurl {
    url = "https://github.com/kaanreal/henkan/releases/download/v${version}/Henkan-v${version}-linux.AppImage";
    hash = "sha256-YrjNn2muIUJdZYSCYkVchllXSDDxKhO2xtvHz+LE/YY=";
  };
  appimageContents = appimageTools.extract { inherit pname version src; };
in
appimageTools.wrapType2 {
  inherit pname version src;

  extraInstallCommands = ''
    install -Dm644 ${appimageContents}/usr/share/applications/Henkan.desktop \
      $out/share/applications/henkan.desktop
    substituteInPlace $out/share/applications/henkan.desktop \
      --replace-fail "Exec=henkan" "Exec=$out/bin/henkan"

    for icon in ${appimageContents}/usr/share/icons/hicolor/*/apps/henkan.png; do
      destination="''${icon#${appimageContents}/}"
      install -Dm644 "$icon" "$out/$destination"
    done
  '';

  meta = {
    description = "osu!mania to Etterna and StepMania converter";
    homepage = "https://henkan.kaan.moe/";
    downloadPage = "https://github.com/kaanreal/henkan/releases";
    license = lib.licenses.mit;
    sourceProvenance = with lib.sourceTypes; [ binaryNativeCode ];
    platforms = [ "x86_64-linux" ];
    mainProgram = "henkan";
  };
}
