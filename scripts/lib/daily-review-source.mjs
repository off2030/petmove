import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const adminRequire=createRequire(new URL('../../apps/admin/package.json',import.meta.url));
const ts=adminRequire('typescript');
const tsxRequire=createRequire(createRequire(import.meta.url).resolve('tsx/package.json'));
const {build}=tsxRequire('esbuild');

// Compile the current UI's pure selectors, not a second implementation or a client app.
// Missing/renamed dependencies fail the build instead of silently changing coverage.
export async function loadReviewSelectors(root, privateDir) {
  const files = ['apps/admin/components/todos/todos-app.tsx', 'apps/admin/lib/inspection-config.ts'];
  const [ui, config] = files.map(f => fs.readFileSync(path.join(root, f), 'utf8'));
  const parse = (s, name) => ts.createSourceFile(name, s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const uiAst = parse(ui, 'todos.tsx'), configAst = parse(config, 'config.ts');
  const boundary = uiAst.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'createImportReportColumns');
  if (!boundary) throw Error('UI selector boundary changed; update daily-review-source');
  const helpers = uiAst.statements.filter(n => ts.isFunctionDeclaration(n) && n.getStart(uiAst) < boundary.getStart(uiAst));
  const constants = uiAst.statements.filter(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => ['EXPORT_DOC_DEST_KEY','IMPORT_REPORT_DEST_ORDER'].includes(d.name.getText(uiAst))));
  const normalizers = configAst.statements.filter(n => (ts.isFunctionDeclaration(n) && !n.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) || (ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(configAst) === 'EU_UK_CH')));
  const exports = ['buildInspectionRows','anyDestHasDeparture','anyDestHasVetVisit','isManualImportReport','isDismissedImportReport','exportDocDeparture','exportDocVetVisit','exportDocVetAvailable','exportDocStatus','exportDocMemo','isExportDocVisitOutOfWindow','isExportDocBookingRequired','importReportDeparture','importReportReturnDate','reportDeadline'];
  for (const name of exports) if (!helpers.some(n => n.name?.text === name)) throw Error(`UI selector missing: ${name}`);
  const source = `
import {destinationCountry,buildDateRuleContext,findDestinationToken,flattenCaseForDestination,getDepartureDate,getVetVisitDate,getVetVisitWindowDays,matchesDestinationKey,findNewZealandToken,findNewZealandTokenWithData,parseDestinations,readScopedWithLegacyFallback,resolveTabActiveDest,validateVetVisitDate,DEFAULT_INSPECTION_CONFIG,DEFAULT_IMPORT_REPORT_COUNTRIES,canonicalDestinations,mergeMissingInfectiousDefaults} from '@petmove/domain';
import {readInspectionStatus,nzInfectiousLabs} from './apps/admin/lib/inspection-status';
import {exportSlotApplies,reportCompleteFor,reportReturnDateFor,reportSlotStatusFor,hasReportSchedule} from './apps/admin/lib/report-status';
import {IMPORT_REPORT_DEST_KEY,isAutoImportReport,withImportReportDest} from './apps/admin/lib/import-report-selection';
${constants.map(n => n.getText(uiAst)).join('\n')}
${helpers.map(n => n.getText(uiAst)).join('\n')}
${normalizers.map(n => n.getText(configAst)).join('\n')}
export {${exports.join(',')},normalize,DEFAULT_INSPECTION_CONFIG,DEFAULT_IMPORT_REPORT_COUNTRIES,readInspectionStatus,exportSlotApplies,reportSlotStatusFor,hasReportSchedule,isAutoImportReport,withImportReportDest,parseDestinations,destinationCountry,flattenCaseForDestination};`;
  const out = path.join(privateDir, 'ui-selectors.private.cjs');
  await build({stdin:{contents:source,resolveDir:root,loader:'ts'},outfile:out,bundle:true,platform:'node',format:'cjs',alias:{'@petmove/domain':path.join(root,'packages/domain/src/index.ts')},logLevel:'error'});
  const require = createRequire(import.meta.url); delete require.cache[out];
  return {selectors:require(out), sourceHashes:Object.fromEntries(files.map((f,i) => [f,createHash('sha256').update([ui,config][i]).digest('hex')]))};
}
