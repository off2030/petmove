#!/usr/bin/env node
/** Read-only DB snapshot for customer-notification tasks. No DB/storage mutation. */
import {createClient} from '@supabase/supabase-js'
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const output=process.argv[2]
if(!output)throw Error('Usage: node scripts/inspection-result-notice-snapshot.mjs <ignored-private-output.json>')
const target=path.resolve(root,output),privateRoot=path.join(root,'work','naver-inquiries')
const relative=path.relative(privateRoot,target)
if(relative.startsWith('..')||path.isAbsolute(relative)||!relative||path.extname(target)!=='.json')throw Error('Output must be a private JSON under work/naver-inquiries')
execFileSync('git',['check-ignore','--quiet','--',path.relative(root,target)],{cwd:root,stdio:'pipe'})
const env={}
for(const file of ['apps/admin/.env.local','apps/portal/.env.local']){
 const f=path.join(root,file);if(!existsSync(f))continue
 for(const line of readFileSync(f,'utf8').split(/\r?\n/)){const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}
}
Object.assign(env,process.env)
if(!env.NEXT_PUBLIC_SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Configured read-only lookup environment missing')
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const orgs=await db.from('organizations').select('id,name').eq('name','로잔동물의료센터')
if(orgs.error||orgs.data?.length!==1)throw Error('Organization not uniquely identified')
const org=orgs.data[0],attachments=[];let total=0,expected=null
for(let from=0;;from+=500){
 const q=await db.from('cases').select('id,pet_name,customer_name,data',{count:'exact'}).eq('org_id',org.id).is('deleted_at',null).order('id').range(from,from+499)
 if(q.error)throw q.error
 if(expected===null)expected=q.count
 else if(q.count!==expected)throw Error('Case count changed during scan; retry snapshot')
 total+=q.data.length
 for(const row of q.data){
  const data=row.data??{},files=new Map()
  for(const a of Array.isArray(data.notes)?data.notes:[])if(a?.type==='file'&&typeof a.path==='string')files.set(a.path,{name:a.name??'',path:a.path,size:a.size??null,uploadedAt:a.createdAt??null,source:'notes'})
  for(const a of Array.isArray(data.documents)?data.documents:[])if(a&&typeof a.path==='string')files.set(a.path,{...files.get(a.path),id:a.id??null,name:a.name??'',path:a.path,size:a.size??null,mime:a.mime??null,stepId:a.stepId??null,destination:a.destination??null,uploadedAt:a.uploadedAt??null,source:'documents'})
  for(const f of files.values()){
   const fingerprint=createHash('sha256').update(JSON.stringify([org.id,row.id,f.id??null,f.path,f.size,f.uploadedAt])).digest('hex')
   attachments.push({caseId:row.id,pet:row.pet_name,guardian:row.customer_name,...f,fingerprint,resultCandidate:/titer|infectious|test/i.test(String(f.stepId??''))||/검사|항체|result|test.report/i.test(f.name)})
  }
 }
 if(q.data.length<500)break
}
if(total!==expected)throw Error('Exact case count mismatch')
attachments.sort((a,b)=>a.caseId.localeCompare(b.caseId)||a.path.localeCompare(b.path))
const snapshot={version:1,checkedAt:new Date().toISOString(),organization:org,casesFetched:total,exactCount:expected,attachments}
mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(snapshot,null,2)+'\n')
console.log(JSON.stringify({organization:org.name,casesFetched:total,exactCountVerified:true,attachments:attachments.length,resultCandidates:attachments.filter(a=>a.resultCandidate).length,privateSnapshotWritten:true}))
