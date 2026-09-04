# Install and verify

## Before you start

- Android 9 or newer.
- Around 500 MB free. The node stores a chain.
- A network you are happy to leave the app on. First sync moves real data.
- **Only one Stables app per device.** Running the standalone app alongside the Core companion, or
  alongside other Minima apps, makes every node on the phone slower.

## 1. Download

Take the file from the [Releases page](https://github.com/StablesCouncil/stables-app/releases) of this
repository and nowhere else.

**Today there is one download: the standalone Android app**, `Stables_v<version>.apk`. It carries
its own Minima node, so it is all you need and there is nothing else to install first.

Two more packages are built from the same source and will appear on the Releases page when each has
been tested to the same standard. They are not there yet, and nothing on the website offers them:

```
StablesCore_v<version>.apk      the companion for an existing Minima Core
Stables_v<version>.mds.zip      the MiniDapp, for a node you already run
```

## 2. Check the file is ours

Every release publishes a SHA-256 for each artifact. Compare before you install.

**Android (Termux):**
```sh
sha256sum Stables_v<version>.apk
```

**Windows (PowerShell):**
```powershell
Get-FileHash .\Stables_v<version>.apk -Algorithm SHA256
```

**macOS or Linux:**
```sh
shasum -a 256 Stables_v<version>.apk
```

If the value does not match the release, stop. Do not install it, and tell us.

### Checking the signature

Every Stables release is signed with the same key. If the signing certificate of a build does not
match the one below, it did not come from us, and Android will refuse to install it over an existing
Stables anyway.

```
Standalone signer SHA-256:
dabb1b2a79b134b6008e6401735d649c140b51f2c4a83eb001b2ffdad5ce5dd4
```

With the Android SDK build tools:
```sh
apksigner verify --print-certs Stables_v<version>.apk
```

The Core companion is signed under its own separate identity; its certificate is published with its
first release.

## 3. Install

Android will ask permission to install an app from outside the Play Store. That permission is granted
to the app you are installing *from* (your browser or file manager), not to us.

1. Open the downloaded `.apk`.
2. Allow installs from that source if prompted.
3. Install, then open Stables.

## 4. First run

The app starts a Minima node and that node has to find the network and catch up. On a first install
this takes a while and the wallet will read `Syncing…` until it has proof of your balances.

The app deliberately shows `Syncing…` rather than `0`. A balance it cannot prove is not shown as
zero, because zero is a claim and the app does not make claims it cannot support.

Leave it running, on a screen you can see, until it settles.

## Updating

Install the newer `.apk` over the top. Your wallet, settings and history are kept.

```sh
adb install -r Stables_v<version>.apk
```

**Do not uninstall to update.** Uninstalling deletes the wallet. If you have not written down your
Vault key, that cannot be undone by anyone, including us.

Close the app before installing an update so the node can shut its database cleanly.

## Moving to another phone

1. On the old phone, open Settings and back up your **Vault key**.
2. Install Stables on the new phone.
3. Restore from the Vault key.
4. Let it sync.

Your coins live on the chain, not in the app. The Vault key is what proves they are yours.

## Uninstalling

Back up your Vault key first if the wallet holds anything you want. Uninstalling removes the wallet
and the local chain data.

## If something goes wrong

| Symptom | What to try |
|---|---|
| Stuck on `Syncing…` for a long time | Check the network. Stop other Minima apps on the phone. Leave the app open and in the foreground. |
| Install refused | You may already have a Stables signed with a different key. Do not uninstall without your Vault key backed up; ask us first. |
| Balances look wrong | Report it with the transaction id and the version from Settings. Do not repeat a transaction to "fix" it. |

Anything involving money that looks wrong: stop, do not retry, and tell us what you saw.
