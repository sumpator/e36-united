(() => {
const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

/* Lightbox gallery with arrows + thumbnail rail */
const lightbox = qs('.lightbox');
const lightboxImg = lightbox?.querySelector('.lightbox-stage > img');
const lightboxItems = qsa('[data-lightbox]');
const lightboxCounter = lightbox ? qs('[data-lightbox-counter]', lightbox) : null;
const lightboxTitle = lightbox ? qs('[data-lightbox-title]', lightbox) : null;
const lightboxThumbs = lightbox ? qs('[data-lightbox-thumbs]', lightbox) : null;
let lightboxIndex = 0;
const paintLightbox = (index, focusThumb = true) => {
if (!lightbox || !lightboxImg || !lightboxItems.length) return;
lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
const item = lightboxItems[lightboxIndex];
const img = item.querySelector('img');
lightboxImg.src = item.dataset.full || img?.src || '';
lightboxImg.alt = img?.alt || '';
if (lightboxCounter) lightboxCounter.textContent = `${String(lightboxIndex + 1).padStart(2,'0')} / ${String(lightboxItems.length).padStart(2,'0')}`;
if (lightboxTitle) lightboxTitle.textContent = img?.alt || 'E36 United';
qsa('.lightbox-thumb', lightboxThumbs || document).forEach((thumb, i) => thumb.classList.toggle('is-active', i === lightboxIndex));
if (focusThumb) qs('.lightbox-thumb.is-active', lightboxThumbs || document)?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
};
const openLightbox = index => { paintLightbox(index, false); lightbox?.classList.add('open'); document.body.style.overflow='hidden'; };
const closeLightbox = () => { lightbox?.classList.remove('open'); document.body.style.overflow=''; };
if (lightboxThumbs && lightboxItems.length) {
lightboxThumbs.innerHTML = '';
lightboxItems.forEach((item, i) => {
const source = item.querySelector('img');
const button = document.createElement('button');
button.type='button'; button.className='lightbox-thumb'; button.setAttribute('aria-label',`Otevřít fotografii ${i+1}`);
const image = document.createElement('img'); image.src=source?.src||''; image.alt=''; image.loading='lazy';
button.append(image); button.addEventListener('click',()=>paintLightbox(i)); lightboxThumbs.append(button);
});
}
lightboxItems.forEach((item, i) => item.addEventListener('click', () => openLightbox(i)));
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

/* Community gallery upload */
const communityUpload = qs('[data-community-upload]');
if (communityUpload) {
const form = qs('[data-upload-form]', communityUpload);
const input = qs('[data-upload-input]', communityUpload);
const dropzone = qs('[data-upload-dropzone]', communityUpload);
const preview = qs('[data-upload-preview]', communityUpload);
const count = qs('[data-upload-count]', communityUpload);
const status = qs('[data-upload-status]', communityUpload);
const submit = qs('[data-upload-submit]', communityUpload);
const maxFiles = 8;
const maxBytes = 12 * 1024 * 1024;
const allowed = ['image/jpeg','image/png','image/webp'];

const setStatus = (message, type='') => {
if (!status) return;
status.textContent = message;
status.classList.remove('is-success','is-error');
if (type) status.classList.add(`is-${type}`);
};

const validateFiles = files => {
if (!files.length) return 'Vyber alespoň jednu fotografii.';
if (files.length > maxFiles) return `Můžeš nahrát maximálně ${maxFiles} fotografií najednou.`;
const badType = files.find(file => !allowed.includes(file.type));
if (badType) return `Soubor „${badType.name}“ není JPG, PNG ani WEBP.`;
const tooLarge = files.find(file => file.size > maxBytes);
if (tooLarge) return `Soubor „${tooLarge.name}“ je větší než 12 MB.`;
return '';
};

const renderPreview = () => {
if (!input || !preview) return;
const files = [...input.files];
preview.innerHTML = '';
if (count) count.textContent = `${files.length} / ${maxFiles} vybráno`;
const error = validateFiles(files);
if (files.length && error) setStatus(error,'error');
else if (!status?.classList.contains('is-success')) setStatus('');
files.slice(0,maxFiles).forEach(file => {
const figure = document.createElement('figure');
const img = document.createElement('img');
const label = document.createElement('span');
label.textContent = file.name;
figure.append(img,label);
preview.append(figure);
const reader = new FileReader();
reader.onload = () => { img.src = String(reader.result || ''); };
reader.readAsDataURL(file);
});
};

input?.addEventListener('change', renderPreview);
['dragenter','dragover'].forEach(type => dropzone?.addEventListener(type, e => {
e.preventDefault(); dropzone.classList.add('is-dragging');
}));
['dragleave','drop'].forEach(type => dropzone?.addEventListener(type, e => {
e.preventDefault(); dropzone.classList.remove('is-dragging');
}));
dropzone?.addEventListener('drop', e => {
if (!input || !e.dataTransfer?.files?.length) return;
const dt = new DataTransfer();
[...e.dataTransfer.files].slice(0,maxFiles).forEach(file => dt.items.add(file));
input.files = dt.files;
renderPreview();
});

form?.addEventListener('submit', async e => {
e.preventDefault();
if (!input || !form) return;
const files = [...input.files];
const error = validateFiles(files);
if (error) { setStatus(error,'error'); return; }
if (!form.reportValidity()) return;
const name = String(new FormData(form).get('name') || '').trim();
const email = String(new FormData(form).get('email') || '').trim();
const shareText = `Fotky z E36 United\nOd: ${name}\nKontakt: ${email}\n\nFotografie posílám ke schválení do community galerie.`;
submit?.setAttribute('disabled','disabled');
try {
if (navigator.canShare && navigator.share && navigator.canShare({files})) {
await navigator.share({title:'Fotky z E36 United',text:shareText,files});
setStatus('Sdílení bylo otevřeno. Vyber e-mail nebo aplikaci, přes kterou nám fotky pošleš.','success');
} else {
const subject = encodeURIComponent('Fotky do galerie E36 United');
const body = encodeURIComponent(`${shareText}\n\nVybrané soubory: ${files.map(f=>f.name).join(', ')}\n\nProsím přilož vybrané fotografie k tomuto e-mailu.`);
window.location.href = `mailto:united@e36united.cz?subject=${subject}&body=${body}`;
setStatus('Otevírám připravený e-mail. Přilož k němu vybrané fotky z výběru výše.','success');
}
} catch (error) {
if (error?.name !== 'AbortError') setStatus('Sdílení se nepodařilo otevřít. Zkus to znovu nebo napiš na united@e36united.cz.','error');
} finally {
submit?.removeAttribute('disabled');
}
});
}

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
img.alt = `${cat.temporary ? 'Referenční vůz' : 'Vítěz'} Show & Shine — ${cat.label}`;
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
  showcaseImage.alt = `${category.label} — ${category.temporary ? 'referenční vůz' : 'vítězný vůz'} Show & Shine`;
  showcaseImage.onload = () => { showcaseImage.style.opacity = '1'; };
  showcaseImage.src = category.thumb;
  window.setTimeout(() => { showcaseImage.style.opacity = '1'; }, 420);
}
if (hudCar) hudCar.textContent = `${category.code || category.label.toUpperCase()} / ${category.temporary ? 'REFERENCE BODY' : 'WINNER 2026'}`;
stage.classList.remove('is-detail','is-tracking','is-settled');
stage.classList.toggle('is-switching', !instant && !reduceMotion);

const applyImage = () => {
if (overviewImg && category.overview) {
overviewImg.src = category.overview;
overviewImg.alt = category.temporary ? `${category.label} — referenční vůz pro Show & Shine` : `${category.label} — vítězný vůz Show & Shine 2026`;
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
card.addEventListener('mouseenter', () => {
if (window.matchMedia('(pointer:fine)').matches) setCategory(card.dataset.category);
});
card.addEventListener('focus', () => {
if (window.matchMedia('(pointer:fine)').matches) setCategory(card.dataset.category);
});
});
setCategory(activeShowshineCategory,{instant:true});
}

/* Info Hub deep links — open the right FAQ + nested detail before scrolling. */
const openInfoFaq = (faqId, deepId, {scroll=true} = {}) => {
  const faq = document.getElementById(faqId);
  if (!faq) return;
  faq.open = true;
  if (deepId) {
    const deep = document.getElementById(deepId);
    if (deep) deep.open = true;
  }
  if (scroll) window.setTimeout(() => faq.scrollIntoView({behavior:'smooth',block:'start'}), 40);
};
qsa('[data-open-faq]').forEach(link => link.addEventListener('click', event => {
  const faqId = link.dataset.openFaq;
  const deepId = link.dataset.openDeepdive;
  if (!document.getElementById(faqId)) return;
  event.preventDefault();
  openInfoFaq(faqId, deepId);
  history.replaceState(null, '', `#${faqId}`);
}));
if (location.hash === '#showshine-rules' || location.hash === '#faq-showshine') {
  openInfoFaq('faq-showshine', location.hash === '#showshine-rules' ? 'showshine-rules' : null, {scroll:false});
}
if (location.hash === '#venue-details' || location.hash === '#faq-place') {
  openInfoFaq('faq-place', location.hash === '#venue-details' ? 'venue-details' : null, {scroll:false});
}

/* Weekend Builder + interactive United map */
const planner = qs('[data-planner]');
const unitedMap = qs('[data-united-map]');
const plannerState = { arrival:'Pátek', sleep:'Chatka', people:2, showshine:'Jedu se podívat' };
let updatePlanner = () => {};
let setPlannerChoice = () => {};

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

const slug = (value, fallback) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z]/g,'').slice(0,2).toUpperCase() || fallback;
const personLabel = count => count === 1 ? 'osoba' : (count >= 2 && count <= 4 ? 'osoby' : 'osob');

setPlannerChoice = (key, value) => {
const group = qs(`[data-choice-group="${key}"]`, planner);
if (!group) return;
const choice = qsa('.choice', group).find(c => c.dataset.value === value);
if (!choice) return;
qsa('.choice', group).forEach(c => c.classList.toggle('is-active', c === choice));
plannerState[key] = value;
updatePlanner();
};

updatePlanner = () => {
if (peopleEl) peopleEl.textContent = plannerState.people;
if (peopleLabel) peopleLabel.textContent = personLabel(plannerState.people);
if (summaryArrival) summaryArrival.textContent = plannerState.arrival;
if (summarySleep) summarySleep.textContent = plannerState.sleep;
if (summaryPeople) summaryPeople.textContent = plannerState.people;
if (summaryPeopleLabel) summaryPeopleLabel.textContent = personLabel(plannerState.people);
if (summaryShow) summaryShow.textContent = plannerState.showshine;
if (code) code.textContent = `U36–${slug(plannerState.arrival,'P')}${slug(plannerState.sleep,'CH')}–${String(plannerState.people).padStart(2,'0')}`;
if (mail) {
const subject = 'E36 United – zájem / rezervace ubytování';
const body = [
'Ahoj E36 United,','',
'mám zájem o další E36 United a rád/a bych ověřil/a možnosti podle této konfigurace:',
`• Příjezd: ${plannerState.arrival}`,
`• Ubytování: ${plannerState.sleep}`,
`• Počet lidí: ${plannerState.people}`,
`• Show & Shine: ${plannerState.showshine}`,'',
'Prosím o informaci k termínu a dostupnosti.','', 'Díky!'
].join('\n');
mail.href = `mailto:united@e36united.cz?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
document.dispatchEvent(new CustomEvent('e36:planner',{detail:{...plannerState}}));
};

groups.forEach(group => {
qsa('.choice', group).forEach(choice => choice.addEventListener('click', () => {
setPlannerChoice(group.dataset.choiceGroup, choice.dataset.value);
}));
});
qs('[data-people-minus]', planner)?.addEventListener('click', () => { plannerState.people = Math.max(1, plannerState.people - 1); updatePlanner(); });
qs('[data-people-plus]', planner)?.addEventListener('click', () => { plannerState.people = Math.min(8, plannerState.people + 1); updatePlanner(); });

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
updatePlanner();
}

/* Inquiry completion sheet */
const inquiryModal = qs('[data-inquiry-modal]');
const inquiryTrigger = qs('[data-planner-mail]');
const inquiryForm = qs('[data-inquiry-form]');
const inquiryPlan = qs('[data-inquiry-plan]');
let inquiryReturnFocus = null;

const inquiryPersonLabel = count => count === 1 ? 'osoba' : (count >= 2 && count <= 4 ? 'osoby' : 'osob');
const renderInquiryPlan = () => {
  if (inquiryPlan) inquiryPlan.textContent = `${plannerState.arrival} · ${plannerState.sleep} · ${plannerState.people} ${inquiryPersonLabel(plannerState.people)} · ${plannerState.showshine}`;
};
const openInquiry = () => {
  if (!inquiryModal) return;
  inquiryReturnFocus = document.activeElement;
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

inquiryTrigger?.addEventListener('click', e => {
  e.preventDefault();
  openInquiry();
});
qsa('[data-inquiry-close]').forEach(el => el.addEventListener('click', closeInquiry));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && inquiryModal && !inquiryModal.hidden) closeInquiry();
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
    `• Ubytování: ${plannerState.sleep}`,
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

const flowAssets = {
day: {
'Pátek': {
image:'https://static.wixstatic.com/media/595239_dabd7051ed494297b10d7009a4136814~mv2.jpeg/v1/fill/w_1000%2Ch_720%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/595239_dabd7051ed494297b10d7009a4136814~mv2.jpeg',
alt:'Páteční komunita E36 United',
title:'Pátek · komunita',
copy:'První večer, seznamování, auta a hlavně lidi.'
},
'Sobota': {
image:'https://static.wixstatic.com/media/595239_ef82600a8c944b88aba5032ee9886f25~mv2.jpg/v1/fill/w_1000%2Ch_720%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/595239_ef82600a8c944b88aba5032ee9886f25~mv2.jpg',
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
image:'https://static.wixstatic.com/media/595239_dabd7051ed494297b10d7009a4136814~mv2.jpeg/v1/fill/w_1000%2Ch_720%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/595239_dabd7051ed494297b10d7009a4136814~mv2.jpeg',
alt:'Soutěžní režim Show and Shine E36 United',
title:'Chci soutěžit',
copy:'Tvoje E36 jde na plochu. Z návštěvy se stává soutěžní víkend.',
badge:'COMPETE'
},
'Jedu se podívat': {
image:'https://static.wixstatic.com/media/595239_ef82600a8c944b88aba5032ee9886f25~mv2.jpg/v1/fill/w_1000%2Ch_720%2Cal_c%2Cq_88%2Cenc_avif%2Cquality_auto/595239_ef82600a8c944b88aba5032ee9886f25~mv2.jpg',
alt:'Návštěva Show and Shine E36 United',
title:'Jedu se podívat',
copy:'Sobotní highlight: auta, komunita a hlavní plocha.',
badge:'WATCH'
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
if (!img || !payload || img.getAttribute('src') === payload.image) return;
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
const day = flowAssets.day[state.arrival] || flowAssets.day['Pátek'];
const sleep = flowAssets.sleep[state.sleep] || flowAssets.sleep['Chatka'];
const show = flowAssets.show[state.showshine] || flowAssets.show['Jedu se podívat'];

swapImage(flowDayImage, day);
swapImage(flowSleepImage, sleep);
swapImage(flowShowImage, show);
if (flowDayTitle) flowDayTitle.textContent = day.title;
if (flowDayCopy) flowDayCopy.textContent = day.copy;
if (flowSleepTitle) flowSleepTitle.textContent = sleep.title;
if (flowSleepCopy) flowSleepCopy.textContent = sleep.copy;
if (flowShowTitle) flowShowTitle.textContent = show.title;
if (flowShowCopy) flowShowCopy.textContent = show.copy;
if (flowShowBadge) flowShowBadge.textContent = show.badge;
renderPeople(state.people);

if (mapArrival) mapArrival.textContent = state.arrival;
if (mapSleep) mapSleep.textContent = state.sleep;
if (mapShow) mapShow.textContent = state.showshine;

Object.entries(previewCards).forEach(([key,card]) => {
if (!card) return;
const value = key === 'people' ? state.people : state[key];
card.dataset.value = value;
card.classList.add('is-active');
});

if (previousPreviewState) {
['arrival','sleep','people','showshine'].forEach(key => {
if (previousPreviewState[key] !== state[key]) animateSelection(key);
});
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