// Run locally with Cloudflare D1 permissions; never commit the password.
import {pbkdf2Sync,randomBytes} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const email=process.env.YAMAMOTO_ADMIN_EMAIL?.trim().toLowerCase();
const password=process.env.YAMAMOTO_ADMIN_PASSWORD;
if(!email||!password||password.length<16)throw Error('Set YAMAMOTO_ADMIN_EMAIL and YAMAMOTO_ADMIN_PASSWORD (at least 16 characters).');
const salt=randomBytes(24).toString('hex');const hash=pbkdf2Sync(password,salt,100000,32,'sha256').toString('hex');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const dir=mkdtempSync(join(tmpdir(),'yamamoto-reset-'));const file=join(dir,'reset.sql');
try{writeFileSync(file,`INSERT INTO yamamoto_admins_v2(email,password_hash,salt,created_at) VALUES(${quote(email)},${quote(hash)},${quote(salt)},datetime('now')) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash,salt=excluded.salt;
INSERT INTO yamamoto_admin_state_v1(email,must_change_password) VALUES(${quote(email)},0) ON CONFLICT(email) DO UPDATE SET must_change_password=0;
DELETE FROM yamamoto_sessions_v2 WHERE email=${quote(email)};`,{mode:0o600});
const childEnv={...process.env};delete childEnv.YAMAMOTO_ADMIN_PASSWORD;
const result=spawnSync('npx',['--yes','wrangler@latest','d1','execute','yamamoto-auto-db','--remote','--file',file],{stdio:'inherit',env:childEnv});if(result.error)throw result.error;process.exitCode=result.status??1;
}finally{rmSync(dir,{recursive:true,force:true})}
