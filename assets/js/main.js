'use strict';

document.querySelectorAll('[data-current-year]').forEach((element) => {
  element.textContent = new Date().getFullYear();
});

const menuButton = document.querySelector('[data-menu-toggle]');
const menu = document.querySelector('[data-menu]');

if (menuButton && menu) {
  const closeMenu = () => {
    menuButton.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
  };
  menuButton.addEventListener('click', () => {
    const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
    menuButton.setAttribute('aria-expanded', String(!isOpen));
    menu.classList.toggle('is-open', !isOpen);
  });
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
}

const header = document.querySelector('[data-header]');
if (header && 'IntersectionObserver' in window) {
  const sentinel = document.createElement('span');
  sentinel.className = 'header-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  document.body.prepend(sentinel);
  const headerObserver = new IntersectionObserver(([entry]) => header.classList.toggle('is-scrolled', !entry.isIntersecting));
  headerObserver.observe(sentinel);
}

window.akizTrack = (eventName, detail = {}) => {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...detail });
  document.dispatchEvent(new CustomEvent('akiz:analytics', { detail: { event: eventName, ...detail } }));
};

document.querySelectorAll('[data-analytics]').forEach((element) => {
  element.addEventListener('click', () => window.akizTrack(element.dataset.analytics));
});

const application = document.querySelector('[data-application]');
if (application && 'IntersectionObserver' in window) {
  const applicationObserver = new IntersectionObserver(([entry], observer) => {
    if (!entry.isIntersecting) return;
    window.akizTrack('application_view');
    observer.disconnect();
  }, { threshold: 0.35 });
  applicationObserver.observe(application);
}

const currentUrl = new URL(window.location.href);
currentUrl.searchParams.forEach((value, key) => {
  if (key.startsWith('utm_') && value && !sessionStorage.getItem(`akiz_${key}`)) sessionStorage.setItem(`akiz_${key}`, value);
});

const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const prefersReducedMotion = motionPreference.matches;

document.querySelectorAll('[data-application-source]').forEach((link) => {
  link.addEventListener('click', () => {
    sessionStorage.setItem('akiz_application_source', link.dataset.applicationSource);
  });
});

if (!prefersReducedMotion) {
  document.documentElement.classList.add('motion-ready');

  const revealGroups = [
    { selector: '.audience .section-title, .learning .section-title, .learning .section-subtitle, .teachers .section-title', className: 'reveal--up' },
    { selector: '.audience-card, .step-card, .outcome-card, .teacher-card, .review-placeholder', className: 'reveal--up', stagger: 90 },
    { selector: '.step-connector', className: 'reveal--scale', stagger: 160 },
    { selector: '.solution, .learning-cta, .reviews__heading', className: 'reveal--scale' },
    { selector: '.application__grid', className: 'reveal--section' },
    { selector: '.site-footer__grid > *', className: 'reveal--up', stagger: 65 }
  ];
  const revealElements = new Set();

  revealGroups.forEach(({ selector, className, stagger = 0 }) => {
    const siblingCounts = new Map();
    document.querySelectorAll(selector).forEach((element) => {
      const index = siblingCounts.get(element.parentElement) || 0;
      siblingCounts.set(element.parentElement, index + 1);
      element.classList.add('reveal', className);
      element.style.setProperty('--reveal-delay', `${Math.min(index * stagger, 180)}ms`);
      revealElements.add(element);
    });
  });

  const showElement = (element, immediate = false) => {
    if (immediate) element.style.setProperty('--reveal-delay', '0ms');
    element.classList.add('is-visible');
    if (element.classList.contains('application__grid')) {
      element.closest('.application')?.classList.add('is-revealed');
    }
  };

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        showElement(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -24px 0px' });

    revealElements.forEach((element) => revealObserver.observe(element));
  } else {
    revealElements.forEach((element) => showElement(element, true));
  }

  // Keyboard navigation must never land inside an invisible section.
  document.addEventListener('focusin', ({ target }) => {
    for (let element = target; element; element = element.parentElement) {
      if (revealElements.has(element)) showElement(element, true);
    }
  });
  motionPreference.addEventListener('change', ({ matches }) => {
    if (!matches) return;
    revealElements.forEach((element) => showElement(element, true));
    document.documentElement.classList.remove('motion-ready');
  });
}

// Suspend decorative loops when the tab is hidden, resuming at the same frame.
const syncMotionVisibility = () => {
  document.documentElement.classList.toggle('motion-paused', document.hidden);
};
document.addEventListener('visibilitychange', syncMotionVisibility);
syncMotionVisibility();
/* Loop the current review placeholders until real reviews are supplied. */
(() => {
  const track = document.querySelector('.reviews__track');
  if (!track || track.children.length < 2) return;
  const carousel = document.createElement('div');
  carousel.className = 'reviews-carousel';
  const viewport = document.createElement('div');
  viewport.className = 'reviews-carousel__viewport';
  track.before(carousel);
  carousel.append(viewport);
  viewport.append(track);
  track.id = 'reviews-carousel-track';
  const originals = [...track.children];
  for (let repeat = 0; repeat < 2; repeat++) {
    originals.forEach(card => track.append(card.cloneNode(true)));
  }
  const cards = [...track.children];
  cards.forEach(card => {
    card.classList.remove('reveal', 'reveal--up');
    card.classList.add('is-revealed');
  });
  let turn = 0;
  let moving = false;
  function pose(index, rotation) {
    const degrees = ((index - 1) * 40 + rotation + 540) % 360 - 180;
    const angle = degrees * Math.PI / 180;
    const depth = Math.cos(angle);
    const cardWidth = cards[0].offsetWidth;
    const radius = (cardWidth + 36) / Math.sin(40 * Math.PI / 180);
    const x = Math.sin(angle) * radius;
    const visible = Math.max(0, Math.min(1, (60 - Math.abs(degrees)) / 8));
    return {
      transform: `translateX(calc(-50% + ${x}px)) translateY(${(1 - depth) * -65}px) scale(${1 - (1 - depth) * .22})`,
      opacity: String(visible),
      zIndex: String(Math.round((depth + 1) * 100))
    };
  }
  function render() {
    cards.forEach((card, index) => Object.assign(card.style, pose(index, turn)));
  }
  render();
  const observer = new ResizeObserver(() => { if (!moving) render(); });
  observer.observe(track);
  window.akizDestroyReviewCarousel = () => {
    observer.disconnect();
    carousel.replaceWith(track);
  };
  async function move(direction) {
    if (moving) return;
    moving = true;
    const next = turn - direction * 40;
    const animations = cards.map((card, index) => card.animate(
      Array.from({ length: 41 }, (_, frame) => ({ ...pose(index, turn + (next - turn) * frame / 40), offset: frame / 40 })),
      { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 900, easing: 'ease-in-out', fill: 'forwards' }
    ));
    await Promise.all(animations.map(animation => animation.finished));
    turn = next % 360;
    render();
    animations.forEach(animation => animation.cancel());
    moving = false;
  }
  for (const direction of [-1, 1]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `reviews-carousel__arrow reviews-carousel__arrow--${direction < 0 ? 'prev' : 'next'}`;
    button.setAttribute('aria-label', direction < 0 ? 'Предыдущий отзыв' : 'Следующий отзыв');
    button.setAttribute('aria-controls', track.id);
    button.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="${direction < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
    button.addEventListener('click', () => move(direction));
    carousel.append(button);
  }
})();

// Separate from the original falling petals: scroll gives this edge layer momentum.
(() => {
  if (!document.querySelector('.petal-field')) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const layer = document.createElement('div');
  layer.className = 'scroll-petals';
  layer.setAttribute('aria-hidden', 'true');
  const random = (min, max) => min + Math.random() * (max - min);
  const petals = Array.from({ length: 18 }, (_, index) => {
    const element = document.createElement('i');
    const edge = index % 3;
    element.style.left = `${edge === 0 ? random(1, 8) : edge === 1 ? random(90, 97) : random(6, 94)}%`;
    const top = edge === 2 ? random(87, 96) : random(14, 87);
    element.style.top = `${top}%`;
    element.style.setProperty('--petal-size', `${random(25, 38)}px`);
    layer.append(element);
    return { element, top, x: 0, y: 0, vx: 0, vy: 0, angle: random(0, 360), spin: random(-10, 10), phase: random(0, Math.PI * 2), rate: random(.7, 1.2) };
  });
  document.body.append(layer);
  let previousY = scrollY;
  let lastScroll = -Infinity;
  let lastFrame = 0;
  let frame = 0;
  let impulse = 0;
  let direction = 1;
  const render = now => {
    const dt = Math.min((now - lastFrame) / 1000 || .016, .04);
    lastFrame = now;
    const age = now - lastScroll;
    const active = age < 220;
    layer.classList.toggle('is-scrolling', active);
    const energy = active ? 1 : Math.max(0, 1 - (age - 220) / 1000);
    for (const p of petals) {
      const time = now / 1000 * p.rate + p.phase;
      p.vx += (Math.sin(time) * 12 * energy - p.x * .8 - p.vx * 2.4) * dt;
      // Scroll direction drives vertical velocity; drag preserves a gentle coast.
      const targetSpeed = active ? direction * (24 + Math.abs(impulse) * .55) * p.rate : 0;
      p.vy += (targetSpeed - p.vy) * (active ? 5 : 1.8) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const screenY = innerHeight * p.top / 100 + p.y;
      if (screenY > innerHeight + 60) p.y -= innerHeight + 120;
      if (screenY < -60) p.y += innerHeight + 120;
      p.angle += (p.spin + Math.sin(time) * 6) * energy * dt;
      p.element.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.angle}deg)`;
    }
    impulse *= Math.exp(-dt * 4);
    frame = age < 1300 ? requestAnimationFrame(render) : 0;
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    lastScroll = -Infinity;
    impulse = 0;
    previousY = scrollY;
    layer.classList.remove('is-scrolling');
  };
  window.addEventListener('scroll', () => {
    const delta = scrollY - previousY;
    previousY = scrollY;
    if (!delta || reducedMotion.matches || document.hidden) return;
    direction = Math.sign(delta);
    impulse = Math.min(90, Math.abs(impulse) + Math.abs(delta) * .4);
    lastScroll = performance.now();
    layer.classList.add('is-scrolling');
    if (!frame) {
      lastFrame = lastScroll;
      frame = requestAnimationFrame(render);
    }
  }, { passive: true });
  reducedMotion.addEventListener('change', stop);
  document.addEventListener('visibilitychange', stop);
  window.addEventListener('pagehide', stop);
})();
