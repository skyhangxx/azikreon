import { client, configured, collections, imageUrl, unwrap, readAll, uploadImage, validateImage, validateRecord, cleanupMedia, errorMessage } from './cms-client.js';

const $ = selector => document.querySelector(selector);
const login = $('#cms-login'), panel = $('#cms-panel'), dialog = $('#editor');
const form = $('#editor-form'), fields = form.elements;
let api, kind = 'teachers', rows = [], editing = null, saving = false, dirty = false;
let previewUrl = '', selectedFile = null, uploadedPath = '', authorized = false, loadVersion = 0, accessVersion = 0;
const status = message => { $('#cms-status').textContent = message; };
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
function revokePreview() { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; }
function lock() {
  authorized = false; ++loadVersion; ++accessVersion; rows = []; panel.hidden = true; login.hidden = false;
  $('#cms-list').replaceChildren(); if (dialog.open) dialog.close(); revokePreview();
}
async function checkAccess(session) {
  if (!session) { lock(); return; }
  const version = ++accessVersion;
  try {
    const { user } = unwrap(await api.auth.getUser());
    const isAdmin = unwrap(await api.rpc('cms_is_admin'));
    if (version !== accessVersion) return;
    if (!isAdmin) { lock(); $('#login-error').textContent = 'У этой учётной записи нет прав администратора.'; return; }
    const first = !authorized;
    authorized = true; login.hidden = true; panel.hidden = false;
    $('#cms-account').textContent = user.email;
    if (first) { status(''); await load(); await clean(false); }
  } catch (error) { if (version === accessVersion) { lock(); $('#login-error').textContent = errorMessage(error); } }
}
async function handleError(error, target = '#editor-error') {
  $(target).textContent = errorMessage(error);
  if (error?.status === 401 || error?.code === 'PGRST301' || error?.code === 'refresh_token_not_found') {
    lock(); $('#login-error').textContent = 'Сессия истекла. Войдите снова.';
  }
}
async function load() {
  const version = ++loadVersion, currentKind = kind;
  $('#list-status').textContent = 'Загружаем…';
  try {
    const next = await readAll(api, collections[currentKind].table);
    if (version !== loadVersion || !authorized) return;
    rows = next; render();
    $('#list-status').textContent = rows.length ? `Записей: ${rows.length}` : currentKind === 'teachers' ? 'Пока нет преподавателей.' : 'Пока нет отзывов. Добавьте первый настоящий отзыв.';
  } catch (error) { if (version === loadVersion) await handleError(error, '#list-status'); }
}
function render() {
  $('#cms-list').replaceChildren(...rows.map(record => {
    const card = el('article', '', 'cms-record');
    const img = el('img'); img.src = imageUrl(record.image_path); img.alt = record.name; img.loading = 'lazy';
    const header = el('div'); header.append(el('h3', record.name), el('p', `${record.is_published ? 'Опубликован' : 'Скрыт'} · Порядок: ${record.sort_order}`));
    if (kind === 'reviews') header.append(el('p', record.location), el('p', '★'.repeat(record.stars)));
    const actions = el('div', '', 'cms-actions');
    const edit = el('button', 'Редактировать', 'cms-secondary'); edit.type = 'button'; edit.onclick = () => openEditor(record);
    const remove = el('button', 'Удалить', 'cms-delete'); remove.type = 'button'; remove.onclick = () => deleteRecord(record, remove);
    actions.append(edit, remove); card.append(img, header, el('p', record.description), actions); return card;
  }));
}
function openEditor(record = null) {
  if (!authorized) return;
  editing = record ? { ...record } : { id: crypto.randomUUID() };
  form.reset(); ++fileVersion; selectedFile = null; uploadedPath = ''; dirty = false; revokePreview();
  $('#save-record').disabled = false;
  $('#editor-error').textContent = '';
  $('#editor-title').textContent = `${record ? 'Редактировать' : 'Добавить'} ${collections[kind].singular}`;
  const review = kind === 'reviews';
  $('#image-label').textContent = review ? 'Аватарка' : 'Фотография';
  $('#description-label').textContent = review ? 'Текст отзыва' : 'Описание преподавателя';
  for (const name of ['location', 'stars']) { fields[name].disabled = !review; fields[name].required = review; $(`#${name}-field`).hidden = !review; }
  for (const name of ['name', 'description', 'location', 'stars', 'sort_order']) fields[name].value = record?.[name] ?? (name === 'sort_order' ? 0 : '');
  fields.is_published.checked = record?.is_published ?? true;
  fields.image.required = !record?.image_path;
  const preview = $('#image-preview'); preview.hidden = !record?.image_path;
  if (record?.image_path) preview.src = imageUrl(record.image_path); else preview.removeAttribute('src');
  $('#editor-meta').textContent = record ? `ID: ${record.id} · Создан: ${new Date(record.created_at).toLocaleString('ru')} · Обновлён: ${new Date(record.updated_at).toLocaleString('ru')}` : '';
  dialog.showModal(); fields.name.focus();
}
function closeEditor() { if (!saving && (!dirty || confirm('Закрыть без сохранения изменений?'))) { dialog.close(); revokePreview(); } }
dialog.addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
$('#close-editor').onclick = closeEditor;
form.addEventListener('input', () => { dirty = true; });
window.addEventListener('beforeunload', event => { if (dialog.open && dirty) { event.preventDefault(); event.returnValue = ''; } });
let fileVersion = 0;
fields.image.addEventListener('change', async () => {
  const version = ++fileVersion;
  selectedFile = null; uploadedPath = ''; $('#editor-error').textContent = '';
  const file = fields.image.files[0];
  if (!file) return;
  $('#save-record').disabled = true;
  try {
    await validateImage(file);
    if (version !== fileVersion) return;
    selectedFile = file; revokePreview(); previewUrl = URL.createObjectURL(file);
    $('#image-preview').src = previewUrl; $('#image-preview').hidden = false;
  } catch (error) { fields.image.value = ''; await handleError(error); }
  finally { if (version === fileVersion) $('#save-record').disabled = false; }
});
form.addEventListener('submit', async event => {
  event.preventDefault(); if (saving || !authorized || $('#save-record').disabled || !form.reportValidity()) return;
  saving = true; $('#editor-fields').disabled = true; $('#save-record').disabled = true;
  $('#save-record').textContent = 'Сохраняем…'; $('#editor-error').textContent = ''; $('#close-editor').disabled = true;
  const currentKind = kind;
  try {
    const record = { name: fields.name.value.trim(), description: fields.description.value.trim(), sort_order: Number(fields.sort_order.value), is_published: fields.is_published.checked,
      image_path: uploadedPath || editing.image_path || (selectedFile ? `${kind}/${editing.id}.png` : '') };
    if (kind === 'reviews') Object.assign(record, { location: fields.location.value.trim(), stars: Number(fields.stars.value) });
    validateRecord(kind, record);
    if (selectedFile && !uploadedPath) uploadedPath = await uploadImage(api, kind, selectedFile);
    record.image_path = uploadedPath || editing.image_path;
    const table = api.from(collections[kind].table);
    const query = editing.updated_at
      ? table.update(record).eq('id', editing.id).eq('updated_at', editing.updated_at)
      : table.upsert({ ...record, id: editing.id });
    unwrap(await query.select().single());
    dirty = false; dialog.close(); revokePreview(); status('Сохранено. Опубликованные изменения появятся на сайте при следующей загрузке страницы.');
    if (kind === currentKind) await load();
    await clean(false);
  } catch (error) { await handleError(error); }
  finally { saving = false; $('#editor-fields').disabled = false; $('#save-record').disabled = false; $('#save-record').textContent = 'Сохранить'; $('#close-editor').disabled = false; }
});
async function deleteRecord(record, button) {
  if (!confirm(`Удалить «${record.name}»? Запись исчезнет с сайта. Это действие нельзя отменить.`)) return;
  button.disabled = true;
  try {
    unwrap(await api.from(collections[kind].table).delete().eq('id', record.id).eq('updated_at', record.updated_at).select().single());
    status('Запись удалена.'); await load(); await clean(false);
  } catch (error) { await handleError(error, '#list-status'); }
  finally { button.disabled = false; }
}
let cleaning = false;
async function clean(manual) {
  if (cleaning) return;
  cleaning = true; $('#cleanup').disabled = true;
  try { const count = await cleanupMedia(api); if (manual) status(`Очистка завершена. Удалено файлов: ${count}. Новые файлы защищены в течение часа.`); }
  catch (error) { status(`Очистка фото не выполнена. Повторите её позже. ${errorMessage(error)}`); }
  finally { cleaning = false; $('#cleanup').disabled = false; }
}
$('#add-record').onclick = () => openEditor();
$('#refresh').onclick = load;
$('#cleanup').onclick = () => clean(true);
document.querySelectorAll('[data-kind]').forEach(button => button.onclick = () => {
  kind = button.dataset.kind; rows = []; render();
  document.querySelectorAll('[data-kind]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === button)));
  $('#collection-title').textContent = collections[kind].title; $('#add-record').textContent = `+ Добавить ${collections[kind].singular}`; load();
});
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.currentTarget.querySelector('button'); if (button.disabled) return;
  button.disabled = true; button.textContent = 'Входим…'; $('#login-error').textContent = '';
  try {
    const { session } = unwrap(await api.auth.signInWithPassword({ email: event.currentTarget.elements.email.value.trim(), password: event.currentTarget.elements.password.value }));
    $('#login-form').elements.password.value = ''; await checkAccess(session);
  } catch (error) { $('#login-error').textContent = errorMessage(error); }
  finally { button.disabled = false; button.textContent = 'Войти'; }
});
$('#logout').onclick = async () => {
  try { unwrap(await api.auth.signOut({ scope: 'local' })); lock(); status('Вы вышли из админ-панели.'); }
  catch (error) { status(errorMessage(error)); }
};
try {
  if (!configured()) status('CMS ещё не подключена. Настройте Supabase по инструкции CMS_SETUP.md; затем здесь можно будет войти.');
  else {
    api = await client(true);
    api.auth.onAuthStateChange((event, session) => {
      if (!session) lock();
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') setTimeout(() => checkAccess(session), 0);
    });
    $('#login-form button').disabled = false;
    await checkAccess(unwrap(await api.auth.getSession()).session);
    setInterval(async () => {
      if (document.hidden || !authorized) return;
      try { await checkAccess(unwrap(await api.auth.getSession()).session); } catch (error) { lock(); $('#login-error').textContent = errorMessage(error); }
    }, 60000);
  }
} catch (error) { status(errorMessage(error)); }
