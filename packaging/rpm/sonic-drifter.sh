#!/bin/sh
# Open Sonic Drifter as its own window.
#
# A Chromium-family browser in --app mode gives a window with no tabs or
# address bar, and it reads the Xbox pad over USB. Anything else falls back to
# the default browser. The page is opened from disk: it needs no network, and
# its saved run lives in that browser's storage for file:// pages.
page=/usr/share/sonic-drifter/sonic-drifter.html
for b in chromium-browser chromium google-chrome-stable google-chrome brave-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    exec "$b" --app="file://$page" "$@"
  fi
done
exec xdg-open "$page"
