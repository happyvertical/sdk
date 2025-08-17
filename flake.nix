{
  description = "A Nix-based development environment for the sdk-ts project";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs-22_x
            bun
            # Add other system-level dependencies here if needed
          ];

          shellHook = ''
            export PATH=$PWD/node_modules/.bin:$PATH
          '';
        };
      });
}
