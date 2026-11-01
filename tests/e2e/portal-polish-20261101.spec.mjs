import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {updateReservationCar} from '../../worker/domains/reservations/requests.js';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
const reservation={id:'r',eventId:'e',eventYear:2026,status:'approved',carId:'c',carSnapshot:{id:'c',nickname:'Blue',model:'BMW 328i'},crew:2,arrival:'Sobota',accommodation:'Bez ubytování',amountDueCzk:1000,payment:{status:'underpaid',amountDueCzk:1000,amountPaidCzk:200,remainingCzk:800,configurationReady:true,actionable:true,testMode:true}};
const cars=[{id:'c',nickname:'Blue',model:'BMW 328i',primary:true,photos:[]},{id:'c2',nickname:'Track',model:'BMW 325i',photos:[]}];
test('empty car choice recovers to one valid save and preserves the existing reservation',async({page})=>{
 const r=memberRuntime();try{
 r.db.exec("UPDATE reservations SET car_id='c' WHERE id='r'");
 const o=await prepareE2ePage(page,{authenticated:true,reservation,cars,member:{id:'m'},showProgramLive:false});let writes=0;
 await page.route('**/api/reservations/r/car',async route=>{writes++;const q=route.request(),res=await updateReservationCar(new Request(q.url(),{method:'PATCH',headers:{'Content-Type':'application/json'},body:q.postData()}),r.env,{uid:'m'},'r','http://127.0.0.1:4173');await route.fulfill({status:res.status,headers,json:await res.json()})});
 await page.goto('/member.html?section=reservation');const select=page.locator('[data-reservation-car-select]'),save=page.locator('[data-reservation-car-save]');await expect(select).toHaveValue('c');await select.selectOption('');await save.click();await expect(page.locator('[data-reservation-car-choice-error]')).toHaveText('Vyber skutečné auto z garáže.');expect(writes).toBe(0);expect(r.db.prepare("SELECT car_id FROM reservations WHERE id='r'").get().car_id).toBe('c');
 await select.selectOption('c2');await expect(page.locator('[data-reservation-car-choice-error]')).toBeHidden();await expect(save).toBeEnabled();await save.click();await expect.poll(()=>r.db.prepare("SELECT car_id FROM reservations WHERE id='r'").get().car_id).toBe('c2');await expect(save).toBeEnabled();expect(writes).toBe(1);expectNoUnexpectedClientErrors(o);
 }finally{r.db.close()}
});

for(const status of ['underpaid','overpaid','paid'])test('trip financial state and saved breakdown '+status,async({page})=>{
 const paid=status==='overpaid'?2920:status==='paid'?1000:200,remaining=Math.max(0,1000-paid),over=Math.max(0,paid-1000),r={...reservation,admissionCzk:500,accommodation:'Chatka',accommodationSnapshot:{optionId:'cabin-standard',optionName:'Chatka',totalCzk:500},payment:{...reservation.payment,status,admissionCzk:500,amountPaidCzk:paid,remainingCzk:remaining,overpaymentCzk:over}};
 const o=await prepareE2ePage(page,{authenticated:true,reservation:r,cars,showProgramLive:false});await page.goto('/member.html?section=reservation');const state=page.locator('[data-reservation-payment-state]');await expect(state).toHaveText(status==='paid'?'Vše v pořádku':status==='overpaid'?'Evidujeme přeplatek':'Evidujeme nedoplatek');await state.getByRole('link').click();await expect(page).toHaveURL(/section=payments.*payment=sraz/);await expect(page.locator('[data-member-payment-tab=sraz]')).toHaveAttribute('aria-pressed','true');
 const parts=page.locator('.payment-price-breakdown');await expect(parts).toContainText('Vstupné');await expect(parts).toContainText('Ubytování');await expect(parts).toContainText('1 000');await expect(page.locator('.payment-totals')).toContainText(paid.toLocaleString('cs-CZ'));if(status!=='underpaid')await expect(page.locator('.member-payment-qr')).toHaveCount(0);await expect(page.locator('.payment-test-warning')).toBeVisible();expectNoUnexpectedClientErrors(o);
});

test('welcome has one navigation action and recognizes an existing preliminary plan',async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true,cars:[],preliminaryEnabled:true,registrationOpen:false,showProgramLive:false});await page.goto('/member.html');const welcome=page.locator('[data-onboarding-intro-content]');await expect(welcome).toBeVisible();await expect(welcome.locator('[data-jump],a[href]')).toHaveCount(1);await expect(welcome).toContainText('za 12 získáš slevu 36 %');await welcome.locator('[data-onboarding-reservation]').click();await expect(page.locator('[data-member-panel=reservation]')).toHaveClass(/is-active/);expectNoUnexpectedClientErrors(o);
});

test('club search reaches later pages with diacritic folding and keeps focus and profile navigation',async({page})=>{
 const {getClubMembers,getClubMemberProfile,listClubMembers}=await import('../../worker/domains/club/members.js');const r=memberRuntime();try{
 for(let i=0;i<27;i++)r.db.prepare("INSERT INTO members(id,member_code,email,name,nickname,created_at) VALUES(?,?,?,?,?,?)").run('search-'+i,'EU-SEARCH-'+i,'private-'+i+'@example.invalid','Člen '+i,'Člen '+i,'2027-01-01');r.db.exec("UPDATE members SET nickname='Řízek',name='Radek Šťastný',created_at='2020-01-01' WHERE id='n';UPDATE cars SET model='M52B28',body='Coupé' WHERE id='cn';UPDATE members SET hide_on_club=1 WHERE id='search-26'");
 const auth={uid:'m',member:{member_code:'EU-MEMBER'}},first=await listClubMembers(r.env,auth);expect(first.pagination.hasMore).toBe(true);
 const o=await prepareE2ePage(page,{authenticated:true,cars,reservation,showProgramLive:false,clubPayload:{clubMembers:first}});
 await page.route('**/api/united-club/members?*',async route=>{const res=await getClubMembers(r.env,auth,new URL(route.request().url()),'http://127.0.0.1:4173');await route.fulfill({headers,status:res.status,json:await res.json()})});
 await page.route('**/api/united-club/members/*',async route=>{const code=new URL(route.request().url()).pathname.split('/').at(-1),res=await getClubMemberProfile(r.env,auth,code,'http://127.0.0.1:4173');await route.fulfill({headers,status:res.status,json:await res.json()})});
 const {readFileSync}=await import('node:fs');const photo=readFileSync('assets/images/showshine/ss_coupe.webp');await page.route('**/api/united-club/members/*/media/cars/*',route=>route.fulfill({headers,contentType:'image/webp',body:photo}));
 await page.goto('/member.html?section=club');await page.locator('[data-open-club-members]').click();const modal=page.locator('[data-club-members-modal]'),input=modal.locator('[data-club-member-search]');await input.fill('rizek');await expect(modal.locator('.club-member-card')).toHaveCount(1);await expect(input).toBeFocused();for(const term of ['stastny','m52b28','coupe']){await input.fill(term);await expect(modal.locator('.club-member-card')).toHaveCount(1);await expect(modal.locator('.club-member-card')).toContainText('Řízek')}
 await input.fill('private-26@example.invalid');await expect(modal.locator('.club-member-card')).toHaveCount(0);await expect(modal).toContainText('Žádný člen');await modal.locator('[data-club-search-clear]').click();await expect(input).toBeFocused();await expect(modal.locator('.club-member-card')).toHaveCount(29);await input.fill('rizek');await modal.getByRole('button',{name:'Otevřít klubový profil Řízek'}).click();await expect(page.locator('[data-club-profile-content] h2')).toHaveText('Řízek');await page.goBack();await expect(modal).toBeVisible();await modal.getByRole('button',{name:'Zavřít seznam členů'}).click();await expect(modal).toBeHidden();expectNoUnexpectedClientErrors(o);
 }finally{r.db.close()}
});
