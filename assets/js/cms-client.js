/* Shared Supabase adapter. CRM deliberately uses its existing, separate adapter. */
const config = window.AKIZ_CMS_CONFIG || {};
export const BUCKET = 'cms-images';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const collections = Object.freeze({
  teachers: { table: 'cms_teachers', title: 'Преподаватели', singular: 'преподавателя' },
  reviews: { table: 'cms_reviews', title: 'Отзывы', singular: 'отзыв' }
});

export function configured() {
  if (!config.supabaseUrl || !config.supabaseKey) return false;
  const url = new URL(config.supabaseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') throw new Error('Проверьте публичный URL Supabase в cms-config.js.');
  if (config.supabaseKey.startsWith('sb_secret_')) throw new Error('В CMS нельзя использовать секретный ключ. Укажите publishable key.');
  if (!config.supabaseKey.startsWith('sb_publishable_')) {
    try {
      const part = config.supabaseKey.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      if (JSON.parse(atob(part)).role !== 'anon') throw new Error();
    } catch { throw new Error('Нужен публичный publishable key или anon key Supabase.'); }
  }
  return true;
}

let sdkPromise;
function sdk() {
  if (!sdkPromise) sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/assets/vendor/supabase-2.57.4.js';
    script.onload = () => window.supabase ? resolve(window.supabase) : reject(new Error('Не удалось загрузить модуль Supabase.'));
    script.onerror = () => reject(new Error('Не удалось загрузить модуль Supabase. Обновите страницу.'));
    document.head.append(script);
  });
  return sdkPromise;
}
const clients = new Map();
export async function client(admin = false) {
  if (!configured()) throw new Error('Supabase ещё не подключён. Заполните публичные настройки по CMS_SETUP.md.');
  if (!clients.has(admin)) {
    clients.set(admin, sdk().then(({ createClient }) => createClient(config.supabaseUrl, config.supabaseKey, {
      auth: { persistSession: admin, autoRefreshToken: admin, detectSessionInUrl: false,
        storage: admin ? sessionStorage : undefined, storageKey: admin ? 'akiz-cms-auth' : 'akiz-cms-public' },
      global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(20000) }) }
    })));
  }
  return clients.get(admin);
}
export function unwrap({ data, error }) { if (error) throw error; return data; }
export function imageUrl(path) {
  if (!path) return '';
  if (/^\/assets\/images\/[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..')) return path;
  if (!/^(teachers|reviews)\/[a-f0-9-]+\.(png|jpg|webp)$/.test(path)) return '';
  return `${config.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${BUCKET}/${path}`;
}
export function validateRecord(kind, data) {
  if (!collections[kind]) throw new Error('Неизвестный раздел.');
  for (const [field, label, max] of [['name', 'Имя', 120], ['description', kind === 'reviews' ? 'Текст отзыва' : 'Описание', 6000]]) {
    if (!data[field]?.trim() || data[field].length > max) throw new Error(`${label}: заполните поле (до ${max} символов).`);
  }
  if (!data.image_path || !imageUrl(data.image_path)) throw new Error('Загрузите изображение.');
  if (!Number.isInteger(data.sort_order) || Math.abs(data.sort_order) > 100000) throw new Error('Порядок: целое число от −100000 до 100000.');
  if (kind === 'reviews') {
    if (!data.location?.trim() || data.location.length > 160) throw new Error('Укажите местоположение (до 160 символов).');
    if (!Number.isInteger(data.stars) || data.stars < 1 || data.stars > 5) throw new Error('Выберите от 1 до 5 звёзд.');
  }
  return data;
}
export async function validateImage(file) {
  const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!types[file?.type]) throw new Error('Выберите изображение JPG, PNG или WebP.');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('Максимальный размер изображения — 5 МБ.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const valid = file.type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === 'image/png' ? [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v)
    : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!valid) throw new Error('Содержимое файла не соответствует формату изображения.');
  const bitmap = await createImageBitmap(file);
  const size = bitmap.width * bitmap.height;
  bitmap.close();
  if (size > 24000000) throw new Error('Изображение слишком большое: максимум 24 мегапикселя.');
  return types[file.type];
}
export async function uploadImage(api, kind, file) {
  const ext = await validateImage(file);
  const path = `${kind}/${crypto.randomUUID()}.${ext}`;
  // Register first: interrupted uploads remain discoverable by the cleanup job.
  unwrap(await api.from('cms_media').insert({ path }));
  unwrap(await api.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' }));
  return path;
}
export async function cleanupMedia(api) {
  const unused = unwrap(await api.rpc('cms_unused_media')) || [];
  for (const { path } of unused) {
    unwrap(await api.storage.from(BUCKET).remove([path]));
    unwrap(await api.from('cms_media').delete().eq('path', path));
  }
  return unused.length;
}
export async function readAll(api, table, published = false) {
  const rows = [];
  for (let from = 0; ; from += 500) {
    let query = api.from(table).select('*').order('sort_order').order('id').range(from, from + 499);
    if (published) query = query.eq('is_published', true);
    const page = unwrap(await query);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export function errorMessage(error) {
  if (error?.status === 429) return 'Слишком много попыток. Подождите немного и повторите.';
  if (error?.code === 'invalid_credentials') return 'Неверный email или пароль.';
  if (error?.code === 'email_not_confirmed') return 'Email ещё не подтверждён.';
  if (error?.code === '42501' || error?.status === 403) return 'Недостаточно прав. Проверьте назначение администратора.';
  if (error?.code === '23514' || error?.code === '23502') return 'Проверьте обязательные поля и формат данных.';
  if (error?.code === 'PGRST116') return 'Запись уже изменена или удалена. Обновите список и повторите.';
  if (error?.name === 'TypeError' || error?.name === 'TimeoutError' || /fetch|network/i.test(error?.message || '')) return 'Нет связи с сервером. Проверьте соединение и повторите.';
  return error instanceof Error ? error.message : 'Не удалось выполнить запрос. Проверьте соединение и настройки Supabase.';
}
