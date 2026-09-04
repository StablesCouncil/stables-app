# Known limitations

Read this before you install. It is the honest list.

## This is a test with valueless assets

Winiwa and xWiniwa have **no value**. They are not backed, not redeemable, and not tradeable. Nothing
in this build should be treated as money, and nothing you do with it should be treated as investing.

## Not included in this build

- **USDw and every stablecoin.** Not issuable, not usable.
- **Trading, orders, liquidity, market pricing.** The venue is not part of this release.
- **Coverage Funds.**
- **The wider Stables economic system**: reserves, collateral, governance, economic operation.
- **Windows, macOS, Linux.** Android only.

Their pages are present and readable so you can see what the product will be. Their operations state
that they activate in a later version and refuse before they can construct a transaction.

## Unfinished or rough

- Several pages are functional test surfaces and still need product, content and visual work.
- The Academy carries topics rather than course material.
- Some pages show demonstration data and say so.

## Things that will affect you day to day

- **Battery.** The app runs a blockchain node. It uses noticeably more battery than an ordinary app,
  and it keeps working while backgrounded. This is being worked on.
- **Time to be ready.** After a period in the background, or after a restart, the node has catching
  up to do before balances can be proved. The app will say `Syncing…` rather than show you a number
  it cannot support.
- **Several Minima nodes on one phone are slow.** If you also run the Minima app or Minima Core, all
  of them compete for the same memory. Prefer one.

## What has and has not been proven

**Exercised on real devices, with valueless assets, and recorded:**
faucet claim, mint, partial burn, full burn, send, receive, refusal on invalid input and insufficient
balance, behaviour when a proof is unavailable, recovery after the app is force-stopped mid-operation,
and reconciliation of balances against a node queried directly.

**Not claimed:**

- no external security audit;
- no independent reproduction by a third party;
- no adversarial testing by anyone outside the project;
- no assessment of suitability for real value;
- no long-run stability evidence;
- the trading and stablecoin design is documented but unproven, and is not in this build.

Where this project says something was observed, it means at the level observed and no further.

## No remote stop

There is no kill switch and no remote pause. If a defect is found, the response is a new version, a
new release here, and a notice asking testers to update. Watch the community channel.

## Reporting

Use the in-app Feedback page or the [community group](https://t.me/stablescommunity). Include the
version from Settings and, for anything involving a transaction, its id. Security issues: read
[SECURITY.md](SECURITY.md) first.
