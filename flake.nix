{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    fenix.url = "github:nix-community/fenix";
    fenix.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      fenix,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          system = system;
          config.allowUnfree = true;
          config.android_sdk.accept_license = true;
        };

        android_sdk =
          (pkgs.androidenv.composeAndroidPackages {
            platformVersions = [ "36" ];
            ndkVersions = [ "26.3.11579264" ];
            includeNDK = true;
            useGoogleAPIs = false;
            useGoogleTVAddOns = false;
            includeEmulator = false;
            includeSystemImages = false;
            includeSources = true;
            buildToolsVersions = [ "35.0.0" ];
          }).androidsdk;

        packages = with pkgs; [
          curl
          wget
          pkg-config

          nodejs_20
          typescript-language-server

          (
            with fenix.packages.${system};
            combine [
              complete.rustc
              complete.cargo
              complete.clippy
              targets.aarch64-linux-android.latest.rust-std
              targets.armv7-linux-androideabi.latest.rust-std
              targets.i686-linux-android.latest.rust-std
              targets.x86_64-linux-android.latest.rust-std
            ]
          )
          rust-analyzer
          openssl_3
          android_sdk
          jdk
          bun
          android-studio
        ];

        libraries = with pkgs; [
          gtk3
          libsoup_3
          webkitgtk_4_1
          cairo
          gdk-pixbuf
          glib
          dbus
          openssl
          librsvg
          cacert
        ];
      in
      {
        devShell = pkgs.mkShell {
          buildInputs = packages ++ libraries;

          LD_LIBRARY_PATH = "${pkgs.lib.makeLibraryPath libraries}:$LD_LIBRARY_PATH";
          XDG_DATA_DIRS = "${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS";
          ANDROID_HOME = "${android_sdk}/libexec/android-sdk";
          NDK_HOME = "${android_sdk}/libexec/android-sdk/ndk/26.3.11579264";
          SSL_CERT_FILE = "${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt";
          GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${android_sdk}/libexec/android-sdk/build-tools/35.0.0/aapt2";
        };
      }
    );
}
