import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const memberHtml=read('member.html'),memberJs=read('member.js'),memberCss=read('member.css');
const adminHtml=read('admin.html'),adminJs=read('admin.js'),adminCss=read('admin.css');
const merchJs=read('merch.js');
const worker=read('cloudflare-worker-media.js'),migration=read('D1-united-club-v1.sql');
const club=memberHtml.slice(memberHtml.indexOf('data-member-panel="club"'),memberHtml.indexOf('data-member-panel="photos"'));

test('United Club uses exact heading, explanation and four activity-only earning cards',()=>{
  assert.match(club,/United Club\.[\s\S]*Tvoje historie, body a odměny v United\./);
  assert.doesNotMatch(club,/Body\. Historie\. Achievements\./);
  assert.match(club,/United Points\. Tvoje odměny\./);
  assert.match(club,/Buď členem United a čerpej výhody![\s\S]*TOP 3 Show &amp; Shine[\s\S]*přidávání fotek/);
  const rewards=memberJs.slice(memberJs.indexOf('function renderRewards()'),memberJs.indexOf("reservationForm?.addEventListener"));
  assert.equal((rewards.match(/\['earn-/g)||[]).length,4);
  for(const label of ['Účast na srazu','Umístění v Show & Shine','Nahrávání fotek','Doplnění profilu'])assert.match(rewards,new RegExp(label));
  assert.doesNotMatch(rewards,/\+1|\+2|\+3/);
});

test('member history editor only lists concluded server events and locks approved attendance',()=>{
  assert.match(memberHtml,/Upravit historii[\s\S]*data-history-editor/);
  assert.match(memberJs,/filter\(item=>item\.concluded\)/);
  assert.match(memberJs,/Schválenou účast nelze odebrat/);
  assert.match(memberJs,/attendanceApproved:true/);
  assert.match(memberJs,/apiRequestForm\('\/api\/history\/claims'/);
  assert.match(memberJs,/maxFiles:4,maxBytes:8\*1024\*1024/);
  assert.match(memberJs,/apiRequestBlob\(`\/api\/history\/evidence\//);
  assert.match(memberJs,/data-history-complete/);
  assert.match(memberJs,/historyCompletedAt/);
});

test('history year cards open and focus the matching editor event while the full editor remains secondary',()=>{
  assert.match(memberHtml,/class="member-secondary history-edit-all" data-open-history-editor/);
  assert.match(memberHtml,/aria-controls="history-editor-modal"/);
  assert.match(memberJs,/tag=item\.concluded\?'button':'article'/);
  assert.match(memberJs,/data-open-history-year="\$\{esc\(item\.eventId\)\}"/);
  assert.match(memberJs,/openHistoryEditor\(event\.currentTarget,button\.dataset\.openHistoryYear\)/);
  assert.match(memberJs,/data-history-event="\$\{esc\(item\.eventId\)\}" tabindex="-1"/);
  assert.match(memberJs,/find\(card=>String\(card\.dataset\.historyEvent\)===String\(eventId\)\)/);
  assert.match(memberJs,/target\.focus\(\{preventScroll:true\}\)/);
  assert.match(memberJs,/target\.scrollIntoView\(\{block:'start'\}\)/);
  assert.match(memberCss,/button\.history-year:focus-visible/);
});

test('history cards expose readable unverified, pending, verified and separate S&S states',()=>{
  assert.match(memberJs,/item\.concluded\?'NEUVEDENO'/);
  assert.match(memberJs,/Historii můžeš doplnit\./);
  assert.match(memberJs,/pending\?'ČEKÁ NA KONTROLU'/);
  assert.match(memberJs,/approved\?'OVĚŘENO'/);
  assert.match(memberJs,/sns\.status==='pending'\?'<span class="history-sns-state is-pending">/);
  assert.match(memberCss,/\.history-year-status b\{display:block[^}]*font-size:13px/);
  assert.match(memberCss,/\.history-year-status small\{display:block;margin-top:7px[^}]*font-size:12px/);
  assert.match(memberCss,/\.history-year\.is-attended \.history-check\{[^}]*background:#69b8f8/);
});

test('pending history summary contains only submitted attendance and S&S details',()=>{
  const summary=memberJs.slice(memberJs.indexOf('function historySubmittedSummary'),memberJs.indexOf('function renderHistory'));
  assert.match(summary,/Účast na United \$\{item\.eventYear\}/);
  assert.match(summary,/if\(!sns\.competed\)details\.push\('<span>Pouze účast<\/span>'\)/);
  for(const detail of ['Show &amp; Shine:','místo','Best of the Best','Nej zvuk výfuku'])assert.match(summary,new RegExp(detail));
  assert.match(memberJs,/if\(pending\)return[\s\S]*historySubmittedSummary\(item\)/);
  assert.match(memberJs,/item\.showShine\?\.status==='pending'\?historySubmittedSummary\(item,\{attendance:false\}\)/);
});

test('verified history card uses only primary private evidence and approved accolade data',()=>{
  assert.match(memberJs,/primaryEvidence=approved\?item\.evidence\?\.\[0\]:null/);
  assert.match(memberJs,/data-history-card-evidence-id="\$\{esc\(primaryEvidence\.id\)\}"/);
  assert.match(memberJs,/getPrivateHistoryEvidenceUrl[\s\S]*apiRequestBlob\(`\/api\/history\/evidence\/\$\{encodeURIComponent\(photoId\)\}`\)/);
  assert.match(memberJs,/evidenceStillOwned=/);
  assert.doesNotMatch(memberJs,/data-history-card-evidence-id="\$\{esc\(photo\.imageUrl\)/);
  assert.match(worker,/member_id = \? LIMIT 1/);
  assert.match(worker,/"Cache-Control": "private, no-store"/);
  assert.match(memberCss,/\.history-year-media img\{[^}]*object-fit:cover/);
  assert.match(memberCss,/\.history-year-media::after\{[^}]*linear-gradient/);
  assert.match(memberJs,/if\(sns\.status!=='approved'\)return ''/);
  for(const marker of ['history-medal--gold','history-medal--silver','history-medal--bronze','history-accolade--bob','history-accolade--exhaust'])assert.match(`${memberJs}\n${memberCss}`,new RegExp(marker));
});

test('Achievement details stay anchored on desktop and become a mobile sheet',()=>{
  assert.match(memberHtml,/data-achievement-popover/);
  assert.match(memberJs,/getBoundingClientRect\(\)/);
  assert.match(memberJs,/data-achievement-tier/);
  assert.match(memberJs,/data-achievement-condition/);
  assert.match(memberJs,/data-achievement-points/);
  assert.match(memberJs,/event\.key==='Escape'/);
  assert.match(memberCss,/left:var\(--achievement-left\);top:var\(--achievement-top\)/);
  assert.match(memberCss,/@media\(max-width:700px\)[\s\S]*\.achievement-detail-popover\{left:10px!important[\s\S]*bottom:10px/);
});

test('Member Card keeps four core blocks with the requested typography lift',()=>{
  assert.equal((memberHtml.match(/class="member-card-stat(?: [^"]*)?"/g)||[]).length,4);
  assert.match(memberHtml,/member-card-achievements-label">ACHIEVEMENTS/);
  assert.match(memberCss,/\.member-card-stat>small\{font-size:11px\}/);
  assert.match(memberCss,/\.member-card-stat>b\{font-size:24px\}/);
  assert.match(memberCss,/\.member-card-points b\{font-size:35px\}/);
});

test('Admin Photos contains two internal queues without another top-level navigation target',()=>{
  assert.match(adminHtml,/data-gallery-mode="community"[\s\S]*Komunitní fotky/);
  assert.match(adminHtml,/data-gallery-mode="history"[\s\S]*Důkazy účasti/);
  assert.equal((adminHtml.match(/data-admin-jump="gallery"/g)||[]).length,1);
  assert.match(adminHtml,/data-history-search/);
  for(const status of ['pending','approved','rejected','all'])assert.match(adminHtml,new RegExp(`data-history-filter="${status}"`));
  assert.match(adminJs,/filteredHistoryClaims/);
  assert.match(adminJs,/data-history-review="attendance"/);
  assert.match(adminJs,/data-history-review="sns"/);
  assert.match(adminJs,/Při zamítnutí je důvod povinný/);
  assert.match(adminHtml,/data-attention-history/);
});

test('private evidence preview is authenticated, separate and full-size contain',()=>{
  assert.match(worker,/history-proof\/\$\{auth\.uid\}/);
  assert.match(worker,/\\\/api\\\/history\\\/evidence/);
  assert.match(worker,/\\\/api\\\/admin\\\/history\\\/evidence/);
  assert.match(worker,/member_id = \? LIMIT 1/);
  assert.match(adminJs,/apiMedia\(`\/api\/admin\/history\/evidence\//);
  assert.match(adminCss,/\.admin-history-evidence-dialog>img\{[^}]*object-fit:contain/);
  assert.match(adminHtml,/data-history-evidence-member[\s\S]*data-history-evidence-submitted[\s\S]*data-history-evidence-created[\s\S]*data-history-evidence-attendance[\s\S]*data-history-evidence-sns/);
  assert.doesNotMatch(worker,/gallery_submissions[\s\S]{0,160}history-proof/);
});

test('migration is forward-only, immutable and introduces no legacy point seed',()=>{
  for(const table of ['united_history_claims','united_history_evidence','united_points_ledger'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration,/ALTER TABLE events ADD COLUMN event_end_at TEXT/);
  assert.match(migration,/ALTER TABLE members ADD COLUMN history_completed_at TEXT/);
  assert.match(migration,/UNIQUE \(member_id, source_key\)/);
  assert.match(migration,/united_points_ledger_no_update/);
  assert.match(migration,/united_points_ledger_no_delete/);
  assert.doesNotMatch(migration,/INSERT\s+(?:OR\s+IGNORE\s+)?INTO\s+united_points_ledger/i);
  assert.doesNotMatch(migration,/INSERT\s+INTO\s+united_history_claims/i);
});

test('all claim and review routes are inside authenticated/Admin routing',()=>{
  assert.match(worker,/if \(url\.pathname\.startsWith\("\/api\/admin\/"\)\)[\s\S]*requireAdmin[\s\S]*\/api\/admin\/history\/claims/);
  assert.match(worker,/\/api\/history\/claims[\s\S]*submitHistoryClaim/);
  assert.match(worker,/\/api\/history\/completed[\s\S]*completeMemberHistory/);
  assert.match(worker,/adminHistoryReviewMatch[\s\S]*patchAdminHistoryClaim/);
});

test('all public Points displays consume the authoritative United Club payload',()=>{
  assert.match(merchJs,/fetch\(`\$\{apiBaseUrl\}\/api\/united-club`/);
  assert.match(merchJs,/Authorization:`Bearer \$\{token\}`/);
  assert.match(merchJs,/club\.points\?\.available/);
  assert.doesNotMatch(merchJs,/localStorage|config\.points|deriveMemberBenefit/);
});
