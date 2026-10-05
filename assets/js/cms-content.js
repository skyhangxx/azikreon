import { client, configured, readAll, collections, imageUrl } from './cms-client.js?v=20260915-security';
// Keep the original decorative HTML as the empty-state template, never as CMS data.
const reviewPlaceholder = document.querySelector('.reviews__track .review-placeholder[aria-hidden="true"]')?.cloneNode(true);
const node = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; if (text) el.textContent = text; return el; };
function photo(path, name, cls) {
  const img = node('img', cls); img.src = imageUrl(path); img.alt = name; img.loading = 'lazy'; img.decoding = 'async';
  // A failed individual upload must not collapse its reserved portrait space.
  img.addEventListener('error', () => { img.removeAttribute('src'); img.alt = `Фото: ${name}`; }, { once: true });
  return img;
}
export function teacherCard(record) {
  const card = node('article', 'teacher-card cms-teacher');
  card.dataset.contentId = record.id;
  const img = photo(record.image_path, record.name, 'teacher-card__portrait');
  img.style.objectPosition = record.image_path.endsWith('teacher-jaehyuk.webp') ? 'center 35%' : 'center 24%';
  card.append(img, node('h3', '', record.name), node('p', '', record.description));
  return card;
}
function openReview(record, trigger) {
  const dialog = node('dialog', 'cms-review-dialog');
  dialog.setAttribute('aria-label', `Отзыв: ${record.name}`);
  const close = node('button', 'cms-review-close', '×');
  close.type = 'button'; close.setAttribute('aria-label', 'Закрыть отзыв');
  const scroll = node('div', 'cms-review-dialog-scroll');
  scroll.tabIndex = 0;
  scroll.append(reviewCard(record, true));
  dialog.append(close, scroll);
  document.querySelector('.reviews').append(dialog);
  const previousOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
  close.onclick = () => dialog.close();
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { document.documentElement.style.overflow = previousOverflow; dialog.remove(); trigger.focus({ preventScroll: true }); }, { once: true });
  dialog.showModal(); close.focus();
}
export function reviewCard(record, full = false) {
  const card = node('article', 'review-placeholder cms-review'); card.dataset.contentId = record.id;
  const head = node('div', 'review-template__head');
  const avatar = node('div', 'review-template__avatar');
  if (record.image_path) {
    const img = photo(record.image_path, record.name, 'cms-review-avatar-image');
    img.addEventListener('error', () => img.remove(), { once: true });
    avatar.append(img);
  } else { avatar.setAttribute('role', 'img'); avatar.setAttribute('aria-label', 'Аватар не указан'); }
  const meta = node('div', 'review-template__meta'); meta.append(node('h4', '', record.name));
  if (record.location) meta.append(node('p', 'cms-review-location', record.location));
  const rating = Math.max(1, Math.min(5, Number(record.stars) || 1));
  const stars = node('div', 'review-template__rating', '★'.repeat(rating) + '☆'.repeat(5 - rating));
  stars.setAttribute('role', 'img'); stars.setAttribute('aria-label', `Оценка: ${rating} из 5`);
  head.append(avatar, meta, stars);
  const body = node('div', 'review-template__body');
  const quote = node('b', '', '“'); quote.setAttribute('aria-hidden', 'true');
  body.append(quote, node('p', 'cms-review-copy', record.description));
  card.append(head, body);
  if (!full) {
    card.classList.add('cms-review-preview');
    const more = node('button', 'cms-review-more', 'Раскрыть');
    more.type = 'button'; more.setAttribute('aria-haspopup', 'dialog');
    more.hidden = true; more.onclick = () => openReview(record, more);
    card.append(more);
  }
  return card;
}
let destroyReviews = null;
let destroyTeachers = null;
function teacherCarousel(track) {
  const wrapper = node('div', 'teachers-carousel');
  track.before(wrapper); wrapper.append(track);
  const controls = node('div', 'teachers-carousel-controls');
  const hint = node('div', 'teachers-swipe-hint', 'Листайте →');
  hint.setAttribute('aria-hidden', 'true');
  track.id = 'teachers-carousel-track';
  track.tabIndex = 0;
  track.after(controls);
  wrapper.append(hint);
  const buttons = [-1, 1].map(direction => {
    const button = node('button', 'teachers-carousel-arrow', direction < 0 ? '‹' : '›');
    button.type = 'button';
    button.setAttribute('aria-label', direction < 0 ? 'Предыдущие преподаватели' : 'Следующие преподаватели');
    button.setAttribute('aria-controls', track.id);
    button.onclick = () => {
      const positions = [...track.children].map(card => card.offsetLeft - track.firstElementChild.offsetLeft);
      const next = direction > 0 ? positions.find(x => x > track.scrollLeft + 2)
        : positions.reverse().find(x => x < track.scrollLeft - 2);
      track.scrollTo({ left: next ?? (direction > 0 ? track.scrollWidth : 0), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    };
    controls.append(button); return button;
  });
  const state = () => {
    const end = track.scrollWidth - track.clientWidth;
    controls.hidden = !matchMedia('(min-width: 641px)').matches || end < 2;
    hint.hidden = !matchMedia('(max-width: 640px)').matches || track.children.length < 2;
    if (track.scrollLeft > 2) hint.classList.add('is-dismissed');
    buttons[0].disabled = track.scrollLeft < 2;
    buttons[1].disabled = track.scrollLeft >= end - 2;
  };
  const canvas = document.createElement('canvas').getContext('2d');
  let disposed = false;
  const resize = () => {
    if (disposed) return;
    const mobile = matchMedia('(max-width: 640px)').matches;
    // Original desktop card: (1180px container - 38px gap) / 2.
    wrapper.classList.toggle('has-navigation', !mobile && track.children.length * 571 + (track.children.length - 1) * 38 > wrapper.clientWidth);
    const width = track.clientWidth;
    const cardWidth = mobile ? width : Math.min(571, width);
    track.classList.remove('is-compact');
    track.style.setProperty('--teacher-width', `${cardWidth}px`);
    track.querySelectorAll('h3').forEach(heading => {
      heading.style.removeProperty('font-size');
      const style = getComputedStyle(heading);
      canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const spacing = parseFloat(style.letterSpacing) || 0;
      const longest = Math.max(...heading.textContent.trim().split(/\s+/).map(word => canvas.measureText(word).width + spacing * word.length));
      if (longest > heading.clientWidth) heading.style.setProperty('font-size', `${parseFloat(style.fontSize) * heading.clientWidth / longest * .98}px`, 'important');
    });
    state();
  };
  const key = event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); buttons[event.key === 'ArrowLeft' ? 0 : 1].click(); }
  };
  track.addEventListener('scroll', state, { passive: true });
  track.addEventListener('keydown', key);
  window.addEventListener('resize', resize);
  const observer = new ResizeObserver(resize); observer.observe(track);
  resize(); document.fonts.ready.then(resize);
  return () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', resize); track.removeEventListener('scroll', state); track.removeEventListener('keydown', key); wrapper.replaceWith(track); track.removeAttribute('tabindex'); track.classList.remove('is-compact'); };
}
// Keep native touch scrolling; the first interaction hands control to the reader.
function driftReviews(track, cards, desktop) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0, last = 0, position = 0, visible = false, manual = false;
  track.classList.toggle('has-mobile-reviews', cards.length > 1);
  const tick = time => {
    frame = 0;
    if (desktop.matches || reduced.matches || manual || !visible || document.hidden || cards.length < 2) { last = 0; return; }
    if (last) {
      // Move the cards physically right, recycling an offscreen card at the left edge.
      if (position < 1) {
        const end = track.lastElementChild;
        const stride = end.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap);
        track.prepend(end);
        position += stride;
      }
      position -= Math.min(time - last, 50) * 0.018;
      track.scrollLeft = position;
      // Native scrolling may round to whole pixels. Preserve the fractional
      // remainder in the compositor so slow motion stays smooth on every frame.
      const remainder = track.scrollLeft - position;
      cards.forEach(card => { card.style.translate = `${remainder}px 0`; });
    } else position = track.scrollLeft;
    last = time;
    frame = requestAnimationFrame(tick);
  };
  const start = () => { if (!frame) frame = requestAnimationFrame(tick); };
  const clearOffset = () => cards.forEach(card => card.style.removeProperty('translate'));
  const stop = () => { manual = true; cancelAnimationFrame(frame); frame = 0; last = 0; clearOffset(); };
  const change = () => {
    if (desktop.matches) {
      clearOffset();
      cards.forEach(card => track.append(card));
      track.scrollLeft = 0;
    }
    last = 0; start();
  };
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start(); });
  observer.observe(track);
  for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'focusin']) track.addEventListener(event, stop, { passive: true });
  desktop.addEventListener('change', change);
  reduced.addEventListener('change', start);
  document.addEventListener('visibilitychange', start);
  return () => {
    stop(); observer.disconnect();
    for (const event of ['pointerdown', 'touchstart', 'wheel', 'keydown', 'focusin']) track.removeEventListener(event, stop);
    desktop.removeEventListener('change', change); reduced.removeEventListener('change', start);
    document.removeEventListener('visibilitychange', start);
    track.classList.remove('has-mobile-reviews');
  };
}
export function renderContent(kind, records) {
  const target = document.querySelector(kind === 'teachers' ? '.teachers__grid' : '.reviews__track');
  if (!target) return;
  if (kind === 'teachers') { destroyTeachers?.(); destroyTeachers = null; }
  if (kind === 'reviews') {
    destroyReviews?.();
    window.akizDestroyReviewCarousel?.(); window.akizDestroyReviewCarousel = null;
  }
  target.classList.add(kind === 'teachers' ? 'cms-teachers' : 'cms-reviews');
  target.setAttribute('aria-label', collections[kind].title);
  target.replaceChildren(...records.map(record => kind === 'teachers' ? teacherCard(record) : reviewCard(record)));
  if (!records.length) {
    if (kind === 'reviews' && reviewPlaceholder) {
      const wrapper = node('div', 'reviews-carousel cms-reviews-carousel');
      const viewport = node('div', 'reviews-carousel__viewport');
      target.before(wrapper); wrapper.append(viewport); viewport.append(target);
      target.style.setProperty('--review-width', 'min(480px, 100%)');
      for (let i = 0; i < 3; i++) {
        const card = reviewPlaceholder.cloneNode(true);
        card.removeAttribute('style');
        card.classList.remove('reveal', 'reveal--up');
        card.classList.add('cms-review', 'is-revealed');
        target.append(card);
      }
      target.removeAttribute('tabindex');
      destroyReviews = () => { wrapper.replaceWith(target); destroyReviews = null; };
      return;
    }
    target.append(node('p', 'cms-content-empty', kind === 'teachers' ? 'Информация о преподавателях скоро появится.' : 'Отзывы скоро появятся.'));
  } else if (kind === 'teachers') {
    target.scrollLeft = 0;
    destroyTeachers = teacherCarousel(target);
  } else if (kind === 'reviews') {
    const wrapper = node('div', 'reviews-carousel cms-reviews-carousel');
    const viewport = node('div', 'reviews-carousel__viewport');
    target.before(wrapper); wrapper.append(viewport); viewport.append(target);
    const cards = [...target.children];
    const controls = [];
    const desktop = matchMedia('(min-width: 641px)');
    const update = () => {
      wrapper.classList.toggle('has-review-navigation', desktop.matches && cards.length > 3);
      target.style.setProperty('--review-width', `${Math.min(480, target.clientWidth)}px`);
      for (const part of ['name', 'location', 'head']) target.style.removeProperty(`--review-${part}-height`);
      const nameHeight = Math.max(...cards.map(card => card.querySelector('h4').offsetHeight));
      const locationHeight = Math.max(...cards.map(card => card.querySelector('.cms-review-location')?.offsetHeight || 0));
      target.style.setProperty('--review-name-height', `${nameHeight}px`);
      target.style.setProperty('--review-location-height', `${locationHeight}px`);
      const headHeight = Math.max(...cards.map(card => card.querySelector('.review-template__head').offsetHeight));
      target.style.setProperty('--review-head-height', `${headHeight}px`);
      cards.forEach(card => {
        card.style.height = 'auto';
        const copy = card.querySelector('.cms-review-copy');
        card.querySelector('.cms-review-more').hidden = copy.scrollHeight > copy.clientHeight + 1 ? false : true;
      });
      const height = Math.max(...cards.map(card => card.offsetHeight));
      cards.forEach(card => { card.style.height = `${height}px`; });
      navigation();

    };
    for (const direction of [-1, 1]) {
      const button = node('button', `reviews-carousel__arrow reviews-carousel__arrow--${direction < 0 ? 'prev' : 'next'}`, direction < 0 ? '\u2039' : '\u203a');
      button.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${direction < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
      button.type = 'button'; button.setAttribute('aria-label', direction < 0 ? '\u041f\u0440\u0435\u0434\u044b\u0434\u0443\u0449\u0438\u0439 \u043e\u0442\u0437\u044b\u0432' : '\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u043e\u0442\u0437\u044b\u0432');
      target.id = 'reviews-carousel-track'; button.setAttribute('aria-controls', target.id);
      button.onclick = () => target.scrollBy({ left: direction * (cards[0].offsetWidth + 24), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
      wrapper.append(button); controls.push(button);
    }
    const navigation = () => controls.forEach((button, index) => {
      button.hidden = !desktop.matches || cards.length <= 3;
      button.disabled = index === 0 ? target.scrollLeft < 2 : target.scrollLeft >= target.scrollWidth - target.clientWidth - 2;
    });
    target.addEventListener('scroll', navigation, { passive: true });
    target.tabIndex = 0;
    const key = event => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); controls[event.key === 'ArrowLeft' ? 0 : 1].click(); } };
    target.addEventListener('keydown', key);
    const observer = new ResizeObserver(update); cards.forEach(card => observer.observe(card)); observer.observe(target);
    desktop.addEventListener('change', update); update();
    const stopDrift = driftReviews(target, cards, desktop);
    destroyReviews = () => { stopDrift(); observer.disconnect(); desktop.removeEventListener('change', update); target.removeEventListener('keydown', key); target.removeEventListener('scroll', navigation); target.style.height = ''; target.classList.remove('cms-reviews-orbit'); wrapper.replaceWith(target); destroyReviews = null; };

  }
}
async function start() {
  try {
    if (!configured()) return;
    const api = await client();
    await Promise.allSettled(Object.entries(collections).map(async ([kind, { table }]) => {
      const target = document.querySelector(kind === 'teachers' ? '.teachers__grid' : '.reviews__track');
      if (!target) return;
      target.setAttribute('aria-busy', 'true');
      try {
        const records = await readAll(api, table, true);
        renderContent(kind, records);
      } catch { target.dataset.cmsLoad = 'unavailable'; }
      finally { target.removeAttribute('aria-busy'); }
    }));
  } catch { /* Keep the existing HTML when public configuration is missing or invalid. */ }
}
start();
