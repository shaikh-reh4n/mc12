'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),net=require('net');
const{spawn,execFile}=require('child_process'),{pipeline}=require('stream/promises'),{Readable}=require('stream');
const ROOT=__dirname,DATA=path.join(ROOT,'data'),SRV=path.join(ROOT,'server'),BK=path.join(ROOT,'backups'),CF=path.join(DATA,'config.json');
for(const d of[DATA,BK,SRV])fs.mkdirSync(d,{recursive:true});
const env={};try{for(const l of fs.readFileSync(path.join(ROOT,'.env'),'utf8').split('\n')){const m=l.match(/^(\w+)=(.*)$/);if(m)env[m[1]]=m[2]}}catch{}
if(!env.PANEL_USER||!env.PANEL_PASS){console.error('Run: npm run setup');process.exit(1)}
let cfg={created:false,type:'fabric',name:'Minecraft Server',motd:'A Minecraft Server',maxPlayers:20,ram:2048,version:'',port:25565,autoShutdown:false,idle:10,autoStart:false,autoRestart:true,discord:{}};
try{cfg={...cfg,...JSON.parse(fs.readFileSync(CF,'utf8'))}}catch{}
const save=()=>fs.writeFileSync(CF,JSON.stringify(cfg,null,1),{mode:0o600});
const JAR=()=>cfg.type==='paper'?'server.jar':'fabric-server.jar',MODS=()=>cfg.type==='paper'?'plugins':'mods';
const pub=()=>({...cfg,discord:{...cfg.discord,token:undefined,hasToken:!!cfg.discord?.token}});
const UA={'User-Agent':'mc-panel/1.0'},j=async u=>{const r=await fetch(u,{headers:UA});if(!r.ok)throw Error('HTTP '+r.status+' '+u);return r.json()};
const dl=async(u,f)=>{const r=await fetch(u,{headers:UA});if(!r.ok)throw Error('Download failed '+r.status);await pipeline(Readable.fromWeb(r.body),fs.createWriteStream(f))};

/* ---------- auth ---------- */
const sess=new Map(),fails=new Map();
const sha=s=>crypto.createHash('sha256').update(s).digest();
function check(u,p){const[s,h]=env.PANEL_PASS.split('$');const d=crypto.scryptSync(String(p),Buffer.from(s,'hex'),64);
 const a=crypto.timingSafeEqual(d,Buffer.from(h,'hex')),b=crypto.timingSafeEqual(sha(String(u)),sha(env.PANEL_USER));return a&&b}
setInterval(()=>{const n=Date.now();for(const[k,v]of sess)if(v<n)sess.delete(k);for(const[k,v]of fails)if(v.until<n-36e5)fails.delete(k)},6e4).unref();

/* ---------- security helpers: audit log, TOTP 2FA, client IP ---------- */
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),AUD=path.join(DATA,'audit.log'),AUTH=path.join(DATA,'auth.json');
try{if(fs.statSync(AUD).size>2e6)fs.writeFileSync(AUD,fs.readFileSync(AUD,'utf8').split('\n').slice(-2000).join('\n'),{mode:0o600})}catch{}
const aud=(ip,t)=>{try{fs.appendFileSync(AUD,JSON.stringify({t:Date.now(),ip:String(ip||'?').replace('::ffff:',''),a:String(t).slice(0,200)})+'\n',{mode:0o600})}catch{}};
let auth={},pendTotp=null,gf=[];try{auth=JSON.parse(fs.readFileSync(AUTH,'utf8'))}catch{}
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32e=b=>{let o='',x=0,n=0;for(const c of b){x=(x<<8)|c;n+=8;while(n>=5){o+=B32[(x>>>(n-5))&31];n-=5}x&=(1<<n)-1}if(n)o+=B32[(x<<(5-n))&31];return o};
const b32d=s=>{let x=0,n=0;const o=[];for(const c of s.toUpperCase()){x=(x<<5)|B32.indexOf(c);n+=5;if(n>=8){o.push((x>>>(n-8))&255);n-=8;x&=(1<<n)-1}}return Buffer.from(o)};
const hotp=(k,c)=>{const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(c));const h=crypto.createHmac('sha1',b32d(k)).update(b).digest(),o=h[19]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1e6).padStart(6,'0')};
const totpOk=(k,code)=>{const c=Math.floor(Date.now()/3e4),v=String(code||'').replace(/\s/g,'').padEnd(6,'x').slice(0,6);let ok=false;for(const d of[-1,0,1])if(crypto.timingSafeEqual(Buffer.from(hotp(k,c+d)),Buffer.from(v)))ok=true;return ok};
const clientIp=q=>env.TRUST_PROXY==='1'?((q.headers['x-forwarded-for']||'').split(',')[0].trim()||q.socket.remoteAddress):q.socket.remoteAddress;
const myTok=q=>(q.headers.cookie||'').match(/sid=([a-f0-9]{64})/)?.[1];
const keepOnly=q=>{const t=myTok(q),e=sess.get(t);sess.clear();if(t)sess.set(t,e)};

/* ---------- minecraft process ---------- */
let ds='',proc=null,status='offline',logs=[],players=new Set(),clients=new Set(),idleSince=null,listener=null,socks=new Set(),restartNext=false,crashes=[],hook=null,installing='',installErr='';
const emit=l=>{logs.push(l);if(logs.length>500)logs.shift();for(const r of clients)r.write('data: '+JSON.stringify(l)+'\n\n');hook&&hook(l)};
function line(l){emit(l);if(/\]: Done \(/.test(l)){status='online';idleSince=Date.now()}
 let m=l.match(/\]: (\w+) joined the game/);if(m)players.add(m[1]);m=l.match(/\]: (\w+) left the game/);if(m)players.delete(m[1])}
function start(){if(proc||!cfg.created||!fs.existsSync(path.join(SRV,JAR())))return;closeListener();try{writeProps({motd:motdFull()})}catch{}status='starting';players.clear();
 proc=spawn('java',[`-Xms${Math.min(cfg.ram,1024)}M`,`-Xmx${cfg.ram}M`,'-XX:+UseG1GC','-XX:+UseStringDeduplication','-jar',JAR(),'nogui'],{cwd:SRV});
 const f=d=>d.toString().split(/\r?\n/).filter(Boolean).forEach(line);proc.stdout.on('data',f);proc.stderr.on('data',f);
 proc.on('error',e=>{emit('[panel] '+e.message+' (is Java installed?)');proc=null;status='offline';openListener()});
 proc.on('exit',c=>{const was=status;proc=null;status='offline';players.clear();emit('[panel] server exited ('+c+')');
  if(restartNext){restartNext=false;start()}
  else if(cfg.autoRestart&&was!=='stopping'&&c!==0&&(crashes=crashes.filter(t=>Date.now()-t<6e5),crashes.push(Date.now()))<=3){emit('[panel] crash detected — restarting in 5s');setTimeout(start,5000)}
  else openListener()})}
function stop(){if(!proc||status==='stopping')return;status='stopping';proc.stdin.write('stop\n');const p=proc;setTimeout(()=>p.exitCode===null&&p.kill('SIGKILL'),60000).unref()}
const restart=()=>{if(!proc)return start();restartNext=true;stop()};
const cmd=c=>{if(proc&&status!=='offline')proc.stdin.write(String(c).replace(/[\r\n]+/g,' ')+'\n')};
setInterval(()=>{if(cfg.autoShutdown&&status==='online'&&!players.size){idleSince??=Date.now();if(Date.now()-idleSince>cfg.idle*6e4){emit('[panel] idle timeout — stopping');stop()}}else idleSince=null},3e4).unref();

/* ---------- auto-start listener (fake MC server while offline) ---------- */
const vi=n=>{const b=[];do{let t=n&127;n>>>=7;if(n)t|=128;b.push(t)}while(n);return Buffer.from(b)};
const rv=(b,o)=>{let r=0,s=0,c;do{if(o>=b.length)return null;c=b[o++];r|=(c&127)<<s;s+=7}while(c&128);return[r,o]};
const str=s=>{const b=Buffer.from(s);return Buffer.concat([vi(b.length),b])},pk=(id,d)=>{const p=Buffer.concat([vi(id),d]);return Buffer.concat([vi(p.length),p])};
function closeListener(){if(listener){listener.close();const o=[...socks];socks.clear();setTimeout(()=>o.forEach(s=>s.destroy()),2000).unref();listener=null}}
function openListener(){closeListener();if(!cfg.autoStart||!cfg.created||proc)return;
 listener=net.createServer(s=>{socks.add(s);s.setTimeout(8000,()=>s.destroy());s.on('close',()=>socks.delete(s));s.on('error',()=>{});
  let buf=Buffer.alloc(0),st=0,proto=0;
  s.on('data',d=>{buf=Buffer.concat([buf,d]);if(buf.length>4096)return s.destroy();
   for(;;){const L=rv(buf,0);if(!L||buf.length<L[1]+L[0])break;const p=buf.subarray(L[1],L[1]+L[0]);buf=buf.subarray(L[1]+L[0]);const id=rv(p,0);
    if(st===0&&id[0]===0){const pr=rv(p,id[1]),hl=rv(p,pr[1]);proto=pr[0];const o=hl[1]+hl[0]+2,ns=rv(p,o);st=ns?ns[0]:0;
     }
    else if(st>=2&&id[0]===0){s.end(pk(0,str(JSON.stringify({text:'§eServer is waking up — rejoin in about 30 seconds!'}))));emit('[panel] join attempt — waking server');start();return}
    else if(st===1&&id[0]===0)s.write(pk(0,str(JSON.stringify({version:{name:cfg.version,protocol:proto},players:{max:cfg.maxPlayers,online:0},description:{text:motdLive()+' §e💤 Sleeping, join to wake'}}))));
    else if(st===1&&id[0]===1){s.end(Buffer.concat([vi(p.length),p]))}}})})
 .on('error',e=>{emit('[panel] auto-start listener: '+e.message);listener=null}).listen(+readProps()['server-port']||25565)}

/* ---------- server.properties ---------- */
const PF=path.join(SRV,'server.properties');
// MOTD line 1 = server name (bold gold), line 2 = your MOTD. File form uses \u00A7 / \n escapes; live form is for the sleeping-server ping.
const clean=t=>String(t||'').replace(/[\r\n\\]/g,' ');
const motdFull=(n=cfg.name,m=cfg.motd)=>'\\u00A76\\u00A7l'+clean(n).replace(/§/g,'')+'\\n\\u00A77'+clean(m).replace(/§/g,'\\u00A7');
const motdLive=()=>'§6§l'+clean(cfg.name).replace(/§/g,'')+'§r\n§7'+clean(cfg.motd);
const readProps=()=>{const o={};try{for(const l of fs.readFileSync(PF,'utf8').split('\n')){const i=l.indexOf('=');if(l&&l[0]!=='#'&&i>0)o[l.slice(0,i)]=l.slice(i+1)}}catch{}return o};
const writeProps=u=>{const p={...readProps(),...u};fs.writeFileSync(PF,'#Edited by mc-panel\n'+Object.entries(p).map(([k,v])=>k+'='+String(v).replace(/[\r\n]/g,'')).join('\n')+'\n')};

/* ---------- mods (Modrinth) ---------- */
const enc=encodeURIComponent;
async function addMod(slug,seen=new Set()){if(seen.has(slug))return;seen.add(slug);
 const vs=await j(`https://api.modrinth.com/v2/project/${enc(slug)}/version?loaders=${enc(cfg.type==='paper'?'["paper","spigot","bukkit"]':'["fabric"]')}&game_versions=${enc(JSON.stringify([cfg.version]))}`);
 if(!vs.length)throw Error(`${slug}: no compatible build for ${cfg.version}`);const v=vs[0],f=v.files.find(x=>x.primary)||v.files[0];
 fs.mkdirSync(path.join(SRV,MODS()),{recursive:true});await dl(f.url,path.join(SRV,MODS(),path.basename(f.filename)));emit('[panel] installed '+f.filename);
 for(const d of v.dependencies||[])if(d.dependency_type==='required'&&d.project_id)await addMod(d.project_id,seen);return f.filename}
const REC={fabric:['fabric-api','lithium','ferrite-core','spark'],paper:['spark','luckperms','essentialsx']};

const vc=(a,b)=>{const x=a.split('.'),y=b.split('.');for(let i=0;i<3;i++){const d=(+y[i]||0)-(+x[i]||0);if(d)return d}return 0},rel=v=>/^\d+(\.\d+)+$/.test(v);
async function paperVersions(){try{return Object.values((await j('https://fill.papermc.io/v3/projects/paper')).versions).flat().filter(rel).sort(vc)}catch{return(await j('https://api.papermc.io/v2/projects/paper')).versions.filter(rel).sort(vc)}}
async function paperJar(v,dest){try{const u=(await j(`https://fill.papermc.io/v3/projects/paper/versions/${enc(v)}/builds/latest`)).downloads?.['server:default']?.url;if(!u)throw Error('x');await dl(u,dest)}
 catch{const r=(await j(`https://api.papermc.io/v2/projects/paper/versions/${enc(v)}/builds`)).builds,b=r.filter(x=>x.channel==='default').pop()||r.pop();await dl(`https://api.papermc.io/v2/projects/paper/versions/${enc(v)}/builds/${b.build}/downloads/${b.downloads.application.name}`,dest)}}
async function install(b){try{installing='Downloading '+b.type+'…';if(b.type==='paper')await paperJar(b.version,path.join(SRV,'server.jar'));else{
 const lv=(await j('https://meta.fabricmc.net/v2/versions/loader')).find(x=>x.stable),iv=(await j('https://meta.fabricmc.net/v2/versions/installer')).find(x=>x.stable);
 await dl(`https://meta.fabricmc.net/v2/versions/loader/${enc(b.version)}/${lv.version}/${iv.version}/server/jar`,path.join(SRV,'fabric-server.jar'))}
 fs.writeFileSync(path.join(SRV,'eula.txt'),'eula=true\n');
 writeProps({motd:motdFull(b.name,b.motd),'max-players':b.maxPlayers,'server-port':cfg.port});
 if(b.icon?.startsWith('data:image/png;base64,'))fs.writeFileSync(path.join(SRV,'server-icon.png'),Buffer.from(b.icon.split(',')[1],'base64'));
 Object.assign(cfg,{created:true,type:b.type,name:b.name,motd:b.motd,maxPlayers:b.maxPlayers,ram:b.ram,version:b.version,autoShutdown:!!b.autoShutdown,idle:b.idle,autoStart:!!b.autoStart});save();
 if(b.plugins)for(const s of REC[b.type]){installing='Installing '+s+'…';try{await addMod(s)}catch(e){emit('[panel] '+e.message)}}
 installing='';openListener()}catch(e){installErr=e.message;installing=''}}

/* ---------- http ---------- */
const json=(res,c,o)=>{res.writeHead(c,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
const body=(req,max=1e6)=>new Promise((ok,no)=>{let n=0,c=[];req.on('data',d=>{n+=d.length;if(n>max){no(Error('Too large'));req.destroy()}else c.push(d)});req.on('end',()=>{try{ok(c.length?JSON.parse(Buffer.concat(c)):{})}catch{no(Error('Bad JSON'))}})});
const safe=p=>{const f=path.resolve(SRV,'.'+path.sep+String(p||''));if(f!==SRV&&!f.startsWith(SRV+path.sep))throw Error('Bad path');return f};
const sh=(c,a)=>new Promise((ok,no)=>execFile(c,a,e=>e?no(e):ok()));
const int=(v,a,b,d)=>{v=parseInt(v);return Number.isFinite(v)&&v>=a&&v<=b?v:d};
let vcache={};
const bkName=n=>{if(!/^[\w.-]+\.tar\.gz$/.test(n||''))throw Error('Bad backup name');return path.join(BK,n)};
const mkBackup=async()=>{const n=`${cfg.name.replace(/\W+/g,'_')}-${new Date().toISOString().replace(/[:.]/g,'-').slice(0,19)}.tar.gz`;
 fs.writeFileSync(path.join(SRV,'panel-config.json'),JSON.stringify({...cfg,discord:undefined}));await sh('tar',['-czf',path.join(BK,n),'-C',SRV,'.']);return n};
const R={
 'POST /api/login':async(q,s,u,ip)=>{const f=fails.get(ip)||{n:0,until:0};if(f.until>Date.now()&&(aud(ip,'login blocked (lockout)'),1))return json(s,429,{error:'Too many attempts. Try again in '+Math.ceil((f.until-Date.now())/1000)+'s'});
  const b=await body(q,2000);gf=gf.filter(t=>Date.now()-t<6e5);await sleep(400+(gf.length>25?3000:0));
  if(!(check(b.username||'',b.password||'')&&(!auth.totp||totpOk(auth.totp,b.code)))){gf.push(Date.now());aud(ip,'login FAILED user='+String(b.username).slice(0,30));f.n++;if(f.n>=4)f.until=Date.now()+Math.min(2**f.n*1000,9e5);fails.set(ip,f);return json(s,401,{error:'Wrong username or password'})}
  fails.delete(ip);aud(ip,'login ok');const t=crypto.randomBytes(32).toString('hex');sess.set(t,Date.now()+432e5);
  s.setHeader('Set-Cookie',`sid=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${q.headers['x-forwarded-proto']==='https'||q.socket.encrypted?'; Secure':''}`);json(s,200,{ok:1})},
 'POST /api/logout':async(q,s)=>{sess.delete((q.headers.cookie||'').match(/sid=(\w+)/)?.[1]);json(s,200,{ok:1})},
 'GET /api/state':async(q,s)=>json(s,200,{status,players:[...players],cfg:pub(),installing,installErr,discord:ds,backups:fs.readdirSync(BK).filter(f=>f.endsWith('.tar.gz')).sort().reverse()}),
 'GET /api/versions':async(q,s,u)=>{const t=u.searchParams.get('type')==='paper'?'paper':'fabric';vcache[t]??=t==='paper'?await paperVersions():(await j('https://meta.fabricmc.net/v2/versions/game')).filter(v=>v.stable).map(v=>v.version);json(s,200,vcache[t].slice(0,25))},
 'POST /api/create':async(q,s)=>{if(cfg.created||installing)throw Error('Server already exists');const b=await body(q,2e5);
  if(!/^[\w.-]+$/.test(b.version||''))throw Error('Pick a version');if(!b.eula)throw Error('Accept the Minecraft EULA');
  installErr='';install({type:b.type==='paper'?'paper':'fabric',version:b.version,name:String(b.name||'Minecraft Server').slice(0,40),motd:String(b.motd||'').replace(/[\r\n]/g,' ').slice(0,100),maxPlayers:int(b.maxPlayers,1,1000,20),ram:int(b.ram,512,65536,2048),
  icon:b.icon,plugins:b.plugins,autoShutdown:b.autoShutdown,idle:int(b.idle,1,1440,10),autoStart:b.autoStart});json(s,200,{ok:1})},
 'POST /api/start':async(q,s)=>{start();json(s,200,{ok:1})},'POST /api/stop':async(q,s)=>{stop();json(s,200,{ok:1})},'POST /api/restart':async(q,s)=>{restart();json(s,200,{ok:1})},
 'POST /api/cmd':async(q,s,u,ip)=>{const c=(await body(q,2000)).cmd||'';aud(ip,'cmd: '+String(c).slice(0,120));cmd(c);json(s,200,{ok:1})},
 'GET /api/logs':async(q,s)=>{s.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache'});s.write('retry: 3000\n\n');for(const l of logs.slice(-150))s.write('data: '+JSON.stringify(l)+'\n\n');clients.add(s);q.on('close',()=>clients.delete(s))},
 'POST /api/settings':async(q,s)=>{const b=await body(q,1e5),d=b.discord||{};
  if(b.name!=null)cfg.name=String(b.name).slice(0,40);if(b.motd!=null)cfg.motd=String(b.motd).replace(/[\r\n]/g,' ').slice(0,100);
  cfg.maxPlayers=int(b.maxPlayers,1,1000,cfg.maxPlayers);cfg.ram=int(b.ram,512,65536,cfg.ram);cfg.idle=int(b.idle,1,1440,cfg.idle);
  if(b.autoShutdown!=null)cfg.autoShutdown=!!b.autoShutdown;if(b.autoStart!=null)cfg.autoStart=!!b.autoStart;if(b.autoRestart!=null)cfg.autoRestart=!!b.autoRestart;
  for(const k of['opRole','panelChat','consoleChat','crossChat'])if(d[k]!=null)cfg.discord[k]=String(d[k]).replace(/\D/g,'');
  if(d.events!=null)cfg.discord.events=!!d.events;if(d.statusMsgs!=null)cfg.discord.statusMsgs=!!d.statusMsgs;if(d.token)cfg.discord.token=String(d.token).trim();if(d.clear)delete cfg.discord.token;
  save();writeProps({motd:motdFull(),'max-players':cfg.maxPlayers});openListener();require('./discord')(api).catch(e=>emit('[panel] '+e.message));json(s,200,pub())},
 'GET /api/props':async(q,s)=>json(s,200,readProps()),'POST /api/props':async(q,s)=>{writeProps(await body(q,1e5));json(s,200,{ok:1})},
 'GET /api/files':async(q,s,u)=>{const d=safe(u.searchParams.get('p')),o=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){let z=0;try{z=e.isDirectory()?0:fs.statSync(path.join(d,e.name)).size}catch{}o.push({name:e.name,dir:e.isDirectory(),size:z})}
  json(s,200,o.sort((a,b)=>b.dir-a.dir||a.name.localeCompare(b.name)))},
 'GET /api/file':async(q,s,u)=>{const f=safe(u.searchParams.get('p'));if(fs.statSync(f).size>2e6)throw Error('File too large to edit (2 MB max)');json(s,200,{content:fs.readFileSync(f,'utf8')})},
 'PUT /api/file':async(q,s,u)=>{fs.writeFileSync(safe(u.searchParams.get('p')),String((await body(q,5e6)).content??''));json(s,200,{ok:1})},
 'DELETE /api/file':async(q,s,u)=>{const f=safe(u.searchParams.get('p'));if(f===SRV)throw Error('Refusing');fs.rmSync(f,{recursive:true,force:true});json(s,200,{ok:1})},
 'POST /api/mkdir':async(q,s,u)=>{fs.mkdirSync(safe(u.searchParams.get('p')),{recursive:true});json(s,200,{ok:1})},
 'POST /api/upload':async(q,s,u)=>{const n=path.basename(u.searchParams.get('name')||'');if(!n)throw Error('No name');const f=path.join(safe(u.searchParams.get('p')),n);let z=0;
  q.on('data',d=>{z+=d.length;if(z>1e9)q.destroy()});await pipeline(q,fs.createWriteStream(f));json(s,200,{ok:1})},
 'GET /api/plugins':async(q,s)=>{const d=path.join(SRV,MODS());json(s,200,fs.existsSync(d)?fs.readdirSync(d).filter(f=>f.endsWith('.jar')):[])},
 'GET /api/plugins/search':async(q,s,u)=>{const f=(cfg.type==='paper'?[['project_type:plugin'],['categories:paper','categories:spigot','categories:bukkit']]:[['project_type:mod'],['categories:fabric'],['server_side:required','server_side:optional']]).concat([['versions:'+cfg.version]]);
  const r=await j(`https://api.modrinth.com/v2/search?limit=20&query=${enc(u.searchParams.get('q')||'')}&facets=${enc(JSON.stringify(f))}`);
  json(s,200,r.hits.map(h=>({slug:h.slug,title:h.title,description:h.description,icon:h.icon_url,downloads:h.downloads})))},
 'POST /api/plugins/install':async(q,s)=>{const b=await body(q,1000);if(!/^[\w-]+$/.test(b.slug||''))throw Error('Bad slug');json(s,200,{file:await addMod(b.slug)})},
 'POST /api/backups':async(q,s)=>json(s,200,{name:await mkBackup()}),
 'GET /api/hello':async(q,s)=>json(s,200,{totp:!!auth.totp}),
 'GET /api/security':async(q,s)=>{const p=readProps(),on=(k,d)=>(p[k]??d)==='true';let ops=[];try{ops=JSON.parse(fs.readFileSync(path.join(SRV,'ops.json'),'utf8')).map(o=>o.name+' (level '+o.level+')')}catch{}
  json(s,200,{totp:!!auth.totp,ops,hard:[{label:'Online mode on (blocks cracked / spoofed accounts)',ok:on('online-mode','true')},{label:'Whitelist enabled',ok:on('white-list','false')},
   {label:'Whitelist enforced for players already online',ok:on('enforce-whitelist','false')},{label:'RCON disabled',ok:!on('enable-rcon','false')},{label:'Query disabled',ok:!on('enable-query','false')}]})},
 'POST /api/hardening':async(q,s,u,ip)=>{writeProps({'online-mode':'true','white-list':'true','enforce-whitelist':'true','enable-rcon':'false','enable-query':'false'});if(status==='online')cmd('whitelist on');aud(ip,'applied recommended hardening');json(s,200,{ok:1})},
 'POST /api/totp/setup':async(q,s)=>{pendTotp=b32e(crypto.randomBytes(20));json(s,200,{secret:pendTotp})},
 'POST /api/totp/enable':async(q,s,u,ip)=>{const b=await body(q,500);if(!pendTotp||!totpOk(pendTotp,b.code))throw Error('Wrong code');auth.totp=pendTotp;pendTotp=null;fs.writeFileSync(AUTH,JSON.stringify(auth),{mode:0o600});aud(ip,'2FA enabled');json(s,200,{ok:1})},
 'POST /api/totp/disable':async(q,s,u,ip)=>{const b=await body(q,500);await sleep(400);if(!check(env.PANEL_USER,b.password||''))throw Error('Wrong password');delete auth.totp;fs.writeFileSync(AUTH,JSON.stringify(auth),{mode:0o600});aud(ip,'2FA disabled');json(s,200,{ok:1})},
 'POST /api/password':async(q,s,u,ip)=>{const b=await body(q,1000);await sleep(400);if(!check(env.PANEL_USER,b.old||''))throw Error('Current password is wrong');if(String(b.new||'').length<12)throw Error('New password needs 12+ characters');
  const sl=crypto.randomBytes(16),h=sl.toString('hex')+'$'+crypto.scryptSync(String(b.new),sl,64).toString('hex'),ef=path.join(ROOT,'.env');
  fs.writeFileSync(ef,fs.readFileSync(ef,'utf8').replace(/^PANEL_PASS=.*$/m,()=>'PANEL_PASS='+h),{mode:0o600});env.PANEL_PASS=h;keepOnly(q);aud(ip,'password changed, other sessions signed out');json(s,200,{ok:1})},
 'POST /api/sessions/clear':async(q,s,u,ip)=>{keepOnly(q);aud(ip,'signed out all other sessions');json(s,200,{ok:1})},
 'GET /api/audit':async(q,s)=>{let l=[];try{l=fs.readFileSync(AUD,'utf8').trim().split('\n').slice(-150).reverse().map(x=>JSON.parse(x))}catch{}json(s,200,l)},
 'GET /api/jars':async(q,s)=>{const d=path.join(SRV,MODS());json(s,200,fs.existsSync(d)?fs.readdirSync(d).filter(f=>f.endsWith('.jar')).map(f=>{const p=path.join(d,f),st=fs.statSync(p);return{name:f,size:st.size,mtime:st.mtimeMs,sha:crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}}):[])},
 'GET /api/icon':async(q,s)=>{const d=fs.readFileSync(path.join(SRV,'server-icon.png'));s.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-cache'});s.end(d)},
 'POST /api/icon':async(q,s)=>{const b=await body(q,3e5);if(!String(b.icon||'').startsWith('data:image/png;base64,'))throw Error('PNG expected');fs.writeFileSync(path.join(SRV,'server-icon.png'),Buffer.from(b.icon.split(',')[1],'base64'));json(s,200,{ok:1})},
 'POST /api/delete':async(q,s)=>{const b=await body(q,2000);if(proc||status!=='offline')throw Error('Stop the server first');
  await new Promise(r=>setTimeout(r,400));if(!check(env.PANEL_USER,b.password||''))throw Error('Wrong password');
  if(b.backup&&cfg.created)await mkBackup();closeListener();fs.rmSync(SRV,{recursive:true,force:true});fs.mkdirSync(SRV);
  if(b.deleteBackups)for(const f of fs.readdirSync(BK))if(f.endsWith('.tar.gz'))fs.rmSync(path.join(BK,f),{force:true});
  Object.assign(cfg,{created:false,type:'fabric',name:'Minecraft Server',motd:'A Minecraft Server',maxPlayers:20,ram:2048,version:'',autoShutdown:false,autoStart:false});
  if(cfg.discord)delete cfg.discord.panelMsg;save();logs=[];players.clear();json(s,200,{ok:1})},
 'POST /api/restore':async(q,s)=>{if(status!=='offline')throw Error('Stop the server first');const f=bkName((await body(q,1000)).name);
  fs.rmSync(SRV,{recursive:true,force:true});fs.mkdirSync(SRV);await sh('tar',['-xzf',f,'-C',SRV]);
  try{const o=JSON.parse(fs.readFileSync(path.join(SRV,'panel-config.json'),'utf8'));for(const k of['type','name','motd','maxPlayers','ram','version','autoShutdown','idle','autoStart'])if(o[k]!=null)cfg[k]=o[k]}catch{}
  cfg.created=true;if(!fs.existsSync(path.join(SRV,'fabric-server.jar'))&&fs.existsSync(path.join(SRV,'server.jar')))cfg.type='paper';save();openListener();json(s,200,{ok:1})},
 'DELETE /api/backups':async(q,s,u)=>{fs.rmSync(bkName(u.searchParams.get('name')),{force:true});json(s,200,{ok:1})}
};
const api={cfg,save,dstat:s=>{ds=s},emit,start,stop,restart,cmd,status:()=>status,players:()=>[...players],setHook:f=>{hook=f}};
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css'};
const H=async(q,s)=>{
 s.setHeader('X-Content-Type-Options','nosniff');s.setHeader('Cross-Origin-Resource-Policy','same-origin');if(q.socket.encrypted)s.setHeader('Strict-Transport-Security','max-age=31536000');s.setHeader('X-Frame-Options','DENY');s.setHeader('Referrer-Policy','no-referrer');
 s.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data: https://cdn.modrinth.com; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
 try{const u=new URL(q.url,'http://x'),ip=clientIp(q);
  if(u.pathname.startsWith('/api/')){const h=R[q.method+' '+u.pathname];if(!h)return json(s,404,{error:'Not found'});
   if(q.method!=='GET'&&q.headers['x-panel']!=='1')return json(s,403,{error:'Forbidden'});
   if(u.pathname!=='/api/login'&&u.pathname!=='/api/hello'){const t=(q.headers.cookie||'').match(/sid=([a-f0-9]{64})/)?.[1];if(!t||(sess.get(t)||0)<Date.now())return json(s,401,{error:'Login required'});sess.set(t,Date.now()+432e5)}
   if(q.method!=='GET'&&!['/api/login','/api/cmd','/api/logout'].includes(u.pathname))aud(ip,q.method+' '+u.pathname.slice(5)+' '+(u.searchParams.get('p')||u.searchParams.get('name')||''));
   return await h(q,s,u,ip)}
  const f=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!/^[\w.-]+$/.test(f)||!MIME[path.extname(f)])return json(s,404,{});
  const d=fs.readFileSync(path.join(ROOT,'public',f));s.writeHead(200,{'Content-Type':MIME[path.extname(f)]+(f.endsWith('.woff2')?'':'; charset=utf-8'),'Cache-Control':f.endsWith('.woff2')?'max-age=31536000':'no-cache'});s.end(d)
 }catch(e){if(!s.headersSent)json(s,e.code==='ENOENT'?404:400,{error:e.code==='ENOENT'?'Not found':e.message});else s.end()}
};
(env.TLS_KEY&&env.TLS_CERT?require('https').createServer({key:fs.readFileSync(env.TLS_KEY),cert:fs.readFileSync(env.TLS_CERT)},H):http.createServer(H)).listen(+env.PORT||8080,env.HOST||'0.0.0.0',()=>console.log(`\n  ✓ Panel running → http://localhost:${env.PORT||8080}\n`));
openListener();require('./discord')(api).catch(()=>{});
process.on('SIGINT',()=>{if(proc){stop();proc.on('exit',()=>process.exit())}else process.exit()});
