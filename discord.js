'use strict';
// Discord bridge (DiscordSRV-style, works on Fabric AND Paper because it reads the server log — no plugin needed).
// Panel message is created once and edited in place. Cross-chat uses a webhook so messages show the player's name + head.
const{execFile}=require('child_process');
let client,iv,flush;
async function load(a){try{return require('discord.js')}catch{}
 a.dstat('Installing discord.js (first time, ~30s)…');a.emit('[panel] installing discord.js…');
 await new Promise(r=>execFile(process.platform==='win32'?'npm.cmd':'npm',['i','discord.js@14','--no-audit','--no-fund'],{cwd:__dirname,shell:process.platform==='win32'},r));
 try{return require('discord.js')}catch{return null}}
const head=n=>`https://mc-heads.net/avatar/${encodeURIComponent(n)}/128`;
const DEATH=/^(was (slain|shot|killed|blown|pricked|fireballed|squashed|pummeled|impaled|struck|stung|skewered|doomed|obliterated|roasted|poked|squished)|died|drowned|fell |hit the ground|went up in flames|burned|blew up|tried to swim|walked into|starved|suffocated|experienced kinetic|withered|got finished|froze|didn't want|discovered|left the confines)/;
module.exports=async function(a){
 clearInterval(iv);clearInterval(flush);a.setHook(null);
 if(client){const c=client;client=null;try{c.destroy()}catch{}}
 const d=a.cfg.discord||{};if(!d.token){a.dstat('Not configured');return}
 const D=await load(a);if(!D){a.dstat('Could not install discord.js — run: npm i discord.js');return}
 const{Client,GatewayIntentBits:G,ActionRowBuilder:Row,ButtonBuilder:B,ButtonStyle:S,EmbedBuilder:E,Events}=D;
 const me=client=new Client({intents:[G.Guilds,G.GuildMessages,G.MessageContent]});
 const ch=async id=>{if(!id)return null;try{return me.channels.cache.get(id)||await me.channels.fetch(id)}catch{return null}};
 const isOp=m=>!!d.opRole&&!!m?.roles?.cache?.has(d.opRole),xc=()=>me.channels.cache.get(d.crossChat);
 const view=()=>{const s=a.status(),p=a.players(),ic={online:'🟢',offline:'🔴'}[s]||'🟡';
  return{embeds:[new E().setTitle(a.cfg.name||'Minecraft Server').setColor(s==='online'?0x34c759:s==='offline'?0xff3b30:0xffcc00)
   .setDescription(a.cfg.motd||null).addFields({name:'Status',value:`${ic} ${s[0].toUpperCase()+s.slice(1)}`,inline:true},
   {name:'Players',value:`${p.length}/${a.cfg.maxPlayers}`+(p.length?'\n'+p.join(', '):''),inline:true},{name:'Version',value:`${a.cfg.type==='paper'?'Paper':'Fabric'} ${a.cfg.version}`,inline:true})
   .setFooter({text:'Live panel · updates automatically'})],
  components:[new Row().addComponents(new B().setCustomId('start').setLabel('Start').setStyle(S.Success),
   new B().setCustomId('stop').setLabel('Stop').setStyle(S.Danger),new B().setCustomId('restart').setLabel('Restart').setStyle(S.Secondary))]}};
 let pm=null,last='',lastP='',wh=null,note='';
 async function ensure(){const c=await ch(d.panelChat);if(!c?.isTextBased()){a.dstat('Panel channel not found — check ID and bot access');return null}
  try{const[sc,sid]=(d.panelMsg||'').split(':');if(sc===c.id&&sid)pm=await c.messages.fetch(sid).catch(()=>null);
   if(!pm){const ms=await c.messages.fetch({limit:30}).catch(()=>null);pm=ms?.find(m=>m.author.id===me.user.id&&m.components.length)||null}
   if(!pm)pm=await c.send(view());d.panelMsg=c.id+':'+pm.id;a.save();return pm}
  catch(e){a.dstat('Panel error: '+(e.code===50013||e.code===50001?'bot needs View Channel, Send Messages & Embed Links in the panel channel':e.message));return null}}
 async function refresh(force){if(me!==client)return;const v=view(),k=JSON.stringify([a.status(),a.players(),a.cfg.name,a.cfg.motd,a.cfg.maxPlayers,a.cfg.version]);
  if(!force&&k===last)return;if(!pm&&!await ensure())return;
  try{await pm.edit(v);last=k}catch(e){if(e.code===10008){pm=null;last='';delete d.panelMsg}else a.dstat('Panel error: '+e.message)}}
 const pres=()=>{const s=a.status(),n=a.players().length,t=s==='online'?`${n} player${n===1?'':'s'} online`:s==='offline'?'Server offline':'Server '+s;
  if(t!==lastP){lastP=t;me.user.setPresence({status:s==='online'?'online':'idle',activities:[{name:t,type:3}]})}};
 me.once(Events.ClientReady,async()=>{note='Connected as '+me.user.tag;
  const c=await ch(d.crossChat);if(c?.fetchWebhooks){try{wh=(await c.fetchWebhooks()).find(w=>w.owner?.id===me.user.id)||await c.createWebhook({name:'Minecraft Chat'})}catch{note+=' · cross-chat: grant Manage Webhooks for player heads/names'}}
  a.dstat(note);pres();await refresh(true);iv=setInterval(()=>{pres();refresh()},4000)});
 me.on('error',e=>a.dstat('Error: '+e.message));
 me.on('interactionCreate',async i=>{if(!i.isButton()||i.message.id!==pm?.id)return;const id=i.customId;
  if(id!=='start'&&!isOp(i.member))return i.reply({content:'You need the op role for that.',ephemeral:true}).catch(()=>{});
  await i.deferUpdate().catch(()=>{});a[id]();setTimeout(()=>refresh(),1500)});
 me.on('messageCreate',m=>{if(m.author.bot||m.webhookId)return;
  if(m.channelId===d.consoleChat&&isOp(m.member))a.cmd(m.content);
  else if(m.channelId===d.crossChat&&a.status()==='online'){
   const n=m.member?.displayName||m.author.username,col=m.member?.displayHexColor,t=((m.cleanContent||'').replace(/\s+/g,' ').trim()+(m.attachments.size?' [attachment]':'')).trim();if(!t)return;
   a.cmd('tellraw @a '+JSON.stringify([{text:'[Discord] ',color:'blue'},{text:n,color:col&&col!=='#000000'?col:'gray'},{text:' » ',color:'dark_gray'},{text:t.slice(0,256),color:'white'}]))}});
 const post=p=>xc()?.send(p).catch(()=>{}),emb=(col,n,t)=>new E().setColor(col).setAuthor({name:t,iconURL:head(n)});
 const chat=(n,t)=>{const c=xc();if(!c)return;t=t.slice(0,1900);
  if(wh)wh.send({content:t,username:n,avatarURL:head(n),allowedMentions:{parse:[]}}).catch(()=>{});else c.send({content:`**${n}** » ${t}`,allowedMentions:{parse:[]}}).catch(()=>{})};
 let buf=[];
 a.setHook(l=>{buf.push(l.replace(/```/g,"'''").slice(0,300));
  let m=l.match(/\]: (?:\[Not Secure\] )?<([\w.]{1,16})> (.+)$/);if(m)return chat(m[1],m[2]);
  if(d.events!==false){
   if(m=l.match(/\]: (\w{1,16}) (joined|left) the game$/))return post({embeds:[emb(m[2]==='joined'?0x34c759:0xff3b30,m[1],`${m[1]} ${m[2]==='joined'?'joined the server':'left the server'}`)]});
   if(m=l.match(/\]: (\w{1,16}) (has (?:made the advancement|completed the challenge|reached the goal) .+)$/))return post({embeds:[emb(0xffcc00,m[1],`${m[1]} ${m[2]}`)]});
   if((m=l.match(/\]: (\w{1,16}) (.+)$/))&&a.players().includes(m[1])&&DEATH.test(m[2]))return post({embeds:[emb(0x8e8e93,m[1],`${m[1]} ${m[2]}`)]})}
  if(d.statusMsgs!==false){if(/\]: Done \(/.test(l))post({embeds:[new E().setColor(0x34c759).setTitle('✅ Server started')]});else if(/\]: Stopping server/.test(l))post({embeds:[new E().setColor(0xff3b30).setTitle('🛑 Server stopped')]})}});
 flush=setInterval(()=>{const c=me.channels.cache.get(d.consoleChat);if(!c||!buf.length)return;const t=buf.join('\n');buf=[];
  for(let i=0;i<t.length&&i<7600;i+=1900)c.send('```\n'+t.slice(i,i+1900)+'\n```').catch(()=>{})},2500);
 me.login(d.token).catch(e=>a.dstat('Login failed: '+e.message+(/intent/i.test(e.message)?' → enable MESSAGE CONTENT INTENT in the Developer Portal (Bot tab)':'')));
};
