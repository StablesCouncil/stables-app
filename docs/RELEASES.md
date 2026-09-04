# Releases

## Version numbers

```
v0.0.11.53
  │ │  │ └── iteration: increments on every build that changes the app
  │ │  └──── line
  └─┴─────── generation
```

Every build that changes the application increments the iteration. There is no such thing as two
different builds carrying the same version, so a version identifies exactly one artifact.

The Android `versionCode` is derived from the same number (`0.0.11.53` becomes `11053`), so the two
identities cannot disagree.

## Artifact names

These are the names each build is given. **A release carries only the artifacts it actually
published**, which today is the standalone app alone.

```
Stables_v<version>.apk          standalone Android, embedded node
StablesCore_v<version>.apk      Android companion for an existing Minima Core
Stables_v<version>.mds.zip      MiniDapp package
```

The git tag is `app-v<version>`; the asset file is `Stables_v<version>.apk`. They differ on purpose.

## What is published today

The current release is the **standalone Android app only**. The Council decided on 2026-09-03 to
release it first, on its own, rather than hold it for a coordinated set. The MiniDapp package and
the Minima Core companion follow one at a time, each when it has been tested to the same standard;
until then they are not on the Releases page and the website says so.

## What every release publishes

- the artifacts it actually contains, named exactly as above;
- a SHA-256 for each;
- release notes covering what changed;
- the scope that was tested, and what was not.

Verify the checksum before installing. [How](INSTALL.md).

## Signing

Releases are signed with a permanent key. The standalone signing certificate is:

```
dabb1b2a79b134b6008e6401735d649c140b51f2c4a83eb001b2ffdad5ce5dd4
```

The Core companion is signed with the same key, so one certificate identifies every Stables app.

Android refuses to install a build signed with a different key over an existing install. That is the
protection working: an impostor build cannot replace your wallet app.

## Updating

Install the newer artifact over the top. Never uninstall to update; that deletes the wallet.

The app can check a manifest at `https://stablescouncil.org/releases/android-update.json` and tell you
a newer version exists. It verifies the package, hash, signer and versionCode of what it is told
about before offering it, and it installs nothing without you.

## Coordinated set

Web, MiniDapp, standalone Android and the Core companion publish as **one version set**. A partial set
is not published, and all four report the same version.

## Before a release is produced

Each build must pass, on the exact source being released: the interface contract, a runtime audit of
every page at four widths, capability parity between mobile and desktop, the page map, the mobile
behaviour contract, four-platform source parity, Android unit tests, lint, a signed build, and
signature verification. A build that fails any of them is not released.
