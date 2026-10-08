// Step 2 (Instant payments): the size a Minima signature adds to a transaction, measured in-process.
//
// The size tool may not sign (txnsign is forbidden in these dry runs), so the one signature a withdrawal carries
// (the dedicated withdrawal key) and the one a load carries (the Savings wallet key) are measured here instead:
// a default TreeKey (64 keys x 3 levels, as the wallet creates) signs a 32-byte transaction id, the signature is
// added to an empty Witness, and the serialised Witness is compared with the empty one. The node's own classes
// (DevNodesSet/9101/minima.jar, Minima 1.0.45.15) do the serialising. No node, database or wallet is touched: the
// key comes from a fixed test seed and exists only in memory.
// Output: one JSON object on stdout.
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import org.minima.objects.Witness;
import org.minima.objects.base.MiniData;
import org.minima.objects.keys.Signature;
import org.minima.objects.keys.TreeKey;

public class Step2SigSize {
    static int size(Witness w) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        DataOutputStream dos = new DataOutputStream(bos);
        w.writeDataStream(dos);
        dos.flush();
        return bos.size();
    }
    public static void main(String[] a) throws Exception {
        long t0 = System.nanoTime();
        TreeKey key = TreeKey.createDefault(new MiniData("0x5354424C45535354455032"));
        long t1 = System.nanoTime();
        MiniData txnid = new MiniData("0x" + "AB".repeat(32));
        Signature sig = key.sign(txnid);
        long t2 = System.nanoTime();
        boolean ok = key.verify(txnid, sig);
        Witness empty = new Witness();
        Witness one = new Witness();
        one.addSignature(sig);
        int e = size(empty), o = size(one);
        int raw = MiniData.getMiniDataVersion(sig).getLength();
        System.out.println("{\"keysPerLevel\":" + key.getSize() + ",\"levels\":" + key.getDepth()
                + ",\"signatureProofs\":" + sig.getAllSignatureProofs().size()
                + ",\"signatureBytes\":" + raw + ",\"witnessEmptyBytes\":" + e + ",\"witnessWithOneSignatureBytes\":" + o
                + ",\"addedByOneSignature\":" + (o - e) + ",\"verifies\":" + ok
                + ",\"keygenMs\":" + ((t1 - t0) / 1000000) + ",\"signMs\":" + ((t2 - t1) / 1000000) + "}");
    }
}
