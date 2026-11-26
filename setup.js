'use strict';
// One-time onboarding: asks for username + password, stores a scrypt hash in .env, starts the panel.
const fs=require('fs'),crypto=require('crypto'),readline=require('readline'),{spawnSync}=require('child_process');
if(fs.existsSync('.env')){console.log('Already set up → starting panel (delete .env to reset login).');require('./server.js');return}
const rl=readline.createInterface({input:process.stdin,output:process.stdout});
let muted=false;rl._writeToOutput=s=>{if(!muted||s.includes('\n'))rl.output.write(s)};
const ask=(q,hide)=>new Promise(r=>{rl.question(q,a=>{muted=false;r(a)});muted=!!hide});
(async()=>{
 console.log('\n  Minecraft Panel — first-time setup\n');
 if(spawnSync('java',['-version']).error)console.log('  ⚠ Java not found. Install Java 21+ (e.g. sudo apt install openjdk-21-jre-headless).\n');
 const user=(await ask('  Choose a username: ')).trim();
 let pw;for(;;){pw=await ask('  Choose a password (min 12 chars): ',1);console.log();if(pw.length>=12)break;console.log('  Too short.')}
 const port=(await ask('  Panel port [8080]: ')).trim()||'8080';
 const open=(await ask('  Reachable from other devices / the internet? (n = this machine only) [y/N]: ')).trim().toLowerCase()==='y';rl.close();
 if(!/^[\w.-]{3,32}$/.test(user)){console.log('Username: 3-32 chars (letters, digits . _ -)');process.exit(1)}
 const salt=crypto.randomBytes(16),h=crypto.scryptSync(pw,salt,64);
 fs.writeFileSync('.env',`PANEL_USER=${user}\nPANEL_PASS=${salt.toString('hex')}$${h.toString('hex')}\nPORT=${port}\nHOST=${open?'0.0.0.0':'127.0.0.1'}\nTRUST_PROXY=0\n`,{mode:0o600});
 console.log('\n  ✓ Saved (hashed) to .env\n  Tip: after login, enable 2FA in Settings → Security.\n');require('./server.js');
})();
