const tabs=[...document.querySelectorAll('[data-club-tab]')];
function target(){
 const url=new URL(location.href),section=url.searchParams.get('section')||url.searchParams.get('panel');
 return url.searchParams.get('clubTab')||(section==='rewards'?'points':section==='history'?'history':['points','history','achievements'].includes(url.hash.slice(1))?url.hash.slice(1):null);
}
let initialTarget=target();
function select(name,{write=false}={}){
 if(!tabs.some(button=>button.dataset.clubTab===name))name='history';
 tabs.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.clubTab===name)));
 document.querySelectorAll('[data-club-anchor]').forEach(panel=>{const hidden=panel.dataset.clubAnchor!==name;if(panel.hasAttribute('data-club-read-hidden'))panel.dataset.clubReadHidden=String(hidden);else panel.hidden=hidden});
 if(write){const url=new URL(location.href);url.searchParams.set('clubTab',name);if(url.href!==location.href)history.pushState(history.state,'',url)}
}
tabs.forEach(button=>button.addEventListener('click',()=>select(button.dataset.clubTab,{write:true})));
window.addEventListener('member:sectionchange',event=>{
 if(event.detail.section!=='club')return;
 const explicit=target()||initialTarget;initialTarget=null;
 if(explicit||event.detail.previousSection!=='club'||event.detail.fromHistory)select(explicit||'history');
});
select(initialTarget||'history');
