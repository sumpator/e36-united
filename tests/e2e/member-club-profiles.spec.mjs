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
const rejectedReservation={
  id:'reservation-rejected-change',eventId:'united-2026',eventYear:2026,title:'E36 United 2026',carId:'car-001',
  carSnapshot:{id:'car-001',nickname:'Estoril',body:'Coupé',model:'328i'},arrival:'Pátek',crew:2,accommodation:'Bez ubytování',accommodationUnits:0,showShine:'Ne',status:'approved',amountDueCzk:0,amountPaidCzk:0,
  request:{id:'request-rejected',type:'change',status:'rejected',original:{arrival:'Pátek'},proposed:{arrival:'Sobota',crew:2,accommodation:'Bez ubytování',amountDueCzk:0},memberNote:'Změna příjezdu',adminComment:'Původní rezervace zůstává platná.',memberAcknowledgedAt:null},
};

async function runFlow(page,label){
  await page.setViewportSize(label==='mobile'?{width:390,height:844}:{width:1440,height:980});
  const observations=await prepareE2ePage(page,{authenticated:true,registrationOpen:true,reservation:rejectedReservation,clubProfiles,approvedGallery,clubPayload:{clubMembers,profileCompletion:{requiredFields:true,historyReviewed:false,hasCar:true,approvedPhotos:1,complete:false},approvedPhotoCount:1}});
  await page.goto('/member.html');await expect(page.locator('[data-app-view]')).toBeVisible();
  const onboarding=page.locator('[data-united-onboarding]');await expect(onboarding).toBeVisible();await expect(onboarding).toContainText('Profil je založený');await expect(onboarding).toContainText('Rezervace je připravená');
  if(label==='desktop')await onboarding.screenshot({path:'test-results/member-club-onboarding-desktop.png'});else await onboarding.screenshot({path:'test-results/member-club-onboarding-390.png'});

  await page.locator('[data-united-onboarding] [data-jump="club"]').click();await expect(page.locator('[data-member-panel="club"]')).toHaveClass(/is-active/);
  const list=page.locator('[data-club-members-list]');await expect(list).toContainText('Petr');await expect(list).not.toContainText('Hidden');
  if(label==='desktop')await page.locator('.club-members-section').screenshot({path:'test-results/member-club-list-desktop.png'});
  const card=list.locator('.club-member-card').first();await card.click();const modal=page.locator('[data-club-profile-modal]');await expect(modal).toBeVisible();await expect(modal).toContainText('Alpina');await expect(modal).toContainText('Páteční příjezd');await expect(modal).not.toContainText('petr@example');
  if(label==='desktop')await modal.locator('.club-profile-dialog').screenshot({path:'test-results/member-club-profile-desktop.png'});
  await page.keyboard.press('Escape');await expect(modal).toBeHidden();await expect(card).toBeFocused();

  await page.goto('/galerie.html');const visibleAuthor=page.locator('.gallery-member-link',{hasText:'Petr'});await expect(visibleAuthor).toBeVisible();await expect(page.locator('.gallery-item',{hasText:'Hidden'}).locator('.gallery-member-link')).toHaveCount(0);await visibleAuthor.click();
  await expect(page).toHaveURL(/member\.html\?section=club&profile=EU-OTHER/);await expect(page.locator('[data-club-profile-modal]')).toBeVisible();await expect(page.locator('[data-club-profile-content]')).toContainText('Petr');

  await page.goto('/member.html?section=reservation');const requestPanel=page.locator('[data-reservation-request-status]');await expect(requestPanel).toBeVisible();await expect(requestPanel).toContainText('Žádost o změnu byla zamítnuta');await expect(requestPanel).toContainText('Původní rezervace zůstává platná.');
  if(label==='desktop')await requestPanel.screenshot({path:'test-results/member-rejected-change-ack-desktop.png'});
  await requestPanel.locator('[data-reservation-request-acknowledge]').click();await expect(requestPanel).toBeHidden();expect(observations.reservationRequestAcknowledgements).toHaveLength(1);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);expect(overflow).toBeLessThanOrEqual(1);
  expectNoUnexpectedClientErrors(observations);
}

test('MEMBER CLUB visible profiles, private links, onboarding and rejected-change acknowledgement stay responsive',async({browser})=>{
  for(const label of ['desktop','mobile']){const page=await browser.newPage();try{await runFlow(page,label)}finally{await page.close()}}
});
