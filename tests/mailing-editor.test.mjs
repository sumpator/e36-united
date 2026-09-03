import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAILING_BLOCK_TYPES,
  MAILING_TEMPLATE_VERSION,
  MailingContentDefinitionError,
  createMailingStarterContent,
  createMailingStarterDraft,
  normalizeMailingContent,
  renderMailingTemplate,
} from '../worker/domains/mailing/template.js';

function contentWith(...blocks){return{template:MAILING_TEMPLATE_VERSION,blocks}}

test('E36 renderer has a stable graphical shell with conservative email fallbacks',()=>{
  const preview=renderMailingTemplate(createMailingStarterDraft());
  assert.equal(preview.templateVersion,'e36-default-v1');
  assert.match(preview.html,/<!doctype html>/i);
  assert.match(preview.html,/role="presentation"/);
  assert.match(preview.html,/width="640"/);
  assert.match(preview.html,/bgcolor="#06080b"/);
  assert.match(preview.html,/background-color:#06080b/);
  assert.match(preview.html,/radial-gradient/);
  assert.match(preview.html,/\[if mso\]/);
  assert.match(preview.html,/@media only screen and \(max-width:680px\)/);
  assert.doesNotMatch(preview.html,/<script|<form/i);
});

test('subject, preheader and unsafe rich text are escaped while safe formatting remains',()=>{
  const preview=renderMailingTemplate({
    subject:'United <script>alert(1)</script>',preheader:'A < B',
    content:contentWith({id:'copy',type:'rich_text',text:'<img src=x onerror=alert(1)>\n\n**Tučně** a _kurzíva_ s [webem](https://e36united.cz/).'}),
  });
  assert.match(preview.html,/<title>United &lt;script&gt;alert\(1\)&lt;\/script&gt;<\/title>/);
  assert.match(preview.html,/A &lt; B/);
  assert.match(preview.html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(preview.html,/<strong[^>]*>Tučně<\/strong>/);
  assert.match(preview.html,/<em>kurzíva<\/em>/);
  assert.match(preview.html,/href="https:\/\/e36united.cz\/"/);
  assert.doesNotMatch(preview.html,/<img src=x/);
});

test('block order, hero, image, CTA and survey render through one HTML generator',()=>{
  const content=createMailingStarterContent();
  content.blocks.push({id:'cta-info',type:'cta',label:'PROGRAM UNITED',url:'https://e36united.cz/#experience',variant:'primary'});
  content.blocks.push({id:'event-image',type:'image',imageUrl:'https://e36united.cz/assets/images/program/saturday.webp',alt:'Sobota',caption:'Hlavní United program'});
  const preview=renderMailingTemplate({subject:'United',preheader:'Preview',content});
  assert.ok(preview.html.indexOf('Díky za United')<preview.html.indexOf('Jak to vidíš se Zbraslavicemi?'));
  assert.ok(preview.html.indexOf('Jak to vidíš se Zbraslavicemi?')<preview.html.indexOf('PROGRAM UNITED'));
  assert.match(preview.html,/BMW E36 na srazu E36 United 2026/);
  assert.match(preview.html,/assets\/images\/program\/saturday.webp/);
  assert.match(preview.html,/data-survey-question="zbraslavice-2026-outlook"/);
  assert.match(preview.html,/data-answer-id="return-zbraslavice"/);
});

test('content model accepts only the eight controlled block types and unique stable IDs',()=>{
  assert.deepEqual(MAILING_BLOCK_TYPES,['hero','heading','rich_text','image','cta','divider','highlight','survey']);
  assert.throws(()=>normalizeMailingContent(contentWith({id:'unsafe',type:'html',html:'<script/>'})),MailingContentDefinitionError);
  assert.throws(()=>normalizeMailingContent(contentWith({id:'same',type:'heading',heading:'A'},{id:'same',type:'heading',heading:'B'})),/unique/);
  assert.throws(()=>normalizeMailingContent(contentWith({id:'bad id',type:'heading',heading:'A'})),/letters, numbers/);
});

test('survey requires stable question/answer IDs and two to five unique options',()=>{
  const answer=id=>({id,label:id.toUpperCase()});
  const survey=answers=>({id:'survey',type:'survey',questionId:'next-event',question:'Kam dál?',text:'',answers});
  assert.equal(normalizeMailingContent(contentWith(survey([answer('yes'),answer('no')]))).blocks[0].questionId,'next-event');
  assert.throws(()=>normalizeMailingContent(contentWith(survey([answer('yes')]))),/between 2 and 5/);
  assert.throws(()=>normalizeMailingContent(contentWith(survey([answer('a'),answer('b'),answer('c'),answer('d'),answer('e'),answer('f')]))),/between 2 and 5/);
  assert.throws(()=>normalizeMailingContent(contentWith(survey([answer('same'),answer('same')]))),/unique/);
});

test('starter preserves the exact Zbraslavice survey concepts and verified current hero',()=>{
  const starter=createMailingStarterDraft(),survey=starter.content.blocks.find(block=>block.type==='survey'),hero=starter.content.blocks.find(block=>block.type==='hero');
  assert.equal(starter.templateVersion,'e36-default-v1');
  assert.equal(survey.question,'Jak to vidíš se Zbraslavicemi?');
  assert.deepEqual(survey.answers.map(answer=>answer.label),[
    'SUPER – CHCI TAM UNITED ZNOVU',
    'LÍBILO SE MI – ALE MÍSTO JE MI VLASTNĚ JEDNO',
    'RADIĚJI BYCH LETOS JINAM',
  ]);
  assert.match(hero.imageUrl,/static\.wixstatic\.com/);
  assert.match(hero.alt,/United 2026 ve Zbraslavicích/);
});

test('incomplete drafts render controlled placeholders without accepting unsafe URLs',()=>{
  const preview=renderMailingTemplate({content:contentWith({id:'image',type:'image',imageUrl:'',alt:'',caption:''},{id:'cta',type:'cta',label:'CTA',url:'',variant:'secondary'})});
  assert.match(preview.html,/IMAGE PLACEHOLDER/);
  assert.match(preview.html,/>CTA &nbsp;→<\/span>/);
  assert.throws(()=>normalizeMailingContent(contentWith({id:'image',type:'image',imageUrl:'javascript:alert(1)',alt:'',caption:''})),/absolute http\(s\) URL/);
});
