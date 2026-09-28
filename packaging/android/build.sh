#!/usr/bin/env bash
# packaging/android/build.sh — Sonic Drifter as an installable Android APK.
#
# No Gradle, no Android Studio: the app is one Activity and one WebView, so the
# whole build is the steps a build system would run anyway, in order, where
# they can be read.
#
#   1. bundle the game into one HTML file (app/build-drifter.mjs)
#   2. resources: the icon, the manifest and the game as an asset, linked
#   3. javac: compile MainActivity against a platform android.jar
#   4. dex: turn the classes into classes.dex
#   5. put classes.dex into the APK, zipalign it
#   6. apksigner: sign it with the repo's sideload key
#
# Output: releases/sonic-drifter.apk
#
# TWO TOOLCHAINS, either will do:
#
#   the Android SDK   aapt2 + d8 from $ANDROID_HOME (GitHub's runners have one;
#                     packaging/android/sdk.sh fetches one from Google)
#   Debian / Ubuntu   apt install aapt dalvik-exchange zipalign apksigner
#                     android-sdk-platform-23 — distro builds of the same tools,
#                     for machines that cannot reach Google's SDK host
#
# The app is COMPILED against whichever platform jar is found (API 23 on the
# Debian path) and DECLARES targetSdk 34 either way. The Java touches nothing
# newer than API 23 by symbol — see MainActivity's saveFile — so both paths
# produce the same app.

set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
MIN_SDK=24
TARGET_SDK=34

# versionCode must only ever go up, or a phone refuses the update. Hours since
# 2000 in UTC does that without a counter anybody has to remember.
VERSION_NAME="${VERSION_NAME:-$(tr -d '[:space:]' < "$root/packaging/VERSION")}"
VERSION_CODE="${VERSION_CODE:-$(( ($(date -u +%s) - 946684800) / 3600 ))}"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/android-sdk}}"
BT="$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$BT" ] && [ -x "$BT/aapt2" ] && [ -x "$BT/d8" ]; then
  MODE=sdk
  JAR="$SDK/platforms/$(ls "$SDK/platforms" | sort -V | tail -1)/android.jar"
  ZIPALIGN="$BT/zipalign"; APKSIGNER="$BT/apksigner"
elif command -v aapt >/dev/null && command -v dalvik-exchange >/dev/null \
    && [ -f /usr/lib/android-sdk/platforms/android-23/android.jar ]; then
  MODE=debian
  JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
  ZIPALIGN=zipalign; APKSIGNER=apksigner
else
  echo "no Android toolchain: set ANDROID_HOME, run packaging/android/sdk.sh, or" >&2
  echo "  apt install aapt dalvik-exchange zipalign apksigner android-sdk-platform-23" >&2
  exit 1
fi

out="$root/releases"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out" "$work/assets" "$work/gen" "$work/classes"

echo "== 1. the game"
( cd "$root" && node app/build-drifter.mjs )
cp "$root/app/sonic-drifter.html" "$work/assets/index.html"

echo "== 2. resources ($MODE toolchain, $(basename "$(dirname "$JAR")"))"
if [ "$MODE" = sdk ]; then
  "$BT/aapt2" compile --dir "$here/res" -o "$work/res.zip"
  "$BT/aapt2" link -o "$work/base.apk" -I "$JAR" --manifest "$here/AndroidManifest.xml" \
    --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
    --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
    -A "$work/assets" --java "$work/gen" "$work/res.zip"
else
  # -0 arsc: Android 11+ refuses an app targeting 30+ whose resource table is
  # compressed, and aapt v1 compresses it unless told otherwise.
  aapt package -f -0 arsc -M "$here/AndroidManifest.xml" -S "$here/res" -A "$work/assets" \
    -I "$JAR" -J "$work/gen" -F "$work/base.apk" \
    --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
    --version-code "$VERSION_CODE" --version-name "$VERSION_NAME"
fi

echo "== 3. code"
javac -source 8 -target 8 -Xlint:-options -encoding UTF-8 \
  -bootclasspath "$JAR" -classpath "$JAR" -d "$work/classes" \
  $(find "$here/java" "$work/gen" -name '*.java')

echo "== 4. dex"
if [ "$MODE" = sdk ]; then
  "$BT/d8" --release --min-api "$MIN_SDK" --lib "$JAR" --output "$work" \
    $(find "$work/classes" -name '*.class')
else
  dalvik-exchange --dex --min-sdk-version="$MIN_SDK" --output="$work/classes.dex" "$work/classes"
fi

echo "== 5. assemble"
cp "$work/base.apk" "$work/unsigned.apk"
python3 - "$work/unsigned.apk" "$work/classes.dex" <<'PY'
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "a", zipfile.ZIP_DEFLATED) as z:
    z.write(sys.argv[2], "classes.dex")
PY
"$ZIPALIGN" -f -p 4 "$work/unsigned.apk" "$work/aligned.apk"

echo "== 6. sign"
# A SIDELOAD KEY, not a store key. It is committed on purpose: Android only
# installs an update over an app signed by the same key, so a key that lived on
# one machine would make every build from anywhere else an uninstall-first. It
# protects nothing and is not meant to — the password is "android", as it is
# for the debug key every Android SDK generates. Never publish to a store with it.
ks="$here/sideload.keystore"
if [ ! -f "$ks" ]; then
  keytool -genkeypair -keystore "$ks" -storetype PKCS12 -storepass android -keypass android \
    -alias sonicdrifter -keyalg RSA -keysize 2048 -validity 12000 \
    -dname "CN=Sonic Drifter sideload, O=NEW_REPOSITORY_30" 2>&1 | grep -v "^Picked up" || true
fi
"$APKSIGNER" sign --ks "$ks" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias sonicdrifter --min-sdk-version "$MIN_SDK" \
  --out "$out/sonic-drifter.apk" "$work/aligned.apk" 2>&1 | grep -v "^Picked up" || true
"$APKSIGNER" verify -v "$out/sonic-drifter.apk" 2>&1 | grep -v "^Picked up" | head -6
rm -f "$out/sonic-drifter.apk.idsig"

echo "== releases/sonic-drifter.apk  $(du -h "$out/sonic-drifter.apk" | cut -f1)  version $VERSION_NAME ($VERSION_CODE)"
