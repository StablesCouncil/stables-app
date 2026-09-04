# Architecture

## The short version

There is no Stables server. The app on your phone is a complete Minima node, a wallet, and a user
interface. Everything it shows you it read from the chain itself, and everything it does it signed
locally.

```
  ┌──────────────────────────── your phone ────────────────────────────┐
  │                                                                     │
  │   Stables interface  ──private in-app channel──▶  Minima node       │
  │   (one shared UI)                                 (wallet + keys)   │
  │                                                          │          │
  └──────────────────────────────────────────────────────────┼──────────┘
                                                             │
                                                    the Minima network
```

## Why there is no server

A bank you cannot be locked out of cannot have a gatekeeper. If Stables held your keys, or served
your balances from a database, then Stables could freeze you, lose you, or be compelled to. Running
the node on the device removes that possibility rather than promising not to use it.

The consequence is honest and worth stating: **your phone has to do the work.** A node syncs, uses
battery, and needs time after being asleep. We would rather explain that than hide it behind a
server.

## The three applications, one product

The interface is one shared source. It is not rewritten per platform, and a platform never gets a
different set of capabilities; only the shell around it differs.

| Application | Shell | Node |
|---|---|---|
| Stables (standalone) | Android app with an embedded node | Its own, inside the app |
| Stables for Minima Core | Android app, no node, no Internet permission | Your existing Minima Core, over package-scoped messaging you approve |
| Stables MiniDapp | Runs inside a Minima node's MiniDapp host | The node hosting it |

A fourth surface, the web preview, exists for development. It is the same interface again.

Every completed change is applied to the shared source and then synchronized to all of them, and a
parity check refuses to pass if any surface has drifted.

## What the node does

The embedded node is a Minima client node: it follows the chain, holds your coins, and signs. It runs
as an Android foreground service, which is why there is a permanent notification. That notification
is Android telling you the truth: something is running on your behalf.

## How the app knows your balance

It asks the node, and the node answers from proofs it holds. If the node cannot prove a balance, the
app shows `Syncing…` or `Proof unavailable`, never `0`. A missing proof is not the same as no money,
and the app will not enable an action it cannot back.

## Minting and burning xWiniwa

xWiniwa is minted from Winiwa one for one, and burned back one for one, by an on-chain covenant. The
app builds the transaction, the node signs it, the chain settles it. There is no operator in the
path, and no step where Stables could take a different amount than the one you confirmed.

Both directions are proven on-chain in this build with valueless assets.

## What is designed but not in this build

The stablecoin system, the reserves and coverage funds, governance, and the trading venue exist as
protocol design and are not part of this release. Their pages are present and readable; their
operations refuse. When you see a page that says an operation activates in a later version, that is
literally true, and the code refuses before it can construct a transaction.

## Interface rules that are enforced, not intended

A few product rules are checked automatically on every build, because a rule with no check is a note:

- **The app draws its own lists, pickers, confirmations and messages.** No screen hands a decision
  to an operating-system dialog, because an OS surface carries none of the app's language.
- **A confirmation the app cannot draw is answered no.** An irreversible action never proceeds
  because a dialog was unavailable.
- **The accent colour marks the recommended action and nothing else.**
- **Every page works from 320px wide**, at 200% text size, without horizontal scrolling.

These are verified on all 25 pages at four widths before any build is produced.
