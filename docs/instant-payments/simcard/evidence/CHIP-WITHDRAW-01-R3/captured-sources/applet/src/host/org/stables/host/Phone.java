package org.stables.host;

import java.util.List;

/**
 * What the phones do (chip-balance-design.md 4.1): they only carry bytes. The standard tap, and the documented
 * recovery procedure for a torn tap (3.3), which the tear harness and the relay suite both use.
 */
public final class Phone {
    private Phone() { }

    /** Each chip checks the other's certificate (accepted vendor, vendor signature) and caches its key. */
    public static void introduce(Card a, Card b) {
        a.peer(b.cert());
        b.peer(a.cert());
    }

    /** A complete tap: certificates, HELLO, PAY (commit then emit), CREDIT (commit then emit), ACK. Returns the ACK. */
    public static byte[] tap(Card payer, Card receiver, int slot, long amount) {
        introduce(payer, receiver);
        byte[] hello = receiver.hello(slot);
        byte[] transfer = payer.pay(hello, amount);
        byte[] ack = receiver.credit(transfer);
        payer.ack(ack);
        return ack;
    }

    /**
     * The documented recovery procedure for every transfer still PENDING in the payer's ring (3.3):
     *  1. re-send the same signed bytes (RESEND) to the named receiver; CREDIT credits it once, or re-issues the ACK;
     *  2. if the receiver refuses because the nonce is no longer outstanding, ask it for a CANCEL proof (it retires
     *     the nonce if needed and never credits it afterwards), and give that to the payer (CANCEL restores it);
     *  3. give the ACK to the payer.
     * Returns the number of transfers finished (credited or cancelled).
     */
    public static int recover(Card payer, List<Card> world) {
        int done = 0;
        for (Card.Pending p : payer.pendings()) {
            if (p.status != 1) {
                continue;
            }
            byte[] transfer = payer.resend(Hex.u32(p.wire, Wire.X_N));
            byte[] rid = Hex.sub(transfer, Wire.X_RID, 32);
            Card receiver = null;
            for (Card c : world) {
                if (java.util.Arrays.equals(c.chipId(), rid)) {
                    receiver = c;
                }
            }
            if (receiver == null) {
                continue;
            }
            introduce(payer, receiver);
            byte[] ack;
            try {
                ack = receiver.credit(transfer);
            } catch (Card.Err e) {
                if (e.sw != Card.SW_NONCE_NOT_OUTSTANDING && e.sw != Card.SW_ALREADY_CREDITED
                    && e.sw != Card.SW_REVOKED && e.sw != Card.SW_LIMIT && e.sw != Card.SW_AMOUNT
                    && e.sw != Card.SW_SWAP_UNDERPAID && e.sw != Card.SW_TICKET_LOG_FULL) {
                    throw e;
                }
                payer.cancel(receiver.cancelProof(transfer));
                done++;
                continue;
            }
            payer.ack(ack);
            done++;
        }
        return done;
    }
}
