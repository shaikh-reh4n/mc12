'use strict';
const $=s=>document.querySelector(s),A=$('#app'),esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
let S={},tab='Overview',es,poll,fp='',sec='General';
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),2800)}
async function api(m,u,b,raw){const r=await fetch('/api/'+u,{method:m,headers:{'X-Panel':'1',...(b&&!raw?{'Content-Type':'application/json'}:{})},body:raw?b:b?JSON.stringify(b):undefined});
 if(r.status===401&&u!=='login'){loginView();throw Error('Session expired')}const t=await r.json().catch(()=>({}));if(!r.ok)throw Error(t.error||r.statusText);return t}
const run=async(f,ok)=>{try{const r=await f();ok&&toast(ok);return r}catch(e){toast(e.message)}};
const val=id=>{const e=$('#'+id);return e.type==='checkbox'?e.checked:e.value};
const tog=(id,on)=>`<input type="checkbox" class="tog" id="${id}" ${on?'checked':''}>`;
const sw=(id,l,h,on)=>`<label class="row sw"><div class="g">${l}<small>${h}</small></div>${tog(id,on)}</label>`;
const fld=(id,l,v,o={})=>`<label class="fld"><span>${l}</span><input id="${id}" type="${o.t||'text'}" value="${esc(v)}" placeholder="${esc(l)}" autocomplete="off">${o.h?`<small>${o.h}</small>`:''}</label>`;
const sw2=()=>0;

async function loginView(){clearInterval(poll);es?.close();const hi=await fetch('/api/hello').then(r=>r.json()).catch(()=>({}));A.innerHTML=`<div class="login"><div class="logo">⛏</div><h1>Minecraft Panel</h1><p class="mut">Sign in to manage your server</p>
 <div class="card pad"><label class="fld"><span>Username</span><input id="u" placeholder="Username" autocomplete="username" autofocus></label><br><label class="fld"><span>Password</span><input id="p" type="password" placeholder="Password" autocomplete="current-password"></label>${hi.totp?'<br><label class="fld"><span>2FA code</span><input id="tc" placeholder="6-digit code" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label>':''}</div>
 <button class="pri big" id="go">Sign in</button></div>`;
 const go=()=>run(async()=>{await api('POST','login',{username:val('u'),password:val('p'),code:$('#tc')?.value||''});boot()});
 $('#go').onclick=go;[$('#p'),$('#tc')].forEach(i=>i?.addEventListener('keydown',e=>{if(e.key==='Enter')go()}))}

async function boot(){S=await api('GET','state').catch(()=>null);if(!S)return;
 if(S.cfg.created&&!S.installing)dash();else if(S.installing)installView();else chooser()}

function chooser(){clearInterval(poll);es?.close();A.innerHTML=`<h1>Welcome</h1><p class="mut">Start fresh or bring a backup back to life.</p>
 <div class="choose"><div class="tile" id="new"><span style="font-size:30px">✨</span><b>Create new server</b><span class="mut">Fabric or Paper, ready in about a minute</span></div>
 <div class="tile"><span style="font-size:30px">📦</span><b>Choose backup</b>${S.backups.length?S.backups.map(b=>`<div class="row"><div class="g">${esc(b)}</div><button class="sm pri" data-r="${esc(b)}">Restore</button></div>`).join(''):'<span class="mut">No backups yet. Drop .tar.gz files into the <code>backups</code> folder.</span>'}</div></div>`;
 $('#new').onclick=wizard;A.querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>run(async()=>{await api('POST','restore',{name:b.dataset.r});boot()}))}

async function wizard(){let icon='',type='fabric';
 A.innerHTML=`<h1>New server</h1><p class="mut">Pick your software and basics. Everything can be changed later.</p>
 <h2>Server</h2><div class="card pad"><div class="grid">
 <div class="fld"><span>Software</span><div class="seg" id="ty"><button data-y="fabric" class="on">Fabric</button><button data-y="paper">Paper</button></div></div>
 <label class="fld"><span>Version</span><select id="ver"></select></label>
 ${fld('name','Server name','My Server')}${fld('motd','MOTD','A Minecraft Server',{h:'Shown under the highlighted server name'})}${fld('mp','Max players',20,{t:'number'})}
 <label class="fld"><span>RAM · <b id="rl">2 GB</b></span><input id="ram" type="range" min="1" max="16" value="2"></label>
 <div class="fld" style="grid-column:1/-1"><span>Icon · cropped to 64×64</span><div class="iconrow"><img class="ic" id="ip" alt=""><input type="file" id="if" accept="image/*"></div></div></div></div>
 <h2>Options</h2><div class="card pad">${sw('pl','Install recommended plugins','<span id="ph">Fabric API, Lithium, FerriteCore, Spark</span>',1)}${sw('as','Auto shutdown','Stop when nobody is online',0)}<div id="ir" hidden>${fld('idle','Idle timeout (minutes)',10,{t:'number'})}</div>${sw('au','Auto start','Wake the server when someone tries to join',0)}</div>
 <div class="card pad">${sw('eula','I accept the Minecraft EULA','<a href="https://aka.ms/MinecraftEULA" target="_blank" rel="noopener" style="color:var(--acc)">aka.ms/MinecraftEULA</a>',0)}</div>
 <button class="pri big" id="mk">Create server</button>`;
 const lv=async()=>{$('#ver').innerHTML='<option>Loading…</option>';const vs=await run(()=>api('GET','versions?type='+type))||[];$('#ver').innerHTML=vs.map(v=>`<option>${v}</option>`).join('')};lv();
 $('#ty').querySelectorAll('button').forEach(b=>b.onclick=()=>{type=b.dataset.y;$('#ty').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));$('#ph').textContent=type==='paper'?'Spark, LuckPerms, EssentialsX':'Fabric API, Lithium, FerriteCore, Spark';lv()});
 $('#ram').oninput=()=>$('#rl').textContent=val('ram')+' GB';$('#as').onchange=()=>$('#ir').hidden=!val('as');
 $('#if').onchange=e=>{const f=e.target.files[0];if(!f)return;const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),m=Math.min(im.width,im.height);
  x.drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,64,64);icon=c.toDataURL('image/png');$('#ip').src=icon};im.src=URL.createObjectURL(f)};
 $('#mk').onclick=()=>run(async()=>{await api('POST','create',{name:val('name'),motd:val('motd'),maxPlayers:val('mp'),ram:val('ram')*1024,version:val('ver'),type,icon,plugins:val('pl'),autoShutdown:val('as'),idle:val('idle'),autoStart:val('au'),eula:val('eula')});boot()})}

function installView(){A.innerHTML=`<div class="login"><div class="logo">⛏</div><h1>Setting up…</h1><p class="mut" id="im">${esc(S.installing)}</p><div class="prog"><i></i></div></div>`;
 const t=setInterval(async()=>{S=await api('GET','state');if(S.installErr){clearInterval(t);toast(S.installErr);chooser()}else if(!S.installing){clearInterval(t);boot()}else $('#im').textContent=S.installing},1500)}

const fixIcons=()=>document.querySelectorAll('.hicon img').forEach(i=>i.onerror=()=>i.remove());
const kind=()=>S.cfg.type==='paper'?'Paper':'Fabric';
function dash(){es?.close();clearInterval(poll);
 A.innerHTML=`<div class="head"><div class="hl"><div class="hicon">⛏<img src="/api/icon?t=${Date.now()}" alt=""></div><div><h1>${esc(S.cfg.name)}</h1><span class="mut">${kind()} ${esc(S.cfg.version)}</span></div></div><div><span id="st" class="pill"></span><button class="sm" id="lo">Sign out</button></div></div>
 <div class="tabs">${['Overview','Plugins','Files','Settings'].map(t=>`<button class="${t===tab?'on':''}" data-t="${t}">${t}</button>`).join('')}</div><div id="v"></div>`;
 A.querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>{tab=b.dataset.t;dash()});$('#lo').onclick=async()=>{await api('POST','logout');loginView()};fixIcons();
 poll=setInterval(async()=>{try{S=await api('GET','state');paint()}catch{}},3000);({Overview:overview,Plugins:plugins,Files:files,Settings:settings})[tab]();paint()}
function paint(){const s=$('#st');if(!s)return;s.className='pill '+S.status;s.textContent=S.status;
 const p=$('#pl2');if(p)p.innerHTML=S.players.length?S.players.map(n=>`<span class="chip">${esc(n)}</span>`).join(''):'<span class="mut">Nobody online</span>';
 const d=$('#ds');if(d)d.textContent=S.discord||'';const c=$('#cnt');if(c)c.textContent=`${S.players.length} / ${S.cfg.maxPlayers}`}

function overview(){$('#v').innerHTML=`<div class="stats"><div class="stat"><span>Players</span><b id="cnt"></b></div><div class="stat"><span>Software</span><b>${kind()}</b></div><div class="stat"><span>Memory</span><b>${(S.cfg.ram/1024).toFixed(1)} GB</b></div></div>
 <div class="card pad"><div class="cap">Online now</div><div id="pl2"></div></div>
 <div class="btns"><button class="ok" data-a="start">Start</button><button class="blk" data-a="restart">Restart</button><button class="dng" data-a="stop">Stop</button></div>
 <h2>Console</h2><div id="con"></div><div class="cmd"><input id="ci" class="search" style="background-image:none;padding-left:14px" placeholder="Send a command…"><button class="pri" id="cs">Send</button></div>`;
 A.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>run(()=>api('POST',b.dataset.a),b.textContent+'…'));
 const con=$('#con');es=new EventSource('/api/logs');es.onmessage=e=>{const n=con.scrollTop+con.clientHeight>=con.scrollHeight-30;con.append(JSON.parse(e.data)+'\n');while(con.childNodes.length>400)con.firstChild.remove();if(n)con.scrollTop=con.scrollHeight};
 const send=()=>{const v=val('ci');if(v){api('POST','cmd',{cmd:v});$('#ci').value=''}};$('#cs').onclick=send;$('#ci').addEventListener('keydown',e=>{if(e.key==='Enter')send()})}

async function plugins(){const dir=S.cfg.type==='paper'?'plugins':'mods';
 $('#v').innerHTML=`<div class="cmd"><input id="q" class="search" placeholder="Search Modrinth for ${esc(S.cfg.version)}…"><button class="pri" id="qs">Search</button></div>
 <div id="res"></div><h2>Installed</h2><div class="card pad" id="inst"></div><h2>Upload</h2><div class="card pad"><label class="fld"><span>Add a .jar file</span><input type="file" id="up" accept=".jar"></label></div>`;
 const list=async()=>{const l=await api('GET','plugins');$('#inst').innerHTML=l.length?l.map(f=>`<div class="row"><div class="g">${esc(f)}</div><button class="sm dng" data-d="${esc(f)}">Remove</button></div>`).join(''):'<span class="mut">No plugins installed</span>';
  $('#inst').querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>confirm('Remove '+b.dataset.d+'?')&&run(async()=>{await api('DELETE','file?p='+encodeURIComponent(dir+'/'+b.dataset.d));list()},'Removed'))};list();
 const search=()=>run(async()=>{const r=await api('GET','plugins/search?q='+encodeURIComponent(val('q')));$('#res').innerHTML='<div class="card pad">'+(r.map(p=>`<div class="row">${p.icon?`<img class="ic" src="${esc(p.icon)}" alt="">`:'<div class="ic"></div>'}<div class="g"><b>${esc(p.title)}</b><small>${esc(p.description)}</small></div><button class="sm pri" data-i="${esc(p.slug)}">Install</button></div>`).join('')||'<span class="mut">No results</span>')+'</div>';
  $('#res').querySelectorAll('[data-i]').forEach(b=>b.onclick=()=>{b.disabled=true;b.textContent='…';run(async()=>{await api('POST','plugins/install',{slug:b.dataset.i});b.textContent='Done';list()},'Installed — restart to apply').then(()=>b.disabled=false)})});
 $('#qs').onclick=search;$('#q').addEventListener('keydown',e=>{if(e.key==='Enter')search()});search();
 $('#up').onchange=e=>run(async()=>{const f=e.target.files[0];await api('POST',`upload?p=${dir}&name=${encodeURIComponent(f.name)}`,f,1);list()},'Uploaded')}

async function files(){const v=$('#v');
 const open=async p=>{fp=p;const l=await api('GET','files?p='+encodeURIComponent(p)),parts=p.split('/').filter(Boolean),pre=p?p+'/':'';
  v.innerHTML=`<div class="crumb"><a data-p="">server</a>${parts.map((x,i)=>' / <a data-p="'+esc(parts.slice(0,i+1).join('/'))+'">'+esc(x)+'</a>').join('')}</div>
  <input id="ff" class="search" placeholder="Filter this folder…"><div class="card pad" id="fl"></div>
  <div class="btns"><button id="mkd">New folder</button><button id="upb">Upload file</button><input type="file" id="fu" hidden></div>`;
  const draw=()=>{const q=val('ff').toLowerCase(),m=l.filter(f=>f.name.toLowerCase().includes(q));
   $('#fl').innerHTML=m.map(f=>`<div class="row f" data-n="${esc(f.name)}" data-d="${f.dir?1:0}"><div class="g nm">${f.dir?'📁':'📄'} ${esc(f.name)}</div><span class="mut">${f.dir?'':(f.size/1024).toFixed(1)+' KB'}</span><button class="sm dng" data-x="${esc(f.name)}">Delete</button></div>`).join('')||'<span class="mut">Nothing here</span>';
   $('#fl').querySelectorAll('.f').forEach(r=>r.onclick=e=>{if(e.target.dataset.x)return;r.dataset.d==='1'?open(pre+r.dataset.n):edit(pre+r.dataset.n)});
   $('#fl').querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>confirm('Delete '+b.dataset.x+'?')&&run(async()=>{await api('DELETE','file?p='+encodeURIComponent(pre+b.dataset.x));open(p)},'Deleted'))};draw();
  $('#ff').oninput=draw;v.querySelectorAll('[data-p]').forEach(a=>a.onclick=()=>open(a.dataset.p));
  $('#mkd').onclick=()=>{const n=prompt('Folder name');n&&run(async()=>{await api('POST','mkdir?p='+encodeURIComponent(pre+n));open(p)})};
  $('#upb').onclick=()=>$('#fu').click();
  $('#fu').onchange=e=>run(async()=>{const f=e.target.files[0];await api('POST',`upload?p=${encodeURIComponent(p)}&name=${encodeURIComponent(f.name)}`,f,1);open(p)},'Uploaded')};
 const edit=async n=>{const r=await run(()=>api('GET','file?p='+encodeURIComponent(n)));if(!r)return;
  v.innerHTML=`<div class="crumb">${esc(n)}</div><textarea id="ta" spellcheck="false">${esc(r.content)}</textarea><div class="btns"><button id="bk">Back</button><button class="pri" id="sv">Save</button></div>`;
  $('#bk').onclick=()=>open(fp);$('#sv').onclick=()=>run(()=>api('PUT','file?p='+encodeURIComponent(n),{content:val('ta')}),'Saved')};
 open(fp)}

async function settings(){const c=S.cfg,d=c.discord||{},pr=await api('GET','props');
 const SEC=['General','Automation','Discord','Backups','Properties','Security','Danger zone'],ICO={General:'⚙️',Automation:'⏱',Discord:'💬',Backups:'📦',Properties:'🧾',Security:'🛡️','Danger zone':'⚠️'};
 const V={name:c.name,motd:c.motd,mp:c.maxPlayers,ram:c.ram,as:c.autoShutdown,idle:c.idle,au:c.autoStart,tk:'',or:d.opRole||'',pc:d.panelChat||'',cc:d.consoleChat||'',xc:d.crossChat||'',ar:c.autoRestart!==false,ev:d.events!==false,sm:d.statusMsgs!==false},P={...pr},P0={...pr};
 const F=[['General','name','Server name','','text'],['General','motd','MOTD','Second line in the server list. The server name is shown highlighted above it','text'],['General','mp','Max players','','number'],['General','ram','RAM (MB)','Applies on next start','number'],
  ['Automation','as','Auto shutdown','Stop the server when nobody is online','sw'],['Automation','idle','Idle timeout (minutes)','Used by auto shutdown','number'],['Automation','au','Auto start','Wake the server when someone tries to join','sw'],['Automation','ar','Auto restart on crash','Restart automatically if the server crashes (max 3 per 10 min)','sw'],
  ['Discord','tk','Bot token',d.hasToken?'Saved. Leave blank to keep it':'From the Developer Portal','password'],['Discord','or','Op role ID','Allowed to Stop & Restart','text'],['Discord','pc','Panel channel ID','Status, players & buttons','text'],['Discord','cc','Console channel ID','Live console + commands','text'],['Discord','xc','Cross-chat channel ID','Minecraft ⇄ Discord chat','text'],['Discord','ev','Join, leave, death & advancement messages','Posted in the cross-chat channel','sw'],['Discord','sm','Server start/stop messages','Posted in the cross-chat channel','sw'],
  ...Object.keys(pr).map(k=>['Properties',k,k,'','prop'])];
 const one=([,id,l,h,t])=>{
  if(t==='sw')return`<label class="row sw"><div class="g">${l}<small>${h}</small></div><input type="checkbox" class="tog" data-f="${id}" ${V[id]?'checked':''}></label>`;
  if(t==='prop'){const v=P[id];return v==='true'||v==='false'?`<label class="row sw"><div class="g">${esc(l)}</div><input type="checkbox" class="tog" data-p="${esc(id)}" ${v==='true'?'checked':''}></label>`:`<label class="fld"><span>${esc(l)}</span><input data-p="${esc(id)}" value="${esc(v)}" autocomplete="off"></label>`}
  return`<label class="fld"><span>${l}</span><input data-f="${id}" type="${t}" value="${esc(V[id])}" placeholder="${esc(l)}" autocomplete="off">${h?`<small>${h}</small>`:''}</label>`};
 const bk=()=>`<div class="card pad">${S.backups.map(b=>`<div class="row"><div class="g">${esc(b)}</div><button class="sm" data-r="${esc(b)}">Restore</button><button class="sm dng" data-x="${esc(b)}">Delete</button></div>`).join('')}<div class="row"><button id="bk" class="sm blk">Create backup now</button></div></div>`;
 const danger=()=>`<div class="card pad"><div class="cap">Delete server</div><p class="mut" style="margin-bottom:10px">Permanently removes the world, mods/plugins, configs and everything in <code>server/</code>. Your login and Discord settings are kept.</p>${S.status!=='offline'?'<p style="color:var(--bad);font-weight:600;margin-bottom:10px">Stop the server before deleting it.</p>':''}
  ${sw('db','Create a backup first','Saved in the backups folder',1)}${sw('dd','Also delete all backups','This cannot be undone',0)}
  <label class="fld" style="margin-top:12px"><span>Confirm with your panel password</span><input id="dp" type="password" placeholder="Password" autocomplete="current-password"></label>
  <button class="big" id="del" style="background:var(--bad);color:#fff;margin-top:14px">Delete server</button></div>`;
 const iconCard=()=>`<div class="card pad" style="margin-bottom:12px"><div class="iconrow"><div class="hicon">⛏<img src="/api/icon?t=${Date.now()}" alt=""></div><div class="g" style="flex:1"><b>Server icon</b><small class="mut" style="display:block">Shown in the Minecraft server list (64×64). Restart to apply.</small></div><input type="file" id="sif" accept="image/*" style="max-width:46%"></div></div>`;
 const bot='<div class="card pad"><div class="row"><div class="g">Bot status</div><span class="mut" id="ds"></span></div></div>';
 $('#v').innerHTML=`<input id="sq" class="search" type="search" placeholder="Search settings…" autocomplete="off"><div class="set"><nav class="nav" id="nav">${SEC.map(s=>`<button data-s="${s}">${ICO[s]} ${s}</button>`).join('')}</nav>
  <div><div id="pane"></div><div class="savebar"><button class="pri big" id="sv" style="margin:0">Save changes</button></div></div></div>`;
 const view=()=>{const q=val('sq').trim().toLowerCase();let h='';
  if(q){const m=F.filter(f=>f.join(' ').toLowerCase().includes(q));
   for(const s of SEC){const x=m.filter(f=>f[0]===s);if(x.length)h+=`<h2>${s}</h2><div class="card pad grid">${x.map(one).join('')}</div>`}
   if(q.includes('backup')||'backups'.startsWith(q))h+='<h2>Backups</h2>'+bk();if(/delete|danger|remove|reset/.test(q))h+='<h2>Danger zone</h2>'+danger();
   if(!h)h=`<div class="card pad mut">No settings match “${esc(q)}”</div>`}
  else if(sec==='Backups')h=bk();else if(sec==='Security')h='<div id="sx"><div class="card pad mut">Loading…</div></div>';else if(sec==='Danger zone')h=danger();
  else{const x=F.filter(f=>f[0]===sec);h=x.length?`<div class="card pad grid">${x.map(one).join('')}</div>`:'<div class="card pad mut">Start the server once to generate server.properties.</div>';if(sec==='Discord')h+=bot;if(sec==='General')h=iconCard()+h}
  $('#pane').innerHTML=h;if(sec==='Security'&&!q)secView();$('#nav').querySelectorAll('button').forEach(b=>b.classList.toggle('on',!q&&b.dataset.s===sec));paint();
  $('#pane').querySelectorAll('[data-r]').forEach(b=>b.onclick=()=>confirm('Replace current server with this backup?')&&run(async()=>{await api('POST','restore',{name:b.dataset.r});boot()},'Restored'));
  $('#pane').querySelectorAll('[data-x]').forEach(b=>b.onclick=()=>run(async()=>{await api('DELETE','backups?name='+encodeURIComponent(b.dataset.x));S=await api('GET','state');view()}));
  fixIcons();const sf=$('#sif');if(sf)sf.onchange=e=>{const f=e.target.files[0];if(!f)return;const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=64;const m=Math.min(im.width,im.height);c.getContext('2d').drawImage(im,(im.width-m)/2,(im.height-m)/2,m,m,0,0,64,64);run(async()=>{await api('POST','icon',{icon:c.toDataURL('image/png')});view()},'Icon updated — restart to apply')};im.src=URL.createObjectURL(f)};
  const dl=$('#del');if(dl)dl.onclick=()=>{if(!confirm('Delete this server permanently? This cannot be undone.'))return;run(async()=>{await api('POST','delete',{password:val('dp'),backup:val('db'),deleteBackups:val('dd')});boot()},'Server deleted')};
  const k=$('#bk');if(k)k.onclick=()=>run(async()=>{await api('POST','backups');S=await api('GET','state');view()},'Backup created')};
 const secView=async()=>{const x=$('#sx');if(!x)return;
  const[sc,au]=await Promise.all([api('GET','security'),api('GET','audit')]).catch(()=>[null,null]);if(!sc)return;
  x.innerHTML=`<div class="card pad"><div class="cap">Server hardening</div>${sc.hard.map(c=>`<div class="row"><div class="g">${c.ok?'✅':'⚠️'} ${c.label}</div></div>`).join('')}
  ${sc.hard.every(c=>c.ok)?'':'<button class="pri big" id="hd">Apply recommended settings</button>'}<small class="mut" style="display:block;margin-top:8px">With the whitelist on, only players you add can join. Add them in the Overview console: <code>whitelist add Name</code>. Restart to apply.</small></div>
  <div class="card pad"><div class="cap">Operators</div>${sc.ops.length?sc.ops.map(o=>`<span class="chip">${esc(o)}</span>`).join(''):'<span class="mut">No operators</span>'}<small class="mut" style="display:block;margin-top:8px">Operators have full control. Remove anyone you don't trust with <code>deop Name</code>.</small></div>
  <div class="card pad"><div class="cap">Two-factor login</div><div id="tf">${sc.totp?'<p style="margin-bottom:10px">✅ Enabled</p><label class="fld"><span>Password to disable</span><input id="tdp" type="password" autocomplete="off"></label><button class="big" id="tdis" style="margin-top:10px">Disable 2FA</button>':'<p class="mut" style="margin-bottom:10px">Use an authenticator app (Google Authenticator, Authy, 1Password). Strongly recommended.</p><button class="pri big" id="ten">Enable 2FA</button>'}</div></div>
  <div class="card pad"><div class="cap">Password &amp; sessions</div><div class="grid">${fld('po','Current password','',{t:'password'})}${fld('pn','New password (12+ chars)','',{t:'password'})}</div><button class="big blk" id="pw" style="margin-top:12px">Change password</button><button class="big" id="so" style="margin-top:8px">Sign out all other sessions</button></div>
  <div class="card pad"><div class="cap">Activity log</div>${au.length?au.map(r=>`<div class="row" style="min-height:0;padding:7px 0;font-size:13px${/FAILED|blocked/.test(r.a)?';color:var(--bad)':''}"><span class="mut" style="flex:none;width:118px">${new Date(r.t).toLocaleString([],{dateStyle:'short',timeStyle:'short'})}</span><span class="mut" style="flex:none;width:105px">${esc(r.ip)}</span><div class="g" style="word-break:break-all;font-weight:400">${esc(r.a)}</div></div>`).join(''):'<span class="mut">Nothing yet</span>'}</div>
  <div class="card pad"><div class="cap">Installed ${S.cfg.type==='paper'?'plugins':'mods'}</div><p class="mut" style="margin-bottom:10px">Unknown or recently changed jars are the #1 way servers get backdoored.</p><button class="big" id="jr">Scan &amp; show checksums</button><div id="jl"></div></div>`;
  const g=i=>x.querySelector(i);
  if(g('#hd'))g('#hd').onclick=()=>run(async()=>{await api('POST','hardening');secView()},'Applied. Restart to take effect');
  if(g('#ten'))g('#ten').onclick=()=>run(async()=>{const r=await api('POST','totp/setup');$('#tf').innerHTML=`<p class="mut" style="margin-bottom:8px">Add this key in your authenticator app (enter it manually, time-based):</p><p><code style="font-size:15px;word-break:break-all;user-select:all">${r.secret}</code></p><label class="fld" style="margin-top:12px"><span>Enter the 6-digit code to confirm</span><input id="tcv" inputmode="numeric" maxlength="6" autocomplete="off"></label><button class="pri big" id="tok" style="margin-top:10px">Confirm &amp; enable</button>`;$('#tok').onclick=()=>run(async()=>{await api('POST','totp/enable',{code:val('tcv')});secView()},'2FA enabled')});
  if(g('#tdis'))g('#tdis').onclick=()=>run(async()=>{await api('POST','totp/disable',{password:val('tdp')});secView()},'2FA disabled');
  g('#pw').onclick=()=>run(async()=>{await api('POST','password',{old:val('po'),new:val('pn')});$('#po').value=$('#pn').value=''},'Password changed');
  g('#so').onclick=()=>run(()=>api('POST','sessions/clear'),'Other sessions signed out');
  g('#jr').onclick=()=>run(async()=>{const l=await api('GET','jars');$('#jl').innerHTML=l.map(j=>`<div class="row" style="padding:8px 0;min-height:0;font-size:13px"><div class="g" style="word-break:break-all"><b>${esc(j.name)}</b><small>${(j.size/1024).toFixed(0)} KB · modified ${new Date(j.mtime).toLocaleString()} · sha256 ${j.sha.slice(0,16)}…</small></div></div>`).join('')||'<p class="mut" style="margin-top:10px">None</p>'})};
 const upd=e=>{const t=e.target,f=t.dataset.f,p=t.dataset.p,x=t.type==='checkbox';if(f!=null)V[f]=x?t.checked:t.value;else if(p!=null)P[p]=x?String(t.checked):t.value};
 $('#pane').oninput=$('#pane').onchange=upd;$('#sq').oninput=view;$('#nav').onclick=e=>{const s=e.target.dataset.s;if(s){sec=s;$('#sq').value='';view()}};
 $('#sv').onclick=()=>run(async()=>{await api('POST','settings',{name:V.name,motd:V.motd,maxPlayers:V.mp,ram:V.ram,autoShutdown:V.as,idle:V.idle,autoStart:V.au,autoRestart:V.ar,discord:{events:V.ev,statusMsgs:V.sm,token:V.tk,opRole:V.or,panelChat:V.pc,consoleChat:V.cc,crossChat:V.xc}});
  const ch={};for(const k in P)if(P[k]!==P0[k])ch[k]=P[k];if(Object.keys(ch).length){await api('POST','props',ch);Object.assign(P0,ch)}
  V.tk='';S=await api('GET','state');view()},'Saved');
 view()}
boot();
