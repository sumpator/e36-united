import {test,expect} from '@playwright/test';
import {prepareAdminE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {createMailingStarterDraft,renderMailingTemplate} from '../../worker/domains/mailing/template.js';

async function fixture(page,{state='not_configured',status='draft',testError=false}={}){
  const observations=await prepareAdminE2ePage(page),writes=[];
  const starter=createMailingStarterDraft();starter.content.blocks=starter.content.blocks.filter(b=>b.type!=='survey');
  let campaign={...starter,id:'delivery-fixture',status,recipientCount:2,updatedAt:'2026-09-07T10:00:00Z',preparationId:status==='draft'?null:'frozen-1',provider:status==='sent'?'smtp2go':null,providerStatus:status==='sent'?'accepted':null};
  const provider={provider:'smtp2go',state,ready:state==='ready',dailyLimit:200,monthlyRemaining:9998};
  await page.route('https://eu-api.smtp2go.com/**',()=>{throw new Error('Real SMTP2GO requests forbidden')});
  await page.route('**/api/admin/mailing/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname,reply=(body,code=200)=>route.fulfill({status:code,contentType:'application/json',body:JSON.stringify(body)});
    if(path.endsWith('/provider-status'))return reply({provider});
    if(path.endsWith('/campaigns')&&request.method()==='GET')return reply({campaigns:[campaign]});
    if(path.endsWith('/delivery'))return reply({campaign,tracking:{counts:{recipients:2,sent:2,delivered:1,opened:1,clicked:1,bounced:1,unsubscribed:1},detailLimit:500,recipients:[{email:'test1@example.invalid',name:'Synthetic recipient',status:'unsubscribed',deliveredAt:'2026-09-07T11:01:00Z',openedAt:'2026-09-07T11:02:00Z',clickedAt:'2026-09-07T11:03:00Z'}]},frozenPreview:campaign.status==='draft'?null:{...renderMailingTemplate(campaign),subject:campaign.subject,preheader:campaign.preheader}});
    if(path.includes('/campaigns/delivery-fixture/')&&request.method()==='POST'){
      const action=path.split('/').at(-1),body=request.postDataJSON();writes.push({action,body});
      if(action==='test')return reply(testError?{message:'SMTP2GO odmítlo požadavek kvůli limitu testů.'}:{accepted:true},testError?502:200);
      if(action==='prepare')campaign={...campaign,status:'prepared',preparationId:'frozen-1'};
      if(action==='unprepare')campaign={...campaign,status:'draft',preparationId:null};
      if(action==='send')campaign={...campaign,status:'sent',provider:'smtp2go',providerStatus:'accepted',providerRequestId:'fixture-request',sentAt:'2026-09-07T11:00:00Z'};
      return reply({campaign});
    }
    return route.fallback();
  });
  await page.goto('/admin.html');await expect(page.locator('[data-admin-view]')).toBeVisible();
  await page.locator('[data-admin-jump="mailing"]').click();await page.locator('[data-mailing-tab="campaigns"]').click();
  await page.locator('[data-mailing-campaign-open="delivery-fixture"]').click();
  await expect(page.locator('[data-delivery-count]')).toHaveText('2');
  return {observations,writes,provider};
}

test('Mailing C shows unconfigured provider and independently prepares / returns a frozen campaign',async({page})=>{
  const {observations,writes}=await fixture(page);
  await expect(page.locator('[data-mailing-delivery]')).toBeVisible();
  await expect(page.locator('[data-provider-status]')).toHaveText('SMTP2GO · Nenakonfigurováno');
  await expect(page.locator('[data-delivery-action="test"]')).toBeDisabled();
  const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept()});
  await page.locator('[data-delivery-action="prepare"]').click();await expect(page.locator('[data-delivery-status]')).toHaveText('Připraveno');
  expect(dialogs[0]).toContain('Příprava zmrazí obsah a seznam příjemců.');expect(dialogs[0]).toContain('Způsobilí příjemci: 2');
  await expect(page.locator('[data-mailing-campaign-form] input[name="subject"]')).toBeDisabled();
  await expect(page.locator('[data-mailing-preview-frame]')).toHaveAttribute('sandbox','allow-scripts');
  await expect(page.frameLocator('[data-mailing-preview-frame]').locator('body')).toContainText('Odhlásit odběr');
  await page.locator('[data-delivery-action="unprepare"]').click();await expect(page.locator('[data-delivery-status]')).toHaveText('Draft');
  await expect(page.locator('[data-mailing-campaign-form] input[name="subject"]')).toBeEnabled();
  expect(writes.map(x=>x.action)).toEqual(['prepare','unprepare']);expect(writes[0].body.confirmation.recipientCount).toBe(2);
  expectNoUnexpectedClientErrors(observations);
});

test('Mailing C draft test requires explicit valid addresses and reports provider refusal without preparation',async({page})=>{
  const {observations,writes}=await fixture(page,{state:'ready',testError:true});
  await expect(page.locator('[data-provider-status]')).toHaveText('SMTP2GO · Připraveno');
  await page.locator('[data-delivery-action="test"]').click();await expect(page.locator('[data-delivery-message]')).toContainText('1 až 5');expect(writes).toHaveLength(0);
  await page.locator('[data-delivery-test-addresses]').fill('test1@example.invalid, test2@example.invalid');
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-delivery-action="test"]').click();
  await expect(page.locator('[data-delivery-message]')).toContainText('limitu testů');
  await expect(page.locator('[data-delivery-status]')).toHaveText('Draft');
  expect(writes).toEqual([{action:'test',body:{addresses:['test1@example.invalid','test2@example.invalid']}}]);
  // This test deliberately returns HTTP 502; the fixture console records that expected browser resource error.
  expect(observations.consoleErrors.filter(x=>!x.text.includes('502'))).toEqual([]);
  expect(observations.pageErrors).toEqual([]);expect(observations.unhandledApi).toEqual([]);
});

test('Mailing C.2 readiness gates direct batch send and real send requires frozen explicit confirmation',async({page})=>{
  const {observations,writes,provider}=await fixture(page,{state:'domain_unverified',status:'prepared'});
  await expect(page.locator('[data-provider-status]')).toHaveText('SMTP2GO · Doména není ověřena');
  await expect(page.locator('[data-delivery-action="send"]')).toBeDisabled();
  Object.assign(provider,{state:'ready',ready:true});await page.locator('[data-delivery-action="refresh"]').click();
  await expect(page.locator('[data-provider-status]')).toHaveText('SMTP2GO · Připraveno');
  await expect(page.locator('[data-delivery-action="send"]')).toBeEnabled();
  page.once('dialog',async dialog=>{expect(dialog.message()).toContain('ODESLAT 2 EMAILŮ');expect(dialog.message()).toContain('info@e36united.cz');await dialog.dismiss()});
  await page.locator('[data-delivery-action="send"]').click();expect(writes).toEqual([]);
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-delivery-action="send"]').click();
  await expect(page.locator('[data-delivery-status]')).toHaveText('Odesláno');
  expect(writes.at(-1)).toEqual({action:'send',body:{confirmation:{preparationId:'frozen-1',recipientCount:2}}});
  await expect(page.locator('[data-mailing-save]')).toBeDisabled();expectNoUnexpectedClientErrors(observations);
});

test('Mailing C sent dashboard shows unique delivery stats and read-only recipient detail',async({page})=>{
  const {observations,writes}=await fixture(page,{state:'ready',status:'sent'});
  for(const [key,count] of Object.entries({recipients:2,sent:2,delivered:1,opened:1,clicked:1,bounced:1,unsubscribed:1}))await expect(page.locator(`[data-delivery-metric="${key}"]`)).toHaveText(String(count));
  await expect(page.locator('[data-delivery-tracking]')).toContainText('Otevření je orientační');
  await page.locator('[data-delivery-tracking] summary').click();
  await expect(page.locator('[data-delivery-tracking] details')).toContainText('test1@example.invalid');
  await expect(page.locator('[data-delivery-tracking] details')).toContainText('Odhlášeno');
  await expect(page.locator('[data-mailing-save]')).toBeDisabled();await expect(page.locator('[data-delivery-action="send"]')).toHaveCount(0);
  expect(writes).toEqual([]);expectNoUnexpectedClientErrors(observations);
});

test('Mailing C.2 exposes SMTP2GO quota and removes every provider sync/import control',async({page})=>{
  const {observations,writes}=await fixture(page,{state:'ready',status:'prepared'});
  await expect(page.locator('[data-mailing-delivery]')).toContainText('Měsíčně zbývá: 9998');
  await expect(page.locator('[data-mailing-delivery]')).toContainText('Limit: 200/den');
  await expect(page.locator('[data-import-status]')).toHaveCount(0);
  await expect(page.locator('[data-mailing-delivery]')).not.toContainText('Synchronizovat');
  await expect(page.locator('[data-mailing-delivery]')).not.toContainText('import');
  await expect(page.locator('[data-delivery-action="send"]')).toBeEnabled();
  expect(writes).toEqual([]);
  expectNoUnexpectedClientErrors(observations);
});
