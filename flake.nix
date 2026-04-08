{
  description = "Tauri v2 todo app with embedded SurrealDB (SurrealKV) – Nix dev shell and package build";

  # ── Inputs ─────────────────────────────────────────────────────────────────
  inputs = {
    # Use unstable for the freshest packages; pin to a tag for reproducibility.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # fenix – Rust toolchain provider (replaces rust-overlay).
    # Supports fromToolchainFile and Android cross-compilation std libs.
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Crane – ergonomic Cargo build helpers (dependency caching, clippy, fmt …).
    crane.url = "github:ipetkov/crane";

    # Iterate over all default systems (x86_64-linux, aarch64-linux,
    # x86_64-darwin, aarch64-darwin).
    flake-utils.url = "github:numtide/flake-utils";
  };

  # ── Outputs ─────────────────────────────────────────────────────────────────
  outputs = { self, nixpkgs, fenix, crane, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          # android_sdk.accept_license and allowUnfree are required for the
          # Android SDK / NDK and tools such as android-studio.
          config.allowUnfree = true;
          config.android_sdk.accept_license = true;
        };

        # ── Rust toolchains ─────────────────────────────────────────────────
        fenixPkgs = fenix.packages.${system};

        # Host-only toolchain for the stable channel declared in
        # rust-toolchain.toml. We compose explicit components from fenix's
        # pinned stable artifacts to keep evaluation fully pure.
        rustToolchainHost = fenixPkgs.combine [
          fenixPkgs.stable.cargo
          fenixPkgs.stable.clippy
          fenixPkgs.stable.rust-src
          fenixPkgs.stable.rustc
          fenixPkgs.stable.rustfmt
          fenixPkgs.stable.rust-analyzer
        ];

        # Full dev-shell toolchain: host components + Android cross-std libs.
        # The extra Android targets are ignored by crane but let  cargo build
        # --target aarch64-linux-android  work inside the dev shell.
        rustToolchainFull = fenixPkgs.combine [
          rustToolchainHost
          fenixPkgs.targets.aarch64-linux-android.latest.rust-std
          fenixPkgs.targets.armv7-linux-androideabi.latest.rust-std
          fenixPkgs.targets.i686-linux-android.latest.rust-std
          fenixPkgs.targets.x86_64-linux-android.latest.rust-std
        ];

        craneLib = (crane.mkLib pkgs).overrideToolchain rustToolchainHost;

        # ── Android SDK / NDK ────────────────────────────────────────────────
        androidSdk = (pkgs.androidenv.composeAndroidPackages {
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

        # ── Tauri system dependencies ───────────────────────────────────────
        # These are the C libraries required to compile and run the Tauri
        # WebView window.
        #
        # Linux  – GTK 3, WebKit2GTK 4.1 (used by Tauri v2), libsoup 3, etc.
        # macOS  – Apple SDK frameworks (linked automatically by clang).
        tauriLibs = with pkgs;
          lib.optionals stdenv.isLinux [
            # pkg-config is a build-time tool, kept separate (see nativeBuildInputs)
            openssl
            glib
            gtk3
            libsoup_3
            webkitgtk_4_1
            librsvg
            gdk-pixbuf
            pango
            cairo
            dbus
            # System-tray support (optional; remove if you don't use it)
            libayatana-appindicator
          ]
          ++ lib.optionals stdenv.isDarwin (
            with darwin.apple_sdk.frameworks; [
              WebKit
              AppKit
              CoreServices
              CoreFoundation
              Security
            ]
          );

        # Build-time tools that Cargo / cc need to locate the libraries above.
        tauriNativeBuildInputs = with pkgs;
          lib.optionals stdenv.isLinux [ pkg-config ]
          ++ lib.optionals stdenv.isDarwin [ xcbuild ];

        # ── Frontend build (Vite + TypeScript, via pnpm) ────────────────────
        #
        # Nix sandbox forbids network access in most derivations.  We work
        # around this in two steps:
        #
        #  1. pnpmOfflineCache – Fixed-Output Derivation (FOD) that fetches
        #     all npm packages.  Because it declares an expected hash, Nix
        #     grants it network access.  Update the hash whenever
        #     pnpm-lock.yaml changes (instructions below).
        #
        #  2. frontendDist – regular (sandboxed) derivation that installs
        #     from the offline cache and runs  vite build.
        #
        # ┌──────────────────────────────────────────────────────────────────┐
        # │  HOW TO UPDATE THE PNPM HASH                                     │
        # │                                                                  │
        # │  After changing package.json or pnpm-lock.yaml:                  │
        # │                                                                  │
        # │    nix build .#pnpmOfflineCache 2>&1 \                           │
        # │      | grep 'got:' | awk '{print $2}'                            │
        # │                                                                  │
        # │  Replace the value of pnpmHash below with the output.            │
        # └──────────────────────────────────────────────────────────────────┘
        pnpmHash = pkgs.lib.fakeHash;
        #  ↑ Replace with the real hash once you have run the command above.
        #  Example: "sha256-abc123..."

        pnpmOfflineCache = pkgs.stdenv.mkDerivation {
          pname = "tauri-surrealdb-pnpm-offline-cache";
          version = "0.1.0";
          src = ./.;

          nativeBuildInputs = [ pkgs.nodejs pkgs.pnpm ];

          buildPhase = ''
            export HOME=$TMPDIR
            # Point pnpm at a writeable store path inside the build sandbox.
            pnpm config set store-dir "$TMPDIR/pnpm-store"
            # Download every package declared in pnpm-lock.yaml.
            # Network access is permitted only because this is a FOD.
            pnpm fetch --frozen-lockfile
          '';

          installPhase = ''
            mv "$TMPDIR/pnpm-store" "$out"
          '';

          # Fixed-Output Derivation – opening network access for this step.
          outputHashMode = "recursive";
          outputHashAlgo = "sha256";
          outputHash = pnpmHash;
        };

        # Build the Vite + TypeScript frontend (no network; uses the cache above).
        frontendDist = pkgs.stdenv.mkDerivation {
          pname = "tauri-todo-frontend";
          version = "0.1.0";
          src = ./.;

          nativeBuildInputs = [ pkgs.nodejs pkgs.pnpm ];

          buildPhase = ''
            export HOME=$TMPDIR
            # Install from the offline cache – no network needed.
            pnpm config set store-dir "${pnpmOfflineCache}"
            pnpm install --offline --frozen-lockfile
            # Build the shared transport package first, then the app.
            pnpm --filter @tauri-surrealdb-starter/transport build
            pnpm --filter tauri-todo build
          '';

          installPhase = ''
            cp -r apps/tauri-todo/dist "$out"
          '';
        };

        # ── Rust / Tauri binary (crane) ─────────────────────────────────────
        #
        # tauri-build (build.rs) reads tauri.conf.json and embeds the
        # compiled frontend.  In a Nix sandbox the relative path "../dist"
        # does not exist, so we patch it to the Nix store path of
        # frontendDist before handing the source to crane.
        patchedRustSrc = pkgs.runCommand "tauri-todo-rust-src-patched" {
          nativeBuildInputs = [ pkgs.jq ];
        } ''
          cp -r ${./apps/tauri-todo/src-tauri} "$out"
          chmod -R u+w "$out"
          jq --arg dist "${frontendDist}" \
            '.build.frontendDist = $dist' \
            "$out/tauri.conf.json" > "$out/tauri.conf.json.tmp"
          mv "$out/tauri.conf.json.tmp" "$out/tauri.conf.json"
        '';

        # Arguments shared between buildDepsOnly and buildPackage.
        commonArgs = {
          src = patchedRustSrc;
          strictDeps = true;
          buildInputs = tauriLibs;
          nativeBuildInputs = tauriNativeBuildInputs;
        };

        # Pre-build all Cargo dependencies and cache them.
        # Subsequent rebuilds (when only app code changes) skip this step.
        cargoArtifacts = craneLib.buildDepsOnly commonArgs;

        # The final desktop binary.
        tauri-todo = craneLib.buildPackage (commonArgs // {
          inherit cargoArtifacts;
          # Build only the desktop binary target; the `lib` crate-type is used
          # for mobile (iOS/Android) and does not produce a standalone binary.
          cargoExtraArgs = "--bin tauri-todo";
        });

      in
      {
        # ── Packages ─────────────────────────────────────────────────────────
        #
        #   nix build              →  build the desktop binary
        #   nix build .#frontend   →  build only the Vite frontend
        #   nix build .#pnpmOfflineCache  →  fetch pnpm deps (for hash update)
        packages = {
          inherit tauri-todo frontendDist pnpmOfflineCache;
          default = tauri-todo;
        };

        # ── Checks ───────────────────────────────────────────────────────────
        #
        #   nix flake check        →  run all checks below
        checks = {
          # Ensure the binary compiles.
          build = tauri-todo;

          # Lint with Clippy (warnings become errors in CI).
          clippy = craneLib.cargoClippy (commonArgs // {
            inherit cargoArtifacts;
            cargoClippyExtraArgs = "--all-targets -- --deny warnings";
          });

          # Ensure all Rust code is correctly formatted.
          fmt = craneLib.cargoFmt {
            src = patchedRustSrc;
          };
        };

        # ── Development shell ─────────────────────────────────────────────────
        #
        #   nix develop            →  enter the shell manually
        #   direnv allow           →  auto-enter via .envrc (requires nix-direnv)
        #
        # Inside the shell you can use all standard commands:
        #   pnpm install && pnpm tauri:dev       (desktop)
        #   pnpm tauri android init              (first-time Android setup)
        #   pnpm tauri android dev               (Android emulator / device)
        devShells.default = pkgs.mkShell {
          packages = [
            # Rust toolchain with Android cross-compilation std libs
            rustToolchainFull
            # JavaScript toolchain
            pkgs.nodejs
            pkgs.pnpm
            pkgs.bun
            pkgs.typescript-language-server
            # Android toolchain
            androidSdk
            pkgs.jdk
            pkgs.android-studio
            # Handy Cargo extras
            pkgs.cargo-edit   # cargo add / cargo upgrade
            pkgs.cargo-watch  # cargo watch -x check
            # Miscellaneous dev tools
            pkgs.claude-code
            pkgs.curl
            pkgs.wget
          ] ++ tauriLibs ++ tauriNativeBuildInputs;

          # Expose Tauri's GTK/WebKit libs to the dynamic linker (Linux only).
          LD_LIBRARY_PATH = pkgs.lib.optionalString pkgs.stdenv.isLinux
            "${pkgs.lib.makeLibraryPath tauriLibs}:$LD_LIBRARY_PATH";

          # Required for GTK apps to find icon themes and GSettings schemas.
          XDG_DATA_DIRS = pkgs.lib.optionalString pkgs.stdenv.isLinux
            "${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS";

          # Android SDK / NDK locations consumed by Tauri and Gradle.
          ANDROID_HOME = "${androidSdk}/libexec/android-sdk";
          NDK_HOME = "${androidSdk}/libexec/android-sdk/ndk/26.3.11579264";
          GRADLE_OPTS = "-Dorg.gradle.project.android.aapt2FromMavenOverride=${androidSdk}/libexec/android-sdk/build-tools/35.0.0/aapt2";

          shellHook = ''
            echo ""
            echo "🦀  Tauri SurrealDB Starter – Nix dev shell"
            echo "────────────────────────────────────────────"
            echo "  pnpm install             install / sync JS dependencies"
            echo "  pnpm tauri:dev           start Vite dev server + Tauri window"
            echo "  pnpm tauri:build         build production desktop app bundle"
            echo "  pnpm tauri android init  initialise the Android project (once)"
            echo "  pnpm tauri android dev   run on Android device / emulator"
            echo "  cargo check              quick Rust type-check (from src-tauri/)"
            echo "  cargo clippy             lint Rust code"
            echo "  nix flake check          run all Nix checks (build + clippy + fmt)"
            echo ""
          '';
        };
      }
    );
}

