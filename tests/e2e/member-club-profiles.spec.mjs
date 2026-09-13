import { expect, test } from '@playwright/test';
import { expectNoUnexpectedClientErrors, prepareE2ePage } from './fixtures.mjs';

const visibleProfile={
  profileRef:'EU-OTHER',name:'Petr Svoboda',nickname:'Petr',memberSince:2023,attendanceCount:2,
  points:{available:8,lifetime:11},rating:{name:'328i'},ownProfile:false,
  achievements:[{id:'attendance-2',name:'UNITED REGULAR'}],
  history:[{eventYear:2025,showShine:null},{eventYear:2023,showShine:{placement:2}}],
  cars:[{id:'car-petr',nickname:'Alpina',model:'328i',body:'Touring',year:1997,color:'Boston Green',primary:true,photos:[{id:'photo-petr',imageUrl:'/api/united-club/members/EU-OTHER/media/cars/photo-petr'}]}],
  gallery:[{id:'gallery-petr',caption:'Páteční příjezd',imageUrl:'/api/gallery/media/gallery-petr'}],
};
const clubProfiles={
  'EU-OTHER':visibleProfile,
  'EU-HIDDEN':{...visibleProfile,profileRef:'EU-HIDDEN',nickname:'Hidden',hidden:true},
};
const clubMembers={members:[{profileRef:'EU-OTHER',name:'Petr Svoboda',nickname:'Petr',memberSince:2023,attendanceCount:2,photoId:'photo-petr',photoUrl:'/api/united-club/members/EU-OTHER/media/cars/photo-petr'}],pagination:{limit:24,offset:0,nextOffset:1,hasMore:false}};
const approvedGallery=[
  {id:'gallery-petr',author:'Petr',caption:'Páteční příjezd',imageUrl:'/api/gallery/media/gallery-petr',profileRef:'EU-OTHER'},
  {id:'gallery-hidden',author:'Hidden',caption:'Společná fotka zůstává',imageUrl:'/api/gallery/media/gallery-hidden',profileRef:'EU-HIDDEN'},
];

async function prepareClubPage(page,options={}){
  return prepareE2ePage(page,{authenticated:true,registrationOpen:true,cars:[],clubProfiles,approvedGallery,clubPayload:{clubMembers,profileCompletion:{requiredFields:true,historyReviewed:false,hasCar:false,approvedPhotos:1,complete:false},approvedPhotoCount:1},...options});
}

async function verifyMemberAndGallery(page,label){
  await page.setViewportSize(label==='mobile'?{width:390,height:844}:{width:1440,height:980});
  const observations=await prepareClubPage(page);
  await page.goto('/member.html');await expect(page.locator('[data-app-view]')).toBeVisible();
  const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await expect(intro).toContainText('TVŮJ UNITED ZAČÍNÁ TADY');
  if(label==='desktop')await intro.locator('.united-onboarding').screenshot({path:'test-results/member-onboarding-first-desktop.png'});
  await intro.getByRole('button',{name:'Zavřít úvod'}).click();await expect(intro).toBeHidden();
  const onboarding=page.locator('[data-united-onboarding]');await expect(onboarding).toBeVisible();await expect(onboarding).toContainText('Otevřít registraci');
  await page.reload();await expect(page.locator('[data-app-view]')).toBeVisible();await expect(intro).toBeHidden();

  await page.locator('[data-member-section="club"]').click();const clubPanel=page.locator('[data-member-panel="club"]');await expect(clubPanel).toHaveClass(/is-active/);
  await expect(clubPanel.locator('.club-members-section')).toHaveCount(0);
  const membersButton=page.locator('[data-open-club-members]');await expect(membersButton).toHaveText(/Zobrazit členy klubu/);
  if(label==='desktop')await page.locator('.united-club-head').screenshot({path:'test-results/member-club-entry-desktop.png'});
  await membersButton.click();const membersModal=page.locator('[data-club-members-modal]');await expect(membersModal).toBeVisible();
  const card=membersModal.locator('.club-member-card').first();await expect(card).toContainText('Petr');await card.click();
  const profileModal=page.locator('[data-club-profile-modal]');await expect(profileModal).toBeVisible();const profile=profileModal.locator('[data-club-profile-content]');
  await expect(profile).toContainText('Alpina');await expect(profile).toContainText('Páteční příjezd');await expect(profile).not.toContainText(/petr@example|UID|rezervac|platb|poznám/i);
  const sections=await profile.locator('[data-club-profile-gallery],[data-club-profile-garage]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-club-profile-gallery')!==null?'gallery':'garage'));
  expect(sections).toEqual(['gallery','garage']);await expect(profile.locator('.club-profile-gallery img')).toHaveAttribute('loading','lazy');
  const overflow=await profileModal.locator('.club-profile-dialog').evaluate(element=>element.scrollWidth-element.clientWidth);expect(overflow).toBeLessThanOrEqual(1);
  if(label==='desktop')await profileModal.locator('.club-profile-dialog').screenshot({path:'test-results/member-club-profile-compact-desktop.png'});
  else await profileModal.locator('.club-profile-dialog').screenshot({path:'test-results/member-club-profile-390.png'});
  await page.goBack();await expect(profileModal).toBeHidden();await expect(membersModal).toBeVisible();await membersModal.getByRole('button',{name:'Zavřít seznam členů'}).click();await expect(membersModal).toBeHidden();await expect(clubPanel).toHaveClass(/is-active/);

  await page.goto('/galerie.html');const author=page.locator('.gallery-member-link',{hasText:'Petr'});await expect(author).toBeVisible();
  expect(observations.requests.filter(request=>request==='GET /api/united-club/gallery-links')).toHaveLength(1);const profileRequestsBefore=observations.requests.filter(request=>request==='GET /api/united-club/members/EU-OTHER').length;
  await expect(page.locator('.gallery-item',{hasText:'Hidden'}).locator('.gallery-member-link')).toHaveCount(0);await expect(page.locator('.gallery-item',{hasText:'Hidden'})).toBeVisible();
  await author.scrollIntoViewIfNeeded();const scrollBefore=await page.evaluate(()=>scrollY);
  if(label==='desktop')await author.screenshot({path:'test-results/gallery-member-author-link.png'});
  await author.click();await expect(page).toHaveURL(/galerie\.html\?profile=EU-OTHER/);await expect(profileModal).toBeVisible();await expect(profile).toContainText('Petr');
  expect(observations.requests.filter(request=>request==='GET /api/united-club/members/EU-OTHER')).toHaveLength(profileRequestsBefore+1);
  if(label==='desktop')await profileModal.locator('.club-profile-dialog').screenshot({path:'test-results/gallery-member-profile-overlay.png'});
  await profile.locator('[data-club-profile-gallery] [data-lightbox]').click();await expect(page.locator('.lightbox')).toHaveClass(/open/);await page.keyboard.press('Escape');await expect(page.locator('.lightbox')).not.toHaveClass(/open/);await expect(profileModal).toBeVisible();
  await page.keyboard.press('Escape');await expect(profileModal).toBeHidden();await expect(author).toBeFocused();expect(Math.abs((await page.evaluate(()=>scrollY))-scrollBefore)).toBeLessThanOrEqual(2);
  await author.click();await expect(profileModal).toBeVisible();await page.goBack();await expect(profileModal).toBeHidden();await expect(page).toHaveURL(/galerie\.html$/);
  if(label==='mobile')await page.screenshot({path:'test-results/gallery-profile-flow-390.png',fullPage:false});
  expectNoUnexpectedClientErrors(observations);
}

test('MEMBER CLUB profile UX stays in gallery and keeps Club navigation compact',async({browser})=>{
  for(const label of ['desktop','mobile']){const page=await browser.newPage();try{await verifyMemberAndGallery(page,label)}finally{await page.close()}}
});

test('MEMBER CLUB onboarding acknowledgement is isolated per member and completion uses required steps only',async({browser})=>{
  const context=await browser.newContext();
  const first=await context.newPage();await first.setViewportSize({width:390,height:844});await prepareClubPage(first,{member:{id:'member-a',memberCode:'EU-A',name:'Alice United',email:'alice@example.test'}});await first.goto('/member.html');await expect(first.locator('[data-onboarding-intro-modal]')).toBeVisible();await first.getByRole('button',{name:'Zavřít úvod'}).click();await first.reload();await expect(first.locator('[data-onboarding-intro-modal]')).toBeHidden();await first.close();
  const second=await context.newPage();await second.setViewportSize({width:390,height:844});await prepareClubPage(second,{member:{id:'member-b',memberCode:'EU-B',name:'Bob United',email:'bob@example.test'}});await second.goto('/member.html');await expect(second.locator('[data-onboarding-intro-modal]')).toBeVisible();await second.close();
  const complete=await context.newPage();await complete.setViewportSize({width:1440,height:980});await prepareE2ePage(complete,{authenticated:true,registrationOpen:false,clubProfiles,approvedGallery,clubPayload:{clubMembers,profileCompletion:{requiredFields:true,historyReviewed:false,hasCar:true,approvedPhotos:0,complete:false},approvedPhotoCount:0},member:{id:'member-complete',memberCode:'EU-C',name:'Complete United',email:'complete@example.test'}});await complete.goto('/member.html');await expect(complete.locator('[data-onboarding-intro-modal]')).toBeHidden();const box=complete.locator('[data-united-onboarding]');await expect(box).toContainText('Děkujeme, že jsi UNITED');await expect(box).toContainText('Profil máš kompletní.');await expect(box.locator('.united-onboarding-steps')).toBeHidden();await box.screenshot({path:'test-results/member-onboarding-complete.png'});await complete.close();await context.close();
});

test('MEMBER CLUB anonymous gallery keeps approved photos but exposes no member profile action',async({page})=>{
  const observations=await prepareE2ePage(page,{authenticated:false,clubProfiles,approvedGallery});await page.goto('/galerie.html');await expect(page.locator('.gallery-item--user')).toHaveCount(2);await expect(page.locator('.gallery-member-link')).toHaveCount(0);await expect(page).toHaveURL(/galerie\.html$/);expectNoUnexpectedClientErrors(observations);
});
