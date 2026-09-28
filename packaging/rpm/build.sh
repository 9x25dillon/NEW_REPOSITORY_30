#!/usr/bin/env bash
# packaging/rpm/build.sh — Sonic Drifter as a noarch RPM.
#
# Output: releases/sonic-drifter-<version>-1.noarch.rpm
# Needs: node and rpmbuild (Fedora: dnf install rpm-build; Debian/Ubuntu: apt install rpm).

set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
VERSION="${VERSION_NAME:-$(tr -d '[:space:]' < "$root/packaging/VERSION")}"
top="$(mktemp -d)"
trap 'rm -rf "$top"' EXIT
mkdir -p "$top/SOURCES" "$root/releases"

( cd "$root" && node app/build-drifter.mjs )
cp "$root/app/sonic-drifter.html" "$here/sonic-drifter.sh" "$here/sonic-drifter.desktop" \
   "$here/sonic-drifter.svg" "$top/SOURCES/"

rpmbuild -bb "$here/sonic-drifter.spec" \
  --define "_topdir $top" \
  --define "pkgversion $VERSION" \
  --define "dist %{nil}" \
  --define "_binary_payload w9.xzdio"

find "$top/RPMS" -name '*.rpm' -exec cp {} "$root/releases/" \;
ls -l "$root"/releases/*.rpm
