import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../appearance.js',import.meta.url),'utf8');
function boot({saved=null,light=false,blocked=false}={}){
 const root={dataset:{},style:{}},controls=[{value:''},{value:''}],events={},mediaEvents={},windowEvents={},store={value:saved,writes:0};
 const media={matches:light,addEventListener:(name,fn)=>mediaEvents[name]=fn};
 const document={documentElement:root,querySelectorAll:()=>controls,querySelector:()=>null,addEventListener:(name,fn)=>events[name]=fn};
 const localStorage={getItem(){if(blocked)throw Error('blocked');return store.value},setItem(key,value){if(blocked)throw Error('blocked');assert.equal(key,'e36UnitedAppearance');store.value=value;store.writes++}};
 vm.runInNewContext(code,{document,localStorage,window:{matchMedia:()=>media,addEventListener:(name,fn)=>windowEvents[name]=fn}});
 return {root,store,controls,select(value){events.change({target:{value,matches:()=>true}})},system(light){media.matches=light;mediaEvents.change()},storage(value){windowEvents.storage({key:'e36UnitedAppearance',newValue:value})},restore(value){store.value=value;windowEvents.pageshow()},visible(){events.visibilitychange()}};
}
test('appearance defaults to light before DOM ready, irrespective of device preference',()=>{for(const light of [true,false]){const b=boot({light});assert.equal(b.root.dataset.theme,'light');assert.equal(b.root.dataset.appearance,'light');assert.equal(b.root.style.colorScheme,'light');assert.equal(b.store.writes,0)}});
test('appearance saved light applies synchronously and all controls share one preference',()=>{const b=boot({saved:'light'});assert.equal(b.root.dataset.theme,'light');assert.deepEqual(b.controls.map(c=>c.value),['light','light']);b.select('dark');assert.equal(b.store.value,'dark');assert.equal(b.root.dataset.theme,'dark')});
test('appearance follows device changes only in system mode',()=>{const b=boot({saved:'light'});b.system(false);assert.equal(b.root.dataset.theme,'light');b.select('system');assert.equal(b.root.dataset.theme,'dark');b.system(true);assert.equal(b.root.dataset.theme,'light');assert.equal(b.store.value,'system')});
test('appearance survives unavailable storage and ignores invalid values',()=>{const b=boot({blocked:true});b.select('light');assert.equal(b.root.dataset.theme,'light');b.select('invalid');assert.equal(b.root.dataset.theme,'light');assert.equal(boot({saved:'invalid'}).root.dataset.theme,'light');assert.equal(b.store.writes,0);b.select('dark');b.visible();assert.equal(b.root.dataset.theme,'light')});
test('appearance synchronizes browser tabs and resets safely on cleared preference',()=>{const b=boot();b.storage('light');assert.equal(b.root.dataset.theme,'light');b.storage(null);assert.equal(b.root.dataset.theme,'light');b.storage('invalid');assert.equal(b.root.dataset.theme,'light')});
test('every valid saved preference has priority without rewriting storage',()=>{for(const saved of ['light','dark','system'])for(const light of [true,false]){const b=boot({saved,light});assert.equal(b.root.dataset.theme,saved==='system'?(light?'light':'dark'):saved);assert.equal(b.root.dataset.appearance,saved);assert.equal(b.store.value,saved);assert.equal(b.store.writes,0)}});

test('restored documents reconcile valid, missing and invalid preferences',()=>{const b=boot({saved:'dark'});for(const [saved,expected] of [['system','dark'],['light','light'],['dark','dark'],[null,'light'],['invalid','light']]){b.restore(saved);assert.equal(b.root.dataset.theme,expected)}assert.equal(b.store.writes,0)});

test('native CSS fallback is light while explicit dark retains dark native controls',()=>{const css=readFileSync(new URL('../appearance.css',import.meta.url),'utf8');assert.match(css,/:root \{color-scheme:light\}/);assert.match(css,/:root\[data-theme="dark"\] \{color-scheme:dark\}/)});
test('all six HTML entries load blocking appearance bootstrap before their styles',()=>{for(const file of ['index','galerie','merch','o-nas','member','admin']){const html=readFileSync(new URL(`../${file}.html`,import.meta.url),'utf8');assert.match(html,/<html lang="cs" data-theme="light" style="color-scheme:light">/);assert.equal((html.match(/appearance\.js\?v=/g)||[]).length,1);assert.equal((html.match(/appearance\.css\?v=/g)||[]).length,1);assert.match(html,/<meta(?=[^>]*name="theme-color")(?=[^>]*content="#f3f5f8")[^>]*>/);assert.match(html,/<script src="appearance.js\?v=20261022-light1"><\/script>/);assert.ok(html.indexOf('appearance.js')<html.indexOf('rel="stylesheet"'));assert.match(html,/appearance.css\?v=20261022-light1/);assert.match(html,/data-appearance-select/)}});
test('light semantic text palette meets 4.5:1 on its intended surfaces',()=>{
 const css=readFileSync(new URL('../appearance.css',import.meta.url),'utf8');
 const color=name=>css.match(new RegExp(`--appearance-${name}:#([0-9a-f]+)`))[1];
 const luminance=hex=>{if(hex.length===3)hex=[...hex].map(c=>c+c).join('');return hex.match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)};
 for(const [ink,surface] of [['ink','surface'],['muted','subtle'],['action','surface'],['on-action','action'],['success','success-wash'],['warning','warning-wash'],['danger','danger-wash']]){const a=luminance(color(ink)),b=luminance(color(surface));assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${ink} on ${surface}`)}
});
