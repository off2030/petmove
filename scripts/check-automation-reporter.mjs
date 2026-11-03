import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const exec = promisify(execFile)
const temp = await fs.mkdtemp(path.join(os.tmpdir(),'petmove-calendar-test-'))
const records = []
let reject = false
const server = http.createServer(async(req,res)=>{
  let body='';for await (const chunk of req)body+=chunk
  assert.equal(req.headers.authorization,'Bearer local-test-token')
  if(reject){res.writeHead(503).end('{}');return}
  records.push(JSON.parse(body));res.setHeader('content-type','application/json');res.end('{"ok":true}')
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
const state=path.join(temp,'automation-calendar')
const env={...process.env,CODEX_HOME:temp,GITHUB_ACTIONS:'',AUTOMATION_REPORT_TOKEN:'local-test-token',AUTOMATION_CALENDAR_URL:`http://127.0.0.1:${server.address().port}/`}
async function cli(...args){return exec(process.execPath,['scripts/automation-calendar.mjs',...args],{env})}
try {
  const dir=path.join(temp,'automations','fixture');await fs.mkdir(dir,{recursive:true})
  await fs.writeFile(path.join(dir,'automation.toml'),'id = "fixture"\nname = "펫무브 달력 검증"\nstatus = "ACTIVE"\nrrule = "FREQ=DAILY;BYHOUR=13;BYMINUTE=0"\nprompt = "private prompt must never leave this fixture"\n')
  await cli('start','--id','fixture')
  assert.equal(records[0].runs[0].state,'running')
  assert.equal(records[0].runs[0].ended_at,null)
  assert.ok(!JSON.stringify(records).includes('private prompt'))
  const id=records[0].runs[0].id
  await assert.rejects(cli('start','--id','fixture'))
  reject=true
  await assert.rejects(cli('finish','--id','fixture','--status','needs_attention','--summary','사용자 확인 필요'))
  const queued=await fs.readdir(path.join(state,'outbox'));assert.equal(queued.length,1)
  await assert.rejects(fs.stat(path.join(state,'run-fixture.json')))
  reject=false
  await cli('start','--id','fixture')
  assert.equal(records[1].runs[0].id,id)
  assert.equal(records[1].runs[0].state,'needs_attention')
  assert.ok(records[1].runs[0].ended_at >= records[1].runs[0].started_at)
  assert.equal((await fs.readdir(path.join(state,'outbox'))).length,0)
  assert.notEqual(records[2].runs[0].id,id)
  await cli('finish','--id','fixture','--status','succeeded')
  assert.equal(records.at(-1).runs[0].state,'succeeded')
  await assert.rejects(cli('finish','--id','fixture'))
  const operations=path.join(temp,'automations','automation');await fs.mkdir(operations,{recursive:true})
  await fs.writeFile(path.join(operations,'automation.toml'),'id = "automation"\nname = "펫무브 실무 검증"\nstatus = "ACTIVE"\nrrule = "FREQ=DAILY;BYHOUR=10;BYMINUTE=30"\n')
  await cli('start','--id','automation')
  const before=records.length
  await assert.rejects(cli('finish','--id','automation','--status','succeeded'),/review-dir/)
  assert.equal(records.length,before,'Failed coverage must not publish a success')
  assert.equal(JSON.parse(await fs.readFile(path.join(state,'run-automation.json'),'utf8')).state,'running')
  await cli('finish','--id','automation','--status','needs_attention','--summary','누락 검증 미완료')
  assert.equal(records.at(-1).runs[0].state,'needs_attention')
  // Match Actions: checkout only, no node_modules or operations verifier.
  const checkout=path.join(temp,'dependency-free-checkout')
  await fs.mkdir(path.join(checkout,'scripts'),{recursive:true})
  await fs.mkdir(path.join(checkout,'.github','workflows'),{recursive:true})
  await fs.copyFile('scripts/automation-calendar.mjs',path.join(checkout,'scripts','automation-calendar.mjs'))
  await fs.copyFile('.github/workflows/backup-db.yml',path.join(checkout,'.github','workflows','backup-db.yml'))
  const githubEnv={...env,PATH:'',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'123456789',CALENDAR_RUN_STATUS:'success'}
  for(const phase of ['start','finish']) {
    await exec(process.execPath,['scripts/automation-calendar.mjs','github','--workflow','backup-db.yml','--phase',phase],{cwd:checkout,env:githubEnv})
    assert.equal(records.at(-1).runs[0].id,'github:123456789')
    assert.equal(records.at(-1).runs[0].state,phase==='start'?'running':'succeeded')
  }
  assert.ok(records.at(-1).runs[0].ended_at)
  console.log('자동화 보고: 시작·중복 차단·종료·통신 실패 보관·재전송 검증 통과 (메모리 서버, 운영 쓰기 없음)')
} finally {
  server.close()
  const absolute=path.resolve(temp),allowed=path.resolve(os.tmpdir())+path.sep
  if(!absolute.startsWith(allowed)||!path.basename(absolute).startsWith('petmove-calendar-test-'))throw Error('테스트 폴더 경계 오류')
  await fs.rm(absolute,{recursive:true,force:true})
}
