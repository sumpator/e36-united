// LIVE owns only its history entries. Existing page routers retain all other routes.
// Store navigation identifiers, never names, scores, search terms or files.
export function createLiveHistory({scope,read,restore,canLeave=()=>true,leave,isBusy=()=>false}){
  let active=false,applying=false,current=null,returning=false;
  const owned=()=>history.state?.liveNavigation?.scope===scope?history.state.liveNavigation:null;
  function write(view,index,parent,replace=false){
    current={scope,view,index,parent};
    history[replace?'replaceState':'pushState']({...history.state,liveNavigation:current},'');
  }
  function start(){
    active=true;
    const existing=owned();
    if(existing&&existing.index>0){current=existing;applying=true;restore(existing.view);applying=false;return}
    write(null,0,null,true);write(read(),1,0);
  }
  function record({replace=false,parent}={}){
    if(!active||applying||returning)return;
    const view=read();if(JSON.stringify(view)===JSON.stringify(current?.view))return;
    write(view,replace?current.index:current.index+1,parent??(replace?current.parent:current.index),replace);
  }
  function back(){if(!active||isBusy())return;history.go((current.parent??0)-current.index)}
  function stop(){active=false;returning=false;current=null}
  function exitPrompt(){
    const dialog=document.createElement('dialog');dialog.className='live-exit-dialog';
    dialog.innerHTML='<h2>Opustit LIVE?</h2><p>Rozpracované soubory nejsou po zavření stránky obnovitelné.</p><div><button type="button" data-live-stay>Zůstat</button><button type="button" data-live-leave>Opustit</button></div>';
    document.body.append(dialog);dialog.showModal();
    const finish=()=>{dialog.close();dialog.remove()};
    const stay=()=>{finish();returning=true;history.go(current.index)};
    dialog.addEventListener('cancel',event=>{event.preventDefault();stay()});
    dialog.querySelector('[data-live-stay]').onclick=stay;
    dialog.querySelector('[data-live-leave]').onclick=()=>{if(!canLeave()||leave()===false){stay();return}finish();stop()};
  }
  window.addEventListener('popstate',event=>{
    if(!active)return;
    event.stopImmediatePropagation();
    const target=owned();
    if(returning){returning=false;return}
    if(isBusy()||!canLeave(target?.view)){
      const delta=current.index-(target?.index??0);returning=true;history.go(delta||1);return;
    }
    if(!target||target.index===0){exitPrompt();return}
    // Skip an obsolete preparation entry normalized to the same overview after a start.
    if(target.index<current.index&&target.view?.phase===current.view?.phase&&['root','categories','choice'].includes(target.view?.phase)){
      history.go((target.parent??0)-target.index);return;
    }
    current=target;applying=true;
    try{restore(target.view);write(read(),target.index,target.parent,true)}finally{applying=false}
  },true);
  return{start,record,back,stop,get current(){return current},get applying(){return applying}};
}
