// Browser-only transport fixture, injected by verify-cms.mjs. Never shipped.
(() => {
  const originalFetch = window.fetch.bind(window);
  const user = { id: '11111111-1111-4111-8111-111111111111', email: 'qa@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const makeToken = () => [btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })), 'fixture'].join('.');
  const fixture = window.__cmsFixture = { admin: true, fail: location.search.includes('cms_fail=1'), writes: 0, uploads: 0, tables: { cms_teachers: [], cms_reviews: [], cms_media: [] }, objects: new Set() };
  Object.defineProperty(window, 'AKIZ_CMS_CONFIG', { configurable: true, get: () => ({ supabaseUrl: 'https://cms-test.invalid', supabaseKey: 'sb_publishable_fixture_only' }), set: () => {} });
  const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== 'https://cms-test.invalid') return originalFetch(input, options);
    if (fixture.fail) throw new TypeError('Failed to fetch');
    const method = options.method || 'GET';
    const headers = new Headers(options.headers);
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    if (url.pathname.endsWith('/token')) {
      if (fixture.expired) return reply({ code: 'refresh_token_not_found', msg: 'Invalid refresh token' }, 400);
      if (body.password === 'invalid') return reply({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
      return reply({ access_token: makeToken(), refresh_token: 'fixture-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user });
    }
    if (url.pathname.endsWith('/user')) return reply(user);
    if (url.pathname.endsWith('/logout')) return reply({});
    if (url.pathname.endsWith('/rpc/cms_is_admin')) return reply(fixture.admin);
    if (url.pathname.endsWith('/rpc/cms_unused_media')) return reply(fixture.tables.cms_media.filter(m => m.created_at === 'old' && ![...fixture.tables.cms_teachers, ...fixture.tables.cms_reviews].some(r => r.image_path === m.path)));
    if (url.pathname.startsWith('/storage/v1/object/')) {
      if (method === 'POST') { fixture.uploads++; fixture.objects.add(url.pathname); return reply({ Key: url.pathname, Id: crypto.randomUUID() }); }
      if (method === 'DELETE') return reply(body.prefixes.map(name => ({ name })));
    }
    const table = url.pathname.split('/').pop();
    if (!fixture.tables[table]) return reply({ message: 'Unmocked endpoint ' + url.pathname }, 500);
    const match = row => [...url.searchParams].every(([key, value]) => !value.startsWith('eq.') || String(row[key]) === value.slice(3));
    const selected = fixture.tables[table].filter(match);
    if (method === 'GET') return reply(selected.sort((a,b) => a.sort_order - b.sort_order).slice(Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('offset') || 0) + Number(url.searchParams.get('limit') || 500)));
    fixture.writes++;
    const single = headers.get('accept')?.includes('vnd.pgrst.object');
    if (method === 'POST') {
      const values = Array.isArray(body) ? body : [body];
      const result = values.map(data => {
        const record = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...data, updated_at: new Date().toISOString() };
        const index = fixture.tables[table].findIndex(r => r.id === record.id);
        if (index < 0) fixture.tables[table].push(record); else fixture.tables[table][index] = record;
        return record;
      });
      return reply(single ? result[0] : result, 201);
    }
    if (!selected.length && single) return reply({ code: 'PGRST116', message: 'No rows' }, 406);
    if (method === 'PATCH') selected.forEach(row => Object.assign(row, body, { updated_at: new Date().toISOString() }));
    if (method === 'DELETE') fixture.tables[table] = fixture.tables[table].filter(row => !match(row));
    return reply(single ? selected[0] : selected);
  };
})();
