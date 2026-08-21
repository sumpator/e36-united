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

  /* Lightbox (gallery pages) */
  const lightbox = qs('.lightbox');
  const lightboxImg = lightbox?.querySelector('img');
  const closeLightbox = () => {
    lightbox?.classList.remove('open');
    if (lightboxImg) lightboxImg.src = '';
  };
  qsa('[data-lightbox]').forEach(item => {
    item.addEventListener('click', () => {
      if (!lightbox || !lightboxImg) return;
      const img = item.querySelector('img');
      lightboxImg.src = item.dataset.full || img?.src || '';
      lightboxImg.alt = img?.alt || '';
      lightbox.classList.add('open');
    });
  });
  lightbox?.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
  lightbox?.querySelector('.lightbox-close')?.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });

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

  /* Show & Shine inspection lab */
  const lab = qs('[data-inspection-lab]');
  if (lab) {
    const stage = qs('[data-inspection-stage]', lab);
    const controls = qsa('[data-inspection]', lab);
    const detailImg = qs('[data-detail-image]', lab);
    const label = qs('[data-inspection-label]', lab);
    const scale = qs('[data-inspection-scale]', lab);
    const title = qs('[data-inspection-title]', lab);
    const copy = qs('[data-inspection-copy]', lab);
    const kicker = qs('[data-inspection-kicker]', lab);
    let revealTimer = null;
    let active = 'overview';

    const images = {
      interior: 'https://static.wixstatic.com/media/595239_0e42058f637746259c66bd9bdd6078a2~mv2.jpg/v1/fill/w_1500%2Ch_900%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/595239_0e42058f637746259c66bd9bdd6078a2~mv2.jpg',
      paint: 'https://static.wixstatic.com/media/595239_66d3b284aeb24f1d9c03ea7e02788bbd~mv2.jpg/v1/fill/w_1500%2Ch_900%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/595239_66d3b284aeb24f1d9c03ea7e02788bbd~mv2.jpg',
      wheels: 'https://static.wixstatic.com/media/595239_b09af4c86a2941aa85ead8f0fcb36c96~mv2.png/v1/fill/w_1500%2Ch_900%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/595239_b09af4c86a2941aa85ead8f0fcb36c96~mv2.png',
      engine: 'https://static.wixstatic.com/media/595239_8684980d5e464c5aabe8816c9639ed31~mv2.jpg/v1/fill/w_1500%2Ch_1000%2Cal_c%2Cq_90%2Cenc_avif%2Cquality_auto/595239_8684980d5e464c5aabe8816c9639ed31~mv2.jpg'
    };

    const data = {
      overview: { label:'CELÉ AUTO', scale:'1.0×', zoom:[1,0,0], title:'Začni celkem. Pak řeš detaily.', copy:'Vyber vlevo část auta. Pohled se nejdřív přiblíží na konkrétní zónu a potom ukáže detail hodnocení.', kicker:'SHOW & SHINE VIEW', detail:null },
      exterior: { label:'EXTERIÉR', scale:'1.35×', zoom:[1.35,0,1], title:'Karoserie musí fungovat jako celek.', copy:'Spasování, koroze, originalita dílů a celkový dojem. Tady se často pozná, kolik práce je za autem schované.', kicker:'01 / EXTERIÉR', detail:null },
      interior: { label:'INTERIÉR', scale:'2.0×', zoom:[2.0,-3,8], title:'Dveře se otevřou a začíná druhá půlka auta.', copy:'Čistota, originalita, materiály, čalounění, prvky výbavy a stav. Interiér umí dobré auto posunout — i shodit.', kicker:'02 / INTERIÉR', detail:images.interior },
      paint: { label:'LAK', scale:'2.25×', zoom:[2.25,12,3], title:'Lak neokecáš.', copy:'Provedení lakování, originalita barvy, původní lak a stav. Pod světlem je vidět všechno.', kicker:'03 / LAKOVÁNÍ', detail:images.paint },
      wheels: { label:'KOLA', scale:'2.45×', zoom:[2.45,-22,16], title:'Kola jsou detail, který mění celé auto.', copy:'Volba, vzhled, stav, lak, leštění, čistota i poškození. Porota řeší celek i drobnosti.', kicker:'04 / KOLA', detail:images.wheels },
      engine: { label:'MOTOR', scale:'2.1×', zoom:[2.1,22,-15], title:'Kapota nahoru.', copy:'Vzhled motorového prostoru, čistota, provedení, originalita a úpravy. Funkce nestačí — tady se hodnotí i prezentace.', kicker:'05 / MOTOR', detail:images.engine }
    };

    Object.values(images).forEach(src => { const img = new Image(); img.src = src; });

    const setInspection = mode => {
      if (!data[mode] || !stage) return;
      active = mode;
      const item = data[mode];
      clearTimeout(revealTimer);
      stage.classList.remove('is-detail');
      stage.classList.toggle('is-zooming', mode !== 'overview');
      stage.style.setProperty('--zoom-scale', item.zoom[0]);
      stage.style.setProperty('--zoom-x', `${item.zoom[1]}%`);
      stage.style.setProperty('--zoom-y', `${item.zoom[2]}%`);
      if (label) label.textContent = item.label;
      if (scale) scale.textContent = item.scale;
      if (title) title.textContent = item.title;
      if (copy) copy.textContent = item.copy;
      if (kicker) kicker.textContent = item.kicker;
      controls.forEach(control => {
        const selected = control.dataset.inspection === mode;
        control.classList.toggle('is-active', selected);
        control.setAttribute('aria-selected', String(selected));
      });
      if (item.detail && detailImg) {
        revealTimer = setTimeout(() => {
          if (active !== mode) return;
          detailImg.src = item.detail;
          detailImg.alt = `BMW E36 – ${item.label.toLowerCase()}`;
          stage.classList.add('is-detail');
        }, reduceMotion ? 0 : 470);
      }
    };

    controls.forEach(control => {
      const mode = control.dataset.inspection;
      control.addEventListener('mouseenter', () => setInspection(mode));
      control.addEventListener('focus', () => setInspection(mode));
      control.addEventListener('click', () => setInspection(mode));
    });

    // Return to overview only when pointer leaves the whole laboratory.
    lab.addEventListener('mouseleave', () => {
      if (window.matchMedia('(pointer:fine)').matches) setInspection('overview');
    });
  }

  /* Decorative body-category selection */
  qsa('.body-chip').forEach(chip => chip.addEventListener('click', () => {
    qsa('.body-chip').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
  }));

  /* Weekend Builder */
  const planner = qs('[data-planner]');
  if (planner) {
    const state = { arrival:'Pátek', sleep:'Chatka', people:2, showshine:'Jedu se podívat' };
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

    const slug = (value, fallback) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z]/g,'').slice(0,2).toUpperCase() || fallback;
    const updatePlanner = () => {
      if (peopleEl) peopleEl.textContent = state.people;
      if (peopleLabel) peopleLabel.textContent = state.people === 1 ? 'osoba' : (state.people >= 2 && state.people <= 4 ? 'osoby' : 'osob');
      if (summaryArrival) summaryArrival.textContent = state.arrival;
      if (summarySleep) summarySleep.textContent = state.sleep;
      if (summaryPeople) summaryPeople.textContent = state.people;
      if (summaryPeopleLabel) summaryPeopleLabel.textContent = state.people === 1 ? 'osoba' : (state.people >= 2 && state.people <= 4 ? 'osoby' : 'osob');
      if (summaryShow) summaryShow.textContent = state.showshine;
      if (code) code.textContent = `U36–${slug(state.arrival,'P')}${slug(state.sleep,'CH')}–${String(state.people).padStart(2,'0')}`;
      if (mail) {
        const subject = 'E36 United – zájem / rezervace ubytování';
        const body = [
          'Ahoj E36 United,',
          '',
          'mám zájem o další E36 United a rád/a bych ověřil/a možnosti podle této konfigurace:',
          `• Příjezd: ${state.arrival}`,
          `• Ubytování: ${state.sleep}`,
          `• Počet lidí: ${state.people}`,
          `• Show & Shine: ${state.showshine}`,
          '',
          'Prosím o informaci k termínu a dostupnosti.',
          '',
          'Díky!'
        ].join('\n');
        mail.href = `mailto:united@e36united.cz?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }
    };

    groups.forEach(group => {
      qsa('.choice', group).forEach(choice => choice.addEventListener('click', () => {
        qsa('.choice', group).forEach(c => c.classList.remove('is-active'));
        choice.classList.add('is-active');
        const key = group.dataset.choiceGroup;
        if (key) state[key] = choice.dataset.value;
        updatePlanner();
      }));
    });
    qs('[data-people-minus]', planner)?.addEventListener('click', () => { state.people = Math.max(1, state.people - 1); updatePlanner(); });
    qs('[data-people-plus]', planner)?.addEventListener('click', () => { state.people = Math.min(8, state.people + 1); updatePlanner(); });
    updatePlanner();
  }

  /* Keep only one FAQ card open at a time */
  const details = qsa('.info-card');
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
