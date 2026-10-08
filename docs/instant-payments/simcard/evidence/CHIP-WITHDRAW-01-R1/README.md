# CHIP-WITHDRAW-01-R1: preparation stop, retained

The first exploratory preparation stopped on 2026-10-08 because peer 9101 had no
spendable native MINIMA. `tokencreate` refused with `No Minima Coins available!`.
No token was created and no formal withdrawal transaction was posted.

The current applet was compiled afresh and generated cumulative vouchers of 250
and 290 units in jCardSim. A subsequent independent local preflight exercised 63
per-input Minima KISS executions using the node's exact jar and real token scaling:
63 matched their expected outcomes. Maximum execution was 800 instructions.
This is L0 diagnostic evidence, not mainnet settlement or hardware validation.
`local-preflight/results.json` preserves each outcome and trace; commands and the
original preparation stop remain intact.

The founder supplied 0.000001 MINIMA to the isolated lab address. A succeeding run
uses a fresh identity, CHIP-WITHDRAW-01-R2. The runner adds native-input maturity
checks before minting, since Minima token creation requires mature wallet inputs.
The information sought is unchanged: complete cumulative D1/D2 canonical
settlement and explicit, preserved refusal evidence.
