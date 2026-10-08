// Governed, purpose-created valueless mainnet experiment. Not an app/vault upgrade.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as B from './balance-baseline-covenants.mjs';
import * as O from './ots.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SIM = path.resolve(HERE, '..');
const RUN = process.env.CHIP_WITHDRAW_RUN || 'CHIP-WITHDRAW-01-R1';
if (!/^CHIP-WITHDRAW-01-R[1-9][0-9]*$/.test(RUN)) throw new Error('Invalid run ID');
const EVID = path.join(SIM, 'evidence', RUN);
const PHASE = process.argv[2];
const FILE = path.join(EVID, 'run-state.json');
const JDK = 'C:/Program Files/Eclipse Adoptium/jdk-17.0.18.8-hotspot/bin';
const JAR = 'C:/Users/Charles/Documents/Crypto/Minima/Nodes/DevNodesSet/9101/minima.jar';
const ORDER = ['setup', 'register', 'fund', 'd1a-refusals', 'd1a', 'd2a-refusals', 'd2a', 'replay', 'd1b', 'd2b', 'close'];
const HONEST = new Set(['setup','register','fund','d1a','d2a','d1b','d2b']);
const ALLOWED = new Set(['status','coins','balance','getaddress','keys','help','runscript','mmrcreate','newscript','tokencreate',
  'txncreate','txninput','txnoutput','txnstate','txnscript','txnsign','txnbasics','txncheck','txnexport','txndelete','txnpost','txpow']);
const sha = x => createHash('sha256').update(x).digest('hex');
const hx = x => '0x' + sha(x).toUpperCase();
const now = () => new Date().toISOString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive:true }); fs.writeFileSync(f, JSON.stringify(v,null,2)); };
let st = fs.existsSync(FILE) ? json(FILE) : null;
const save = () => write(FILE, st);
const note = (message, data={}) => { console.log(now(), PHASE, message, JSON.stringify(data)); };
const be = (v,n) => { let x=BigInt(v);const b=Buffer.alloc(n);for(let i=n-1;i>=0;i--){b[i]=Number(x&255n);x>>=8n;}if(x)throw new Error('Integer overflow');return b; };
const atoms = s => { if(!/^\d+(\.\d{1,8})?$/.test(String(s)))throw new Error('Not an exact 8-decimal amount: '+s); const [a,b='']=String(s).split('.'); return BigInt(a)*100000000n+BigInt(b.padEnd(8,'0')); };
const decimal = n => { const a=BigInt(n); if(a<0n)throw new Error('Negative amount');return (a/100000000n)+'.'+(a%100000000n).toString().padStart(8,'0'); };
const native = s => {const [a,b='']=String(s).split('.');return BigInt(a)*10n**44n+BigInt(b.padEnd(44,'0'));};
const nativeDec = n => {if(n<0n)throw new Error('Negative native');return (n/10n**44n)+'.'+(n%10n**44n).toString().padStart(44,'0');};
const same = (a,b) => String(a).toUpperCase()===String(b).toUpperCase();
const out = (address,amount,tokenid,storestate=false) => ({address,amount,tokenid,storestate});
function redact(v){if(Array.isArray(v))return v.map(redact);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,/^(seed|privatekey|phrase|mnemonic|password)$/i.test(k)?'[REDACTED]':redact(x)]));return v;}

async function rpc(command, port=9105, allowFail=false) {
  const verb=command.trim().split(/\s/)[0];
  if(!ALLOWED.has(verb)||command.includes(';')||/\b(?:mine|auto|txnpostauto|txnpostmine):/i.test(command)) throw new Error('Command outside recipe: '+verb);
  if(port===9205&&!['status','coins','newscript','txpow'].includes(verb))throw new Error('Witness mutation refused');
  if(verb==='keys'&&(PHASE!=='prepare'||command!=='keys action:new'))throw new Error('Key command refused');
  if(verb==='tokencreate'&&PHASE!=='prepare')throw new Error('Mint outside preparation refused');
  if(verb==='txnpost'&&(!HONEST.has(PHASE)||command!==`txnpost id:cw_${PHASE} txndelete:true`))throw new Error('Posting refusal or unknown transaction refused');
  const body=Buffer.from(command);
  const request=Buffer.from(`POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: text/plain\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`);
  let r;
  try {r=await new Promise((resolve,reject)=>{
    const sock=net.connect({host:'127.0.0.1',port}),chunks=[];
    const timer=setTimeout(()=>{sock.destroy();reject(new Error('RPC timeout'));},120000);
    sock.on('connect',()=>{sock.write(request);sock.end(body);});sock.on('data',c=>chunks.push(c));
    sock.on('error',e=>{clearTimeout(timer);reject(e);});sock.on('close',()=>{clearTimeout(timer);try{const t=Buffer.concat(chunks).toString();resolve(JSON.parse(t.slice(t.indexOf('{')).trim()));}catch(e){reject(e);}});
  });} catch(e){fs.appendFileSync(path.join(EVID,'commands.jsonl'),JSON.stringify({at:now(),phase:PHASE,port,command,error:e.message})+'\n');throw e;}
  fs.appendFileSync(path.join(EVID,'commands.jsonl'),JSON.stringify({at:now(),phase:PHASE,port,command,response:redact(r)})+'\n');
  if(!r.status&&!allowFail)throw new Error('RPC refused '+verb+': '+r.error);
  return r;
}
const tip = async port => Number((await rpc('status',port)).response.chain.block);
async function coin(id,port=9105){return (await rpc('coins coinid:'+id,port)).response.find(c=>same(c.coinid,id));}
async function observe(transactionid,startTip,label){
  const began=Date.now();const blocks={};
  while(true){
    const t=await tip(9105);
    if(t>startTip+20||Date.now()-began>1200000)throw new Error('Settlement budget exceeded');
    for(let b=startTip;b<=t;b++){
      const block=(await rpc('txpow block:'+b)).response;
      if(blocks[b]===block.txpowid)continue;blocks[b]=block.txpowid;
      const ids=[block.txpowid,...(block.body.txnlist||[])];
      for(const id of ids){
        const tx=id===block.txpowid?block:(await rpc('txpow txpowid:'+id,9105,true)).response;
        if(!tx||!same(tx.body?.txn?.transactionid,transactionid))continue;
        const a=(await rpc('txpow onchain:'+id)).response;
        const w=(await rpc('txpow onchain:'+id,9205)).response;
        if(!a.found||!w.found||Number(a.confirmations)<1||Number(w.confirmations)<1)continue;
        if(!same(a.blockid,w.blockid)||a.block!==w.block)throw new Error('Canonical disagreement');
        write(path.join(EVID,label+'-canonical.json'),{transactionid,txpowid:id,primary:a,witness:w,transaction:tx,block});
        note('canonical on both peers',{label,block:a.block,txpowid:id});
        return {transactionid,txpowid:id,block:a.block,blockid:a.blockid,outputs:tx.body.txn.outputs};
      }
    }
    note('awaiting canonical transaction',{label,tip:t});await sleep(12000);
    // Rescan the last block: witness visibility can lag after its hash was first seen.
    delete blocks[t];
  }
}
async function clean(script){const r=(await rpc('runscript script:'+JSON.stringify(script))).response;if(!r.parseok)throw new Error('KISS parse failed');return {script:r.clean.script,address:r.clean.address};}
async function track(c){for(const p of [9105,9205])await rpc('newscript trackall:true script:'+JSON.stringify(c.script),p);}
const stateObj = a => Object.fromEntries((a||[]).map(s=>[s.port,String(s.data)]));
function record({k=0,F=0n,u=0,D=0n,status=0}={}){const f=st.fx;return Buffer.concat([O.unhex(f.chipId),O.unhex(f.tree.root.data),O.unhex(f.owner.publickey),O.unhex(f.owner.address),O.unhex(f.vendor.publickey),O.unhex(f.tag),be(k,4),be(F,8),be(u,4),be(D,8),Buffer.alloc(20),be(status,1),Buffer.alloc(4),be(f.tree.root.value,8)]);}
function updated(rec,v){const msg=O.unhex(v.message),D=msg.readBigUInt64BE(4),previous=rec.readBigUInt64BE(208);return {nr:Buffer.concat([rec.subarray(0,204),be(v.keyIndex,4),be(D,8),rec.subarray(216)]),ex:Buffer.concat([Buffer.from([0]),be(D-previous,8)]),y:D-previous};}
function sources(){const files=[fileURLToPath(import.meta.url),path.join(HERE,'balance-baseline-covenants.mjs'),path.join(HERE,'balance-covenants.mjs'),path.join(HERE,'covenants.mjs'),path.join(HERE,'kissgen.mjs'),path.join(HERE,'ots.mjs'),path.join(HERE,'java/KissRunScaled.java'),path.join(SIM,'docs/CHIP-WITHDRAW-01.md'),JAR];
  for(const root of ['applet/src/main','applet/src/host','applet/src/simshim']){function visit(d){for(const p of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,p.name);if(p.isDirectory())visit(f);else if(f.endsWith('.java'))files.push(f);}}visit(path.join(SIM,root));}
  return Object.fromEntries(files.map(f=>[path.relative(SIM,f).replaceAll('\\','/'),sha(fs.readFileSync(f))]));}
function runJava(args,label){const r=spawnSync(path.join(JDK,'java.exe'),args,{encoding:'utf8',maxBuffer:128*1024*1024,cwd:EVID});fs.writeFileSync(path.join(EVID,label+'.stdout.txt'),r.stdout||'');fs.writeFileSync(path.join(EVID,label+'.stderr.txt'),r.stderr||'');if(r.status!==0)throw new Error(label+' Java failed: '+r.stderr);return r.stdout;}
function compile(){
  const app=path.join(SIM,'applet');const runtime=path.join(EVID,'runtime');fs.mkdirSync(runtime,{recursive:true});
  for(const [src,dest,cp] of [['src/simshim','simshim',''],['src/main/javacard','sim-card',path.join(app,'lib/jcardsim-3.0.6.0.jar')],['src/host','host',path.join(app,'lib/jcardsim-3.0.6.0.jar')+';'+path.join(runtime,'sim-card')]]){
    const files=[];function visit(d){for(const p of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,p.name);if(p.isDirectory())visit(f);else if(f.endsWith('.java'))files.push(f);}}visit(path.join(app,src));
    const target=path.join(runtime,dest);fs.mkdirSync(target,{recursive:true});const r=spawnSync(path.join(JDK,'javac.exe'),['--release','11','-encoding','UTF-8',...(cp?['-cp',cp]:[]),'-d',target,...files],{encoding:'utf8'});
    fs.writeFileSync(path.join(EVID,'compile-'+dest+'.txt'),(r.stdout||'')+(r.stderr||''));if(r.status!==0)throw new Error('Compile failed '+dest);
  }
  const replay=path.join(runtime,'replay');fs.mkdirSync(replay,{recursive:true});const r=spawnSync(path.join(JDK,'javac.exe'),['-cp',JAR,'-d',replay,path.join(HERE,'java/KissRunScaled.java')],{encoding:'utf8'});fs.writeFileSync(path.join(EVID,'compile-replay.txt'),(r.stdout||'')+(r.stderr||''));if(r.status!==0)throw new Error('Replay compile failed');
  runJava(['-cp',[path.join(runtime,'simshim'),path.join(app,'lib/jcardsim-3.0.6.0.jar'),path.join(runtime,'sim-card'),path.join(runtime,'host')].join(';'),'org.stables.host.Main','fixtures','chip-fixtures.json'],'simulator-fixtures');
}
async function prepare(){
  if(st)throw new Error('Run already exists');fs.mkdirSync(EVID,{recursive:true});st={runId:RUN,mode:'exploratory preparation',started:now(),completed:[],steps:{},coins:{}};save();
  compile();const f=json(path.join(EVID,'results/chip-fixtures.json')).lx16;
  const ds=f.vouchers.map(v=>O.unhex(v.message).readBigUInt64BE(4).toString());if(ds.join(',')!=='25000000000,29000000000')throw new Error('Applet cumulative fixtures unexpected: '+ds);
  for(const v of f.vouchers){const d=O.sha2(Buffer.concat([Buffer.from([0x44]),O.unhex(f.chipId),O.unhex(v.message)]));if(!same(O.hex(d),v.digest)||!O.lxVerify(O.unhex(v.pk),d,{R:O.unhex(v.R),C:O.unhex(v.C)},{n:16,chunks:5,positions:255}))throw new Error('Applet signature invalid');}
  st.fx={...f,owner:(await rpc('getaddress')).response,vendor:(await rpc('keys action:new')).response,tag:hx(Buffer.from(RUN+' helper tag')),burn:hx(Buffer.from(RUN+' retired marker burn'))};save();
  st.before={primary:(await rpc('status')).response,witness:(await rpc('status',9205)).response,balance:(await rpc('balance')).response};save();
  if(!same(st.before.primary.chain.hash,st.before.witness.chain.hash))throw new Error('Starting tips differ');
  for(const [name,amount,decimals] of [['marker','10',0],['value','1000',8]]){
    const fundingWait=Date.now();
    while(!(await rpc('coins relevant:true sendable:true tokenid:0x00 coinage:3')).response.length){
      if(Date.now()-fundingWait>1200000)throw new Error('No mature native mint input within budget');
      note('waiting for native input maturity',{mint:name});await sleep(12000);
    }
    const t=await tip(9105);const r=(await rpc('tokencreate name:'+JSON.stringify({name:RUN+' '+name,description:'Valueless Minima experiment. No redemption value.'})+' amount:'+amount+' decimals:'+decimals+' burn:0')).response;
    write(path.join(EVID,'mint-'+name+'.json'),r);st.steps['mint-'+name]={posted:true,transactionid:r.body.txn.transactionid};save();
    const c=await observe(r.body.txn.transactionid,t,'mint-'+name);const o=c.outputs.find(x=>x.token);if(!o)throw new Error('No minted token output');
    st.fx[name]=o.token.tokenid;st.coins[name+'Wallet']=o.coinid;st.steps['mint-'+name]={...st.steps['mint-'+name],...c};save();
  }
  const leaves=st.fx.keyPks.map((k,i)=>k+':'+i);st.fx.tree=(await rpc('mmrcreate nodes:'+JSON.stringify(leaves))).response;
  st.scripts={};st.scripts.vault=await clean(B.vaultScript({chip:st.fx.marker,value:st.fx.value}));
  st.scripts.helperBody=await clean(B.helperBody({chip:st.fx.marker}));st.scripts.helper=await clean(B.helperAddressScript(st.fx.tag,st.scripts.helperBody.address));
  st.scripts.account=await clean(B.accountScript({chip:st.fx.marker,value:st.fx.value,vault:st.scripts.vault.address,helperHash:st.scripts.helperBody.address,burn:st.fx.burn}));
  st.scripts.registration=await clean(B.registrationScript({chip:st.fx.marker,account:st.scripts.account.address,vendorKey:st.fx.vendor.publickey}));
  for(const [name,c]of Object.entries(st.scripts)){fs.mkdirSync(path.join(EVID,'kiss'),{recursive:true});fs.writeFileSync(path.join(EVID,'kiss',name+'.kiss'),c.script+'\n');if(name!=='helperBody')await track(c);}
  const natives=(await rpc('coins relevant:true sendable:true tokenid:0x00')).response.filter(c=>native(c.amount)>native('0.00000010'));
  if(!natives.length)throw new Error('No lab native coin for returned helpers');st.fx.nativeInput=natives[0];save();
  note('preparation complete',{cumulativeAtoms:ds,marker:st.fx.marker,value:st.fx.value,addresses:Object.fromEntries(Object.entries(st.scripts).map(([k,v])=>[k,v.address]))});
}
function freeze(){if(!st?.scripts||st.frozen)throw new Error('Preparation incomplete or already frozen');const f={runId:RUN,at:now(),sources:sources(),fx:st.fx,scripts:st.scripts,simulatorFixtureSha256:sha(fs.readFileSync(path.join(EVID,'results/chip-fixtures.json'))),environment:{node:process.version,platform:os.platform(),release:os.release(),cpus:os.cpus().length}};write(path.join(EVID,'fixture-block.json'),f);st.frozen=sha(fs.readFileSync(path.join(EVID,'fixture-block.json')));st.mode='formal evidence';save();note('sources and fixtures frozen',{sha256:st.frozen});}
function checkFrozen(){if(!st?.frozen||st.stopped)throw new Error('Run not frozen or permanently stopped');const f=json(path.join(EVID,'fixture-block.json'));if(sha(fs.readFileSync(path.join(EVID,'fixture-block.json')))!==st.frozen||JSON.stringify(sources())!==JSON.stringify(f.sources)||sha(fs.readFileSync(path.join(EVID,'results/chip-fixtures.json')))!==f.simulatorFixtureSha256)throw new Error('Frozen source/fixture changed');if(ORDER[st.completed.length]!==PHASE)throw new Error('Wrong phase order, expected '+ORDER[st.completed.length]);}
async function d1Spec(which,options={}){const f=st.fx,c=st.coins,v=f.vouchers[which],rec=O.unhex(which===0?st.fundedRecord:st.afterARecord);const a=updated(rec,v);const q=await clean(B.qScript(O.hex(O.sha2(Buffer.concat([a.nr,a.ex]))),st.scripts.account.address,st.scripts.vault.address,f.marker));await track(q);
  const state={9:'2',97:'1',29:String(await tip(9105)),16:v.R,17:v.C,18:v.chunkDigests,19:v.message,27:f.tree.nodes[v.keyIndex].proof};
  if(options.badSecret){const b=O.unhex(state[16]);b[40]^=128;state[16]=O.hex(b);}if(options.badComplement){const b=O.unhex(state[17]);b[33]^=1;state[17]=O.hex(b);}
  const helperGroup=options.helperGroup??which;
  return {inputs:[c.account,...c.helpers.slice(helperGroup*5,helperGroup*5+5)],outputs:[out(options.redirect?qx():q.address,'1',f.marker),...Array.from({length:5},()=>out(f.owner.address,'0.00000001','0x00'))],state,witness:[st.scripts.helperBody.script],q,nr:O.hex(a.nr),ex:O.hex(a.ex),y:decimal(a.y)};
}
const qx=()=>hx(Buffer.from(RUN+' forbidden payout'));
async function d2Spec(which,options={}){const f=st.fx,c=st.coins,d=st.steps[which===0?'d1a':'d1b'].spec;const p=options.overpay?decimal(atoms(d.y)+1n):d.y;const vault=await coin(c.vault);const change=decimal(atoms(vault.tokenamount)-atoms(p)-(options.skim?1n:0n));
  return {inputs:[c.q,c.vault],outputs:[out(st.scripts.account.address,'1',f.marker,true),out(options.redirect?qx():f.owner.address,p,f.value),out(st.scripts.vault.address,change,f.value)],state:{9:'10',29:String(await tip(9105)),120:d.nr,201:d.ex,202:st.scripts.account.address}};
}
function replay(label,row,signers){
  const txn=row.transaction,wit=row.witness;const ss=Object.fromEntries((wit.scripts||[]).map(s=>[String(s.address).toUpperCase(),s.script]));
  const cv=c=>({coinid:c.coinid,address:c.address,amount:String(c.tokenamount??c.amount),tokenid:c.tokenid,scale:Number(c.token?.scale??(same(c.tokenid,st.fx.marker)?44:same(c.tokenid,st.fx.value)?36:0)),storestate:c.storestate===true,state:stateObj(c.state),created:c.created});
  const cases=txn.inputs.map((c,i)=>({name:label+'_in'+i,script:ss[String(c.address).toUpperCase()],input:i,block:Number(st.lastTip),trace:true,state:stateObj(txn.state),inputs:txn.inputs.map(cv),outputs:txn.outputs.map(cv),signatures:signers,witnessScripts:Object.values(ss)}));
  if(cases.some(c=>!c.script))throw new Error('Replay witness script missing');const file=path.join(EVID,label+'-replay-cases.json');write(file,cases);
  const stdout=runJava(['-cp',JAR+';'+path.join(EVID,'runtime/replay'),'KissRunScaled',file],label+'-replay');const result=JSON.parse(stdout.trim().split(/\r?\n/).at(-1));write(path.join(EVID,label+'-replay.json'),result);
  return result.map((r,i)=>({input:i,success:r.success,instructions:r.instructions,exception:r.exception,failedClause:r.success?null:(r.trace.match(/INST\[\d+\] - (ASSERT[^\n]*|RETURN[^\n]*)/g)||[]).at(-1)}));
}
function flags(r){const v=r.response.valid;return {basic:v.basic===true,signatures:Array.isArray(v.signatures)?v.signatures.every(s=>s.valid===true):v.signatures===true,mmrproofs:v.mmrproofs===true,scripts:v.scripts===true};}
async function build(label,spec,{negative=false,expectClause=null}={}){
  const id='cw_'+label;
  const before={};for(const cid of spec.inputs){before[cid]=await coin(cid);if(!before[cid]||before[cid].spent)throw new Error('Input missing/spent');}
  await rpc('txncreate id:'+id);for(const cid of spec.inputs)await rpc('txninput id:'+id+' coinid:'+cid);
  for(const o of spec.outputs)await rpc(`txnoutput id:${id} amount:${o.amount} address:${o.address} tokenid:${o.tokenid} storestate:${o.storestate}`);
  for(const [p,v]of Object.entries(spec.state||{}).sort((a,b)=>Number(a[0])-Number(b[0])))await rpc(`txnstate id:${id} port:${p} value:${v}`);
  let signers=[];if(spec.sign){const r=(await rpc('txnsign id:'+id+' publickey:'+spec.sign)).response;signers=r.keys||[spec.sign];}
  let row=(await rpc('txnbasics id:'+id)).response;
  if(spec.witness){await rpc('txnscript id:'+id+' scripts:'+JSON.stringify(Object.fromEntries(spec.witness.map(s=>[s,'']))));row=(await rpc('txnbasics id:'+id)).response;}
  st.lastTip=await tip(9105);const check=await rpc('txncheck id:'+id);const f=flags(check);const ex=(await rpc('txnexport id:'+id)).response;const hex=ex.data;
  fs.mkdirSync(path.join(EVID,'exports'),{recursive:true});fs.writeFileSync(path.join(EVID,'exports',label+'.hex'),hex);
  const rec={label,spec,before,flags:f,txncheck:check.response,exportSha256:sha(Buffer.from(hex.slice(2),'hex')),exportBytes:(hex.length-2)/2,transactionid:row.transaction.transactionid,posted:false};
  write(path.join(EVID,label+'-builder.json'),{row,signers});rec.attribution=replay(label,row,signers);st.steps[label]=rec;save();
  note('validator',{label,...f,bytes:rec.exportBytes,inputResults:rec.attribution.map(x=>({input:x.input,success:x.success,instructions:x.instructions,failedClause:x.failedClause}))});
  if(negative){
    if(!f.basic||!f.signatures||!f.mmrproofs||f.scripts)throw new Error('Unexpected negative validator result '+label);
    if(expectClause&&!rec.attribution.some(x=>!x.success&&expectClause.test(x.failedClause||'')))throw new Error('Wrong refusal attribution '+label);
    await rpc('txndelete id:'+id);rec.after={};for(const cid of spec.inputs){const a=await coin(cid);const b=await coin(cid,9205);if(!a||a.spent||!b||b.spent)throw new Error('Refusal mutated input or witness lacks it');rec.after[cid]={primary:a,witness:b};}
    rec.deleted=true;write(path.join(EVID,label+'-result.json'),rec);save();return rec;
  }
  if(!Object.values(f).every(Boolean)||rec.attribution.some(x=>!x.success))throw new Error('Unexpected honest validator result '+label);
  const t=await tip(9105);const post=(await rpc('txnpost id:'+id+' txndelete:true')).response;rec.posted=true;rec.post=post;rec.transactionid=post.body.txn.transactionid;save();
  rec.canonical=await observe(rec.transactionid,t,label);write(path.join(EVID,label+'-result.json'),rec);save();return rec;
}
async function execute(){checkFrozen();const f=st.fx,c=st.coins,s=st.scripts;
  if(PHASE==='setup'){
    const outputs=[out(s.registration.address,'10',f.marker),...Array.from({length:10},()=>out(s.helper.address,'0.00000001','0x00')),out(f.owner.address,nativeDec(native(f.nativeInput.amount)-native('0.00000010')),'0x00')];
    const r=await build(PHASE,{inputs:[c.markerWallet,f.nativeInput.coinid],outputs,state:{},sign:'auto'});c.stock=r.canonical.outputs[0].coinid;c.helpers=r.canonical.outputs.slice(1,11).map(o=>o.coinid);
  }else if(PHASE==='register'){
    const r=await build(PHASE,{inputs:[c.stock],outputs:[out(s.account.address,'1',f.marker,true),out(s.registration.address,'9',f.marker)],state:{9:'40',120:O.hex(record())},sign:f.vendor.publickey});c.account=r.canonical.outputs[0].coinid;c.stock=r.canonical.outputs[1].coinid;
  }else if(PHASE==='fund'){
    st.fundedRecord=O.hex(record({k:1,F:60000000000n}));const r=await build(PHASE,{inputs:[c.account,c.valueWallet],outputs:[out(s.account.address,'1',f.marker,true),out(s.vault.address,'600',f.value),out(f.owner.address,'400',f.value)],state:{9:'1',120:st.fundedRecord},sign:'auto'});c.account=r.canonical.outputs[0].coinid;c.vault=r.canonical.outputs[1].coinid;c.valueChange=r.canonical.outputs[2].coinid;
  }else if(PHASE==='d1a-refusals'){
    await build('bad-secret',await d1Spec(0,{badSecret:true}),{negative:true,expectClause:/function:SHA2.*variable:t/});
    await build('bad-complement',await d1Spec(0,{badComplement:true}),{negative:true,expectClause:/function:SHA2.*variable:t/});
    await build('release-redirect',await d1Spec(0,{redirect:true}),{negative:true,expectClause:/function:VERIFYOUT.*params:\[0, variable:q/});
  }else if(PHASE==='d1a'||PHASE==='d1b'){
    const r=await build(PHASE,await d1Spec(PHASE==='d1a'?0:1));c.q=r.canonical.outputs[0].coinid;if(PHASE==='d1a')st.afterARecord=r.spec.nr;else st.afterBRecord=r.spec.nr;
  }else if(PHASE==='d2a-refusals'){
    await build('payout-redirect',await d2Spec(0,{redirect:true}),{negative:true,expectClause:/function:GETOUTADDR.*params:\[1\]/});
    await build('payout-overpay',await d2Spec(0,{overpay:true}),{negative:true,expectClause:/variable:p \* 100000000.*variable:y/});
    await build('reserve-skim',await d2Spec(0,{skim:true}),{negative:true,expectClause:/function:VERIFYOUT.*params:\[2/});
  }else if(PHASE==='d2a'||PHASE==='d2b'){
    const r=await build(PHASE,await d2Spec(PHASE==='d2a'?0:1));c.account=r.canonical.outputs[0].coinid;c.vault=r.canonical.outputs[2].coinid;(c.payouts??=[]).push(r.canonical.outputs[1].coinid);
  }else if(PHASE==='replay'){
    // Rebuild voucher 1 against the continued account, but keep its original statement/Q.
    await build('replay-voucher1',await d1Spec(0,{helperGroup:1}),{negative:true,expectClause:/variable:i GT function:NUMBER/});
    const d=await d2Spec(0);d.inputs[0]=c.account;
    await build('fake-release',d,{negative:true,expectClause:/function:GETINADDR.*params:\[0\]/});
  }else if(PHASE==='close'){
    const report={runId:RUN,at:now(),achieved:'L2 for the named complete baseline cumulative withdrawal controls',tests:Object.fromEntries(Object.entries(st.steps).filter(([k])=>!k.startsWith('mint-')).map(([k,v])=>[k,{flags:v.flags,posted:v.posted,exportBytes:v.exportBytes,transactionid:v.transactionid,canonical:v.canonical&&{block:v.canonical.block,txpowid:v.canonical.txpowid},attribution:v.attribution}])),end:{}};
    for(const port of [9105,9205]){const account=await coin(c.account,port),vault=await coin(c.vault,port),payouts=await Promise.all(c.payouts.map(id=>coin(id,port)));if(!account||!vault||payouts.some(x=>!x))throw new Error('End coin absent');const rr=O.unhex(stateObj(account.state)[120]);const total=payouts.reduce((n,x)=>n+atoms(x.tokenamount),0n);if(rr.readBigUInt64BE(208)!==29000000000n||rr.readUInt32BE(204)!==2||atoms(vault.tokenamount)!==31000000000n||total!==29000000000n)throw new Error('Wrong cumulative debit or reserve conservation');report.end[port]={account,vault,payouts,totalPaid:decimal(total),backingConserved:decimal(total+atoms(vault.tokenamount))};}
    write(path.join(EVID,'closure.json'),report);note('campaign passed',{paid:'290',remainingReserve:'310',total:'600',secondPayout:st.steps.d2b.spec.outputs[1].amount});
  }else throw new Error('Unknown phase');st.completed.push(PHASE);save();
}
async function preflight(){
  if(!st?.fx?.vouchers)throw new Error('Fresh simulator fixtures required');
  // Independent L0 diagnostic. Never mint, sign a wallet transaction, track or post.
  st=structuredClone(st);const f=st.fx;
  f.marker=hx(Buffer.from(RUN+' preflight marker only'));f.value=hx(Buffer.from(RUN+' preflight value only'));
  f.tree=(await rpc('mmrcreate nodes:'+JSON.stringify(f.keyPks.map((k,i)=>k+':'+i)))).response;
  const s={};s.vault=await clean(B.vaultScript({chip:f.marker,value:f.value}));
  s.helperBody=await clean(B.helperBody({chip:f.marker}));s.helper=await clean(B.helperAddressScript(f.tag,s.helperBody.address));
  s.account=await clean(B.accountScript({chip:f.marker,value:f.value,vault:s.vault.address,helperHash:s.helperBody.address,burn:f.burn}));
  s.registration=await clean(B.registrationScript({chip:f.marker,account:s.account.address,vendorKey:f.vendor.publickey}));
  const dir=path.join(EVID,'local-preflight');fs.mkdirSync(dir,{recursive:true});write(path.join(dir,'scripts.json'),s);
  const block=await tip(9105),cases=[];
  const cc=(label,address,amount,tokenid,state={})=>({coinid:hx(Buffer.from('preflight '+label)),address,amount,tokenid,scale:same(tokenid,f.marker)?44:same(tokenid,f.value)?36:0,storestate:Object.keys(state).length>0,state,created:block-10});
  const marker=(rec,label='account')=>cc(label,s.account.address,'1',f.marker,{120:O.hex(rec)});
  const helpers=Array.from({length:5},(_,i)=>cc('helper'+i,s.helper.address,'0.00000001','0x00'));
  const walletScript='RETURN SIGNEDBY('+f.owner.publickey+')';
  function add(name,inputs,outputs,state,scripts,expect=[]){inputs.forEach((c,i)=>cases.push({name:name+'_in'+i,input:i,script:scripts[i],block,trace:true,state,inputs,outputs,signatures:[f.owner.publickey,f.vendor.publickey],witnessScripts:[s.helperBody.script],expectedSuccess:!expect.includes(i)}));}
  const rec0=record(),funded=record({k:1,F:60000000000n});
  const stock=cc('stock',s.registration.address,'10',f.marker);
  add('register',[stock],[out(s.account.address,'1',f.marker,true),out(s.registration.address,'9',f.marker)],{9:'40',120:O.hex(rec0)},[s.registration.script]);
  const val=cc('walletvalue',f.owner.address,'1000',f.value);
  add('fund',[marker(rec0),val],[out(s.account.address,'1',f.marker,true),out(s.vault.address,'600',f.value),out(f.owner.address,'400',f.value)],{9:'1',120:O.hex(funded)},[s.account.script,walletScript]);
  async function d1(rec,v,label){const a=updated(rec,v);const q=await clean(B.qScript(O.hex(O.sha2(Buffer.concat([a.nr,a.ex]))),s.account.address,s.vault.address,f.marker));return {label,rec,v,...a,q,inputs:[marker(rec),...helpers],outputs:[out(q.address,'1',f.marker),...Array.from({length:5},()=>out(f.owner.address,'0.00000001','0x00'))],state:{9:'2',97:'1',29:String(block),16:v.R,17:v.C,18:v.chunkDigests,19:v.message,27:f.tree.nodes[v.keyIndex].proof},scripts:[s.account.script,...Array(5).fill(s.helper.script)]};}
  const a=await d1(funded,f.vouchers[0],'d1a'),b=await d1(a.nr,f.vouchers[1],'d1b');
  for(const d of [a,b])add(d.label,d.inputs,d.outputs,d.state,d.scripts);
  for(const [label,port,index]of [['bad-secret',16,40],['bad-complement',17,33]]){const bs=structuredClone(a.state),buf=O.unhex(bs[port]);buf[index]^=128;bs[port]=O.hex(buf);add(label,a.inputs,a.outputs,bs,a.scripts,[1]);}
  const redirected=structuredClone(a.outputs);redirected[0].address=qx();add('release-redirect',a.inputs,redirected,a.state,a.scripts,[0]);
  const replayA=await d1(a.nr,f.vouchers[0],'replay-voucher1');add(replayA.label,replayA.inputs,replayA.outputs,replayA.state,replayA.scripts,[0]);
  const newerFirst=await d1(funded,f.vouchers[1],'newer-first');add(newerFirst.label,newerFirst.inputs,newerFirst.outputs,newerFirst.state,newerFirst.scripts);
  // An invalid older voucher cannot produce a new unsigned debit delta. Preserve its
  // original attempted output while placing the continued newer account at input 0.
  add('older-after-newer',[marker(newerFirst.nr),...helpers],a.outputs,a.state,a.scripts,[0]);
  function d2(d,balance,label){return {inputs:[cc(label+'q',d.q.address,'1',f.marker),cc(label+'vault',s.vault.address,balance,f.value)],outputs:[out(s.account.address,'1',f.marker,true),out(f.owner.address,decimal(d.y),f.value),out(s.vault.address,decimal(atoms(balance)-d.y),f.value)],state:{9:'10',29:String(block),120:O.hex(d.nr),201:O.hex(d.ex),202:s.account.address},scripts:[d.q.script,s.vault.script]};}
  const aa=d2(a,'600','d2a'),bb=d2(b,'350','d2b');for(const [label,d]of [['d2a',aa],['d2b',bb]])add(label,d.inputs,d.outputs,d.state,d.scripts);
  for(const label of ['payout-redirect','payout-overpay','reserve-skim']){const d=structuredClone(aa);if(label==='payout-redirect')d.outputs[1].address=qx();if(label==='payout-overpay'){d.outputs[1].amount=decimal(atoms(d.outputs[1].amount)+1n);d.outputs[2].amount=decimal(atoms(d.outputs[2].amount)-1n);}if(label==='reserve-skim')d.outputs[2].amount=decimal(atoms(d.outputs[2].amount)-1n);add(label,d.inputs,d.outputs,d.state,d.scripts,[1]);}
  const fake=structuredClone(aa);fake.inputs[0]=marker(a.nr);fake.scripts[0]=s.account.script;add('fake-release',fake.inputs,fake.outputs,fake.state,fake.scripts,[0,1]);
  // Token scales on outputs must match real tokencreate, rather than the historical scale-zero runner.
  for(const c of cases)c.outputs=c.outputs.map(o=>({...o,scale:same(o.tokenid,f.marker)?44:same(o.tokenid,f.value)?36:0}));
  const file=path.join(dir,'cases.json');write(file,cases);const stdout=runJava(['-cp',JAR+';'+path.join(EVID,'runtime/replay'),'KissRunScaled',file],'local-preflight');const rs=JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
  const results=rs.map((r,i)=>({...r,expected:cases[i].expectedSuccess,pass:r.success===cases[i].expectedSuccess}));write(path.join(dir,'results.json'),{level:'L0, synthetic transaction contexts, not mainnet settlement',at:now(),sources:sources(),casesSha256:sha(fs.readFileSync(file)),total:results.length,passed:results.filter(x=>x.pass).length,results});
  note('local preflight',{passed:results.filter(x=>x.pass).length,total:results.length,maxInstructions:Math.max(...results.map(x=>x.instructions)),failures:results.filter(x=>!x.pass).map(x=>({name:x.name,success:x.success,exception:x.exception}))});if(results.some(x=>!x.pass))throw new Error('Local preflight unexpected result');
}
try{if(PHASE==='prepare')await prepare();else if(PHASE==='freeze')freeze();else if(PHASE==='preflight')await preflight();else await execute();}
catch(e){if(st&&PHASE!=='preflight'){st.stopped={at:now(),phase:PHASE,error:e.message};save();write(path.join(EVID,'HARD_STOP.json'),st.stopped);}console.error(e.stack);process.exitCode=2;}
