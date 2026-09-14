'use strict';

// Shared navigation/footer for the routes specified in the structure document.
(() => {
  const brand = '<img class="brand__image" src="/assets/images/current/logo-header.webp" width="142" height="49" alt="AKIZ Lingua">';
  document.querySelectorAll('[data-shared-header]').forEach((header) => {
    const home = header.hasAttribute('data-home-header');
    header.className = 'site-header';
    header.setAttribute('data-header', '');
    header.innerHTML = `<div class="container site-header__inner">
      <a class="brand" href="/" aria-label="AKIZ Lingua, на главную">${brand}</a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-navigation" data-menu-toggle>
        <span class="menu-toggle__line" aria-hidden="true"></span><span class="menu-toggle__line" aria-hidden="true"></span><span class="menu-toggle__line" aria-hidden="true"></span><span class="menu-toggle__label">Меню</span>
      </button>
      <nav class="site-nav" id="main-navigation" aria-label="Основная навигация" data-menu>
        <ul class="site-nav__list"><li><a href="/#learning">Система обучения</a></li><li><a href="/#teachers">Носители</a></li><li><a href="/#reviews">Отзывы</a></li></ul>
        ${home ? '<a class="button button--header" href="/application" data-application-source="website_direct" data-analytics="click_more_hero">Узнать больше</a>' : ''}
      </nav></div>`;
  });
  document.querySelectorAll('[data-shared-footer]').forEach((footer) => {
    footer.className = 'site-footer';
    footer.innerHTML = `<div class="container site-footer__grid">
      <nav aria-label="Навигация в подвале"><h2>Навигация</h2><a href="/#learning">Система обучения</a><a href="/#teachers">Преподаватели-носители</a><a href="/#reviews">Отзывы</a></nav>
      <div class="site-footer__legal"><h2>Документы</h2><a href="/privacy/">Политика конфиденциальности</a><a href="/personal-data/">Согласие на обработку персональных данных</a><a href="/agreement/">Пользовательское соглашение</a><a href="/offer/">Публичная оферта</a><a href="/rules/">Правила занятий</a></div>
      <div class="site-footer__contact"><h2>Контакты</h2><a href="mailto:akizkoreanlinguasupport@gmail.com">akizkoreanlinguasupport@gmail.com</a></div>
      <div class="site-footer__details"><span><img src="/assets/images/footer-icon-business.webp" alt="" aria-hidden="true">ИП Золкина А. И.</span><span><img src="/assets/images/footer-icon-shield.webp" alt="" aria-hidden="true">ИНН 614331287097</span><span><img src="/assets/images/footer-icon-document.webp" alt="" aria-hidden="true">ОГРНИП 326930100006242</span></div>
    </div>`;
  });
  document.querySelectorAll('.brand').forEach(element => { element.innerHTML = brand; });
})();
