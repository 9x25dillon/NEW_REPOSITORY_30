# Sonic Drifter, as an RPM for Fedora / RHEL-family desktops.
#
# noarch: the game is one self-contained HTML file with the physics bundled in,
# so the package is that file, a launcher, a menu entry and an icon. Built by
# packaging/rpm/build.sh, which passes the version in.

%{!?pkgversion: %global pkgversion 0.1.0}

Name:           sonic-drifter
Version:        %{pkgversion}
Release:        1%{?dist}
Summary:        An acoustic tweezer you play with one hand
License:        LicenseRef-Proprietary
URL:            https://github.com/9x25dillon/NEW_REPOSITORY_30
BuildArch:      noarch
Source0:        sonic-drifter.html
Source1:        sonic-drifter.sh
Source2:        sonic-drifter.desktop
Source3:        sonic-drifter.svg
Requires:       xdg-utils

%description
You are a nine-micron lipid body in a pair of crossed standing waves at
megahertz, and only the field moves you. Every force is the Gor'kov acoustic
radiation potential, computed live. Gather motifs into chiral crystal cells,
build an organism on the lattice, feed a throne, and fight what you crowned.

Plays with an Xbox controller over USB, or mouse and keyboard. Runs are kept
between sessions in the browser's storage.

%prep

%build

%install
install -Dm0644 %{SOURCE0} %{buildroot}%{_datadir}/sonic-drifter/sonic-drifter.html
install -Dm0755 %{SOURCE1} %{buildroot}%{_bindir}/sonic-drifter
install -Dm0644 %{SOURCE2} %{buildroot}%{_datadir}/applications/sonic-drifter.desktop
install -Dm0644 %{SOURCE3} %{buildroot}%{_datadir}/icons/hicolor/scalable/apps/sonic-drifter.svg

%files
%{_bindir}/sonic-drifter
%dir %{_datadir}/sonic-drifter
%{_datadir}/sonic-drifter/sonic-drifter.html
%{_datadir}/applications/sonic-drifter.desktop
%{_datadir}/icons/hicolor/scalable/apps/sonic-drifter.svg

%changelog
* Mon Sep 28 2026 Sonic Drifter <noreply@example.invalid> - 0.1.0-1
- Saved runs that survive a reload, touch controls, first packaged build.
