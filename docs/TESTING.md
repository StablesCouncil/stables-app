# Testing guide

Thank you for testing. The most useful thing you can do is use the app normally and tell us when
something is confusing, slow, or wrong.

Everything here uses **valueless test assets**. You cannot lose anything of value, and you cannot
gain anything of value.

## Set up

1. Install from [Releases](https://github.com/StablesCouncil/stables-app/releases) and verify the
   checksum ([how](INSTALL.md)).
2. Open the app and let the node sync. This takes a while the first time.
3. **Back up your Vault key** from Settings, even in a test. It builds the habit, and it is the only
   way back into the wallet.

## Worth trying

| # | Try this | Watch for |
|---|---|---|
| 1 | Let it sync from a cold start | How long until balances appear. Does it ever say `0` when it means "not known yet"? |
| 2 | Claim Winiwa from the Faucet | One activity row for one claim. Balance moves once. |
| 3 | Mint xWiniwa from Winiwa | The confirmation says exactly what you are sending and receiving. The result matches. |
| 4 | Burn part of your xWiniwa, then the rest | Balances return to where they started. Rate stays one for one. |
| 5 | Send to yourself, then to someone else | The amount, the address and the confirmation agree. |
| 6 | Receive: show the QR and have someone scan it | The address in the QR is the one on screen. |
| 7 | Force-stop the app mid-operation, reopen it | The operation is not duplicated and is not lost. |
| 8 | Try to send more than you have | It refuses clearly, before anything is signed. |
| 9 | Turn off the network and use the app | It says what it does not know. It does not invent numbers. |
| 10 | Leave it backgrounded for hours, come back | How long before it is usable again. Battery used. |
| 11 | Read every page in the menu | Anything confusing, contradictory, or that looks broken. |
| 12 | Set text size to largest in Android | Anything cut off, overlapping, or unreachable. |
| 13 | Update over the top with a newer release | Wallet, history and settings survive. |

## What we most want to hear

Ranked by how much it helps:

1. **Money that looks wrong.** A balance, fee or amount that disagrees with what you expected.
   Stop, do not retry, send us the transaction id.
2. **Anything that made you unsure whether it worked.**
3. **Anything that lost your place, your input, or your history.**
4. **Wording you had to read twice.**
5. **Slowness and battery**, with a rough sense of how long and how much.
6. Visual problems: cut-off text, overlap, unreadable contrast.

## How to report

In the app: the Feedback page. In the community: [Telegram](https://t.me/stablescommunity).

Please include:

- the version from Settings (for example `v0.0.11.53`);
- your device and Android version;
- what you did, what you expected, what happened;
- a transaction id if money was involved;
- a screenshot if it is visual.

"It felt slow" is a useful report. Do not polish it before sending it.

## Please do not

- Put anything of value into this build.
- Share your Vault key with anyone, including anyone claiming to be us.
- Test findings against another person's wallet.
- Post a security problem publicly before telling us privately ([SECURITY.md](SECURITY.md)).
