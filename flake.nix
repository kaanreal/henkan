{
  description = "Henkan - osu!mania to Etterna and StepMania converter";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
    in {
      packages = forAllSystems (system:
        let pkgs = import nixpkgs { inherit system; };
        in {
          default = pkgs.callPackage ./packaging/nix/package.nix { };
          henkan = pkgs.callPackage ./packaging/nix/package.nix { };
        });

      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.henkan}/bin/henkan";
        };
      });
    };
}
