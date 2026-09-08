# Session handoff — 2026-09-05 (evening)

**This is not `HANDOFF.md`.** That file is the project's standing document: what
SONIC DRIFTER is, the 23 load-bearing rules, what is still unmeasured. It
outlives sessions and it is the one to read first.

This file is smaller and more perishable: what happened in one session, and the
things a next session would otherwise have to re-derive from journals and git.
Everything here was checked at the time of writing. **If it disagrees with the
code or the machine, they are right and this is stale.**

---

## What today was

Two unrelated jobs that happened to share a cause.

The desktop hard-locked on 2026-09-05 at 17:03:37, seven minutes after the last
file was saved and before anything had been committed. So the session opened as
two questions — *where was the work* and *why did the machine die* — and the
second one turned out to be worth more than the first, because the answer was
"nothing on this box was in a position to tell you."

The work was all on disk. Nothing was lost.

---

## Repo state

```
branch    main, level with origin/main
commit    803528a  "the lattice gets a say in what grows, and the kill count
                    was quoting the muzzle"     (pushed 2026-09-05)
tests     306, all passing        (npm test, ~152 s)
typecheck clean                   (npm run typecheck, both tsconfigs)
tree      clean
repo      github.com/9x25dillon/NEW_REPOSITORY_30 — verified PRIVATE, which is
          what config/subject.ts assumes. Check again before that changes.
```

**One stale line:** `HANDOFF.md` says `tests 305`. It is 306. Off by one — a
test was added after that line was written. Worth correcting in passing rather
than trusting.

---

## What shipped in 803528a

Three threads, all from one play report. `HANDOFF.md` carries the durable
versions — rule 22, and two rewritten entries under *What is still open*. Do not
re-derive them from here; this is only the index.

1. **`seatedGroup` / `growable` (`game/body.ts`)** — a square trap net will not
   seat a 3- or 6-fold axis, so a body's effective group is the part of the
   cell's symmetry that also leaves the lattice fixed. Always one of 1, 2, 222,
   4, 422. Growth and walking go through `growable()`; firing keeps the full
   orbit via `shape.lobes()`. **A 622 fires six arms and grows two.**

2. **`dischargesToKill` (`game/run.ts`)** — was quoting damage at the muzzle,
   which lies inside `DEVOUR_REACH`, so it named a price payable only by losing
   the building. Now counted at the edge of safety; a structure that cannot
   outrange the mouth is not counted at all.

3. **Limbs now depend on something** — and the reward was measured, found to
   already exist, and found to be weak (5 of 7 seeds). **An aura was built to
   pay for limbs and the measurement threw it out.** `HANDOFF.md` says in
   capitals not to build it again, and gives the reason that rules out the whole
   family: a merge needs two motifs within `BIND_RADIUS` *of each other*, so
   farming rewards concentration, and any "an arm gathers over a wider area"
   idea is fighting the merge rule.

---

## The machine

This section exists because none of it is in the repo, and the next session will
not find it by reading code.

### The two lockups

| | |
| --- | --- |
| Fri 2026-09-04 02:02:47 | boot `-3`, hard lockup |
| Sat 2026-09-05 17:03:37 | boot `-1`, hard lockup — the one that ended the session |

Both have the same signature: **the journal stops mid-sentence.** No shutdown
sequence, no OOM line, no kernel panic, nothing in `/sys/fs/pstore`, no
coredump. Next boot reported `user-1000.journal corrupted or uncleanly shut
down`. Every other boot back to 2026-08-30 shut down cleanly, so this is a
pattern that started that week, not a standing condition.

Ruled out at the time, with evidence: thermal (62 °C package against a 100 °C
crit, fans normal), disk full (26% of 1.9 T), and disk error (nothing in the
kernel log). **Not** ruled out: memory, and the GPU.

Two suspects remain, and they are roughly equally weighted:

- **i915 on a release-candidate kernel.** The box runs
  `6.19.0-rc6-1-cachyos-rc-lto` — an *rc*, not a release — driving KDE/Wayland
  on the integrated HD 530 of an i7-6700. The display engine is inside the CPU
  package, so an i915 hang is not confined to the compositor. Boot `-1` logged
  `kwin_wayland: atomic commit failed: Device or resource busy` four times, the
  last at 16:55:18 — eight minutes before death — then fifteen rounds of
  `libpng error: Write Error` from `kwin_wayland_wrapper` between 17:01:05 and
  17:01:30.
- **Memory pressure with no relief valve.** At the time of the crash `/tmp` was
  a 48 G tmpfs on a 62 G machine, the only swap was zram with
  `backing_dev = none` (compressed RAM, no path to disk), and *nothing* was
  watching for OOM — `systemd-oomd` inactive, `earlyoom` not installed. In that
  configuration heavy pressure can livelock in page reclaim before the kernel
  OOM killer fires, and a reclaim livelock produces exactly the evidence above:
  a frozen box and an empty log.

### What was changed, and why

All four changes are live and persisted. Backups are dated `*.backup.20260905-*`.

| change | value | why |
| --- | --- | --- |
| `/tmp` | 48 G kept, `+nosuid,nodev` | size is deliberate — the user wants to use this RAM. Only the hardening gap was closed |
| `/mnt/ramdisk` | one line, 16 G, `+nosuid,nodev` | `fstab` had **two conflicting entries** (16 G and 8 G). Nothing on the system references this mount |
| swap | `/swap/swapfile`, 32 G, **pri 10** | zram stays pri 100 and is still used first; disk only catches what would otherwise have nowhere to go. **This is the relief valve** — before it, RAM had no exit |
| `earlyoom` | active, enabled, `-r 3600` | an OOM now kills one process and is **logged**, instead of the box freezing silently |
| `BUILDDIR` | `/tmp/makepkg` | was commented out, so AUR builds were compiling on disk for no reason |

`earlyoom` avoids `init|systemd|kwin_wayland|plasmashell|sddm|sshd|dbus-daemon`
and prefers `firefox|firefox-esr|chromium|node|electron`. It fires only when
free RAM **and** free swap are both under 10%, which with 62 G of each is
genuinely near-death.

**The swapfile is in its own nested btrfs subvolume `/swap`.** That is not
decoration — `snapper`, `snap-pac` and `btrfs-assistant` are all installed, and
btrfs snapshots do not recurse into nested subvolumes, so this is what keeps a
32 G file out of every snapshot. It was created with
`btrfs filesystem mkswapfile`, which makes it NOCOW and uncompressed; btrfs
refuses `swapon` on a file that is either, so a successful `swapon` is itself
the proof.

### What to do if it locks up again

This is the point of the whole exercise. `earlyoom` now writes a memory report
to the journal **every hour**, so there is a trace running up to any future
freeze where before there was nothing.

```sh
journalctl -b -1 -u earlyoom --no-pager | tail -40   # memory, hour by hour, up to the freeze
journalctl --list-boots                              # a boot with no shutdown = hard lockup
journalctl -b -1 -n 50 -o short-precise              # what the last minutes looked like
```

- **If the reports show memory climbing into the freeze** — it was memory. The
  swap tier and `earlyoom` should already have prevented it; if it happened
  anyway, the next lever is shrinking `/tmp` after all.
- **If memory was flat** — memory is cleared and the i915 is the answer. The
  next move is **booting the stable CachyOS kernel instead of the `-rc`**, which
  is the cheapest way to isolate the biggest variable. Keep the rc installed,
  just stop defaulting to it.

---

## Working on this machine

**`sudo` requires a password and there is no TTY in the Claude Code session**, so
root work cannot be run directly. The pattern that works: write the script, then
have the user run it with `pkexec`, which raises a graphical prompt through the
KDE polkit agent that is always running.

```
! pkexec /usr/bin/bash /path/to/script.sh
```

Write those scripts **idempotent, with a backup and a validation step that rolls
back on failure**, because each one costs the user a password prompt and re-runs
are likely. For `fstab` specifically, validate with `findmnt --verify` before
`systemctl daemon-reload`.

---

## First things to do next session

1. **Read `HANDOFF.md` first**, not this file. Especially the 23 rules and
   *What is still open*.
2. `npm test` — expect **306** passing. Correct the `305` in `HANDOFF.md`.
3. Check whether the machine stayed up: `journalctl --list-boots`. A boot with
   no shutdown sequence is another lockup, and the `earlyoom` reports above are
   the first thing to read if so.
4. The game's open questions are all in `HANDOFF.md`. The largest one left is
   the one today did *not* close: **an arm must not be paid in farming, and
   nothing else has been proposed to pay it.** `Cell.ability` is still dropped
   by `structureFrom`, `Cell.blurb` is still shown nowhere, and `aura()` is
   still dead code whose comment disagrees with its body.

---

## Gotchas

- **This file's name collides with `HANDOFF.md`** in the same directory, and
  they differ only by case and an underscore. That is a real hazard for both
  people and tools. Renaming this to `SESSION-2026-09-05.md` would fix it.
- This file is **untracked**. Decide whether it belongs in the repo — much of it
  is about the machine, not the project — or in `.gitignore`.
- `python3 -m http.server` on `app/` must be served **with no-store headers**. A
  plain `http.server` once cost a whole play session debugging code that had
  already been fixed.
