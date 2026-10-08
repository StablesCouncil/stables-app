package org.stables.host;

import java.util.Arrays;
import java.util.List;

/**
 * Value accounting across a set of cards, read only through GET_STATE (what any phone can read).
 *
 * total = every balance + value in flight, per currency slot, where in flight means (0c.2 invariant 1):
 *  - a committed transfer still PENDING in a payer's ring and not credited by its receiver (a receiver's credit log
 *    and, for receive tickets, its ticket log record which transfer credited what, so a transfer that lost the nonce
 *    to another one counts as in flight);
 *  - defunded value (the chain currency only): what the chain has paid the chip's owner, plus what posting the vouchers
 *    the chip still holds can still claim (ChainModel.recoverable). A voucher the chain can no longer accept is not
 *    counted, so value stranded by out-of-order posting shows as a loss (gap fix 2026-09-29).
 */
public final class Audit {
    private Audit() { }

    public static final class Total {
        public long balances, inFlight, vouchers;
        public long total() {
            return balances + inFlight + vouchers;
        }
        public String toString() {
            return String.format("balances %s + in flight %s + vouchers %s = %s", Hex.units(balances), Hex.units(inFlight),
                Hex.units(vouchers), Hex.units(total()));
        }
    }

    public static Total total(List<Card> cards, int slot) {
        Total t = new Total();
        byte[] token = Lab.token(slot);
        for (Card c : cards) {
            t.balances += c.balance(slot);
            for (Card.Pending p : c.pendings()) {
                if (p.status != 1) {
                    continue;
                }
                byte[] w = p.wire;
                if (!Arrays.equals(Hex.sub(w, Wire.X_TOKEN, 32), token)) {
                    continue;
                }
                if (!creditedBy(cards, w)) {
                    t.inFlight += Wire.amount(w, Wire.X_A);
                }
            }
            if ((c.slot(slot).flags & 0x02) != 0) {
                t.vouchers += ChainModel.recoverable(c, slot) + ChainModel.paid(c);
            }
        }
        return t;
    }

    /** True when the transfer's receiver credited this very transfer. */
    public static boolean creditedBy(List<Card> cards, byte[] transfer) {
        byte[] rid = Hex.sub(transfer, Wire.X_RID, 32);
        for (Card r : cards) {
            if (!Arrays.equals(r.chipId(), rid)) {
                continue;
            }
            long m = Hex.u32(transfer, Wire.X_M);
            if (r.nonce(m)[1] != 1) {
                return false;
            }
            byte[] dig = Hex.sub(Hex.sha256(Wire.body(transfer)), 0, 16);
            for (byte[] e : r.creditLog()) {
                // the first byte of a credit-log nonce flags a ticket credit (gap fix 2026-09-29): compare the low 3
                if ((Hex.u32(e, 0) & 0x00FFFFFFL) == m && Arrays.equals(Hex.sub(e, 4, 16), dig)) {
                    return true;
                }
            }
            for (byte[] d : r.ticketLog()) {
                if (Arrays.equals(d, dig)) {
                    return true;
                }
            }
            return false;
        }
        return false; // receiver not among the cards (for example a phone holding tickets): still in flight
    }
}
