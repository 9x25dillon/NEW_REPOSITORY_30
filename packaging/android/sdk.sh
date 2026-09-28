#!/usr/bin/env bash
# packaging/android/sdk.sh — just enough Android SDK to run build.sh.
#
# One platform (android.jar) and one build-tools (aapt2, d8, zipalign,
# apksigner), fetched with Google's own command-line tools into $ANDROID_HOME
# (default ~/android-sdk). Nothing else: no emulator, no Gradle, no NDK.
# Running it by hand means accepting the SDK licences, which it does with `yes`.

set -euo pipefail
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
PLATFORM="${ANDROID_PLATFORM:-android-34}"
BUILD_TOOLS="${ANDROID_BUILD_TOOLS_VERSION:-34.0.0}"
TOOLS_ZIP="commandlinetools-linux-11076708_latest.zip"

mkdir -p "$SDK/cmdline-tools"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/tools.zip" "https://dl.google.com/android/repository/$TOOLS_ZIP"
  python3 -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$tmp/tools.zip" "$tmp"
  rm -rf "$SDK/cmdline-tools/latest"
  mv "$tmp/cmdline-tools" "$SDK/cmdline-tools/latest"
  chmod +x "$SDK/cmdline-tools/latest/bin/"*
  rm -rf "$tmp"
fi
yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" --licenses >/dev/null || true
"$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="$SDK" "platforms;$PLATFORM" "build-tools;$BUILD_TOOLS"
chmod +x "$SDK/build-tools/$BUILD_TOOLS/"* 2>/dev/null || true
echo "ANDROID_HOME=$SDK"
