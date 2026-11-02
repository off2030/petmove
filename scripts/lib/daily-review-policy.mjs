import {createHash} from 'node:crypto';
export const POLICY_VERSION = 1;
export const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
export function kstDay(value = new Date()) { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value)); }
export function dayDistance(a,b) {
  const valid = x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x+'T00:00:00Z')) && new Date(x+'T00:00:00Z').toISOString().slice(0,10) === x;
  if (!valid(a) || !valid(b)) return null;
  return Math.round((Date.parse(b)-Date.parse(a))/86400000);
}
export const itemId = (...parts) => JSON.stringify(parts);
export function collectObligations(snapshot) {
  const items = [];
  const add = (kind,row,slot,reason,mustReport=false) => {
    const id=itemId(kind,row.caseId??'',row.destination??'',slot);
    const content={kind,caseId:row.caseId??null,destination:row.destination??null,slot,pet:row.pet??'',guardian:row.guardian??'',reason,mustReport};
    items.push({...content,id,fingerprint:digest(content)});
  };
  for (const r of snapshot.inspections) {
    if (r.excluded || !['waiting','testing'].includes(r.status)) continue;
    const days=dayDistance(r.date,snapshot.today);
    const late=r.status==='waiting' && days!==null && days>=5;
    add('inspection',r,r.rowId,late?`${r.lab} 검사일 ${r.date}, 대기 ${days}일`: `${r.lab} ${r.status}, 검사일 ${r.date||'미정'}`,late);
    if (r.result && r.status!=='done') add('warning',r,r.rowId+':result-status','검사 결과 등록과 Work 검사 상태의 차이 확인',true);
  }
  for (const r of snapshot.reports) {
    if (r.excluded) continue;
    // Do not filter by Korean departure date. Import and return-export are independent.
    for (const slot of ['import','export']) {
      const status=r[slot+'Status']; if (status==='done'||status==='na') continue;
      add('report',r,slot,`${slot==='import'?'수입':'수출'} ${status}; 출국 ${r.departure||'미정'}, 귀국 ${r.return||'미정'}`);
    }
    const until=dayDistance(snapshot.today,r.deadline);
    if (r.deadlineWarning || (r.importStatus==='not_started' && until!==null && until<=10)) add('warning',r,'import-deadline',`수입 신고기한 ${r.deadline}${until===null?'':` (${until<0?`${-until}일 경과`:`${until}일 남음`})`}`,true);
  }
  for (const r of snapshot.documents) {
    if (r.excluded) continue;
    const visitIn=dayDistance(snapshot.today,r.vetVisit);
    const departureIn=dayDistance(snapshot.today,r.departure);
    const upcoming=visitIn!==null && visitIn>=0 && visitIn<=7;
    const currentDeparture=departureIn!==null && departureIn>=0;
    if(!r.vetVisit?.trim()&&currentDeparture&&departureIn<=14) add('booking',r,'visit-booking:'+r.departure,`내원 예약 미등록; 출국 ${r.departure} (${departureIn}일 남음); 기존 카카오 채팅방 대조 후 예약 요청 안내 필요`,true);
    // Future visits with no departure are still real work; old undated cases are not.
    if (r.status!=='done' && ((upcoming && (departureIn===null||currentDeparture)) || (visitIn!==null&&visitIn<0&&currentDeparture))) add('document',r,'preparation',`서류 준비 미완료; 내원 ${r.vetVisit}, 출국 ${r.departure||'미정'}${visitIn<0?'; 내원일 경과':''}`,true);
    else if (r.status!=='done' && currentDeparture) add('document',r,'preparation',`서류 준비 대기; 내원 ${r.vetVisit||'미정'}, 출국 ${r.departure}`);
    if (r.outOfWindow && (currentDeparture||upcoming)) add('warning',r,'visit-window',`내원일 ${r.vetVisit}과 출국일 ${r.departure||'미정'}의 날짜 구간 불일치`,true);
  }
  for (const task of snapshot.tasks) add(task.interrupted?'interrupted':'followup',task,task.key,task.nextAction,!!task.interrupted);
  for (const finding of snapshot.findings??[]) add('finding',finding,finding.key,finding.reason,true);
  const map=new Map();
  for(const x of items) {
    if(map.has(x.id)) throw Error(`Duplicate obligation identity: ${x.id}`);
    map.set(x.id,x);
  }
  return [...map.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
export function reconcile(initial, final) {
  const map=new Map(collectObligations(initial).map(x=>[x.id,x]));
  for(const item of collectObligations(final)) {
    const before=map.get(item.id);
    map.set(item.id,{...item,mustReport:item.mustReport||!!before?.mustReport});
  }
  return [...map.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
export function validateReview({initial,final,decisions,historyHash,verifiedHistoryHash,now=new Date()}) {
  const errors=[],nowMs=new Date(now).getTime();
  if(initial.policyVersion!==POLICY_VERSION||final.policyVersion!==POLICY_VERSION) errors.push('policy-version');
  for(const s of [initial,final]) {
    if(s.organization?.name!=='로잔동물의료센터'||!s.organization?.id||s.organization.id!==initial.organization.id) errors.push('organization');
    if(!s.allPagesRead||!Number.isInteger(s.exactCount)||s.exactCount<0||s.exactCount!==s.fetchedCount||!Array.isArray(s.caseIds)||new Set(s.caseIds).size!==s.exactCount) errors.push('pagination');
    for(const rows of [s.inspections,s.reports,s.documents]) if(!Array.isArray(rows)||rows.some(r=>r.orgId!==s.organization.id||!s.caseIds.includes(r.caseId))) errors.push('row-scope');
    for(const rows of [s.tasks,s.findings??[]]) if(!Array.isArray(rows)||rows.some(r=>r.orgId!==s.organization.id||(r.caseId!==null&&!s.caseIds.includes(r.caseId)))) errors.push('task-scope');
    if(s.today!==kstDay(now)) errors.push('date');
    if(!Number.isFinite(Date.parse(s.checkedAt))||Date.parse(s.checkedAt)>nowMs)errors.push('snapshot-time');
  }
  if(final.runId!==initial.runId||!initial.runId) errors.push('run-id');
  const age=nowMs-Date.parse(final.checkedAt);
  if(!Number.isFinite(age)||age<0||age>30*60_000||Date.parse(final.checkedAt)<Date.parse(initial.checkedAt)) errors.push('stale-final-snapshot');
  const required=reconcile(initial,final), byId=new Map();
  for(const d of decisions.items??[]) {if(byId.has(d.id))errors.push('duplicate-decision');byId.set(d.id,d);}
  for(const item of required) {
    const d=byId.get(item.id);
    if(!d) {errors.push('unaccounted-item:'+item.id);continue;}
    if(!['reported','resolved','unchanged'].includes(d.disposition)||!d.nextAction?.trim()||!d.evidence?.trim()) errors.push('incomplete-decision:'+item.id);
    if(d.disposition==='unchanged') {
      if(item.mustReport)errors.push('mandatory-item-suppressed:'+item.id);
      const previous=initial.priorReports?.[item.id];
      if(!previous||previous.fingerprint!==item.fingerprint||!previous.deliveryEvidence?.trim()||!Number.isFinite(Date.parse(previous.reportedAt))||Date.parse(previous.reportedAt)>Date.parse(initial.checkedAt)||!Number.isFinite(Date.parse(d.recheckedAt))||Date.parse(d.recheckedAt)<Date.parse(initial.checkedAt)||Date.parse(d.recheckedAt)>nowMs)errors.push('unchanged-without-proof:'+item.id);
    }
    if(d.disposition==='resolved'&&!d.resolutionEvidence?.trim())errors.push('resolution-without-proof:'+item.id);
  }
  for(const id of byId.keys())if(!required.some(i=>i.id===id))errors.push('unknown-item:'+id);
  for(const area of ['mail','resultNotices']) {
    const r=decisions.reviews?.[area];
    if(r?.complete!==true||!r.evidence?.trim()||!Number.isFinite(Date.parse(r.checkedAt))||Date.parse(r.checkedAt)<Date.parse(initial.checkedAt)||Date.parse(r.checkedAt)>nowMs)errors.push('unreviewed-source:'+area);
  }
  if(!historyHash||historyHash!==verifiedHistoryHash) errors.push('shared-history-not-verified');
  const lines=required.filter(i=>byId.get(i.id)?.disposition!=='unchanged').map(i=> {
    const d=byId.get(i.id)??{};
    return `- **${i.pet||'대상 확인 필요'}${i.guardian?' / '+i.guardian:''}${i.destination?' · '+i.destination:''}** — ${i.reason}. ${d.nextAction||'다음 행동 미확인'}${d.disposition==='resolved'?' (처리 결과 확인)':''}`;
  });
  const report=lines.length?`${final.today} 실무 점검 — 필수 보고와 변경 사항\n\n${lines.join('\n')}\n`:'알릴 변화와 일일 필수 보고 대상이 없습니다.\n';
  return {ok:errors.length===0,errors:[...new Set(errors)],required,report,needsAttention:(decisions.items??[]).some(x=>x.needsUserAction===true)};
}
