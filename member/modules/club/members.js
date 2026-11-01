import { createClubProfileViewer } from '../../club-profile.js?v=20261031-compose1';
import { $, esc } from '../../ui.js?v=20260924-merch2';

const fallbackLogo = 'united-logo-blue.svg';

export function createClubMembers({ apiBaseUrl, apiRequest, apiRequestBlob, getData, openSection }) {
  const ownedUrls = new Map();
  const photoSources = new WeakMap();
  let observer = null;
  let listRestoreFocus = null;
  let directProfileHandled = false;
  let bound = false;
  let members = null, seed = null, pagination = null, loading = false, listGeneration = 0;
  const searchText=value=>String(value||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('cs-CZ');
  const query=()=>searchText($('[data-club-member-search]')?.value).trim();
  function syncSearchStatus(error=''){
    const status=$('[data-club-search-status]');if(status)status.textContent=error|| (loading?'Načítám další členy…':'');
    const retry=$('[data-club-search-retry]');if(retry)retry.hidden=!error;
  }
  async function loadRemaining(){
    if(loading||!pagination?.hasMore)return;loading=true;const current=++listGeneration;syncSearchStatus();
    try{
      while(pagination?.hasMore){
        const offset=pagination.nextOffset,result=await apiRequest(`/api/united-club/members?offset=${offset}&limit=24`);
        if(current!==listGeneration)return;
        if(!Array.isArray(result.members)||!result.pagination||result.pagination.nextOffset<=offset&&result.pagination.hasMore)throw Error('club_members_invalid');
        members=[...new Map([...members,...result.members].map(member=>[member.profileRef,member])).values()];pagination=result.pagination;renderList();
      }
      syncSearchStatus();
    }catch(error){if(current===listGeneration)syncSearchStatus('Seznam se nepodařilo načíst celý. Zkus to znovu.');}
    finally{if(current===listGeneration){loading=false;if(!$('[data-club-search-retry]')?.hidden)return;syncSearchStatus()}}
  }

  const profileViewer = createClubProfileViewer({ apiBaseUrl, apiRequest, apiRequestBlob, beforeOpen: () => openSection('club') });

  function releaseListMedia() {
    const root = $('[data-club-members-list]');
    root?.querySelectorAll('[data-club-member-photo]').forEach(image => image.remove());
    observer?.disconnect(); observer = null;
    for (const url of ownedUrls.values()) URL.revokeObjectURL(url);
    ownedUrls.clear();
  }

  async function loadPrivatePhoto(image) {
    const path = photoSources.get(image);
    if (!path || image.dataset.loaded === 'true') return;
    image.dataset.loaded = 'true';
    try {
      const blob = await apiRequestBlob(path);
      if (!image.isConnected || photoSources.get(image) !== path) return;
      const url = URL.createObjectURL(blob); ownedUrls.set(image, url); image.src = url;
    } catch (error) {
      image.removeAttribute('src'); image.closest('.club-member-photo')?.classList.add('is-fallback');
      console.warn('Club member photo unavailable', error);
    }
  }

  function observePhoto(image, path) {
    if (!image || !path) return;
    photoSources.set(image, path);
    if (!('IntersectionObserver' in window)) { void loadPrivatePhoto(image); return; }
    if (!observer) observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); void loadPrivatePhoto(entry.target); }
    }, { rootMargin: '160px' });
    observer.observe(image);
  }

  function renderList() {
    const root = $('[data-club-members-list]'); if (!root) return;
    releaseListMedia();
    const source=getData().club?.clubMembers;if(seed!==source){seed=source;members=source?.members||[];pagination=source?.pagination||null}
    const term=query(),filtered=(members||[]).filter(member=>searchText([member.name,member.nickname,...(member.cars||[]).flatMap(car=>[car.model,car.body])].join(' ')).includes(term));root.innerHTML='';
    if (term&&!filtered.length)root.innerHTML='<p class="club-members-empty" role="status">Žádný člen ani auto neodpovídá hledání.</p>';
    if (!term&&!filtered.length) root.innerHTML = '<article class="club-members-empty"><img alt="" src="united-logo-blue.svg"><div><b>Klubové profily se právě skládají.</b><p>Jakmile členové doplní své United profily, objeví se tady.</p></div></article>';
    for (const member of filtered) {
      const button = document.createElement('button'); button.className = 'club-member-card'; button.type = 'button';
      button.setAttribute('aria-label', `Otevřít klubový profil ${member.nickname || member.name}`);
      button.innerHTML = `<span class="club-member-photo${member.photoUrl ? '' : ' is-fallback'}"><img alt="" data-club-member-photo><i aria-hidden="true"><img alt="" src="${fallbackLogo}"></i></span><span class="club-member-copy"><small>UNITED OD ${esc(member.memberSince || '—')}</small><strong>${esc(member.nickname || member.name || 'United member')}</strong><span>${esc(member.attendanceCount || 0)}× UNITED</span></span><b aria-hidden="true">→</b>`;
      button.addEventListener('click', () => void profileViewer.openProfile(member.profileRef, { push: true, trigger: button })); root.append(button);
      if (member.photoUrl) observePhoto($('[data-club-member-photo]', button), member.photoUrl);
    }
    const profile = new URL(window.location.href).searchParams.get('profile');
    if (profile && !directProfileHandled) { directProfileHandled = true; queueMicrotask(() => void profileViewer.openProfile(profile, { push: false })); }
  }

  function showMembers({ push = true, trigger = null } = {}) {
    const modal = $('[data-club-members-modal]'); if (!modal || !modal.hidden) return;
    listRestoreFocus = trigger || document.activeElement; modal.hidden = false; document.body.classList.add('club-members-open');
    modal.querySelector('[data-club-members-close]')?.focus();void loadRemaining();
    if (push) { const url = new URL(window.location.href); url.searchParams.set('section', 'club'); url.searchParams.set('members', '1'); history.pushState({ ...(history.state || {}), clubMembers: true }, '', url); }
  }

  function hideMembers({ restore = true } = {}) {
    const modal = $('[data-club-members-modal]'); if (!modal || modal.hidden) return;
    modal.hidden = true; document.body.classList.remove('club-members-open');listGeneration++;loading=false;
    if (restore && listRestoreFocus?.isConnected) listRestoreFocus.focus(); listRestoreFocus = null;
  }

  function closeMembers() {
    const url = new URL(window.location.href);
    if (url.searchParams.has('members') && history.state?.clubMembers) { history.back(); return; }
    url.searchParams.delete('members'); history.replaceState(history.state, '', url); hideMembers();
  }

  function syncMembersHistory() { if (new URL(window.location.href).searchParams.has('members')) showMembers({ push: false }); else hideMembers(); }

  function bind() {
    if (bound) return; bound = true; profileViewer.bind();
    $('[data-club-member-search]')?.addEventListener('input',renderList);
    $('[data-club-search-clear]')?.addEventListener('click',()=>{const input=$('[data-club-member-search]');input.value='';renderList();input.focus()});
    $('[data-club-search-retry]')?.addEventListener('click',loadRemaining);
    $('[data-open-club-members]')?.addEventListener('click', event => showMembers({ trigger: event.currentTarget }));
    $('[data-club-members-modal]')?.addEventListener('click', event => { if (event.target.closest('[data-club-members-close]')) closeMembers(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('[data-club-members-modal]')?.hidden && $('[data-club-profile-modal]')?.hidden) closeMembers(); });
    window.addEventListener('popstate', syncMembersHistory); syncMembersHistory();
  }

  function reset() { listGeneration++;members=null;seed=null;pagination=null;loading=false;const input=$('[data-club-member-search]');if(input)input.value='';syncSearchStatus();directProfileHandled = false; releaseListMedia(); profileViewer.reset(); hideMembers({ restore: false }); }
  return { bind, render: renderList, reset };
}
