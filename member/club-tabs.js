const tabs=[...document.querySelectorAll('[data-club-tab]')];
function select(name){
 if(!tabs.some(button=>button.dataset.clubTab===name))name='points';
 tabs.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.clubTab===name)));
 document.querySelectorAll('[data-club-anchor]').forEach(panel=>panel.hidden=panel.dataset.clubAnchor!==name);
}
tabs.forEach(button=>button.addEventListener('click',()=>select(button.dataset.clubTab)));
select('points');
