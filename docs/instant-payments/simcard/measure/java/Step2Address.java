// Step 2, version 2: an in-process cross-check of covenant addresses, on any Minima jar.
//
// For each script text it computes, with the jar's own classes (no node, no database, no wallet):
//   - the CLEAN form, Contract.cleanScript(text), exactly what `runscript` reports as clean.script;
//   - the address of the clean form, new Address(clean) (the same MMR-root construction `runscript` and a coin's
//     address use), in 0x and Mx form;
//   - the address of the text AS GIVEN (multi-line, real newlines), to show that registering the raw text instead
//     of the clean form would track a different (phantom) address (txn-building laws 2 and 3).
// Run it with the lab node's jar (Minima 1.0.45.15) and with the 1.1.2.6 source-build jar to show the clean form
// and address do not depend on the node version.
// Input: a JSON array of { "name":..., "text":... }. Output: one JSON object on stdout.
import java.nio.file.*;
import org.minima.kissvm.Contract;
import org.minima.objects.Address;
import org.minima.system.params.GlobalParams;
import org.minima.utils.json.*;
import org.minima.utils.json.parser.JSONParser;

public class Step2Address {
    public static void main(String[] a) throws Exception {
        JSONArray in = (JSONArray) new JSONParser().parse(new String(Files.readAllBytes(Paths.get(a[0])), "UTF-8"));
        JSONArray out = new JSONArray();
        for (Object o : in) {
            JSONObject c = (JSONObject) o;
            String text = (String) c.get("text");
            String clean = Contract.cleanScript(text);
            Address ca = new Address(clean);
            Address ra = new Address(text);
            JSONObject r = new JSONObject();
            r.put("name", c.get("name"));
            r.put("cleanChars", clean.length());
            r.put("cleanAddress", ca.getAddressData().to0xString());
            r.put("cleanMxAddress", Address.makeMinimaAddress(ca.getAddressData()));
            r.put("cleanIsFixedPoint", Contract.cleanScript(clean).equals(clean));
            r.put("rawAddress", ra.getAddressData().to0xString());
            r.put("rawDiffersFromClean", !text.equals(clean));
            r.put("clean", clean);
            out.add(r);
        }
        JSONObject res = new JSONObject();
        res.put("minimaVersion", GlobalParams.getFullMicroVersion());
        res.put("results", out);
        System.out.println(res.toJSONString());
    }
}
