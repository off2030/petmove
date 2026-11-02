#!/usr/bin/env node
/** Read-only Work scan + private report coverage gate. Never writes customer data. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {loadReviewSelectors} from './lib/daily-review-source.mjs';
import {POLICY_VERSION,kstDay,collectObligations,reconcile,validateReview,digest} from './lib/daily-review-policy.mjs';
export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n');
export function privatePath(value) {
  const target=path.resolve(ROOT,value),base=path.join(ROOT,'work/naver-inquiries');
  const rel=path.relative(base,target);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel))throw Error('Use a private path under work/naver-inquiries');
  execFileSync('git',['check-ignore','--quiet','--',path.relative(ROOT,target)],{cwd:ROOT,stdio:'pipe'});
  // Do not follow a symlink/junction out of the private workspace.
  let p=target;while(!fs.existsSync(p))p=path.dirname(p);
  const actual=path.relative(fs.realpathSync(base),fs.realpathSync(p));
  if(actual.startsWith('..')||path.isAbsolute(actual))throw Error('Private path escapes workspace');
  return target;
}
function dbClient(){
  const {createClient}=createRequire(new URL('../apps/admin/package.json',import.meta.url))('@supabase/supabase-js');
  const env={};for(const name of ['apps/admin/.env.local','apps/portal/.env.local']) {
    const p=path.join(ROOT,name);if(!fs.existsSync(p))continue;
    for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)) {const m=line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);if(m)env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}
  }
  Object.assign(env,process.env);
  if(!env.NEXT_PUBLIC_SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('Read-only lookup environment missing');
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
}
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
export function historyTasks(history,cases,org) {
  const tasks=[], map=new Map(cases.map(c=>[c.id,c]));
  const add=(x,key,interrupted=false)=>{
    const ids=x.caseIds??[x.caseId??x.evidence?.caseId].filter(Boolean);
    const declared=x.orgId??x.organizationId;
    if(declared&&declared!==org.id)return;
    if(!ids.length) {
      // Unidentified legacy work cannot be silently dismissed as another org.
      if(!declared||declared===org.id)tasks.push({orgId:org.id,key,caseId:null,pet:x.pet??x.animal??'',guardian:x.guardian??'',nextAction:'대상 조직·케이스 식별 필요: '+(x.next??x.task??x.reason??''),interrupted:true});
      return;
    }
    for(const id of ids) {
      const c=map.get(id);if(!c){if(declared===org.id)tasks.push({orgId:org.id,key:key+':'+id,caseId:null,pet:x.pet??'',nextAction:'공유 이력의 로잔 대상이 현재 비삭제 케이스에 없음. 삭제·다른 여행 여부 확인',interrupted:true});continue;}
      tasks.push({orgId:org.id,key:key+':'+id,caseId:id,pet:c.pet_name,guardian:c.customer_name,destination:x.destination??null,nextAction:x.next??x.nextAction??x.task??x.reason??x.remaining??'미완료 할 일의 다음 행동 확인',interrupted});
    }
  };
  for(const [i,x] of (history.pending??[]).entries())add(x,'pending:'+(x.key??x.messageId??x.caseId??i));
  for(const [i,x] of (history.manualNaccsContinuation?.remaining??[]).entries())add(x,'manual-naccs:'+(x.caseId??i),true);
  // Canonical place for new interrupted commands, including non-NACCS workflows.
  for(const x of history.delegatedTasks??[])if(!x.resolvedAt&&!x.cancelledAt)add(x,'delegated:'+x.id,true);
  const queue=history.kakaoResultNoticeQueue;
  if(queue?.organization?.id===org.id)for(const x of queue.tasks??[])if(!x.resolvedAt&&!x.cancelledAt)add({...x,orgId:org.id,nextAction:x.remainingAction??x.waitingFor??'결과 안내 남은 확인'},'result-notice:'+x.taskId);
  const booking=history.visitBookingNoticeQueue;
  if(booking?.organization?.id===org.id)for(const x of booking.tasks??[])if(!x.resolvedAt&&!x.cancelledAt)add({...x,orgId:org.id,nextAction:x.remainingAction??'내원 예약 안내 문구 확인·발송 또는 예약 회신 대기'},'visit-booking:'+x.taskId);
  return tasks;
}
export function historyFindings(history,cases,org) {
  const ids=new Set(cases.map(c=>c.id));
  return (history.attachmentReviewFindings??[]).filter(x=>!x.resolvedAt&&!x.cancelledAt&&x.orgId===org.id).map((x,i)=>({orgId:org.id,caseId:ids.has(x.caseId)?x.caseId:null,key:'attachment:'+(x.fingerprint??i),pet:x.pet??'',guardian:x.guardian??'',destination:x.destination??null,reason:[x.finding,x.remainingAction].filter(Boolean).join('; ')}));
}
export async function scan(history,dir,runId) {
  process.env.TZ='Asia/Seoul';
  if(history.account!=='lvmcfile@gmail.com')throw Error('Shared history account mismatch');
  const db=dbClient();
  const o=await db.from('organizations').select('id,name').eq('name','로잔동물의료센터');
  if(o.error||o.data?.length!==1)throw Error('Organization not uniquely identified');
  const organization=o.data[0],cases=[];let count=null;
  for(let from=0;;from+=500) {
    const q=await db.from('cases').select('*',{count:'exact'}).eq('org_id',organization.id).is('deleted_at',null).order('id').range(from,from+499);
    if(q.error)throw Error('Case scan failed');
    if(count===null)count=q.count;else if(count!==q.count)throw Error('Case count changed during scan');
    cases.push(...q.data);if(q.data.length<500)break;
  }
  if(count!==cases.length||new Set(cases.map(c=>c.id)).size!==count)throw Error('Pagination mismatch');
  const settings=await db.from('organization_settings').select('key,value').eq('org_id',organization.id).in('key',['inspection_config','import_report_countries']);
  if(settings.error)throw Error('Organization settings unavailable');
  const {selectors:u,sourceHashes}=await loadReviewSelectors(ROOT,dir);
  const config=settings.data.find(x=>x.key==='inspection_config')?.value;
  const conf=config?u.normalize(config):u.DEFAULT_INSPECTION_CONFIG;
  const rawCountries=settings.data.find(x=>x.key==='import_report_countries')?.value;
  const countries=Array.isArray(rawCountries)&&rawCountries.every(x=>typeof x==='string')?rawCountries:u.DEFAULT_IMPORT_REPORT_COUNTRIES;
  const excluded=new Set((history.inspectionDelayExclusions??[]).filter(e=>{
    const c=cases.find(c=>c.id===e.caseId);return c&&Array.isArray(e.fingerprintFields)&&digest(canonical(Object.fromEntries(e.fingerprintFields.map(k=>[k,c[k]]))))===e.baselineInfoFingerprint;
  }).map(e=>e.caseId));
  const identity=c=>({orgId:organization.id,caseId:c.id,pet:c.pet_name,guardian:c.customer_name});
  const inspections=u.buildInspectionRows(cases,conf.titerRules,conf.titerDefault,conf.infectiousRules).map(r=>({...identity(r.caseRow),rowId:r.id,lab:r.lab,date:r.date,status:u.readInspectionStatus(r.recordsDest?u.flattenCaseForDestination(r.caseRow,r.recordsDest):r.caseRow,r.dateStorage,r.date),result:r.dateStorage.kind==='titer'?r.caseRow.data?.rabies_titer_records?.[r.dateStorage.recordIdx]?.value:null,excluded:excluded.has(r.caseRow.id)}));
  const reportCases=cases.filter(c=>(u.isAutoImportReport(c,countries)||u.isManualImportReport(c))&&!u.isDismissedImportReport(c));
  const reportRows=reportCases.map(c=>u.withImportReportDest(c,countries));
  const activeReport=c=>u.parseDestinations(c.destination).find(d=>d===c.data?.import_report_active_dest)??u.parseDestinations(c.destination)[0]??null;
  const makeReport=(c,dest)=>{
    const selected={...c,data:{...c.data,import_report_active_dest:dest}};
    return {...identity(c),destination:dest,departure:u.importReportDeparture(selected),return:u.importReportReturnDate(selected),importStatus:u.reportSlotStatusFor(c,dest,'import'),exportStatus:u.exportSlotApplies(c,dest)?u.reportSlotStatusFor(c,dest,'export'):'na',deadline:u.reportDeadline(selected),excluded:excluded.has(c.id)};
  };
  // UI active rows for count parity + every scheduled reporting destination for coverage.
  const reports=reportCases.flatMap(c=>{
    let dests=u.parseDestinations(c.destination).filter(d=>countries.includes(u.destinationCountry(d))&&u.hasReportSchedule(c,d));
    if(!dests.length)dests=[activeReport(u.withImportReportDest(c,countries))];
    return dests.map(d=>makeReport(c,d));
  });
  const docCases=cases.filter(c=>u.anyDestHasDeparture(c)||u.anyDestHasVetVisit(c));
  const documents=docCases.flatMap(c=>{
    const dests=u.parseDestinations(c.destination);return (dests.length?dests:[null]).map(destination=>{
      const selected={...c,data:{...c.data,export_doc_active_dest:destination}};
      return {...identity(c),destination,departure:u.exportDocDeparture(selected),vetVisit:u.exportDocVetVisit(selected),available:u.exportDocVetAvailable(selected),status:u.exportDocStatus(selected),memo:u.exportDocMemo(selected),outOfWindow:u.isExportDocVisitOutOfWindow(selected),bookingRequired:u.isExportDocBookingRequired(selected),excluded:excluded.has(c.id)};
    });
  });
  return {policyVersion:POLICY_VERSION,runId,checkedAt:new Date().toISOString(),today:kstDay(),organization,allPagesRead:true,exactCount:count,fetchedCount:cases.length,caseIds:cases.map(c=>c.id),tabRowCounts:{inspection:inspections.length,report:reportRows.length,document:docCases.length},sourceHashes,inspections,reports,documents,tasks:historyTasks(history,cases,organization),findings:historyFindings(history,cases,organization),priorReports:history.dailyReviewCoverage?.reportedItems??{}};
}
export function verifyCompletion(run,dirValue) {
  const dir=privatePath(dirValue),proof=read(path.join(dir,'completion.private.json'));
  const started=Date.parse(run.started_at),created=Date.parse(proof.createdAt),now=Date.now();
  if(!Number.isFinite(started)||!Number.isFinite(created)||created<started||created>now||proof.runId!==run.id||proof.today!==kstDay())throw Error('Review proof is not for this active run');
  const initial=read(path.join(dir,'initial.private.json')),final=read(path.join(dir,'final.private.json')),decisions=read(path.join(dir,'decisions.private.json'));
  if(initial.runId!==run.id||Date.parse(initial.checkedAt)<started)throw Error('Review snapshot predates this active run');
  const history=fs.readFileSync(path.join(dir,'history-uploaded.private.json'),'utf8'),verified=fs.readFileSync(path.join(dir,'history-verified.private.json'),'utf8');
  const result=validateReview({initial,final,decisions,historyHash:digest(history),verifiedHistoryHash:digest(verified)});
  if(!result.ok||result.needsAttention)throw Error('Review coverage incomplete or user action pending; succeeded is blocked');
  if(proof.inputHash!==digest({initial,final,decisions,historyHash:digest(history)}))throw Error('Review inputs changed after validation');
  if(fs.readFileSync(path.join(dir,'report.private.md'),'utf8')!==result.report)throw Error('Report differs from validated mandatory report');
  const historyJson=JSON.parse(verified);
  if(historyJson.dailyReviewCoverage?.runId!==run.id||historyJson.dailyReviewCoverage?.reportHash!==digest(result.report))throw Error('Shared history does not contain this report coverage');
  return {ok:true,required:result.required.length};
}
async function main(){
  const [command,...args]=process.argv.slice(2);const opt=(key,defaultValue)=>{const i=args.indexOf('--'+key);return i<0?defaultValue:args[i+1]};
  const dir=privatePath(opt('dir','work/naver-inquiries/daily-review-'+kstDay()+'-private'));
  fs.mkdirSync(dir,{recursive:true});
  if(command==='snapshot') {
    const history=read(privatePath(opt('history','work/naver-inquiries/japan-mail-review.json')));
    const id=opt('id','automation'),runFile=path.join(process.env.CODEX_HOME??path.join(os.homedir(),'.codex'),'automation-calendar',`run-${id}.json`);
    const runId=opt('manual')==='true'?'manual:'+randomUUID():read(runFile).id;
    const initial=fs.existsSync(path.join(dir,'initial.private.json'))?read(path.join(dir,'initial.private.json')):null;
    if(initial&&(initial.today!==kstDay()||(opt('manual')!=='true'&&initial.runId!==runId)))throw Error('Use a fresh per-run directory');
    const phase=opt('phase','initial');
    if(!['initial','final'].includes(phase)||phase==='final'&&!initial)throw Error('Final snapshot requires this run initial snapshot');
    const snapshot=await scan(history,dir,initial?.runId??runId);
    const filename=phase==='final'?'final.private.json':'initial.private.json';
    if(filename==='initial.private.json'&&initial)throw Error('Initial snapshot already exists; use phase final or a fresh run directory');
    save(path.join(dir,filename),snapshot);
    const required=initial?reconcile(initial,snapshot):collectObligations(snapshot);
    save(path.join(dir,'required.private.json'),required);
    if(!fs.existsSync(path.join(dir,'decisions.private.json')))save(path.join(dir,'decisions.private.json'),{reviews:{mail:{complete:false},resultNotices:{complete:false}},items:required.map(x=>({id:x.id,disposition:'',nextAction:'',evidence:''}))});
    console.log(JSON.stringify({snapshotWritten:true,phase:filename,exactCases:snapshot.exactCount,tabRows:snapshot.tabRowCounts,obligations:required.length,mandatory:required.filter(x=>x.mustReport).length}));return;
  }
  if(command==='render'||command==='complete') {
    const initial=read(path.join(dir,'initial.private.json')),final=read(path.join(dir,'final.private.json')),decisions=read(path.join(dir,'decisions.private.json'));
    if(command==='render') {
      const result=validateReview({initial,final,decisions,historyHash:'render',verifiedHistoryHash:'render'});
      if(!result.ok){save(path.join(dir,'validation-errors.private.json'),result.errors);throw Error('Coverage validation failed; see validation-errors.private.json in the private run folder');}
      fs.writeFileSync(path.join(dir,'report.private.md'),result.report);
      const coverage={runId:initial.runId,checkedAt:final.checkedAt,reportHash:digest(result.report),required:result.required.length,reportedItems:{...initial.priorReports}};
      for(const i of result.required)if(decisions.items.find(d=>d.id===i.id)?.disposition!=='unchanged')coverage.reportedItems[i.id]={fingerprint:i.fingerprint,reportedAt:new Date().toISOString()};
      save(path.join(dir,'coverage.private.json'),coverage);
      const bookingCandidates=collectObligations(final).filter(i=>i.kind==='booking').map(i=>({taskId:i.id,orgId:final.organization.id,caseId:i.caseId,destination:i.destination,pet:i.pet,guardian:i.guardian,departure:final.documents.find(r=>r.caseId===i.caseId&&r.destination===i.destination)?.departure,remainingAction:decisions.items.find(d=>d.id===i.id)?.nextAction,sendMode:'user-reviewed',detectedAt:final.checkedAt}));
      save(path.join(dir,'visit-booking-candidates.private.json'),{organization:final.organization,tasks:bookingCandidates});
      console.log(JSON.stringify({reportRendered:true,items:result.required.length,needsAttention:result.needsAttention}));return;
    }
    const h=fs.readFileSync(path.join(dir,'history-uploaded.private.json'),'utf8'),v=fs.readFileSync(path.join(dir,'history-verified.private.json'),'utf8');
    const result=validateReview({initial,final,decisions,historyHash:digest(h),verifiedHistoryHash:digest(v)});
    if(!result.ok||fs.readFileSync(path.join(dir,'report.private.md'),'utf8')!==result.report){save(path.join(dir,'validation-errors.private.json'),result.errors);throw Error('Report/history coverage validation failed; see the private run folder');}
    const stored=JSON.parse(v).dailyReviewCoverage;
    if(stored?.runId!==initial.runId||stored.reportHash!==digest(result.report))throw Error('Shared coverage record missing');
    save(path.join(dir,'completion.private.json'),{runId:initial.runId,today:final.today,createdAt:new Date().toISOString(),inputHash:digest({initial,final,decisions,historyHash:digest(h)}),reportHash:digest(result.report),needsAttention:result.needsAttention});
    console.log(JSON.stringify({coverageVerified:true,required:result.required.length,finishStatus:result.needsAttention?'needs_attention':'succeeded'}));return;
  }
  throw Error('Use snapshot --dir --history [--phase final], render --dir, complete --dir');
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) main().catch(e=>{console.error('[daily-review] '+e.message);process.exitCode=1;});
