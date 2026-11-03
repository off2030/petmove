export const REVIEW_SCOPES = ['all','inspection','japan','documents'];
export const REVIEW_LABELS = {all:'전체',inspection:'검사',japan:'일본 수입·수출 신고',documents:'서류 및 기타'};
export function reviewScope(value='all') {
  if(!REVIEW_SCOPES.includes(value))throw Error('Unknown review scope: '+value);
  return value;
}
export function sourceAreas(scope='all') {
  return {all:['mail','resultNotices'],inspection:['inspectionMail','resultNotices'],japan:['mail','formAc'],documents:['documentSources','visitBookings']}[reviewScope(scope)];
}
export function workArea(record, fallback='unassigned') {
  if(['inspection','japan','documents'].includes(record.workArea))return record.workArea;
  const text=JSON.stringify(['task','nextAction','next','reason','remainingAction','finding','status','key','authority','recipient'].map(k=>record[k]??''));
  if(/NACCS|Form[ _]?AC|maff\.go\.jp|나하|나리타|하네다|간사이|일본|수출검역|수입신고/i.test(text))return 'japan';
  if(/KSVDL|KRSL|APQA|FAVN|RNATT|검사결과|검사 결과|항체|검사 의뢰|검사 신청|검사비|결과 안내|result.notice|inspection/i.test(text))return 'inspection';
  if(/내원|서류|문서|카카오|자료|예약 안내|visit.booking|document/i.test(text))return 'documents';
  return fallback;
}
export function coverageFor(history,scope='all') {
  return scope==='all'?history.dailyReviewCoverage:history.dailyReviewCoverage?.byArea?.[reviewScope(scope)];
}
