(() => {
const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const coreStyles = qs('link[href^="styles.css"]');
if (coreStyles && !coreStyles.href.includes('v=20260827-planner1')) coreStyles.href = 'styles.css?v=20260827-planner1';

/* Temporary rebuild notice — homepage only. */
const heroContent = qs('.home-page .hero-content');
if (heroContent && !qs('.site-wip', heroContent)) {
const notice = document.createElement('aside');
notice.className = 'site-wip';
notice.setAttribute('role', 'status');
notice.innerHTML = '<span class="site-wip-label"><i></i>WORK IN PROGRESS</span><p>Web právě přestavujeme. Některé funkce ještě nemusí být kompletní.</p>';
heroContent.prepend(notice);
}

/* Header + mobile nav */
const header = qs('.site-header');
const menuBtn = qs('.menu-btn');
const navLinks = qsa('.nav-links a');
const updateHeader = () => header?.classList.toggle('scrolled', window.scrollY > 24);
updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

menuBtn?.addEventListener('click', () => {
document.body.classList.toggle('menu-open');
const open = document.body.classList.contains('menu-open');
menuBtn.setAttribute('aria-expanded', String(open));
});
navLinks.forEach(a => a.addEventListener('click', () => {
document.body.classList.remove('menu-open');
menuBtn?.setAttribute('aria-expanded', 'false');
}));

/* Homepage navigation follows the section currently in view. */
const homeNavSections = [
  { id:'experience', link:qs('.home-page .nav-links a[href="#experience"]') },
  { id:'show-shine', link:qs('.home-page .nav-links a[href="#show-shine"]') },
  { id:'planer', link:qs('.home-page .nav-links a[href="#planer"]') }
].filter(item => item.link && document.getElementById(item.id));
const updateHomeNavActive = () => {
  if (!homeNavSections.length) return;
  const probe = Math.min(window.innerHeight * .34, 300);
  let active = null;
  for (const item of homeNavSections) {
    const section = document.getElementById(item.id);
    const rect = section.getBoundingClientRect();
    if (rect.top <= probe && rect.bottom > probe) active = item;
  }
  homeNavSections.forEach(item => {
    const selected = item === active;
    item.link.classList.toggle('active', selected);
    if (selected) item.link.setAttribute('aria-current', 'location');
    else item.link.removeAttribute('aria-current');
  });
};
updateHomeNavActive();
window.addEventListener('scroll', updateHomeNavActive, { passive:true });
window.addEventListener('resize', updateHomeNavActive, { passive:true });

const navMore = qs('.nav-more');
const navMoreToggle = qs('.nav-more-toggle');
navMoreToggle?.addEventListener('click', e => {
e.stopPropagation();
const open = !navMore?.classList.contains('is-open');
navMore?.classList.toggle('is-open', open);
navMoreToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', e => {
if (!navMore?.classList.contains('is-open') || navMore.contains(e.target)) return;
navMore.classList.remove('is-open');
navMoreToggle?.setAttribute('aria-expanded','false');
});

/* Scroll reveal */
if ('IntersectionObserver' in window && !reduceMotion) {
const observer = new IntersectionObserver((entries) => {
entries.forEach(entry => {
if (entry.isIntersecting) {
entry.target.classList.add('is-visible');
observer.unobserve(entry.target);
}
});
}, { threshold: .1 });
qsa('.reveal').forEach(el => observer.observe(el));
} else {
qsa('.reveal').forEach(el => el.classList.add('is-visible'));
}

/* YouTube aftermovie: inline on hosting, reliable fallback when previewed from file:// */
qsa('[data-youtube-player]').forEach(player => {
const play = qs('[data-youtube-play]', player);
const videoId = player.dataset.videoId;
if (!play || !videoId) return;
play.addEventListener('click', () => {
const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
if (window.location.protocol === 'file:') {
window.open(watchUrl, '_blank', 'noopener');
return;
}
const iframe = document.createElement('iframe');
iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0&playsinline=1`;
iframe.title = 'E36 United 2025 – oficiální video';
iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
iframe.allowFullscreen = true;
iframe.referrerPolicy = 'strict-origin-when-cross-origin';
player.classList.add('is-playing');
play.replaceWith(iframe);
});
});

/* Lightbox gallery with arrows + thumbnail rail. Supports photos inserted after page load. */
const lightbox = qs('.lightbox');
const lightboxImg = lightbox?.querySelector('.lightbox-stage > img');
const lightboxCounter = lightbox ? qs('[data-lightbox-counter]', lightbox) : null;
const lightboxTitle = lightbox ? qs('[data-lightbox-title]', lightbox) : null;
const lightboxThumbs = lightbox ? qs('[data-lightbox-thumbs]', lightbox) : null;
let lightboxItems = [];
let lightboxIndex = 0;
const collectLightboxItems = () => qsa('[data-lightbox]');
const rebuildLightboxThumbs = () => {
  if (!lightboxThumbs) return;
  lightboxThumbs.innerHTML = '';
  lightboxItems.forEach((item, i) => {
    const source = item.querySelector('img');
    const button = document.createElement('button');
    button.type='button'; button.className='lightbox-thumb'; button.setAttribute('aria-label',`Otevřít fotografii ${i+1}`);
    const image = document.createElement('img'); image.src=source?.src||''; image.alt=''; image.loading='lazy';
    button.append(image); button.addEventListener('click',()=>paintLightbox(i)); lightboxThumbs.append(button);
  });
};
const paintLightbox = (index, focusThumb = true) => {
  if (!lightbox || !lightboxImg || !lightboxItems.length) return;
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const item = lightboxItems[lightboxIndex];
  const img = item.querySelector('img');
  lightboxImg.src = item.dataset.full || img?.src || '';
  lightboxImg.alt = img?.alt || '';
  if (lightboxCounter) lightboxCounter.textContent = `${String(lightboxIndex + 1).padStart(2,'0')} / ${String(lightboxItems.length).padStart(2,'0')}`;
  if (lightboxTitle) lightboxTitle.textContent = item.dataset.caption || img?.alt || 'E36 United';
  qsa('.lightbox-thumb', lightboxThumbs || document).forEach((thumb, i) => thumb.classList.toggle('is-active', i === lightboxIndex));
  if (focusThumb) qs('.lightbox-thumb.is-active', lightboxThumbs || document)?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
};
const openLightboxItem = item => {
  lightboxItems = collectLightboxItems();
  const index = Math.max(0, lightboxItems.indexOf(item));
  rebuildLightboxThumbs();
  paintLightbox(index, false);
  lightbox?.classList.add('open'); document.body.style.overflow='hidden';
};
const closeLightbox = () => { lightbox?.classList.remove('open'); document.body.style.overflow=''; };
document.addEventListener('click', e => {
  const item = e.target.closest?.('[data-lightbox]');
  if (!item || !document.body.contains(item)) return;
  e.preventDefault(); openLightboxItem(item);
});
lightbox?.querySelector('.lightbox-prev')?.addEventListener('click',()=>paintLightbox(lightboxIndex-1));
lightbox?.querySelector('.lightbox-next')?.addEventListener('click',()=>paintLightbox(lightboxIndex+1));
lightbox?.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
lightbox?.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
document.addEventListener('keydown', e => {
  if (!lightbox?.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') paintLightbox(lightboxIndex-1);
  if (e.key === 'ArrowRight') paintLightbox(lightboxIndex+1);
});

qsa('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

/* Scroll progress */
const progress = qs('.scroll-progress span');
const updateProgress = () => {
if (!progress) return;
const max = document.documentElement.scrollHeight - window.innerHeight;
progress.style.transform = `scaleX(${max > 0 ? Math.min(1, window.scrollY / max) : 0})`;
};
updateProgress();
window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress, { passive: true });

/* Hero cursor / parallax */
const hero = qs('.hero--dynamic');
if (hero && !reduceMotion && window.matchMedia('(pointer:fine)').matches) {
hero.addEventListener('pointermove', e => {
const r = hero.getBoundingClientRect();
const px = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
const py = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
hero.style.setProperty('--pointer-x', `${px * 100}%`);
hero.style.setProperty('--pointer-y', `${py * 100}%`);
hero.style.setProperty('--hero-x', `${(px - .5) * -1.3}%`);
hero.style.setProperty('--hero-y', `${(py - .5) * -1.1}%`);
});
hero.addEventListener('pointerleave', () => {
hero.style.setProperty('--pointer-x', '70%');
hero.style.setProperty('--pointer-y', '35%');
hero.style.setProperty('--hero-x', '0%');
hero.style.setProperty('--hero-y', '0%');
});
}

/* Animated counters */
const counters = qsa('[data-counter]');
if (counters.length) {
const animateCounter = el => {
const end = Number(el.dataset.counter || 0);
if (reduceMotion || end > 100) {
el.textContent = end.toLocaleString('cs-CZ');
return;
}
const start = performance.now();
const duration = 900;
const tick = now => {
const t = Math.min(1, (now - start) / duration);
const eased = 1 - Math.pow(1 - t, 3);
el.textContent = Math.round(end * eased).toLocaleString('cs-CZ');
if (t < 1) requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
};
if ('IntersectionObserver' in window) {
const counterObserver = new IntersectionObserver(entries => {
entries.forEach(entry => {
if (entry.isIntersecting) {
animateCounter(entry.target);
counterObserver.unobserve(entry.target);
}
});
}, { threshold: .5 });
counters.forEach(c => counterObserver.observe(c));
} else counters.forEach(animateCounter);
}

/* Magnetic buttons */
if (!reduceMotion && window.matchMedia('(pointer:fine)').matches) {
qsa('.magnetic').forEach(el => {
el.addEventListener('pointermove', e => {
const r = el.getBoundingClientRect();
const x = e.clientX - r.left - r.width / 2;
const y = e.clientY - r.top - r.height / 2;
el.style.transform = `translate(${x * .12}px,${y * .16}px)`;
});
el.addEventListener('pointerleave', () => { el.style.transform = ''; });
});
}

/* Weekend story tabs */
const weekend = qs('[data-weekend-story]');
if (weekend) {
const tabs = qsa('[data-day]', weekend);
const panels = qsa('[data-day-panel]', weekend);
const copies = qsa('[data-copy]', weekend);
const index = qs('[data-weekend-index]', weekend);
const order = ['friday', 'saturday', 'sunday'];
let activeDay = 'friday';
let autoTimer = null;

const setDay = day => {
activeDay = day;
tabs.forEach(tab => {
const active = tab.dataset.day === day;
tab.classList.toggle('is-active', active);
tab.setAttribute('aria-selected', String(active));
});
panels.forEach(panel => panel.classList.toggle('is-active', panel.dataset.dayPanel === day));
copies.forEach(copy => copy.classList.toggle('is-active', copy.dataset.copy === day));
if (index) index.textContent = `0${order.indexOf(day) + 1} / 03`;
};
const resetAuto = () => {
if (autoTimer) clearInterval(autoTimer);
if (!reduceMotion) autoTimer = setInterval(() => {
const next = order[(order.indexOf(activeDay) + 1) % order.length];
setDay(next);
}, 6500);
};
tabs.forEach(tab => tab.addEventListener('click', () => { setDay(tab.dataset.day); resetAuto(); }));
weekend.addEventListener('pointerenter', () => { if (autoTimer) clearInterval(autoTimer); });
weekend.addEventListener('pointerleave', resetAuto);
resetAuto();
}

/* About page: restrained scroll-driven history */
const historySection = qs('[data-history]');
if (historySection) {
const entries = qsa('.timeline-entry', historySection);
const currentYear = qs('[data-history-year]', historySection);
const currentTitle = qs('[data-history-title]', historySection);
const progress = qs('[data-history-progress]', historySection);

const setHistoryEntry = entry => {
if (!entry) return;
entries.forEach(item => item.classList.toggle('is-current', item === entry));
const year = qs('.timeline-year', entry)?.textContent?.trim() || '';
const title = qs('.timeline-copy h2', entry)?.textContent?.trim() || '';
if (currentYear) currentYear.textContent = year;
if (currentTitle) currentTitle.textContent = title;
};

if ('IntersectionObserver' in window) {
const historyObserver = new IntersectionObserver(items => {
const visible = items.filter(item => item.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio);
if (visible[0]) setHistoryEntry(visible[0].target);
}, { rootMargin:'-28% 0px -48% 0px', threshold:[0,.15,.35,.6] });
entries.forEach(entry => historyObserver.observe(entry));
}
setHistoryEntry(entries[0]);

const updateHistoryProgress = () => {
if (!progress) return;
const rect = historySection.getBoundingClientRect();
const total = Math.max(1, rect.height - window.innerHeight * .72);
const travelled = Math.min(total, Math.max(0, -rect.top + window.innerHeight * .22));
progress.style.width = `${Math.round((travelled / total) * 100)}%`;
};
updateHistoryProgress();
window.addEventListener('scroll', updateHistoryProgress, {passive:true});
window.addEventListener('resize', updateHistoryProgress, {passive:true});
}

/* 3D tilt media */
if (!reduceMotion && window.matchMedia('(pointer:fine)').matches) {
qsa('[data-tilt]').forEach(card => {
card.addEventListener('pointermove', e => {
const r = card.getBoundingClientRect();
const px = (e.clientX - r.left) / r.width;
const py = (e.clientY - r.top) / r.height;
const rx = (py - .5) * -4.5;
const ry = (px - .5) * 5.5;
card.style.transform = `perspective(1100px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-2px)`;
card.style.setProperty('--glare-x', `${px * 100}%`);
card.style.setProperty('--glare-y', `${py * 100}%`);
});
card.addEventListener('pointerleave', () => { card.style.transform = ''; });
});
}

/* Show & Shine — category winners + precision inspection */
const lab = qs('[data-inspection-lab]');
const suppliedShowshineConfig = window.E36_SHOWSHINE?.categories || {};
const fallbackFocus = {
fit:{scale:1.42,x:0,y:1,focusX:52,focusY:48},
corrosion:{scale:1.86,x:-12,y:15,focusX:36,focusY:67},
originality:{scale:1.52,x:5,y:0,focusX:58,focusY:48},
paint:{scale:1.72,x:8,y:2,focusX:61,focusY:44},
interior:{scale:1.92,x:-7,y:4,focusX:43,focusY:45},
wheels:{scale:2.08,x:-20,y:17,focusX:30,focusY:70},
engine:{scale:1.88,x:20,y:-12,focusX:69,focusY:32},
impression:{scale:1.08,x:0,y:0,focusX:50,focusY:50}
};
const showshineConfig = Object.keys(suppliedShowshineConfig).length
? suppliedShowshineConfig
: { sedan:{label:'Sedan',code:'SEDAN',winnerName:'Show & Shine',temporary:true,thumb:null,overview:null,details:{},focus:fallbackFocus} };
let activeShowshineCategory = window.E36_SHOWSHINE?.activeCategory || Object.keys(showshineConfig)[0] || 'sedan';
let activeInspectionMode = 'fit';

if (lab) {
const stage = qs('[data-inspection-stage]', lab);
const controls = qsa('[data-inspection]', lab);
const overviewImg = qs('[data-overview-image]', lab);
const detailImg = qs('[data-detail-image]', lab);
const label = qs('[data-inspection-label]', lab);
const scale = qs('[data-inspection-scale]', lab);
const title = qs('[data-inspection-title]', lab);
const copy = qs('[data-inspection-copy]', lab);
const kicker = qs('[data-inspection-kicker]', lab);
const scanStatus = qs('[data-scan-status]', lab);
const hudCar = qs('[data-hud-car]', lab);
const activeCategoryLabel = qs('[data-active-category]');
const categoryCards = qsa('[data-category]');
const showcaseImage = qs('[data-category-showcase-image]');
const showcaseLabel = qs('[data-category-showcase-label]');
const showcaseWinner = qs('[data-category-showcase-winner]');
const showcaseIndex = qs('[data-category-showcase-index]');
const showcaseAward = qs('[data-category-showcase-award]');
let settleTimer = null;
let detailTimer = null;
let switchTimer = null;

const inspectionData = {
fit:{ label:'ZPRACOVÁNÍ / SPASOVÁNÍ', title:'Detaily musí navazovat.', copy:'Porota sleduje lícování dílů, návaznosti hran, mezery mezi panely a celkovou kvalitu provedení.', kicker:'01 / ZPRACOVÁNÍ' },
corrosion:{ label:'KOROZE & STAV', title:'Stav karoserie nejde schovat.', copy:'Kontroluje se koroze, stav lemů a prahů, poškození i to, jak poctivě je auto udržované.', kicker:'02 / STAV KAROSERIE' },
originality:{ label:'ORIGINALITA DÍLŮ', title:'Dobovost a smysl úprav.', copy:'Hodnotí se původní nebo dobově správné prvky a také to, zda úpravy respektují charakter konkrétního auta.', kicker:'03 / ORIGINALITA' },
paint:{ label:'LAK & POVRCH', title:'Lak ukáže kvalitu práce.', copy:'Rovnoměrnost, odstín, kvalita povrchu, vady, původní lak i péče o jeho současný stav.', kicker:'04 / LAK' },
interior:{ label:'INTERIÉR', title:'Uvnitř se pozná péče.', copy:'Stav, čistota, čalounění, materiály, prvky výbavy, originalita a sladění interiéru se zbytkem auta.', kicker:'05 / INTERIÉR' },
wheels:{ label:'KOLA & POSTOJ', title:'Kola musí sedět celému autu.', copy:'Volba kol, jejich stav a čistota, fitment i to, jak výsledný postoj podporuje charakter vozu.', kicker:'06 / KOLA' },
engine:{ label:'MOTOROVÝ PROSTOR', title:'Kapota nahoru.', copy:'Čistota, provedení, originalita, kabeláž, detaily a celkový vzhled motorového prostoru.', kicker:'07 / MOTOROVÝ PROSTOR' },
impression:{ label:'CELKOVÝ DOJEM', title:'Nakonec rozhoduje celek.', copy:'Nejde o součet jednotlivostí. Porota vnímá, jestli auto působí promyšleně, konzistentně a dotaženě jako jeden celek.', kicker:'08 / CELKOVÝ DOJEM' }
};

const preload = src => { if (!src) return; const img = new Image(); img.src = src; };
Object.values(showshineConfig).forEach(cat => {
preload(cat.thumb); preload(cat.overview);
Object.values(cat.details || {}).forEach(preload);
});

categoryCards.forEach(card => {
const key = card.dataset.category;
const cat = showshineConfig[key];
if (!cat) return;
const img = qs('[data-category-thumb]', card);
const winner = qs('[data-category-winner]', card);
if (img) {
img.src = cat.thumb;
img.alt = `${cat.temporary ? 'Ukázka kategorie' : 'Vítěz'} Show & Shine — ${cat.label}`;
}
if (winner) winner.textContent = cat.winnerName || 'Vítěz 2026';
const badge = qs('.winner-photo i', card);
if (badge) badge.hidden = !cat.temporary;
});

const cameraFor = (category, mode) => {
return category.focus?.[mode] || fallbackFocus[mode] || {scale:1.35,x:0,y:0,focusX:50,focusY:50};
};

const setInspection = (mode, {instant=false} = {}) => {
const category = showshineConfig[activeShowshineCategory];
const item = inspectionData[mode];
if (!category || !item || !stage) return;
activeInspectionMode = mode;
clearTimeout(settleTimer); clearTimeout(detailTimer);
const camera = cameraFor(category, mode);

stage.classList.remove('is-detail','is-settled');
stage.classList.toggle('is-tracking', mode !== 'impression');
stage.style.setProperty('--cam-scale', camera.scale);
stage.style.setProperty('--cam-x', `${camera.x}%`);
stage.style.setProperty('--cam-y', `${camera.y}%`);
stage.style.setProperty('--cam-rot', `${mode === 'impression' ? 0 : (camera.x || 0) * .004}deg`);
stage.style.setProperty('--focus-x', `${camera.focusX}%`);
stage.style.setProperty('--focus-y', `${camera.focusY}%`);

if (label) label.textContent = item.label;
if (scale) scale.textContent = `${Number(camera.scale).toFixed(camera.scale === 1 ? 1 : 2)}×`;
if (title) title.textContent = item.title;
if (copy) copy.textContent = item.copy;
if (kicker) kicker.textContent = item.kicker;
if (scanStatus) scanStatus.textContent = 'ACTIVE';
controls.forEach(control => {
const selected = control.dataset.inspection === mode;
control.classList.toggle('is-active', selected);
control.setAttribute('aria-selected', String(selected));
});

const detailSrc = category.details?.[mode];
if (detailSrc && detailImg) {
const showLoadedDetail = () => {
  if (activeInspectionMode === mode) stage.classList.add('is-detail');
};
detailImg.alt = `${category.label} — ${item.label.toLowerCase()}`;
detailImg.onload = showLoadedDetail;
detailImg.onerror = () => stage.classList.remove('is-detail');
detailImg.src = detailSrc;
if (detailImg.complete && detailImg.naturalWidth) {
  detailTimer = setTimeout(showLoadedDetail, reduceMotion || instant ? 0 : 120);
}
}

settleTimer = setTimeout(() => {
if (activeInspectionMode !== mode) return;
stage.classList.add('is-settled');
if (scanStatus) scanStatus.textContent = 'ACTIVE';
}, reduceMotion || instant ? 0 : 920);

document.dispatchEvent(new CustomEvent('e36:showshine',{detail:{category:activeShowshineCategory,label:category.label,mode}}));
};

const setCategory = (key, {instant=false} = {}) => {
const category = showshineConfig[key];
if (!category || !stage) return;
activeShowshineCategory = key;
activeInspectionMode = 'fit';
clearTimeout(switchTimer);
categoryCards.forEach(card => {
const selected = card.dataset.category === key;
card.classList.toggle('is-active', selected);
card.setAttribute('aria-selected', String(selected));
});
if (activeCategoryLabel) activeCategoryLabel.textContent = category.label.toUpperCase();
if (showcaseLabel) showcaseLabel.textContent = category.label.toUpperCase();
if (showcaseWinner) showcaseWinner.textContent = category.winnerName || 'Vítěz 2026';
if (showcaseIndex) {
  const idx = Math.max(0, Object.keys(showshineConfig).indexOf(key));
  showcaseIndex.textContent = `${String(idx + 1).padStart(2,'0')} / ${String(Object.keys(showshineConfig).length).padStart(2,'0')}`;
}
if (showcaseAward) showcaseAward.textContent = ['z3','mpower'].includes(key) ? 'TOP 1' : 'TOP 3';
if (showcaseImage && category.thumb) {
  showcaseImage.style.opacity = '.2';
  showcaseImage.alt = `${category.label} — ${category.temporary ? 'ukázka kategorie' : 'vítězný vůz'} Show & Shine`;
  showcaseImage.onload = () => { showcaseImage.style.opacity = '1'; };
  showcaseImage.src = category.thumb;
  window.setTimeout(() => { showcaseImage.style.opacity = '1'; }, 420);
}
if (hudCar) hudCar.textContent = `${category.code || category.label.toUpperCase()} / ${category.temporary ? 'CATEGORY SAMPLE' : 'WINNER 2026'}`;
stage.classList.remove('is-detail','is-tracking','is-settled');
stage.classList.toggle('is-switching', !instant && !reduceMotion);

const applyImage = () => {
if (overviewImg && category.overview) {
overviewImg.src = category.overview;
overviewImg.alt = category.temporary ? `${category.label} — ukázka kategorie Show & Shine` : `${category.label} — vítězný vůz Show & Shine 2026`;
}
setInspection('fit',{instant:true});
};
if (instant || reduceMotion) applyImage();
else switchTimer = setTimeout(applyImage, 190);
setTimeout(() => stage.classList.remove('is-switching'), reduceMotion ? 0 : 760);
};

controls.forEach(control => {
const mode = control.dataset.inspection;
control.addEventListener('mouseenter', () => setInspection(mode));
control.addEventListener('focus', () => setInspection(mode));
control.addEventListener('click', () => {
setInspection(mode);
if (window.matchMedia('(max-width:680px)').matches) setTimeout(() => stage.scrollIntoView({behavior:'smooth',block:'center'}), 80);
});
});
categoryCards.forEach(card => {
card.addEventListener('click', () => {
  setCategory(card.dataset.category);
});
});

/* Show & Shine disclosure: opening the judging panel must not move the page.
   Mobile Chrome can otherwise re-anchor the viewport after <details> expands. */
const showshineDisclosure = qs('.showshine-disclosure');
const showshineDisclosureTrigger = qs('.showshine-disclosure-trigger', showshineDisclosure || document);
if (showshineDisclosure && showshineDisclosureTrigger) {
  let disclosureScrollY = null;
  const rememberDisclosureScroll = () => { disclosureScrollY = window.scrollY; };
  showshineDisclosureTrigger.addEventListener('pointerdown', rememberDisclosureScroll, {passive:true});
  showshineDisclosureTrigger.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') rememberDisclosureScroll();
  });
  showshineDisclosure.addEventListener('toggle', () => {
    if (!showshineDisclosure.open || disclosureScrollY == null) return;
    const y = disclosureScrollY;
    disclosureScrollY = null;
    const restoreViewport = () => window.scrollTo({top:y,left:0,behavior:'auto'});
    requestAnimationFrame(() => {
      restoreViewport();
      requestAnimationFrame(restoreViewport);
    });
    window.setTimeout(restoreViewport, 90);
    window.setTimeout(restoreViewport, 260);
  });
}

setCategory(activeShowshineCategory,{instant:true});
}

/* Info Hub — four always-open FAQ cards trigger two optional detail panels below the full FAQ grid. */
const openInfoPanel = (panelId, {scroll=true} = {}) => {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.open = true;
  if (scroll) window.setTimeout(() => panel.scrollIntoView({behavior:'smooth',block:'start'}), 40);
};
qsa('[data-open-info-panel]').forEach(trigger => {
  const activate = event => {
    const panelId = trigger.dataset.openInfoPanel;
    if (!panelId || !document.getElementById(panelId)) return;
    if (trigger.tagName === 'A') event.preventDefault();
    openInfoPanel(panelId);
    history.replaceState(null, '', `#${panelId}`);
  };
  trigger.addEventListener('click', activate);
  if (trigger.getAttribute('role') === 'button') {
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(event); }
    });
  }
});
if (location.hash === '#showshine-rules-panel') openInfoPanel('showshine-rules-panel',{scroll:false});
if (location.hash === '#venue-details-panel') openInfoPanel('venue-details-panel',{scroll:false});

/* Weekend Builder + interactive United map */
const planner = qs('[data-planner]');
const unitedMap = qs('[data-united-map]');
const plannerState = { arrival:'Pátek', departure:'Neděle', sleep:'Chatka', accommodationOptionId:null, accommodationUnits:2, people:2, partialAccommodation:false, showshine:'Jedu se podívat' };
let plannerEventData = null;
let plannerAccommodationOptions = [];
let updatePlanner = () => {};
let setPlannerChoice = () => {};
let memberPlannerMode = false;
const plannerNights = () => plannerState.arrival === 'Pátek' ? (plannerState.departure === 'Sobota' ? 1 : Number(plannerEventData?.fullWeekendNights ?? 2)) : plannerState.arrival === 'Sobota' ? Number(plannerEventData?.saturdayOnlyNights ?? 1) : 0;
const plannerNightLabel = count => count === 1 ? '1 noc' : `${count} noci`;
const plannerStayLabel = () => plannerState.arrival === 'Jen na otočku' ? 'Jen na otočku' : `${plannerState.arrival} → ${plannerState.departure}`;

if (planner) {
const groups = qsa('[data-choice-group]', planner);
const peopleEl = qs('[data-people]', planner);
const summaryArrival = qs('[data-summary-arrival]', planner);
const summarySleep = qs('[data-summary-sleep]', planner);
const summaryPeople = qs('[data-summary-people]', planner);
const summaryPeopleLabel = qs('[data-summary-people-label]', planner);
const summaryShow = qs('[data-summary-showshine]', planner);
const code = qs('[data-plan-code]', planner);
const mail = qs('[data-planner-mail]', planner);
const peopleLabel = peopleEl?.nextElementSibling;
const calendarButton = qs('[data-calendar-button]', planner);
const calendarPopover = qs('[data-calendar-popover]', planner);
const googleCalendar = qs('[data-google-calendar]', planner);
const plannerSection = planner.closest('[data-event-start]');
const departureGroup = qs('[data-choice-group="departure"]', planner);
const departureStep = qs('[data-planner-departure-step]', planner);
const plannerStayNote = qs('[data-planner-stay-note]', planner);
const staySlider = qs('[data-stay-slider]', planner);
const stayTitle = qs('[data-stay-title]', planner);
const stayMeta = qs('[data-stay-meta]', planner);
const stayButtons = qsa('[data-stay-index]', planner);
const stayPresets = [
  {arrival:'Pátek',departure:'Neděle',title:'Celý víkend',meta:'Pátek → Neděle · 2 noci'},
  {arrival:'Pátek',departure:'Sobota',title:'Pátek → Sobota',meta:'1 noc · páteční start + sobotní program'},
  {arrival:'Sobota',departure:'Neděle',title:'Sobota → Neděle',meta:'1 noc · hlavní den + noc'},
  {arrival:'Jen na otočku',departure:'Stejný den',title:'Na otočku',meta:'Bez noclehu'}
];
const sleepGroup = qs('[data-choice-group="sleep"]', planner);
const sleepStep = sleepGroup?.closest('.planner-step');
const sleepPreviewCard = qs('[data-preview-card="sleep"]', planner);
const sleepTimelineStep = qs('[data-timeline-step="sleep"]', planner);
const accommodationUnitsStep = qs('[data-accommodation-units-step]', planner);
const accommodationUnitsEl = qs('[data-accommodation-units]', planner);
const accommodationUnitsLabel = qs('[data-accommodation-units-label]', planner);
const accommodationOptionStep = qs('[data-planner-accommodation-option-step]', planner);
const accommodationOptionSelect = qs('[data-planner-accommodation-option]', planner);
const accommodationOptionCards = qs('[data-planner-accommodation-cards]', planner);
const accommodationOptionTitle = qs('[data-planner-accommodation-option-title]', planner);
const accommodationAvailability = qs('[data-planner-accommodation-availability]', planner);
const partialAccommodationStep = qs('[data-planner-partial-step]', planner);
const partialAccommodationInput = qs('[data-planner-partial-accommodation]', planner);
const plannerPricePreview = qs('[data-planner-price-preview]', planner);
const plannerRecap = qs('[data-planner-recap]', planner);
const plannerActionCopy = qs('.planner-actionbar-copy strong', planner);
let lastOvernightSleep = plannerState.sleep;

const slug = (value, fallback) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z]/g,'').slice(0,2).toUpperCase() || fallback;
const personLabel = count => count === 1 ? 'osoba' : (count >= 2 && count <= 4 ? 'osoby' : 'osob');
const plannerMoney = new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0});
const plannerEscapeHtml = value => String(value||'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const plannerAccommodationKind = () => plannerState.sleep === 'Chatka' ? 'cabin' : plannerState.sleep === 'Stan' ? 'tent' : null;
const matchingPlannerAccommodation = () => plannerAccommodationOptions.filter(option => option.active && option.kind === plannerAccommodationKind()).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'cs'));
const selectedPlannerAccommodation = () => matchingPlannerAccommodation().find(option => option.id === plannerState.accommodationOptionId) || null;
const plannerAccommodationPrice = option => {
  const people=plannerState.accommodationUnits,unitCount=Math.ceil(people/Math.max(1,Number(option?.capacityPerUnit||1))),nights=plannerNights();
  const base=unitCount*Number(option?.unitPriceCzk||0)*nights,person=people*Number(option?.personPriceCzk||0),bedding=people*Number(option?.beddingFeePerPersonCzk||0),cityTax=people*nights*Number(option?.cityTaxPerPersonPerNightCzk||0);
  return {people,unitCount,nights,base,person,bedding,cityTax,total:base+person+bedding+cityTax};
};
const plannerOptionPriceLabel = option => {
  const place=option.kind==='tent'?'stan':'chatka',parts=[];
  if(Number(option.unitPriceCzk)>0)parts.push(`${plannerMoney.format(option.unitPriceCzk)} / ${place} / noc`);
  if(Number(option.personPriceCzk)>0)parts.push(`${plannerMoney.format(option.personPriceCzk)} / osoba`);
  return parts.join(' + ')||'Cena v souhrnu';
};
const renderPlannerAccommodationOptions = (preferredId='') => {
  if (!accommodationOptionSelect) return;
  const options=matchingPlannerAccommodation(),previous=preferredId||plannerState.accommodationOptionId||'';
  accommodationOptionSelect.innerHTML=(!options.length&&plannerEventData?'<option value="">Ubytování zatím není nastavené</option>':options.length>1?'<option value="">Vyber konkrétní možnost</option>':'')+options.map(option=>{
    const availability=option.inventoryMode==='unlimited'?'bez omezení':option.soldOut?'VYPRODÁNO':`k dispozici: ${Number(option.freeUnits||0)}`;
    const place=option.kind==='tent'?'jeden stan':'jednu chatku';
    return `<option value="${plannerEscapeHtml(option.id)}" ${option.soldOut?'disabled':''}>${plannerEscapeHtml(option.name)} · max. ${Number(option.capacityPerUnit||1)} ${personLabel(Number(option.capacityPerUnit||1))} na ${place} · ${availability}</option>`;
  }).join('');
  const preferred=options.find(option=>option.id===previous&&!option.soldOut);
  plannerState.accommodationOptionId=preferred?.id||(options.length===1&&!options[0].soldOut?options[0].id:null);
  accommodationOptionSelect.value=plannerState.accommodationOptionId||'';
  accommodationOptionSelect.disabled=!options.length;
  if(accommodationOptionCards)accommodationOptionCards.innerHTML=options.length?options.map(option=>{
    const active=option.id===plannerState.accommodationOptionId,availability=option.inventoryMode==='unlimited'?'Bez omezení':option.soldOut?'Vyprodáno':`${Number(option.freeUnits||0)} volných`;
    return `<button aria-pressed="${active}" class="planner-accommodation-card${active?' is-active':''}" data-accommodation-option-id="${plannerEscapeHtml(option.id)}" ${option.soldOut?'disabled':''} type="button"><strong>${plannerEscapeHtml(option.name)}</strong><span>Max. ${Number(option.capacityPerUnit||1)} ${personLabel(Number(option.capacityPerUnit||1))}</span><b>${plannerEscapeHtml(plannerOptionPriceLabel(option))}</b><small>${availability}</small></button>`;
  }).join(''):'<div class="planner-accommodation-empty">Pro tento event zatím není konkrétní varianta nastavená.</div>';
};
const renderPlannerPrice = (needsAccommodation) => {
  if (!plannerPricePreview || !accommodationAvailability) return;
  const option=selectedPlannerAccommodation();
  if (!needsAccommodation || !option) {
    plannerPricePreview.hidden=true;plannerPricePreview.innerHTML='';
    const matching=matchingPlannerAccommodation();accommodationAvailability.textContent=needsAccommodation&&matching.length?(matching.every(item=>item.soldOut)?'VYPRODÁNO · vyber jiný typ ubytování.':'Vyber konkrétní možnost.'):needsAccommodation&&plannerEventData?'Ubytování pro tento event zatím není nakonfigurované. Můžeš zvolit Bez ubytování.':'';
    return;
  }
  const price=plannerAccommodationPrice(option),free=option.freeUnits,enough=option.inventoryMode==='unlimited'||Number(free)>=price.unitCount;
  accommodationAvailability.classList.toggle('is-warning',!enough);
  const place=option.kind==='tent'?'jeden stan':'jednu chatku';
  const availabilityCopy=option.inventoryMode==='unlimited'?`Dostupné bez omezení · max. ${Number(option.capacityPerUnit||1)} ${personLabel(Number(option.capacityPerUnit||1))} na ${place}.`:!enough?'Pro tvoji posádku už není dostatek volné kapacity.':Number(free)===1?'Zbývá poslední volná možnost.':Number(free)===2?'Zbývají poslední 2 možnosti.':`Aktuálně k dispozici: ${free}.`;
  accommodationAvailability.textContent=availabilityCopy;
  const rows=[[`${price.unitCount}× ${option.name} · ${price.nights} ${price.nights===1?'noc':'noci'}`,price.base],['Poplatek za osoby',price.person],['Povlečení',price.bedding],[`Pobytová taxa · ${price.nights} ${price.nights===1?'noc':'noci'}`,price.cityTax]].filter(([,value])=>value>0);
  const detailOpen=qs('[data-planner-price-details]',plannerPricePreview)?.open===true;
  plannerPricePreview.hidden=false;
  plannerPricePreview.innerHTML=`<div class="planner-price-title"><span>${price.people} ${personLabel(price.people)} · ${price.unitCount}× ${plannerEscapeHtml(option.name)}</span><small>Orientační cena</small></div><div class="planner-price-estimate"><b>${plannerMoney.format(price.total)}</b></div><details class="planner-price-details" data-planner-price-details><summary><span class="price-detail-show">+ Detail ceny</span><span class="price-detail-hide">− Skrýt detail</span></summary><div class="planner-price-breakdown">${rows.map(([label,value])=>`<div><span>${plannerEscapeHtml(label)}</span><b>${plannerMoney.format(value)}</b></div>`).join('')}<div class="planner-price-total"><strong>Celkem</strong><b>${plannerMoney.format(price.total)}</b></div><small>Cenu při rezervaci znovu ověříme podle aktuální dostupnosti.</small></div></details>`;
  const priceDetails=qs('[data-planner-price-details]',plannerPricePreview);if(priceDetails)priceDetails.open=detailOpen;
};

const currentStayIndex = () => {
  const idx = stayPresets.findIndex(preset => preset.arrival === plannerState.arrival && preset.departure === plannerState.departure);
  return idx >= 0 ? idx : (plannerState.arrival === 'Jen na otočku' ? 3 : 0);
};
const syncStayPicker = () => {
  const index = currentStayIndex();
  const preset = stayPresets[index];
  if (staySlider) {
    staySlider.value = String(index);
    staySlider.style.setProperty('--stay-progress', `${index / (stayPresets.length - 1) * 100}%`);
  }
  stayButtons.forEach((button,buttonIndex) => {
    const active = buttonIndex === index;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (stayTitle) stayTitle.textContent = preset.title;
  if (stayMeta) stayMeta.textContent = preset.meta;
};
const applyStayPreset = rawIndex => {
  const index = Math.max(0, Math.min(stayPresets.length - 1, Number(rawIndex) || 0));
  const preset = stayPresets[index];
  const wasDayPass = plannerState.arrival === 'Jen na otočku';
  plannerState.arrival = preset.arrival;
  plannerState.departure = preset.departure;
  if (preset.arrival === 'Jen na otočku') {
    if (plannerState.sleep !== 'Bez ubytování') lastOvernightSleep = plannerState.sleep;
    plannerState.sleep = 'Bez ubytování';
    plannerState.accommodationUnits = 0;
    plannerState.partialAccommodation = false;
    plannerState.accommodationOptionId = null;
    qsa('.choice', sleepGroup || planner).forEach(c => c.classList.toggle('is-active', c.dataset.value === 'Bez ubytování'));
  } else if (wasDayPass && plannerState.sleep === 'Bez ubytování') {
    plannerState.sleep = lastOvernightSleep || 'Chatka';
    plannerState.accommodationUnits = plannerState.people;
    plannerState.partialAccommodation = false;
    qsa('.choice', sleepGroup || planner).forEach(c => c.classList.toggle('is-active', c.dataset.value === plannerState.sleep));
  }
  renderPlannerAccommodationOptions();
  updatePlanner();
};

setPlannerChoice = (key, value) => {
const group = qs(`[data-choice-group="${key}"]`, planner);
if (!group) return;
const choice = qsa('.choice', group).find(c => c.dataset.value === value);
if (!choice) return;
qsa('.choice', group).forEach(c => c.classList.toggle('is-active', c === choice));
if (key === 'arrival') {
  const wasDayPass = plannerState.arrival === 'Jen na otočku';
  if (value === 'Jen na otočku') {
    plannerState.departure = 'Stejný den';
    if (plannerState.sleep !== 'Bez ubytování') lastOvernightSleep = plannerState.sleep;
    plannerState.sleep = 'Bez ubytování';
    plannerState.accommodationUnits = 0;
    plannerState.partialAccommodation = false;
    plannerState.accommodationOptionId = null;
    qsa('.choice', sleepGroup || planner).forEach(c => c.classList.toggle('is-active', c.dataset.value === 'Bez ubytování'));
  } else {
    if (value === 'Sobota') plannerState.departure = 'Neděle';
    else if (wasDayPass || plannerState.departure === 'Stejný den') plannerState.departure = 'Neděle';
  }
  if (wasDayPass && value !== 'Jen na otočku' && plannerState.sleep === 'Bez ubytování') {
    plannerState.sleep = lastOvernightSleep || 'Chatka';
    plannerState.accommodationUnits = plannerState.people;
    plannerState.partialAccommodation = false;
    qsa('.choice', sleepGroup || planner).forEach(c => c.classList.toggle('is-active', c.dataset.value === plannerState.sleep));
  }
}
if (key === 'sleep') {
  if (value !== 'Bez ubytování') {
    if (plannerState.sleep === 'Bez ubytování') {plannerState.accommodationUnits = plannerState.people;plannerState.partialAccommodation=false}
    lastOvernightSleep = value;
  } else {plannerState.accommodationUnits = 0;plannerState.partialAccommodation=false}
}
plannerState[key] = value;
if(key==='sleep'||key==='arrival')renderPlannerAccommodationOptions();
updatePlanner();
};

updatePlanner = () => {
const dayPass = plannerState.arrival === 'Jen na otočku';
if (dayPass) { plannerState.sleep = 'Bez ubytování'; plannerState.departure = 'Stejný den'; }
else if (plannerState.arrival === 'Sobota' || !['Sobota','Neděle'].includes(plannerState.departure)) plannerState.departure = 'Neděle';
if (departureStep) departureStep.hidden = dayPass;
if (departureGroup) {
  qsa('.choice', departureGroup).forEach(choice => {
    const invalid = plannerState.arrival === 'Sobota' && choice.dataset.value === 'Sobota';
    choice.hidden = invalid; choice.disabled = invalid;
    choice.classList.toggle('is-active', choice.dataset.value === plannerState.departure);
  });
}
const nights = plannerNights();
if (plannerStayNote) plannerStayNote.textContent = dayPass ? 'Bez nocování' : `${plannerNightLabel(nights)} · odjezd v ${plannerState.departure === 'Sobota' ? 'sobotu' : 'neděli'}`;
syncStayPicker();
const needsAccommodation = !dayPass && plannerState.sleep !== 'Bez ubytování';
const partialAccommodationRelevant = needsAccommodation && plannerState.people > 1;
if (!partialAccommodationRelevant && partialAccommodationInput) partialAccommodationInput.checked = false;
plannerState.partialAccommodation=partialAccommodationRelevant&&Boolean(partialAccommodationInput?.checked);
plannerState.accommodationUnits = needsAccommodation ? (plannerState.partialAccommodation?Math.max(1,Math.min(plannerState.people,Number(plannerState.accommodationUnits)||plannerState.people)):plannerState.people) : 0;
if (sleepStep) sleepStep.hidden = dayPass;
if (sleepPreviewCard) sleepPreviewCard.hidden = dayPass;
if (sleepTimelineStep) sleepTimelineStep.hidden = dayPass;
if (partialAccommodationStep) partialAccommodationStep.hidden = !partialAccommodationRelevant;
if (accommodationUnitsStep) accommodationUnitsStep.hidden = !plannerState.partialAccommodation;
if (accommodationOptionStep) accommodationOptionStep.hidden = !needsAccommodation;
if (accommodationOptionTitle) accommodationOptionTitle.textContent=plannerState.sleep==='Chatka'?'Typ chatky':'Typ stanu';
if (partialAccommodationInput) partialAccommodationInput.checked=plannerState.partialAccommodation;
if (unitedMap) unitedMap.classList.toggle('is-day-pass', dayPass);
if (plannerActionCopy) plannerActionCopy.textContent = memberPlannerMode ? 'Hotovo. Výběr přeneseme do Můj United.' : 'Hotovo. Teď už jen dokončit rezervaci.';
if (mail) {mail.innerHTML = memberPlannerMode ? 'Dokončit v Můj United <span>→</span>' : 'Pokračovat k rezervaci <span>→</span>';mail.href='member.html'}
if (peopleEl) peopleEl.textContent = plannerState.people;
if (peopleLabel) peopleLabel.textContent = personLabel(plannerState.people);
if (accommodationUnitsEl) accommodationUnitsEl.textContent = plannerState.accommodationUnits;
if (accommodationUnitsLabel) accommodationUnitsLabel.textContent = personLabel(plannerState.accommodationUnits);
if (summaryArrival) summaryArrival.textContent = plannerState.arrival;
const selectedOption=selectedPlannerAccommodation();
if (summarySleep) summarySleep.textContent = selectedOption?.name||plannerState.sleep;
if (summaryPeople) summaryPeople.textContent = plannerState.people;
if (summaryPeopleLabel) summaryPeopleLabel.textContent = personLabel(plannerState.people);
if (summaryShow) summaryShow.textContent = plannerState.showshine;
if (plannerRecap) { const partialStay=needsAccommodation&&plannerState.accommodationUnits!==plannerState.people?` · ubytování ${plannerState.accommodationUnits} ${personLabel(plannerState.accommodationUnits)}`:''; plannerRecap.textContent = `${plannerStayLabel()}${dayPass?'':` · ${plannerNightLabel(nights)}`} · ${selectedOption?.name||plannerState.sleep}${partialStay} · ${plannerState.people} ${personLabel(plannerState.people)} · Show & Shine · ${{'Chci soutěžit':'Ano','Možná':'Možná','Jedu se podívat':'Ne'}[plannerState.showshine]||'Ne'}`; }
if (code) code.textContent = `U36–${slug(plannerState.arrival,'P')}${slug(plannerState.sleep,'CH')}–${String(plannerState.people).padStart(2,'0')}–${nights}N`;
renderPlannerPrice(needsAccommodation);
document.dispatchEvent(new CustomEvent('e36:planner',{detail:{...plannerState}}));
};

const handleStaySlider = () => applyStayPreset(staySlider.value);
staySlider?.addEventListener('input', handleStaySlider);
staySlider?.addEventListener('change', handleStaySlider);
stayButtons.forEach(button => button.addEventListener('click', () => applyStayPreset(button.dataset.stayIndex)));

groups.forEach(group => {
qsa('.choice', group).forEach(choice => choice.addEventListener('click', () => {
setPlannerChoice(group.dataset.choiceGroup, choice.dataset.value);
}));
});
qs('[data-people-minus]', planner)?.addEventListener('click', () => { plannerState.people = Math.max(1, plannerState.people - 1);plannerState.accommodationUnits=plannerState.partialAccommodation?Math.min(plannerState.accommodationUnits,plannerState.people):plannerState.people;updatePlanner(); });
qs('[data-people-plus]', planner)?.addEventListener('click', () => { plannerState.people = Math.min(8, plannerState.people + 1);if(!plannerState.partialAccommodation)plannerState.accommodationUnits=plannerState.people;updatePlanner(); });
qs('[data-accommodation-units-minus]', planner)?.addEventListener('click', () => {plannerState.accommodationUnits=Math.max(1,plannerState.accommodationUnits-1);updatePlanner()});
qs('[data-accommodation-units-plus]', planner)?.addEventListener('click', () => {plannerState.accommodationUnits=Math.min(plannerState.people,plannerState.accommodationUnits+1);updatePlanner()});
partialAccommodationInput?.addEventListener('change',()=>{plannerState.partialAccommodation=partialAccommodationInput.checked;if(!plannerState.partialAccommodation)plannerState.accommodationUnits=plannerState.people;updatePlanner()});
accommodationOptionSelect?.addEventListener('change',()=>{plannerState.accommodationOptionId=accommodationOptionSelect.value||null;updatePlanner()});
accommodationOptionCards?.addEventListener('click',event=>{const card=event.target.closest('[data-accommodation-option-id]');if(!card||card.disabled)return;plannerState.accommodationOptionId=card.dataset.accommodationOptionId;accommodationOptionSelect.value=plannerState.accommodationOptionId;renderPlannerAccommodationOptions(plannerState.accommodationOptionId);updatePlanner()});

const loadPlannerCurrentEvent=async()=>{
  try{
    const cfg=await import('./firebase-config.js?v=20260823-auth2'),base=String(cfg.portalConfig?.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
    const response=await fetch(`${base}/api/events/current`,{cache:'no-store'});if(!response.ok)throw new Error(`Event API ${response.status}`);
    const payload=await response.json();plannerEventData=payload?.event||null;
    plannerAccommodationOptions=(Array.isArray(payload?.accommodationOptions)?payload.accommodationOptions:[]).map((option,index)=>({
      id:String(option.id||''),name:String(option.name||''),kind:option.kind==='tent'?'tent':'cabin',inventoryMode:option.inventoryMode==='unlimited'?'unlimited':'limited',
      unitsTotal:Number(option.unitsTotal||0),freeUnits:option.freeUnits==null?null:Number(option.freeUnits),capacityPerUnit:Math.max(1,Number(option.capacityPerUnit||1)),
      unitPriceCzk:Number(option.unitPriceCzk||0),personPriceCzk:Number(option.personPriceCzk||0),beddingFeePerPersonCzk:Number(option.beddingFeePerPersonCzk||0),cityTaxPerPersonPerNightCzk:Number(option.cityTaxPerPersonPerNightCzk||0),active:option.active!==false,soldOut:option.soldOut===true,sortOrder:option.sortOrder==null?index:Number(option.sortOrder),
    })).filter(option=>option.id&&option.name);
    if(plannerSection&&plannerEventData){plannerSection.dataset.eventId=plannerEventData.id;plannerSection.dataset.eventYear=plannerEventData.year}
    const statusCopy=qs('.planner-status span',planner);if(statusCopy&&plannerEventData)statusCopy.textContent=`Výběr pro United ${plannerEventData.year} zatím není rezervace. Dokončíš ji v Můj United.`;
    renderPlannerAccommodationOptions();updatePlanner();
  }catch(error){console.debug('Aktuální nabídka ubytování není dostupná; Planner pokračuje bez live ceníku.',error);plannerEventData=null;plannerAccommodationOptions=[];renderPlannerAccommodationOptions();updatePlanner()}
};
loadPlannerCurrentEvent();

if (googleCalendar && plannerSection) {
const start = (plannerSection.dataset.eventStart || '2026-06-19').replaceAll('-','');
const end = (plannerSection.dataset.eventEnd || '2026-06-22').replaceAll('-','');
const details = 'E36 United — BMW E36 komunita, Show & Shine a víkend ve Zbraslavicích.';
googleCalendar.href = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent('E36 United')}&dates=${start}/${end}&details=${encodeURIComponent(details)}&location=${encodeURIComponent('Zbraslavice, Česko')}`;
}
calendarButton?.addEventListener('click', () => {
if (!calendarPopover) return;
const willOpen = calendarPopover.hidden;
calendarPopover.hidden = !willOpen;
calendarButton.setAttribute('aria-expanded', String(willOpen));
});
document.addEventListener('click', e => {
if (!calendarPopover || calendarPopover.hidden) return;
if (!calendarPopover.contains(e.target) && !calendarButton?.contains(e.target)) {
calendarPopover.hidden = true;
calendarButton?.setAttribute('aria-expanded','false');
}
});
const refreshMemberPlannerMode = async () => {
  // Never trust a local boolean as authentication state. Firebase is the only source of truth.
  memberPlannerMode = false;
  localStorage.removeItem('e36UnitedMemberSessionV19');
  try {
    const cfg = await import('./firebase-config.js?v=20260823-auth2');
    const fc = cfg.firebaseConfig;
    const live = fc?.apiKey && fc?.projectId && !String(fc.apiKey).startsWith('PASTE_');
    if (!live) { updatePlanner(); return; }
    const appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const app = appMod.getApps().length ? appMod.getApps()[0] : appMod.initializeApp(fc);
    const auth = authMod.getAuth(app);
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
    await new Promise(resolve => {
      const unsub = authMod.onAuthStateChanged(auth,user=>{memberPlannerMode=Boolean(user&&!user.isAnonymous);updatePlanner();unsub();resolve();});
    });
  } catch (e) {
    memberPlannerMode = false;
    console.debug('Member planner auth state unavailable; failing closed.', e);
  }
  updatePlanner();
};
updatePlanner();
refreshMemberPlannerMode();
}

/* Account-first planner completion with a manual e-mail fallback. */
const inquiryModal = qs('[data-inquiry-modal]');
const inquiryDialog = qs('.inquiry-dialog',inquiryModal||document);
const inquiryTrigger = qs('[data-planner-mail]');
const inquiryForm = qs('[data-inquiry-form]');
const inquiryPlan = qs('[data-inquiry-plan]');
const plannerChoiceStep = qs('[data-planner-choice-step]');
let inquiryReturnFocus = null;
const handoffStoragePrefix='e36UnitedPlannerHandoff:v1:';

const inquiryPersonLabel = count => count === 1 ? 'osoba' : (count >= 2 && count <= 4 ? 'osoby' : 'osob');
const accommodationLabel = count => count === 1 ? 'osoba' : (count >= 2 && count <= 4 ? 'osoby' : 'osob');
const renderInquiryPlan = () => {
  if (!inquiryPlan) return;
  const option=plannerAccommodationOptions.find(item=>item.id===plannerState.accommodationOptionId);
  const accommodation=plannerState.accommodationUnits?` · ${plannerState.accommodationUnits} ${accommodationLabel(plannerState.accommodationUnits)} k ubytování`:'';
  const accommodationDetail=plannerState.accommodationUnits&&plannerState.accommodationUnits!==plannerState.people?accommodation:'';
  inquiryPlan.textContent = `${plannerStayLabel()}${plannerState.arrival==='Jen na otočku'?'':` · ${plannerNightLabel(plannerNights())}`} · ${option?.name||plannerState.sleep}${accommodationDetail} · ${plannerState.people} ${inquiryPersonLabel(plannerState.people)} · ${plannerState.showshine}`;
};
const setInquiryStage = stage => {
  const manual=stage==='manual';
  if(plannerChoiceStep)plannerChoiceStep.hidden=manual;
  qsa('[data-inquiry-manual]').forEach(element=>element.hidden=!manual);
  inquiryDialog?.setAttribute('aria-labelledby',manual?'inquiry-title':'planner-choice-title');
  if(manual)inquiryDialog?.removeAttribute('aria-describedby');else inquiryDialog?.setAttribute('aria-describedby','planner-choice-intro');
};
const openPlannerChoice = () => {
  if (!inquiryModal) return;
  inquiryReturnFocus = document.activeElement;
  setInquiryStage('choice');
  renderInquiryPlan();
  inquiryModal.hidden = false;
  document.body.classList.add('modal-open');
  window.requestAnimationFrame(() => qs('[data-planner-register]')?.focus());
};
const openInquiry = () => {
  if (!inquiryModal) return;
  if(inquiryModal.hidden)inquiryReturnFocus=document.activeElement;
  setInquiryStage('manual');
  renderInquiryPlan();
  inquiryModal.hidden = false;
  document.body.classList.add('modal-open');
  window.requestAnimationFrame(() => inquiryForm?.elements?.car?.focus());
};
const closeInquiry = () => {
  if (!inquiryModal) return;
  inquiryModal.hidden = true;
  document.body.classList.remove('modal-open');
  inquiryReturnFocus?.focus?.();
};
const cleanupPlannerHandoffs=()=>{
  try{
    for(let index=localStorage.length-1;index>=0;index--){
      const key=localStorage.key(index);if(!key?.startsWith(handoffStoragePrefix))continue;
      try{const value=JSON.parse(localStorage.getItem(key)||'null'),expiresAt=Date.parse(value?.expiresAt);if(!value||!Number.isFinite(expiresAt)||expiresAt<=Date.now())localStorage.removeItem(key)}catch{localStorage.removeItem(key)}
    }
  }catch(error){console.debug('Planner handoff cleanup unavailable.',error)}
};
const encodePlannerHandoff=draft=>{
  const bytes=new TextEncoder().encode(JSON.stringify(draft));
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
const createPlannerHandoff=()=>{
  cleanupPlannerHandoffs();
  const draftId=crypto.randomUUID();
  const now=Date.now(),createdAt=new Date(now).toISOString(),expiresAt=new Date(now+7*24*60*60*1000).toISOString();
  const eventSection=planner?.closest('[data-event-start]'),eventStart=eventSection?.dataset.eventStart||'',eventId=plannerEventData?.id||eventSection?.dataset.eventId||null;
  const eventYear=Number(plannerEventData?.year||eventSection?.dataset.eventYear||eventStart.slice(0,4))||new Date().getFullYear();
  const attendanceType={Pátek:'full_weekend',Sobota:'saturday_only','Jen na otočku':'day_visit'}[plannerState.arrival];
  const showShine={'Chci soutěžit':'Ano','Možná':'Možná','Jedu se podívat':'Ne'}[plannerState.showshine];
  const draft={version:1,draftId,source:'weekend-planner',eventYear,eventId:eventId||null,createdAt,expiresAt,arrival:plannerState.arrival,departure:plannerState.departure,nights:plannerNights(),attendanceType,accommodation:plannerState.sleep,accommodationOptionId:plannerState.accommodationOptionId||null,accommodationUnits:plannerState.accommodationUnits,crew:plannerState.people,showShine};
  try{localStorage.setItem(`${handoffStoragePrefix}${draftId}`,JSON.stringify(draft))}catch(error){console.debug('Planner handoff local storage unavailable.',error)}
  return draft;
};
const continueToMember=mode=>{
  const draft=createPlannerHandoff(),destination=new URL('member.html',window.location.href);
  if(mode)destination.searchParams.set('mode',mode);
  destination.searchParams.set('panel','reservation');
  destination.searchParams.set('draft',draft.draftId);
  destination.hash=`handoff=${encodeURIComponent(encodePlannerHandoff(draft))}`;
  const opened=window.open(destination.href,'_blank');
  if(opened){try{opened.opener=null}catch{}closeInquiry();return}
  window.location.assign(destination.href);
};

inquiryTrigger?.addEventListener('click', e => {e.preventDefault();if(memberPlannerMode)continueToMember(null);else openPlannerChoice()});
qs('[data-planner-register]')?.addEventListener('click',()=>continueToMember('register'));
qs('[data-planner-login]')?.addEventListener('click',()=>continueToMember('login'));
qs('[data-planner-manual]')?.addEventListener('click',openInquiry);
qsa('[data-inquiry-close]').forEach(el => el.addEventListener('click', closeInquiry));
document.addEventListener('keydown', e => {
  if (!inquiryModal || inquiryModal.hidden) return;
  if (e.key === 'Escape'){e.preventDefault();closeInquiry();return}
  if(e.key!=='Tab')return;
  const focusable=qsa('button:not([disabled]),a[href],input:not([disabled])',inquiryDialog).filter(element=>element.offsetParent!==null);
  if(!focusable.length)return;
  const first=focusable[0],last=focusable.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
});
document.addEventListener('e36:planner', renderInquiryPlan);

inquiryForm?.addEventListener('submit', e => {
  e.preventDefault();
  if (!inquiryForm.reportValidity()) return;
  const data = new FormData(inquiryForm);
  const car = String(data.get('car') || '').trim();
  const name = String(data.get('name') || '').trim();
  const nickname = String(data.get('nickname') || '').trim();
  const phone = String(data.get('phone') || '').trim();
  const email = String(data.get('email') || '').trim();
  const subject = `E36 United – poptávka / ${car || name}`;
  const body = [
    'Ahoj E36 United,','',
    'mám zájem o další E36 United a rád/a bych ověřil/a možnosti podle této konfigurace:','',
    `• Příjezd: ${plannerState.arrival}`,
    `• Odjezd: ${plannerState.departure}${plannerState.arrival==='Jen na otočku'?'':` (${plannerNightLabel(plannerNights())})`}`,
    `• Ubytování: ${plannerAccommodationOptions.find(item=>item.id===plannerState.accommodationOptionId)?.name||plannerState.sleep}`,
    `• Počet osob k ubytování: ${plannerState.accommodationUnits}`,
    `• Počet lidí: ${plannerState.people}`,
    `• Show & Shine: ${plannerState.showshine}`,'',
    'Údaje posádky:',
    `• Auto / typ: ${car}`,
    `• Jméno: ${name}`,
    `• Přezdívka: ${nickname || '—'}`,
    `• Telefon: ${phone}`,
    `• E-mail: ${email}`,'',
    'Prosím o informaci k termínu a dostupnosti.','',
    'Díky!'
  ].join('\n');
  window.location.href = `mailto:united@e36united.cz?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.setTimeout(closeInquiry, 250);
});
renderInquiryPlan();

if (unitedMap) {
const flowDayImage = qs('[data-flow-day-image]', unitedMap);
const flowDayTitle = qs('[data-flow-day-title]', unitedMap);
const flowDayCopy = qs('[data-flow-day-copy]', unitedMap);
const flowSleepImage = qs('[data-flow-sleep-image]', unitedMap);
const flowSleepTitle = qs('[data-flow-sleep-title]', unitedMap);
const flowSleepCopy = qs('[data-flow-sleep-copy]', unitedMap);
const flowAccommodationUnits = qs('[data-preview-accommodation-units]', unitedMap);
const flowShowImage = qs('[data-flow-show-image]', unitedMap);
const flowShowTitle = qs('[data-flow-show-title]', unitedMap);
const flowShowCopy = qs('[data-flow-show-copy]', unitedMap);
const flowShowBadge = qs('[data-flow-show-badge]', unitedMap);
const flowPeopleIcons = qs('[data-flow-people-icons]', unitedMap);
const flowPeopleTitle = qs('[data-flow-people-title]', unitedMap);
const flowPeopleCopy = qs('[data-flow-people-copy]', unitedMap);
const flowPeopleNumber = qs('[data-flow-people-number]', unitedMap);
const mapArrival = qs('[data-map-arrival]', unitedMap);
const mapSleep = qs('[data-map-sleep]', unitedMap);
const mapPeople = qs('[data-map-people]', unitedMap);
const mapShow = qs('[data-map-show]', unitedMap);
const previewCards = {
arrival: qs('[data-preview-card="arrival"]', unitedMap),
sleep: qs('[data-preview-card="sleep"]', unitedMap),
people: qs('[data-preview-card="people"]', unitedMap),
showshine: qs('[data-preview-card="showshine"]', unitedMap)
};
const timelineSteps = {
arrival: qs('[data-timeline-step="arrival"]', unitedMap),
sleep: qs('[data-timeline-step="sleep"]', unitedMap),
people: qs('[data-timeline-step="people"]', unitedMap),
showshine: qs('[data-timeline-step="showshine"]', unitedMap)
};
const timelineProgress = qs('[data-timeline-progress]', unitedMap);

const flowAssets = {
day: {
'Pátek': {
image:'assets/images/program/friday.webp',
alt:'Páteční komunita E36 United',
title:'Pátek · komunita',
copy:'První večer, seznamování, auta a hlavně lidi.'
},
'Sobota': {
image:'assets/images/program/saturday.webp',
alt:'Sobotní auta a Show and Shine E36 United',
title:'Sobota · auta',
copy:'Hlavní plocha, nejvíc E36 a centrum celého programu.'
},
'Jen na otočku': {
image:'https://static.wixstatic.com/media/595239_b682f486d81c4c4cbddef668c9b5a0fc~mv2.jpeg/v1/fill/w_1000%2Ch_720%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/595239_b682f486d81c4c4cbddef668c9b5a0fc~mv2.jpeg',
alt:'Krátká návštěva E36 United',
title:'Day pass · na otočku',
copy:'Přijeď na hlavní program a večer zase vyraz domů.'
}
},
sleep: {
'Chatka': {
image:'cabin-zbraslavice-user.webp',
fallback:'map-cabin.svg',
alt:'Chatky v rekreačním areálu Zbraslavice',
title:'Chatka',
copy:'Pevné zázemí přímo v areálu a pohodlnější celý víkend.'
},
'Stan': {
image:'https://f0cd1afc5f.clvaw-cdnwnd.com/d2f4b4b3024714eacd68dfcfbe3b8bc2/200002120-10bff10c02/IMG_9058.jpeg?ph=f0cd1afc5f',
fallback:'map-tent.svg',
alt:'Stanové městečko v rekreačním areálu Zbraslavice',
title:'Stan',
copy:'Campová atmosféra, vlastní tempo a komunita pár kroků od tebe.'
},
'Bez ubytování': {
image:'map-meadow.svg',
fallback:'map-meadow.svg',
alt:'Varianta bez ubytování',
title:'Bez ubytování',
copy:'Příjezd, hlavní program a návrat bez nocování.'
}
},
show: {
'Chci soutěžit': {
image:'pohary.jpg',
alt:'Poháry pro soutěžící Show and Shine E36 United',
position:'center 38%',
title:'Chci soutěžit',
copy:'Tvoje E36 jde na plochu. Z návštěvy se stává soutěžní víkend.',
badge:'COMPETE'
},
'Jedu se podívat': {
image:'assets/images/program/saturday.webp',
alt:'Návštěva Show and Shine E36 United',
title:'Jedu se podívat',
copy:'Sobotní highlight: auta, komunita a hlavní plocha.',
badge:'WATCH'
},
'Možná': {
image:'assets/images/program/friday.webp',
alt:'Show and Shine E36 United – rozhodnu se později',
title:'Možná',
copy:'Necháváš si otevřená vrátka. Rozhodnutí můžeš upřesnit později.',
badge:'MAYBE'
}
}
};

let previousPreviewState = null;
const personLabelPreview = count => count === 1 ? 'osoba' : (count >= 2 && count <= 4 ? 'osoby' : 'osob');

const animateSelection = key => {
const card = previewCards[key];
const step = timelineSteps[key];
[card,step].forEach(el => {
if (!el || reduceMotion) return;
el.classList.remove('is-updating');
void el.offsetWidth;
el.classList.add('is-updating');
window.setTimeout(() => el.classList.remove('is-updating'), 780);
});
};

const swapImage = (img, payload) => {
if (!img || !payload) return;
img.style.objectPosition = payload.position || 'center';
if (img.getAttribute('src') === payload.image) return;
img.style.opacity = '.18';
img.alt = payload.alt;
img.onerror = () => {
if (payload.fallback && img.getAttribute('src') !== payload.fallback) img.src = payload.fallback;
img.style.opacity = '1';
};
const reveal = () => { img.style.opacity = '1'; };
img.onload = reveal;
img.src = payload.image;
window.setTimeout(reveal, 420);
};

const renderPeople = count => {
if (flowPeopleIcons) {
const max = 8;
flowPeopleIcons.innerHTML = Array.from({length:max}, (_,index) => `<span class="flow-person${index < count ? '' : ' is-ghost'}"></span>`).join('');
}
const label = `${count} ${personLabelPreview(count)}`;
if (flowPeopleTitle) flowPeopleTitle.textContent = label;
if (flowPeopleNumber) flowPeopleNumber.textContent = String(count).padStart(2,'0');
if (flowPeopleCopy) flowPeopleCopy.textContent = count === 1 ? 'Solo trip. Jedno auto, celý víkend po svém.' : count <= 2 ? 'Kompaktní posádka.' : count <= 4 ? 'Ideální crew na celý víkend.' : 'Velká parta. Přesně tak má United vypadat.';
if (mapPeople) mapPeople.textContent = label;
};

const renderPreview = state => {
const dayPass = state.arrival === 'Jen na otočku';
const day = flowAssets.day[state.arrival] || flowAssets.day['Pátek'];
const sleep = flowAssets.sleep[state.sleep] || flowAssets.sleep['Chatka'];
const show = flowAssets.show[state.showshine] || flowAssets.show['Jedu se podívat'];
const liveOption = plannerAccommodationOptions.find(option=>option.id===state.accommodationOptionId);

unitedMap.classList.toggle('is-day-pass', dayPass);
if (previewCards.sleep) previewCards.sleep.hidden = dayPass;
if (timelineSteps.sleep) timelineSteps.sleep.hidden = dayPass;
const visibleKeys = dayPass ? ['arrival','people','showshine'] : ['arrival','sleep','people','showshine'];
visibleKeys.forEach((key,index) => {
  const cardIndex = qs('.preview-choice-index', previewCards[key] || document);
  const stepIndex = qs(':scope > span', timelineSteps[key] || document);
  const label = String(index + 1).padStart(2,'0');
  if (cardIndex) cardIndex.textContent = label;
  if (stepIndex) stepIndex.textContent = label;
});
if (timelineProgress) {
  timelineProgress.style.transform = 'scaleX(1)';
  timelineProgress.dataset.visibleSteps = String(visibleKeys.length);
}

swapImage(flowDayImage, day);
swapImage(flowSleepImage, sleep);
swapImage(flowShowImage, show);
if (flowDayTitle) flowDayTitle.textContent = state.arrival === 'Jen na otočku' ? day.title : `${state.arrival} → ${state.departure}`;
if (flowDayCopy) flowDayCopy.textContent = state.arrival === 'Jen na otočku' ? day.copy : `${plannerNightLabel(plannerNights())} · ${day.copy.charAt(0).toLowerCase()}${day.copy.slice(1)}`;
if (flowSleepTitle) flowSleepTitle.textContent = liveOption?.name||sleep.title;
if (flowSleepCopy) {const place=liveOption?.kind==='tent'?'jeden stan':'jednu chatku';flowSleepCopy.textContent = liveOption?(liveOption.inventoryMode==='unlimited'?`Max. ${liveOption.capacityPerUnit} ${personLabelPreview(liveOption.capacityPerUnit)} na ${place} · dostupné bez omezení.`:`Max. ${liveOption.capacityPerUnit} ${personLabelPreview(liveOption.capacityPerUnit)} na ${place} · k dispozici: ${liveOption.freeUnits}.`):sleep.copy}
if (flowAccommodationUnits) {const hasAccommodationUnits=state.accommodationUnits>0,unitCount=liveOption?Math.ceil(state.accommodationUnits/Math.max(1,liveOption.capacityPerUnit)):0;flowAccommodationUnits.hidden=!hasAccommodationUnits;flowAccommodationUnits.style.display=hasAccommodationUnits?'':'none';flowAccommodationUnits.textContent=hasAccommodationUnits?(liveOption?`${unitCount}× · ${plannerNightLabel(plannerNights())}`:`${state.accommodationUnits} ${personLabelPreview(state.accommodationUnits)} k ubytování`):''}
if (flowShowTitle) flowShowTitle.textContent = show.title;
if (flowShowCopy) flowShowCopy.textContent = show.copy;
if (flowShowBadge) flowShowBadge.textContent = show.badge;
renderPeople(state.people);

if (mapArrival) mapArrival.textContent = state.arrival === 'Jen na otočku' ? state.arrival : `${state.arrival} → ${state.departure}`;
if (mapSleep) mapSleep.textContent = state.accommodationUnits?`${liveOption?.name||state.sleep} · ${state.accommodationUnits} ${personLabelPreview(state.accommodationUnits)}`:state.sleep;
if (mapShow) mapShow.textContent = state.showshine;

Object.entries(previewCards).forEach(([key,card]) => {
if (!card) return;
const value = key === 'people' ? state.people : state[key];
card.dataset.value = value;
card.classList.add('is-active');
});

if (previousPreviewState) {
['arrival','departure','sleep','people','showshine'].forEach(key => {
if (previousPreviewState[key] !== state[key]) animateSelection(key);
});
if(previousPreviewState.accommodationUnits!==state.accommodationUnits)animateSelection('sleep');
}
previousPreviewState = {...state};
};

document.addEventListener('e36:planner', e => renderPreview(e.detail));
renderPreview(plannerState);
}

/* Persistent context HUD */
const eventHud = qs('[data-event-hud]');
if (eventHud) {
const hudKicker = qs('[data-hud-kicker]', eventHud);
const hudTitle = qs('[data-hud-title]', eventHud);
const hudState = qs('[data-hud-state]', eventHud);
let activeSection = 'home';
let latestShowshine = {label:'Sedan',mode:'overview'};
let latestPlan = {...plannerState};
const sectionMap = [
['home','#home'],['weekend','#experience'],['showshine','#show-shine'],['planner','#planer'],['map','#areal'],['info','#info-hub']
];
const renderHud = () => {
eventHud.classList.toggle('is-visible', window.scrollY > 120);
eventHud.classList.toggle('is-active', activeSection !== 'home');
if (activeSection === 'showshine') {
if (hudKicker) hudKicker.textContent = 'SHOW & SHINE';
if (hudTitle) hudTitle.textContent = `${latestShowshine.label.toUpperCase()} / ${String(latestShowshine.mode).toUpperCase()}`;
if (hudState) hudState.textContent = 'SCAN';
} else if (activeSection === 'planner') {
if (hudKicker) hudKicker.textContent = 'YOUR UNITED';
if (hudTitle) hudTitle.textContent = `${latestPlan.people}× / ${latestPlan.sleep} / ${latestPlan.arrival}`.toUpperCase();
if (hudState) hudState.textContent = 'PLAN';
} else if (activeSection === 'map') {
if (hudKicker) hudKicker.textContent = 'LIVE WEEKEND';
if (hudTitle) hudTitle.textContent = `${latestPlan.sleep} → SHOW & SHINE`.toUpperCase();
if (hudState) hudState.textContent = 'SYNC';
} else if (activeSection === 'weekend') {
if (hudKicker) hudKicker.textContent = 'E36 UNITED';
if (hudTitle) hudTitle.textContent = '3 DNY / 1 KOMUNITA';
if (hudState) hudState.textContent = 'WEEKEND';
} else {
if (hudKicker) hudKicker.textContent = 'E36 UNITED';
if (hudTitle) hudTitle.textContent = '19–21 JUN / ZBRASLAVICE';
if (hudState) hudState.textContent = 'EXPLORE';
}
};
const detectSection = () => {
const probe = window.innerHeight * .42;
let found = 'home';
sectionMap.forEach(([name,selector]) => {
const el = qs(selector); if (!el) return;
const r = el.getBoundingClientRect();
if (r.top <= probe && r.bottom >= probe) found = name;
});
activeSection = found; renderHud();
};
document.addEventListener('e36:showshine', e => { latestShowshine = e.detail; renderHud(); });
document.addEventListener('e36:planner', e => { latestPlan = e.detail; renderHud(); });
detectSection();
window.addEventListener('scroll', detectSection,{passive:true});
}


/* Info Hub — road-trip calculator (OpenStreetMap geocoding + OSRM route). */
const routeCalculator = qs('[data-route-calculator]');
if (routeCalculator) {
  const form = qs('[data-route-form]', routeCalculator);
  const originInput = qs('[data-route-origin]', routeCalculator);
  const fromLabel = qs('[data-route-from]', routeCalculator);
  const distanceEl = qs('[data-route-distance]', routeCalculator);
  const durationEl = qs('[data-route-duration]', routeCalculator);
  const noteEl = qs('[data-route-note]', routeCalculator);
  const mapLink = qs('[data-route-map-link]', routeCalculator);
  const submit = form?.querySelector('button[type="submit"]');
  const destination = { lat:49.8239483, lon:15.1933317 };

  const formatDuration = seconds => {
    const min = Math.max(1, Math.round(seconds / 60));
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const rest = min % 60;
    return rest ? `${h} h ${rest} min` : `${h} h`;
  };
  const haversineKm = (lat1,lon1,lat2,lon2) => {
    const r = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return 2*r*Math.asin(Math.sqrt(a));
  };

  form?.addEventListener('submit', async e => {
    e.preventDefault();
    const query = originInput?.value.trim();
    if (!query) return;
    routeCalculator.classList.remove('is-ready');
    routeCalculator.classList.add('is-loading');
    if (submit) submit.disabled = true;
    if (fromLabel) fromLabel.textContent = query;
    if (distanceEl) distanceEl.textContent = '…';
    if (durationEl) durationEl.textContent = '…';
    if (noteEl) noteEl.textContent = 'Hledám město a počítám trasu…';
    if (mapLink) mapLink.href = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(query)}&destination=${destination.lat},${destination.lon}`;

    try {
      const geoUrl = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=cs&q=${encodeURIComponent(query)}`;
      const geoRes = await fetch(geoUrl, {headers:{'Accept':'application/json'}});
      if (!geoRes.ok) throw new Error('geocode');
      const places = await geoRes.json();
      if (!places?.length) throw new Error('not-found');
      const origin = { lat:Number(places[0].lat), lon:Number(places[0].lon) };
      const cityLabel = (places[0].display_name || query).split(',').slice(0,2).join(',').trim();
      if (fromLabel) fromLabel.textContent = cityLabel;

      let distanceKm, durationSec;
      try {
        const routeUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false&alternatives=false&steps=false`;
        const routeRes = await fetch(routeUrl);
        const routeData = await routeRes.json();
        if (!routeRes.ok || !routeData.routes?.[0]) throw new Error('route');
        distanceKm = routeData.routes[0].distance / 1000;
        durationSec = routeData.routes[0].duration;
      } catch (_) {
        const straight = haversineKm(origin.lat,origin.lon,destination.lat,destination.lon);
        distanceKm = straight * 1.24;
        durationSec = (distanceKm / 72) * 3600;
      }

      if (distanceEl) distanceEl.textContent = `${Math.round(distanceKm)} km`;
      if (durationEl) durationEl.textContent = formatDuration(durationSec);
      if (noteEl) noteEl.textContent = 'Orientační silniční vzdálenost bez započtení aktuální dopravy.';
      routeCalculator.classList.add('is-ready');
    } catch (err) {
      if (distanceEl) distanceEl.textContent = '— km';
      if (durationEl) durationEl.textContent = '—';
      if (noteEl) noteEl.textContent = 'Lokalitu se nepodařilo spočítat. Trasování můžeš otevřít rovnou v Google Maps.';
    } finally {
      routeCalculator.classList.remove('is-loading');
      if (submit) submit.disabled = false;
    }
  });
}

/* Keep only one FAQ card open at a time */
const details = qsa('details.info-card');
details.forEach(detail => detail.addEventListener('toggle', () => {
if (!detail.open) return;
details.forEach(other => { if (other !== detail) other.open = false; });
}));

/* Sticky conversion CTA */
const sticky = qs('[data-sticky-cta]');
let stickyDismissed = false;
const updateSticky = () => {
if (!sticky || stickyDismissed) return;
const plannerSection = qs('#planer');
const nearPlanner = plannerSection && plannerSection.getBoundingClientRect().top < window.innerHeight * .75 && plannerSection.getBoundingClientRect().bottom > 0;
sticky.classList.toggle('is-visible', window.scrollY > window.innerHeight * .8 && !nearPlanner);
};
sticky?.querySelector('[data-close-sticky]')?.addEventListener('click', () => {
stickyDismissed = true;
sticky?.classList.remove('is-visible');
});
updateSticky();
window.addEventListener('scroll', updateSticky, { passive:true });
})();
