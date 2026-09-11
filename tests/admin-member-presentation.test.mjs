import test from 'node:test';
import assert from 'node:assert/strict';
import {MEMBER_TABS,memberIdentity,memberOverview,memberSection,memberLabel} from '../admin/member-presentation.js';
import {adminRoute,adminRouteUrl} from '../admin/navigation.js';
import {memberRefreshTasks} from '../admin/member-detail.js';
import {adminState} from '../admin/state.js?v=20260911-member-rows-r3';
import {ADMIN_REFRESH} from '../admin/refresh-policy.js';
const header={member:{memberId:'m',name:'Testovací člen',nickname:'Řidič',email:'example@example.invalid',memberCode:'EU-TEST',status:'active',role:'member',createdAt:'2026-01-01'},event:{id:'e',title:'United 2026'},reservations:[]};

test('Member modal section contract defaults to overview and preserves every explicit deep link',()=>{
 assert.deepEqual(Object.keys(MEMBER_TABS),['overview','event','reservations','garage','photos','club','history','points','mailing','qr']);
 globalThis.location={pathname:'/admin.html'};
 for(const tab of Object.keys(MEMBER_TABS)){const url=adminRouteUrl({section:'members',memberId:'m',eventId:'e',memberTab:tab});assert.equal(adminRoute(url.split('?')[1]).memberTab,tab);if(tab==='event')assert.match(url,/tab=event/);}
 assert.equal(adminRoute('?member=m').memberTab,'overview');assert.equal(adminRoute('?member=m&tab=__proto__').memberTab,'overview');assert.doesNotMatch(adminRouteUrl({memberId:'m',memberTab:'<unsafe>'}),/tab=/);
 delete globalThis.location;
});
test('Member overview adds only existing Club analytics to header tasks and keeps all other sources explicit',()=>{
 Object.assign(adminState,{memberId:'m',selectedEventId:'e',memberTab:'overview',memberPage:1});
 const tasks=memberRefreshTasks();assert.deepEqual(tasks.map(t=>[t[0],t[1],t[3]]),[['member-header','/api/admin/members/m?eventId=e',ADMIN_REFRESH.operationalMs],['member-tab','/api/admin/members/m/club?eventId=e&page=1',ADMIN_REFRESH.analyticsMs]]);
 adminState.memberTab='club';assert.equal(memberRefreshTasks()[1][1],tasks[1][1]);adminState.memberTab='event';assert.equal(memberRefreshTasks().length,1);adminState.memberId=null;
});
test('Member overview distinguishes success-empty, initial loading, unavailable and stale projections',()=>{
 assert.match(memberOverview(header,null),/Na tento ročník zatím nemá rezervaci/);assert.match(memberOverview(header,null),/Bez rezervace nejsou/);assert.doesNotMatch(memberOverview(header,null),/vše zaplaceno/i);
 const failed=memberOverview(null,null,{headerState:{state:'unavailable'},clubState:{state:'unavailable'}});assert.match(failed,/Rezervaci se nepodařilo načíst/);assert.doesNotMatch(failed,/zatím nemá rezervaci/);
 assert.match(memberOverview(null,null),/Načítám rezervaci/);assert.match(memberOverview(header,null,{headerState:{state:'stale'}}),/posledního úspěšného čtení/);
});
test('Member presentation uses exact per-reservation finance, known zero and unknown are distinct',()=>{
 const res={id:'r',eventId:'e',amountDueCzk:1000,amountPaidCzk:1300};
 const html=memberOverview({...header,reservations:[res]},null);assert.match(html,/300\sKč/);assert.match(html,/0\sKč/);
 const unknown=memberOverview({...header,reservations:[{...res,amountPaidCzk:null,amountDueCzk:null}]},null);assert.doesNotMatch(unknown,/0\sKč/);assert.match(unknown,/>—</);
});
test('Member identity is escaped, monogram-only and labels registration without historical claims',()=>{
 assert.match(memberIdentity(header.member),/ČLEN UNITED/);assert.match(memberIdentity(header.member),/Aktivní/);assert.doesNotMatch(memberIdentity(header.member),/<img/);
 assert.match(memberIdentity({...header.member,nickname:'<img onerror=x>'}),/&lt;img/);const html=memberOverview(header,null);assert.match(html,/Registrace/);assert.match(html,/Neuveden/);assert.doesNotMatch(html,/United od/);assert.equal(memberLabel('future_status'),'future_status');
});
test('Member Club summary uses server values and no invented progress or rating calculation',()=>{
 const club={rating:{name:'Serverová hodnost'},points:{available:0,lifetime:400},achievements:Array.from({length:5},(_,i)=>({name:'Achievement '+i,condition:'Serverový popis'}))};
 const html=memberOverview(header,club);assert.match(html,/Serverová hodnost/);assert.match(html,/>0</);assert.match(html,/>400</);assert.doesNotMatch(html,/Achievement 3|progress|meter/);
 assert.match(memberSection({...club,context:{tab:'club'}}),/Achievement 4/);
});
test('Member history presents separate decisions, Mailing never infers relation and unissued QR has no generator call',()=>{
 const history=memberSection({context:{tab:'history'},items:[{year:2025,attendanceStatus:'approved',snsStatus:'pending',attendanceNote:'Účast ověřena',snsNote:'Výsledek čeká'}]});assert.match(history,/Účast ověřena/);assert.match(history,/Výsledek čeká/);assert.match(history,/Schváleno/);assert.match(history,/Čeká na schválení/);
 assert.match(memberSection({context:{tab:'mailing'},items:[],contact:null}),/Shoda e-mailu sama o sobě není vazba/);
 assert.match(memberSection({context:{tab:'qr'},payload:null},()=>assert.fail('must not generate')),/Členské QR zatím nebylo vydáno/);
});

test('Member known technical labels are presentation-only and keep Mailing eligibility distinct from consent',()=>{
 assert.equal(memberLabel('suspended'),'Pozastavený');assert.equal(memberLabel('not_claimed'),'Nenárokováno');
 const html=memberSection({context:{tab:'mailing'},contact:{email:'test@example.invalid',mailingConsent:'no',suppressionStatus:'eligible',deliverabilityStatus:'unknown'},items:[{campaign:'Test',deliveryStatus:'prepared'}]});
 assert.match(html,/>Ne</);assert.match(html,/Bez vyloučení/);assert.match(html,/Neznámý stav/);assert.match(html,/Připraveno/);assert.doesNotMatch(html,/Souhlas udělen|eligible|prepared/);
});
