// SPHINCS baseline for Phase 1 (Stables payment account).
// Generates a REAL signature with Minima's shipped SPHINCS/FORS/HORST code (org.minima.utils.sphincs, from
// the 1.1.2.6 source build in work/scratch), writes the transaction state variables it produces, and runs
// the shipped KISSVM_SPHINCS_SCRIPT in-process against a synthetic transaction to count instructions.
// Usage: java -cp <minima-nolibs.jar;bcprov.jar;.> SphincsBaseline <inputs> <outputs> <out.json>
import java.io.FileWriter;
import java.util.ArrayList;
import org.minima.kissvm.Contract;
import org.minima.objects.*;
import org.minima.objects.base.*;
import org.minima.utils.sphincs.*;

public class SphincsBaseline {
    public static void main(String[] a) throws Exception {
        int nin = Integer.parseInt(a[0]), nout = Integer.parseInt(a[1]);
        SPHINCS sp = new SPHINCS();
        sp.initSeed(new MiniData("0x5354414245534243"));
        String script = SPHINCSUtils.getKISSVMScript(sp.getPublicKey());
        Transaction txn = new Transaction();
        Witness wit = new Witness();
        Token tok = null;
        for (int i = 0; i < nin; i++) {
            Coin in = new Coin(new MiniData("0x0" + i), new MiniData("0x00"), MiniNumber.ONE, Token.TOKENID_MINIMA, false);
            txn.addInput(in);
            wit.addCoinProof(new CoinProof(in, new org.minima.objects.mmr.MMRProof()));
        }
        for (int i = 0; i < nout; i++) {
            Coin out = new Coin(new MiniData("0xF" + i), new MiniData("0xAA"), MiniNumber.ONE, Token.TOKENID_MINIMA, false);
            txn.addOutput(out);
        }
        MiniData message = SPHINCSUtils.calculateTransactionID(txn);
        SPHINCSSignature sig = sp.signMessage(message);
        SPHINCSUtils.setupTransaction(txn, sig);
        long t0 = System.nanoTime();
        Contract c = new Contract(script, new ArrayList<MiniData>(), wit, txn, new ArrayList<StateVariable>(), false);
        c.setGlobalVariable("@TOTIN", new org.minima.kissvm.values.NumberValue(nin));
        c.setGlobalVariable("@TOTOUT", new org.minima.kissvm.values.NumberValue(nout));
        c.run();
        long t1 = System.nanoTime();
        MiniData hashed = new MiniData(org.minima.utils.Crypto.getInstance().hashData(message.getBytes()));
        StringBuilder sb = new StringBuilder();
        sb.append("{\"inputs\":").append(nin).append(",\"outputs\":").append(nout);
        sb.append(",\"success\":").append(c.isSuccess()).append(",\"instructions\":").append(c.getNumberOfInstructions());
        sb.append(",\"exception\":\"").append(c.getException().replace("\"", "'")).append("\"");
        sb.append(",\"runMicros\":").append((t1 - t0) / 1000);
        sb.append(",\"publicKey\":\"").append(sp.getPublicKey().to0xString()).append("\"");
        sb.append(",\"hashedmessage\":\"").append(hashed.to0xString()).append("\"");
        sb.append(",\"script\":\"").append(script).append("\",\"state\":{");
        boolean first = true; long stateBytes = 0;
        for (StateVariable sv : txn.getCompleteState()) {
            if (!first) sb.append(","); first = false;
            sb.append("\"").append(sv.getPort()).append("\":\"").append(sv.toString()).append("\"");
            String s = sv.toString(); stateBytes += s.startsWith("0x") ? (s.length() - 2) / 2 : s.length();
        }
        sb.append("},\"stateBytes\":").append(stateBytes).append("}");
        try (FileWriter w = new FileWriter(a[2])) { w.write(sb.toString()); }
        System.out.println("success=" + c.isSuccess() + " instructions=" + c.getNumberOfInstructions() + " stateBytes=" + stateBytes + " " + c.getException());
    }
}
