# CHIP-WITHDRAW-01-R2: builder identity error, retained

Two purpose-created valueless tokens were minted and confirmed on both peers.
The local preflight matched all 63 expected per-input outcomes. Formal sources and
fixtures were frozen, but setup stopped before signing/posting with `Token not found`.

Root cause: the runner took `token.tokenid` from the mint transaction. That object
describes the creation placeholder. Minima derives the spendable token identity
from the created coin. Reading the confirmed minted coin proved the two final
identities differ from the mint transaction's embedded metadata.

The incomplete builder was exported and deleted, never posted. Both entire token
supplies remain untouched. Frozen source bytes, original fixture hashes, commands,
HARD_STOP.json and partial-setup-export.json are preserved.

CHIP-WITHDRAW-01-R3 corrects the identity lookup. It reuses these purpose-created,
unspent supplies and the same simulated-applet signatures, verifies their virgin
coins on both peers, regenerates dependent covenant addresses, then freezes a
fresh experiment identity and changed source hash. No additional mint or funding
is required. This is a builder correction, not a failed signature/covenant result.
