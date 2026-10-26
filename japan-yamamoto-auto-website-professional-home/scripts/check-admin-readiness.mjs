import {spawnSync} from 'node:child_process';
const blocked=["fc3e840b35b758e6f1f4ca8a4c15d8b3159a9caa90ee486332d66fa4590c4b25", "f152aacfb61823818d827d728e1556ea23fdb066670d9f6de32c122d93efbd65", "f7c80072e612e6ea23db65a13b5d0f0b91fd5cbd8f5a059f2d46239cfb8fbab6", "1b7b5a2cd58880fa3c76a7c5d6715ea1a16f84cbacd45a9885bee95e9f7af6f9"];
const sql="SELECT COUNT(*) AS safe_admins FROM yamamoto_admins_v2 WHERE password_hash NOT IN ("+blocked.map(h=>"'"+h+"'").join(',')+")";
const result=spawnSync('npx',['--yes','wrangler@latest','d1','execute','yamamoto-auto-db','--remote','--json','--command',sql],{encoding:'utf8'});
if(result.status!==0)throw Error('Could not verify admin readiness. Deployment stopped; production unchanged.');
let data;try{data=JSON.parse(result.stdout)}catch{throw Error('Unexpected D1 response. Deployment stopped.');}
const count=data?.[0]?.results?.[0]?.safe_admins;
if(!(Number(count)>0))throw Error('No administrator has a safe password. Change an admin password in the existing website before deployment, then rerun. Production was not changed.');
console.log('Admin readiness verified: an administrator with a non-legacy password exists.');
