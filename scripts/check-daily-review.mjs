import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {POLICY_VERSION,collectObligations,reconcile,validateReview,kstDay,dayDistance,digest} from './lib/daily-review-policy.mjs';
import {loadReviewSelectors} from './lib/daily-review-source.mjs';
import {ROOT,historyTasks,verifyCompletion,privatePath} from './daily-review.mjs';

const now='2026-11-02T03:00:00Z',org={id:'clinic',name:'로잔동물의료센터'};
const ident={orgId:org.id,caseId:'case-a',pet:'테스트 동물',guardian:'테스트 보호자',destination:'일본'};
const base=()=>({policyVersion:POLICY_VERSION,runId:'test-run',checkedAt:now,today:'2026-11-02',organization:org,allPagesRead:true,exactCount:1,fetchedCount:1,caseIds:['case-a'],inspections:[],reports:[],documents:[],tasks:[],priorReports:{}});
const initial=base();initial.reports=[{...ident,departure:'2026-12-21',return:'',importStatus:'not_started',exportStatus:'na',deadline:'2026-11-11'}];
initial.documents=[{...ident,vetVisit:'2026-11-07',departure:'2026-11-14',status:'not_started'}];
initial.tasks=[{...ident,key:'authorized-export',interrupted:true,nextAction:'기존 제출 지시가 오류로 중단됨; 재개 필요'}];
const final=structuredClone(initial);
const decisions=()=>({reviews:Object.fromEntries(['mail','resultNotices'].map(k=>[k,{complete:true,checkedAt:now,evidence:'실제 원문·첨부 전체 대조 근거'}])),items:reconcile(initial,final).map(i=>({id:i.id,disposition:'reported',nextAction:'남은 조치와 기한 보고',evidence:'실제 조회 근거'}))});
const validate=d=>validateReview({initial,final,decisions:d,historyHash:'same',verifiedHistoryHash:'same',now});
assert.equal(validate(decisions()).ok,true);
for(const kind of ['warning','document','interrupted']) {
  const d=decisions(),target=collectObligations(initial).find(i=>i.kind===kind);
  d.items=d.items.filter(i=>i.id!==target.id);
  assert.equal(validate(d).ok,false,kind+' omission must fail');
  const s=decisions();s.items.find(i=>i.id===target.id).disposition='unchanged';
  assert.ok(validate(s).errors.some(e=>e.startsWith('mandatory-item-suppressed:')));
}
const returning=base();returning.reports=[{...ident,departure:'2026-10-22',return:'2026-11-16',importStatus:'done',exportStatus:'not_started',deadline:'2026-09-12'}];
assert.ok(collectObligations(returning).some(i=>i.kind==='report'&&i.slot==='export'));
const d0=base();for(const days of [0,5,7,8]) d0.documents.push({...ident,destination:'여행'+days,vetVisit:new Date(Date.parse('2026-11-02')+days*86400000).toISOString().slice(0,10),departure:'2026-12-01',status:'not_started'});
assert.equal(collectObligations(d0).filter(i=>i.mustReport).length,3);
d0.documents.push({...ident,destination:'과거무출국일',vetVisit:'2026-01-01',departure:'',status:'not_started'});
assert.equal(collectObligations(d0).some(i=>i.destination==='과거무출국일'),false);
const ins=base();ins.inspections=[['waiting','2026-10-28'],['waiting','2026-11-03'],['testing','2026-10-01'],['waiting','']].map(([status,date],i)=>({...ident,rowId:'r'+i,status,date,lab:'KRSL'}));
assert.equal(collectObligations(ins).filter(i=>i.mustReport).length,1);
const booking=base();for(const days of [-1,0,14,15])booking.documents.push({...ident,destination:'예약'+days,vetVisit:'',departure:new Date(Date.parse('2026-11-02')+days*86400000).toISOString().slice(0,10),status:'not_started'});
assert.equal(collectObligations(booking).filter(i=>i.kind==='booking'&&i.mustReport).length,2);
booking.documents[1].vetVisit='2026-11-02';
assert.equal(collectObligations(booking).filter(i=>i.kind==='booking').length,1);
const removed=base();assert.ok(reconcile(initial,removed).some(i=>i.kind==='interrupted'));
const normal=collectObligations(initial).find(i=>!i.mustReport),d=decisions();
initial.priorReports[normal.id]={fingerprint:normal.fingerprint,reportedAt:'2026-10-31T04:00:00Z',deliveryEvidence:'이전 실제 사용자 보고 메시지 재조회 근거'};
Object.assign(d.items.find(x=>x.id===normal.id),{disposition:'unchanged',recheckedAt:now});
assert.equal(validate(d).ok,true);
const savedDelivery=initial.priorReports[normal.id].deliveryEvidence;delete initial.priorReports[normal.id].deliveryEvidence;
assert.equal(validate(d).ok,false);initial.priorReports[normal.id].deliveryEvidence=savedDelivery;
assert.equal(validateReview({initial,final,decisions:d,historyHash:'a',verifiedHistoryHash:'b',now}).ok,false);
const bad=structuredClone(final);bad.documents[0].orgId='another-org';
assert.equal(validateReview({initial,final:bad,decisions:decisions(),historyHash:'s',verifiedHistoryHash:'s',now}).ok,false);
bad.organization=org;bad.allPagesRead=false;
assert.equal(validateReview({initial,final:bad,decisions:decisions(),historyHash:'s',verifiedHistoryHash:'s',now}).ok,false);
const invalid=decisions();invalid.reviews.mail.checkedAt='invalid';assert.equal(validate(invalid).ok,false);
const invalidSnapshot=structuredClone(initial);invalidSnapshot.checkedAt='invalid';
assert.equal(validateReview({initial:invalidSnapshot,final,decisions:decisions(),historyHash:'s',verifiedHistoryHash:'s',now}).ok,false);
const foreignFinding=structuredClone(final);foreignFinding.findings=[{...ident,orgId:'other',key:'warning',reason:'outside'}];
assert.equal(validateReview({initial,final:foreignFinding,decisions:decisions(),historyHash:'s',verifiedHistoryHash:'s',now}).ok,false);
assert.equal(kstDay('2026-11-01T16:00:00Z'),'2026-11-02');
assert.equal(dayDistance('2026-02-30','2026-11-02'),null);
assert.equal(dayDistance('2026-13-01','2026-11-02'),null);
assert.throws(()=>privatePath('scripts/public.json'));
assert.throws(()=>verifyCompletion({id:'no-proof',started_at:now},'work/naver-inquiries/nonexistent-review-private'));
const tasks=historyTasks({pending:[{caseId:'case-a',reason:'회신 대기'},{caseId:'other',orgId:'other-org',reason:'범위 밖'}],manualNaccsContinuation:{remaining:[{caseId:'case-a',next:'중단 지시'}]}},[{id:'case-a',pet_name:'테스트',customer_name:'보호자'}],org);
assert.equal(tasks.length,2);assert.equal(tasks.filter(t=>t.interrupted).length,1);

// Compile the live UI selectors; exercise destination scoping and repeated tests.
fs.mkdirSync(path.join(ROOT,'work/naver-inquiries'),{recursive:true});
const tmp=fs.mkdtempSync(path.join(ROOT,'work/naver-inquiries/review-test-private-'));
try {
  const {selectors:u}=await loadReviewSelectors(ROOT,tmp);
  const row={id:'synthetic-case',org_id:'clinic',destination:'일본, 일본 (2차)',departure_date:'2026-10-22',data:{species:'dog',by_dest:{'일본':{departure_date:'2026-10-22',entry_date:'2026-10-22',return_date:'2026-11-16'},'일본 (2차)':{departure_date:'2026-12-21',entry_date:'2026-12-21',vet_visit_date:'2026-11-07',export_doc_status:'not_started'}},rabies_titer_records:[{date:'2026-10-20',lab:'krsl'},{date:'2026-10-28',lab:'apqa_seoul'}],inspection_status_titer_0:'done',inspection_status_titer_1:'waiting'}};
  assert.equal(u.buildInspectionRows([row],[], 'krsl',[]).length,2);
  const selected={...row,data:{...row.data,export_doc_active_dest:'일본 (2차)'}};
  assert.equal(u.exportDocVetVisit(selected),'2026-11-07');
  assert.equal(u.reportSlotStatusFor(row,'일본','export'),'not_started');
  assert.equal(u.importReportDeparture({...row,data:{...row.data,import_report_active_dest:'일본 (2차)'}}),'2026-12-21');
  assert.equal(u.importReportReturnDate({...row,data:{...row.data,import_report_active_dest:'일본'}}),'2026-11-16');
  for(const days of [-1,0,14,15]) {
    const departure=new Date(Date.parse('2026-11-02')+days*86400000).toISOString().slice(0,10);
    const unbooked={...row,destination:'일본',departure_date:departure,data:{by_dest:{'일본':{departure_date:departure,vet_visit_date:''}}}};
    assert.equal(u.isExportDocBookingRequired(unbooked,'2026-11-02'),days>=0&&days<=14);
  }
  assert.equal(u.isExportDocBookingRequired(selected,'2026-12-07'),false);
  // Exercise the CLI report -> remote-readback proof -> calendar completion contract.
  // Fixtures are fictional and no server or Drive writes are performed.
  const current=new Date(),stamp=current.toISOString(),run={id:'fixture-current-run',started_at:new Date(+current-1000).toISOString()};
  const fixture=base();Object.assign(fixture,{runId:run.id,today:kstDay(current),checkedAt:stamp});
  fixture.tasks=[{...ident,key:'fixture-stopped',interrupted:true,nextAction:'인증 대기로 중단'}];
  const fixtureDecisions={reviews:Object.fromEntries(['mail','resultNotices'].map(k=>[k,{complete:true,checkedAt:stamp,evidence:'가상 검토 근거'}])),items:collectObligations(fixture).map(i=>({id:i.id,disposition:'reported',nextAction:'중단 사유 보고',evidence:'가상 근거'}))};
  const write=(f,v)=>fs.writeFileSync(path.join(tmp,f),JSON.stringify(v));
  write('initial.private.json',fixture);write('final.private.json',fixture);write('decisions.private.json',fixtureDecisions);
  const cli=cmd=>{const r=spawnSync(process.execPath,['scripts/daily-review.mjs',cmd,'--dir',tmp],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r};
  assert.equal(cli('render').status,0);
  const coverage=JSON.parse(fs.readFileSync(path.join(tmp,'coverage.private.json'),'utf8'));
  write('history-uploaded.private.json',{dailyReviewCoverage:coverage});write('history-verified.private.json',{dailyReviewCoverage:coverage});
  assert.equal(cli('complete').status,0);
  assert.equal(verifyCompletion(run,tmp).ok,true);
  assert.throws(()=>verifyCompletion({...run,id:'different-run'},tmp));
  assert.throws(()=>verifyCompletion({...run,started_at:'invalid'},tmp));
  fs.appendFileSync(path.join(tmp,'report.private.md'),'누락·변조');
  assert.throws(()=>verifyCompletion(run,tmp));
  assert.equal(cli('render').status,0);
  write('history-verified.private.json',{dailyReviewCoverage:{...coverage,reportHash:'mismatch'}});
  assert.throws(()=>verifyCompletion(run,tmp));
  write('history-verified.private.json',{dailyReviewCoverage:coverage});
  fixtureDecisions.items[0].needsUserAction=true;write('decisions.private.json',fixtureDecisions);
  assert.equal(cli('render').status,0);assert.equal(cli('complete').status,0);
  assert.throws(()=>verifyCompletion(run,tmp));
} finally {
  // Only files created by this test in the verified private temp directory.
  for(const f of fs.readdirSync(tmp))fs.unlinkSync(path.join(tmp,f));fs.rmdirSync(tmp);
}
console.log('누락 검증 통과: 경고·중단 지시·내원 0~7일·출국 0~14일 미예약·귀국 전 수출·회차·범위·보고 전달 근거·공유 이력·완료 차단');
