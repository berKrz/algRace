{
  description = "AlgRace";

  inputs = {
    # Pinned to the 26.05 stable release channel.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    # Build the same devShell for every system flake-utils knows about
    # (x86_64-linux, aarch64-linux, x86_64-darwin, aarch64-darwin).
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            # Runtime
            bun
            postgresql_17

            # LSPs
            vtsls
            nil

            # Formatters
            alejandra
          ];
        };
      }
    );
}
