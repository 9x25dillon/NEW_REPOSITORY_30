# Sonic Drifter — install it

Two packages, both built from the same single-file game (`app/sonic-drifter.html`):

| | File | For |
| --- | --- | --- |
| Android | `releases/sonic-drifter.apk` | a phone or tablet, Android 7.0 and later |
| RPM | `releases/sonic-drifter-<version>-1.noarch.rpm` | Fedora or another RHEL-family desktop |

They are committed under `releases/`. Every push that touches the game also
rebuilds them on GitHub Actions (`.github/workflows/packages.yml`) and puts them
on the **`sonic-drifter-latest`** pre-release. The repository is private, so
both places need you to be signed in to GitHub.

## On a phone

1. Open the repository in the GitHub app or in the phone's browser (signed in).
   Go to **Releases → sonic-drifter-latest**, or to `releases/sonic-drifter.apk`
   on the branch, and download the APK.
2. Open the download. Android asks you to allow installing apps from that
   source (the browser, or the GitHub app). Allow it, then **Install**.
3. Play Protect may say it doesn't recognise the developer. That is expected
   for an app that isn't from the Play Store. Choose **Install anyway**.

It runs full screen in landscape and needs no network permission.

- **Touch:** a stick appears wherever your left thumb lands. On the right
  are the pad's four face buttons (THRONE, BUILD, NEXT, BURST), with GRIP
  above them. **Double-tap GRIP to lock it** so your thumb is free to burst,
  and tap it again to let go. ▲ ▼ retune the channel, **II** stops, and
  **LIFT** and **CALL** sit in the upper corners.
- **Xbox controller:** pair it over Bluetooth and it works as it does on the
  desktop. The on-screen buttons hide while a pad is reporting. The pad's
  **B** is kept for the game and never acts as Android's back button.
- **Back gesture:** stops or resumes a run. On the title screen it closes the
  app.
- **Your run is kept:** pausing, switching apps and closing the app all save
  it. Reopen the app and the title offers to go on with it. **Export run**
  (on the title or death screen, or `drifter.exportRun()`) writes a file to
  Downloads, and **Import run** loads one back.

Updates install over the old version without losing a saved run, because every
build is signed with the same sideload key (`packaging/android/sideload.keystore`).
That key is a debug-style key, with password `android`. It is committed on
purpose so any machine can build an update. It is not a store key.

## On a Fedora desktop

```sh
sudo dnf install ./sonic-drifter-0.1.0-1.noarch.rpm
sonic-drifter          # or find it in the applications menu
```

It opens the game as its own window in Chromium or Chrome if one is installed,
and in the default browser otherwise. The Xbox pad works over USB, as before.

## Building them

```sh
# Android: needs node, a JDK, and either an Android SDK (ANDROID_HOME) or
# Debian/Ubuntu's packaged tools:
sudo apt install aapt dalvik-exchange zipalign apksigner android-sdk-platform-23
bash packaging/android/build.sh           # -> releases/sonic-drifter.apk

# RPM: needs node and rpmbuild (dnf install rpm-build, or apt install rpm)
bash packaging/rpm/build.sh               # -> releases/sonic-drifter-*.noarch.rpm
```

There is no Gradle. The app is one Activity and one WebView
(`packaging/android/java/app/sonicdrifter/MainActivity.java`), and `build.sh`
runs the six steps a build system would. The two Android toolchains produce
the same app. It compiles against the oldest platform jar available (API 23 on
the Debian path) and declares targetSdk 34. The Java touches nothing newer
than API 23 by symbol.

The version is `packaging/VERSION`. The Android versionCode is hours since 2000
in UTC, so it only ever goes up.

## Checked

- `test/drifter-phone.browser.mjs` drives the page in Chromium as a
  landscape touch phone. It checks that:
  - the controls appear and the stick moves the pilot;
  - II stops the run and keeps it;
  - after a reload, a tap goes on with the run at the same moment it was saved;
  - with the Android bridge present, export goes through it and back pauses;
  - a desktop gets no buttons.
- The APK passes `apksigner verify` (APK Signature Scheme v2 and v3) and
  `zipalign -c -p 4`. `resources.arsc` is stored and aligned, as Android 11+
  requires for targetSdk 30+.
- `rpm -qip` / `rpm -qlp` show the expected metadata, files and dependencies.

**Not checked:** the APK has not been installed on a physical phone or an
emulator from this environment, which has neither. The first real install is
the first real test. If anything misbehaves, a `drifter.report()` plus an
exported run is the evidence to send.
