import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=name=>readFileSync(new URL(`../${name}`,import.meta.url),'utf8');
const memberHtml=read('member.html'),memberEntryJs=read('member.js'),memberShellJs=read('member/shell.js'),memberOverviewJs=read('member/modules/overview.js'),memberClubIndexJs=read('member/modules/club/index.js'),memberClubPointsJs=read('member/modules/club/points.js'),memberClubHistoryJs=read('member/modules/club/history.js'),memberAccountJs=read('member/modules/account.js'),memberJs=[memberEntryJs,memberShellJs,memberOverviewJs,memberClubIndexJs,memberClubPointsJs,memberClubHistoryJs,memberAccountJs].join('\n'),memberCss=read('member.css');
const adminHtml=read('admin.html'),adminJs=`${read('admin.js')}\n${read('admin/state.js')}\n${read('admin/modules/moderation.js')}`,adminCss=read('admin.css');
const merchJs=read('merch.js');
const worker=[
  'worker/domains.js',
  'worker/domains/club/history.js',
  'worker/domains/club/points.js',
  'worker/domains/club/achievements.js',
  'worker/domains/club/index.js',
  'worker/router.js',
].map(read).join('\n'),migration=read('D1-united-club-v1.sql');
const club=memberHtml.slice(memberHtml.indexOf('data-member-panel="club"'),memberHtml.indexOf('data-member-panel="photos"'));

test('United Club uses exact heading, explanation and four activity-only earning cards',()=>{
  assert.match(club,/United Club\.[\s\S]*Tvoje historie, body a odměny v United\./);
  assert.doesNotMatch(club,/Body\. Historie\. Achievements\./);
  assert.match(club,/United Points\. Tvoje odměny\./);
  assert.match(club,/Buď členem United a čerpej výhody![\s\S]*TOP 3 Show &amp; Shine[\s\S]*přidávání fotek/);
  const rewards=memberClubPointsJs.slice(memberClubPointsJs.indexOf('function renderRewards()'),memberClubPointsJs.indexOf('function bind()'));
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

test('focused history claim immediately collects evidence without an attendance checkbox',()=>{
  const claimForm=memberJs.slice(memberJs.indexOf('function historyClaimForm'),memberJs.indexOf('function closeHistoryCategoryField'));
  const submit=memberJs.slice(memberJs.indexOf('async function submitHistoryEditorForm'),memberJs.indexOf('function openHistoryEditor'));
  assert.doesNotMatch(claimForm,/Byl\/a jsem tam|data-history-attended-toggle|name="attended"/);
  assert.match(claimForm,/DOLOŽ SVOJI ÚČAST/);
  assert.match(claimForm,/Nahraj důkaz účasti/);
  assert.match(claimForm,/případně doplň Show/);
  assert.match(claimForm,/data-history-claim-fields=""/);
  assert.doesNotMatch(claimForm,/data-history-claim-fields="" hidden/);
  assert.match(memberJs,/renderHistoryEditor\(eventId,eventId\?'view':''\)/);
  assert.match(memberJs,/list\.dataset\.selectedEvent=historyEditorSelectedEventId/);
  assert.match(memberJs,/list\.innerHTML=selected\?historyClaimForm\(selected,\{mode:historyEditorMode\}\)/);
  assert.doesNotMatch(submit,/attended/);
  assert.match(worker,/VALUES \(\?, \?, \?, 'pending'/);
});

test('history S&S uses NE/ANO, configured custom category options and no native selects',()=>{
  const sns=memberJs.slice(memberJs.indexOf('function historySnsFields'),memberJs.indexOf('function historyEvidenceMarkup'));
  assert.match(memberHtml,/showshine-data\.js/);
  assert.match(memberJs,/window\.E36_SHOWSHINE\?\.categories/);
  assert.match(sns,/data-history-sns-choice="no"[\s\S]*data-history-sns-choice="yes"/);
  assert.match(sns,/const prefill=!!sns\.competed/);
  assert.match(sns,/aria-pressed="\$\{!prefill\}"/);
  assert.match(sns,/aria-pressed="\$\{prefill\}"/);
  assert.match(sns,/data-history-category-trigger/);
  assert.match(sns,/role="listbox"/);
  assert.match(sns,/data-history-category-value/);
  assert.doesNotMatch(sns,/<select|<option/);
  assert.match(memberCss,/\.history-category-menu\{position:absolute/);
});

test('history placement and optional accolades are styled accessible inputs',()=>{
  const sns=memberJs.slice(memberJs.indexOf('function historySnsFields'),memberJs.indexOf('function historyEvidenceMarkup'));
  for(const value of ['', '3', '2', '1'])assert.match(sns,new RegExp(`name="snsPlacement" type="radio" value="${value}"`));
  for(const name of ['snsBestOfBest','snsBestExhaust'])assert.match(sns,new RegExp(`name="${name}" type="checkbox" value="on"`));
  assert.match(memberCss,/\.history-placement-options \.is-bronze:has\(input:checked\)/);
  assert.match(memberCss,/\.history-placement-options \.is-silver:has\(input:checked\)/);
  assert.match(memberCss,/\.history-placement-options \.is-gold:has\(input:checked\)/);
  assert.match(memberCss,/\.history-award-chip:has\(input:checked\)/);
});

test('history claim FormData stays compatible and omits unselected S&S defaults',()=>{
  const submit=memberJs.slice(memberJs.indexOf('async function submitHistoryEditorForm'),memberJs.indexOf('function openHistoryEditor'));
  assert.match(submit,/upload\.append\('eventId',fd\.get\('eventId'\)\)/);
  assert.match(submit,/if\(fd\.get\('snsCompeted'\)\)\{/);
  for(const field of ['snsCompeted','snsCategory','snsPlacement','snsBestOfBest','snsBestExhaust'])assert.match(`${submit}\n${worker}`,new RegExp(field));
  assert.match(submit,/upload\.append\('files',file,file\.name\)/);
  assert.doesNotMatch(submit,/upload\.append\('attended'/);
  assert.match(worker,/if \(!competed\) return \{ value: \{ competed: false, category: null, placement: null/);
});

test('history header drops its redundant UNITED OD block but keeps the secondary editor action',()=>{
  assert.doesNotMatch(club,/history-since|data-history-since/);
  assert.match(club,/MOJE STOPA V UNITED[\s\S]*Tvoje United historie\.[\s\S]*history-edit-all/);
  assert.match(memberHtml,/data-member-since/);
});

test('history year cards open and focus the matching editor event while the full editor remains secondary',()=>{
  assert.match(memberHtml,/class="member-secondary history-edit-all" data-open-history-editor/);
  assert.match(memberHtml,/aria-controls="history-editor-modal"/);
  assert.match(memberJs,/tag=item\.concluded\?'button':'article'/);
  assert.match(memberJs,/data-open-history-year="\$\{esc\(item\.eventId\)\}"/);
  assert.match(memberJs,/openHistoryEditor\(event\.currentTarget,button\.dataset\.openHistoryYear\)/);
  assert.match(memberJs,/data-history-event="\$\{esc\(item\.eventId\)\}" tabindex="-1"/);
  assert.match(memberJs,/const selectedEvent=renderHistoryEditor\(eventId,eventId\?'view':''\)/);
  assert.match(memberJs,/const target=\$\('\[data-history-event\]',historyEditor\)/);
  assert.match(memberJs,/if\(eventId\)target\.scrollIntoView\(\{block:'start'\}\)/);
  assert.match(memberCss,/button\.history-year:focus-visible/);
});

test('verified year detail exposes edit action and keeps the same selected event',()=>{
  const overview=memberJs.slice(memberJs.indexOf('function historyEditorOverview'),memberJs.indexOf('function historyClaimForm'));
  const editor=memberJs.slice(memberJs.indexOf('function renderHistoryEditor'),memberJs.indexOf('async function submitHistoryEditorForm'));
  assert.match(overview,/DETAIL HISTORIE/);
  assert.match(overview,/Upravit údaje/);
  assert.match(overview,/data-history-edit-selected="\$\{esc\(item\.eventId\)\}"/);
  assert.match(editor,/renderHistoryEditor\(buttonEvent\.currentTarget\.dataset\.historyEditSelected,'edit'\)/);
  assert.match(editor,/historyEditorSelectedEventId=selected\?\.eventId/);
});

test('history editor uses compact stateful year navigation and renders one detail only',()=>{
  const editor=memberJs.slice(memberJs.indexOf('function preferredHistoryEditorMode'),memberJs.indexOf('async function submitHistoryEditorForm'));
  assert.match(memberHtml,/data-history-year-nav/);
  assert.match(memberHtml,/data-history-editor-list/);
  assert.match(editor,/sort\(\(a,b\)=>Number\(b\.eventYear\)-Number\(a\.eventYear\)\)/);
  assert.match(editor,/data-history-year-select/);
  for(const state of ['pending','verified','rejected','empty'])assert.match(memberJs,new RegExp(`key:'${state}'`));
  assert.match(editor,/list\.innerHTML=selected\?historyClaimForm\(selected/);
  assert.doesNotMatch(editor,/concluded\.map\(item=>historyClaimForm/);
  assert.match(memberCss,/\.history-editor-years\{display:grid;grid-template-columns:repeat\(6/);
  assert.match(memberCss,/scroll-snap-type:x mandatory/);
});

test('global history editor chooses pending, then incomplete, then the newest year',()=>{
  const defaults=memberJs.slice(memberJs.indexOf('function preferredHistoryEditorMode'),memberJs.indexOf('function historyYearSelectorMarkup'));
  assert.match(defaults,/key==='pending'/);
  assert.match(defaults,/\['empty','rejected'\]\.includes/);
  assert.match(defaults,/items\[0\]/);
  assert.match(memberJs,/\$\('\[data-open-history-editor\]'\)\?\.addEventListener\('click',event=>openHistoryEditor\(event\.currentTarget\)\)/);
});

test('verified attendance is protected while safe S&S amendments are prefilled',()=>{
  const sns=memberJs.slice(memberJs.indexOf('function historySnsFields'),memberJs.indexOf('function historyEvidenceMarkup'));
  const claim=memberJs.slice(memberJs.indexOf('function historyClaimForm'),memberJs.indexOf('function closeHistoryCategoryField'));
  assert.match(claim,/Schválenou účast nelze odebrat/);
  assert.match(claim,/if\(approved\)return[\s\S]*historyEvidenceMarkup\(item\)/);
  assert.match(claim,/Schválené Show &amp; Shine nelze bezpečně přepsat/);
  assert.match(claim,/Současné API neumí schválené S&S bezpečně měnit/);
  assert.match(sns,/\['not_claimed','rejected'\]\.includes\(sns\.status\)/);
  assert.match(sns,/value="\$\{esc\(category\)\}"/);
  assert.match(sns,/placement==='2'\?'checked':''/);
  assert.match(sns,/sns\.bestOfBest\?'checked':''/);
  assert.match(sns,/sns\.bestExhaust\?'checked':''/);
  assert.match(worker,/existing\?\.attendance_status === "approved"/);
  assert.match(worker,/sns_status = 'pending'/);
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
  assert.match(summary,/\.join\(' · '\)/);
  for(const detail of ['místo','Best of the Best','Nej zvuk výfuku'])assert.match(summary,new RegExp(detail));
  assert.match(memberJs,/if\(pending\)return[\s\S]*historySubmittedSummary\(item\)/);
  assert.match(memberJs,/item\.showShine\?\.status==='pending'\?historySubmittedSummary\(item,\{attendance:false\}\)/);
});

test('featured S&S TOP 3 and BMW Prospekt use only authoritative Bronze Silver Gold tier classes',()=>{
  const tier=memberOverviewJs.slice(memberOverviewJs.indexOf('function achievementTierClass'),memberOverviewJs.indexOf('function renderFeaturedAchievements'));
  assert.match(tier,/sns-top3-/);
  assert.match(tier,/achievement\.type==='community'&&achievement\.name==='BMW PROSPEKT'/);
  assert.match(tier,/\['bronze','silver','gold'\]/);
  assert.match(memberJs,/featured-achievement \$\{tierClass\}/);
  assert.match(memberJs,/featured-achievement-tier/);
  for(const value of ['bronze','silver','gold'])assert.match(memberCss,new RegExp(`featured-achievement\\.is-tier-${value} i`));
  assert.doesNotMatch(tier,/attendance|history/);
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
  assert.match(memberJs,/function positionContextPopover[\s\S]*getBoundingClientRect\(\)/);
  assert.match(memberJs,/data-achievement-tier/);
  assert.match(memberJs,/data-achievement-condition/);
  assert.match(memberJs,/data-achievement-points/);
  assert.match(memberJs,/event\.key==='Escape'/);
  assert.match(memberCss,/left:var\(--context-left\)!important[\s\S]*top:var\(--context-top\)!important/);
  assert.match(memberCss,/\.contextual-popover\.is-mobile-sheet\{left:10px!important[\s\S]*bottom:10px!important/);
});

test('all United Club help uses one anchored desktop and mobile-sheet infrastructure',()=>{
  assert.match(memberHtml,/member-help-popover contextual-popover/);
  assert.match(memberHtml,/achievement-detail-popover contextual-popover/);
  assert.match(memberJs,/positionContextPopover\(memberHelpPopover,button,370\)/);
  assert.match(memberJs,/positionContextPopover\(achievementPopover,button,330\)/);
  assert.match(memberJs,/closeAchievementDetail\(\);memberHelpTrigger=button/);
  assert.match(memberJs,/closeMemberHelp\(\);achievementTrigger=button/);
  assert.match(memberJs,/window\.addEventListener\('resize',refreshContextPopoverPosition/);
  assert.match(memberJs,/window\.addEventListener\('scroll',refreshContextPopoverPosition/);
});

test('Points help and Achievement detail use structured sections and rows',()=>{
  const help=memberJs.slice(memberJs.indexOf('const memberHelpContent'),memberJs.indexOf('const memberHelpPopover'));
  for(const label of ['BODY ZA ÚČAST','UMÍSTĚNÍ','BONUSY','MILNÍKY','PODMÍNKY'])assert.match(help,new RegExp(label));
  for(const score of ['+1 bod','+2 body','+3 body'])assert.match(help,new RegExp(score.replace('+','\\+')));
  assert.match(memberJs,/context-popover-rows/);
  assert.match(memberHtml,/achievement-detail-head/);
  assert.match(memberHtml,/>PODMÍNKA</);
  assert.match(memberHtml,/>ODMĚNA</);
  assert.match(memberJs,/\[year,achievement\.tier\|\|'ACHIEVEMENT'\]/);
  assert.match(memberCss,/\.context-popover-rows>div/);
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
  assert.match(adminHtml,/data-gallery-mode="history"[\s\S]*Ověření účasti/);
  assert.equal((adminHtml.match(/data-admin-jump="gallery"/g)||[]).length,1);
  assert.match(adminHtml,/data-history-search/);
  for(const status of ['pending','approved','rejected','all'])assert.match(adminHtml,new RegExp(`data-history-filter="${status}"`));
  assert.match(adminJs,/filteredHistoryClaims/);
  assert.match(adminJs,/data-history-review="attendance"/);
  assert.match(adminJs,/data-history-review="sns"/);
  assert.match(adminJs,/Při zamítnutí je důvod povinný/);
  assert.match(adminHtml,/data-attention-history/);
});

test('Admin history review is server-filtered, session-sticky, paginated and compact by default',()=>{
  for(const marker of ['data-history-year','Všechny ročníky','data-history-type','Attendance','Best of the Best','Best Exhaust','data-history-clear','Vymazat filtry','data-history-pagination'])assert.match(adminHtml,new RegExp(marker));
  assert.match(adminHtml,/Show &amp; Shine/);
  for(const key of ['historyStatus','historyYear','historyType','historySearch'])assert.match(adminJs,new RegExp(`e36UnitedAdmin\\.${key}`));
  assert.match(adminJs,/function historyRequestPath[\s\S]*pageSize/);
  assert.match(adminJs,/<details class="admin-history-card/);
  assert.match(adminJs,/addEventListener\('toggle'[\s\S]*hydrateHistoryEvidence/);
  assert.match(adminJs,/await loadHistoryClaims\(\{page:adminState\.historyPagination\.page\}\)/);
  assert.match(worker,/SUM\(CASE WHEN c\.attendance_status = 'pending' OR c\.sns_status = 'pending' THEN 1 ELSE 0 END\)/);
  assert.match(worker,/LIMIT \? OFFSET \?/);
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
