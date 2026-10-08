// In-process KISS runner for Phase 1 cost proofs (Stables payment account).
//
// runscript cannot evaluate transaction functions (VERIFYOUT, GETINADDR, GETINID, @TOTIN...) because it runs
// on an empty transaction. This harness runs the SAME Contract class, from the lab node's own jar
// (DevNodesSet/9101/minima.jar, Minima 1.0.45.15), against a synthetic transaction built from a JSON spec,
// exactly as TxPoWChecker does per input (new Contract per input, setGlobals, run).
//
// It starts no node, opens no database and touches no wallet: it only instantiates value objects.
//
// Input: a JSON array of cases, each
//   { "name":..., "script":..., "input":0, "block":2340000,
//     "state":{"port":"value"},
//     "inputs":[{"coinid":"0x..","address":"0x..","amount":"1","tokenid":"0x00","storestate":true,"state":{..},"created":2339000}],
//     "outputs":[{"address":"0x..","amount":"1","tokenid":"0x00","storestate":false}],
//     "signatures":["0x<pubkey>"] }
// Output: a JSON array of { name, success, instructions, exception, monotonic } on stdout.
import java.nio.file.*;
import java.util.*;
import org.minima.kissvm.Contract;
import org.minima.objects.*;
import org.minima.objects.base.*;
import org.minima.utils.json.*;
import org.minima.utils.json.parser.JSONParser;

public class KissRun {
    static Token token(String id) {
        // scale 0: raw amount == token units, so VERIFYOUT/@AMOUNT read the same numbers the spec gives
        return new Token(new MiniData(id), MiniNumber.ZERO, new MiniNumber("1000000000000"), new MiniString("t"), new MiniString("RETURN TRUE"));
    }
    static Coin coin(JSONObject c, boolean isInput) {
        String tok = (String) c.getOrDefault("tokenid", "0x00");
        Coin cc = new Coin(new MiniData((String) c.getOrDefault("coinid", "0x00")), new MiniData((String) c.get("address")),
                new MiniNumber((String) c.get("amount")), new MiniData(tok), Boolean.TRUE.equals(c.get("storestate")));
        if (!tok.equals("0x00")) cc.setToken(token(tok));
        if (c.containsKey("created")) cc.setBlockCreated(new MiniNumber(String.valueOf(c.get("created"))));
        if (c.containsKey("state")) {
            ArrayList<StateVariable> st = new ArrayList<>();
            JSONObject s = (JSONObject) c.get("state");
            for (Object k : s.keySet()) st.add(new StateVariable(Integer.parseInt((String) k), (String) s.get(k)));
            cc.setState(st);
        }
        return cc;
    }
    public static void main(String[] a) throws Exception {
        JSONArray cases = (JSONArray) new JSONParser().parse(new String(Files.readAllBytes(Paths.get(a[0])), "UTF-8"));
        JSONArray out = new JSONArray();
        for (Object o : cases) {
            JSONObject c = (JSONObject) o;
            Transaction txn = new Transaction();
            Witness wit = new Witness();
            for (Object ws : (JSONArray) c.getOrDefault("witnessScripts", new JSONArray())) wit.addScript(new ScriptProof((String) ws));
            JSONObject st = (JSONObject) c.getOrDefault("state", new JSONObject());
            // optional real Minima signature (TreeKey) over a state value, e.g. a vendor certificate
            if (c.containsKey("treekey")) {
                JSONObject tk = (JSONObject) c.get("treekey");
                org.minima.objects.keys.TreeKey key = org.minima.objects.keys.TreeKey.createDefault(new MiniData((String) tk.get("seed")));
                String data = (String) st.get(String.valueOf(tk.get("dataPort")));
                org.minima.objects.keys.Signature sig = key.sign(new MiniData(data));
                st.put(String.valueOf(tk.get("pkPort")), key.getPublicKey().to0xString());
                st.put(String.valueOf(tk.get("sigPort")), MiniData.getMiniDataVersion(sig).to0xString());
                // copy [inputIndex, port, fromTxnPort] into input coins' stored state (they pin these ports)
                for (Object cs : (JSONArray) tk.getOrDefault("copyState", new JSONArray())) {
                    JSONArray t = (JSONArray) cs; st.put(String.valueOf(t.get(0)), st.get(String.valueOf(t.get(1))));
                }
                for (Object cp : (JSONArray) tk.getOrDefault("copy", new JSONArray())) {
                    JSONArray t = (JSONArray) cp;
                    JSONObject ps = (JSONObject) ((JSONObject) ((JSONArray) c.get("inputs")).get(((Number) t.get(0)).intValue())).get("state");
                    ps.put(String.valueOf(t.get(1)), st.get(String.valueOf(t.get(2))));
                }
            }
            ArrayList<Coin> ins = new ArrayList<>();
            for (Object i : (JSONArray) c.getOrDefault("inputs", new JSONArray())) {
                Coin cc = coin((JSONObject) i, true); ins.add(cc); txn.addInput(cc);
                // GETINID and friends read the witness coin proofs, as on chain; the MMR proof content is not
                // consulted by the script (it is checked separately by the node), so an empty proof suffices here
                wit.addCoinProof(new CoinProof(cc, new org.minima.database.mmr.MMRProof()));
            }
            for (Object i : (JSONArray) c.getOrDefault("outputs", new JSONArray())) txn.addOutput(coin((JSONObject) i, false));
            for (Object k : st.keySet()) txn.addStateVariable(new StateVariable(Integer.parseInt((String) k), (String) st.get(k)));
            int input = ((Number) c.getOrDefault("input", 0L)).intValue();
            ArrayList<MiniData> sigs = new ArrayList<>();
            for (Object s : (JSONArray) c.getOrDefault("signatures", new JSONArray())) sigs.add(new MiniData((String) s));
            Coin me = ins.get(input);
            ArrayList<StateVariable> prev = me.getState();
            String script = (String) c.get("script");
            Contract ct = new Contract(script, sigs, wit, txn, prev, false);
            long block = ((Number) c.getOrDefault("block", 2340000L)).longValue();
            ct.setGlobals(new MiniNumber(block), new MiniNumber(System.currentTimeMillis()), txn, input,
                    me.getBlockCreated() == null ? new MiniNumber(block - 10) : me.getBlockCreated(), script);
            ct.run();
            JSONObject r = new JSONObject();
            r.put("name", c.get("name"));
            r.put("success", ct.isSuccess());
            r.put("instructions", ct.getNumberOfInstructions());
            r.put("exception", ct.getException());
            r.put("monotonic", ct.isMonotonic());
            out.add(r);
        }
        System.out.println(out.toJSONString());
    }
}
