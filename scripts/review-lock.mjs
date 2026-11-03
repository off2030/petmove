#!/usr/bin/env node
/** Same-PC operation coordination. Locks never expire or steal another owner's work. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
function fileFor(base,key) {
  if(key!=='history'&&!/^case:[a-zA-Z0-9-]+$/.test(key))throw Error('Use history or case:<caseId> lock');
  return path.join(base,createHash('sha256').update(key).digest('hex')+'.json');
}
export function acquireLock(base,key,owner) {
  if(typeof owner!=='string'||!owner.trim()||owner.length>300)throw Error('Run owner required');
  fs.mkdirSync(base,{recursive:true});
  const file=fileFor(base,key);
  let fd;
  try{fd=fs.openSync(file,'wx');}catch(e){if(e.code==='EEXIST')return {acquired:false,key,held:true};throw e;}
  try{fs.writeFileSync(fd,JSON.stringify({key,owner,createdAt:new Date().toISOString()}));}finally{fs.closeSync(fd);}
  return {acquired:true,key};
}
export function releaseLock(base,key,owner) {
  const file=fileFor(base,key),held=JSON.parse(fs.readFileSync(file,'utf8'));
  if(held.owner!==owner||held.key!==key)throw Error('Only the owning run may release this lock');
  fs.unlinkSync(file);return {released:true,key};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  try {
    const args=process.argv.slice(2),opt=k=>{const i=args.indexOf('--'+k);return i<0?'':args[i+1]};
    const base=path.join(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'automation-calendar','review-locks');
    const action={acquire:acquireLock,release:releaseLock}[args[0]];
    if(!action)throw Error('Use acquire/release --key --owner');
    const result=action(base,opt('key'),opt('owner'));console.log(JSON.stringify(result));
    if(result.acquired===false)process.exitCode=2;
  }catch(e){console.error('[review-lock] '+e.message);process.exitCode=1;}
}
