/* WebMCP POC – Asset Library
 * Tools call the SAME functions as the UI buttons, so human and agent share state.
 * Append ?webmcp=off to the URL to disable registration (baseline run).
 */
(() => {
  'use strict';

  // ---------- Data (in-memory) ----------
  const assets = [
    { id: 'A-101', name: 'Hero Banner Autumn', type: 'image', tags: ['banner', 'autumn', 'campaign'] },
    { id: 'A-102', name: 'Product Shot Sneaker', type: 'image', tags: ['product', 'shoes'] },
    { id: 'A-103', name: 'Brand Guidelines 2026', type: 'document', tags: ['brand', 'guidelines'] },
    { id: 'A-104', name: 'Launch Teaser 15s', type: 'video', tags: ['launch', 'teaser', 'campaign'] },
    { id: 'A-105', name: 'Logo Pack', type: 'image', tags: ['brand', 'logo'] },
    { id: 'A-106', name: 'Q4 Media Plan', type: 'document', tags: ['campaign', 'plan'] },
    { id: 'A-107', name: 'Customer Story Interview', type: 'video', tags: ['story', 'customer'] },
    { id: 'A-108', name: 'Social Template Set', type: 'image', tags: ['social', 'template'] },
    { id: 'A-109', name: 'Press Kit', type: 'document', tags: ['press', 'brand'] },
    { id: 'A-110', name: 'Holiday Promo Loop', type: 'video', tags: ['holiday', 'promo', 'campaign'] },
  ];
  const collection = new Set(['A-101']);
  const state = { query: '', type: '' };
  const TYPES = ['image', 'video', 'document'];
  const ID_RE = /^A-\d{3}$/;

  // ---------- DOM helpers (textContent only – no innerHTML with data) ----------
  const $ = (id) => document.getElementById(id);
  const el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };

  // ---------- Core app logic (shared by UI + tools) ----------
  function findAssets({ query = '', type = '' } = {}) {
    const q = String(query).trim().toLowerCase();
    return assets.filter((a) =>
      (!type || a.type === type) &&
      (!q || a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q))));
  }

  function addToCollection(id) {
    if (!ID_RE.test(id)) throw new Error('Invalid asset id format. Expected A-###.');
    if (!assets.some((a) => a.id === id)) throw new Error(`Asset ${id} not found.`);
    const already = collection.has(id);
    collection.add(id);
    render();
    return { id, added: !already, collectionSize: collection.size };
  }

  function deleteAsset(id) {
    const i = assets.findIndex((a) => a.id === id);
    if (i < 0) throw new Error(`Asset ${id} not found.`);
    const [removed] = assets.splice(i, 1);
    collection.delete(id);
    render();
    return { deleted: removed.id, name: removed.name };
  }

  function confirmDialog(message) {
    const dlg = $('confirm');
    $('confirmMsg').textContent = message;
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
    });
  }

  // ---------- Rendering ----------
  function render() {
    const rows = $('rows');
    rows.replaceChildren();
    for (const a of findAssets(state)) {
      const tr = el('tr');
      tr.append(el('td', a.id), el('td', a.name), el('td', a.type), el('td', a.tags.join(', ')));
      const td = el('td', undefined, 'actions');
      const add = el('button', collection.has(a.id) ? 'In collection' : 'Add');
      add.disabled = collection.has(a.id);
      add.addEventListener('click', () => { logCall('ui', 'add_to_collection', { id: a.id }, 'write'); addToCollection(a.id); });
      const del = el('button', 'Delete');
      del.addEventListener('click', async () => {
        if (await confirmDialog(`Delete ${a.name} (${a.id})?`)) deleteAsset(a.id);
      });
      td.append(add, del);
      tr.append(td);
      rows.append(tr);
    }
    const list = $('collection');
    list.replaceChildren();
    for (const id of collection) {
      const a = assets.find((x) => x.id === id);
      if (a) list.append(el('li', `${a.id} – ${a.name}`));
    }
    if (!list.children.length) list.append(el('li', '(empty)'));
  }

  $('q').addEventListener('input', (e) => { state.query = e.target.value; render(); });
  $('type').addEventListener('change', (e) => { state.type = e.target.value; render(); });

  // ---------- Tool-call log ----------
  function logCall(source, name, args, kind) {
    const li = el('li', `[${new Date().toLocaleTimeString()}] ${source}: ${name}(${JSON.stringify(args)})`, kind);
    $('log').prepend(li);
    console.info('[webmcp-poc]', source, name, args);
  }

  // ---------- WebMCP tools ----------
  // Result envelope: MCP-style content array. If an agent shows raw/odd output,
  // change ONLY this helper (some clients accept plain objects too).
  const ok = (obj) => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });

  const wrap = (name, kind, fn) => async (args = {}) => {
    logCall('agent', name, args, kind);
    try { return ok(await fn(args)); }
    catch (e) { return { isError: true, content: [{ type: 'text', text: String(e.message || e) }] }; }
  };

  const tools = [
    {
      name: 'app_context',
      description: 'Read-only orientation call. Returns the current filters, asset count, and collection contents. Call this before any write action.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: wrap('app_context', 'read', () => ({
        filters: { ...state }, totalAssets: assets.length,
        visibleAssets: findAssets(state).length, collection: [...collection],
      })),
    },
    {
      name: 'search_assets',
      description: 'Search assets by free-text query (matches name or tag) and optional type. Also updates the on-screen filters so the user sees the same results.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', maxLength: 100, description: 'Text to match against name or tags' },
          type: { type: 'string', enum: TYPES, description: 'Optional asset type filter' },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: wrap('search_assets', 'read', ({ query = '', type = '' }) => {
        if (type && !TYPES.includes(type)) throw new Error(`type must be one of ${TYPES.join(', ')}`);
        state.query = String(query).slice(0, 100); state.type = type;
        $('q').value = state.query; $('type').value = state.type;
        render();
        return { results: findAssets(state) };
      }),
    },
    {
      name: 'add_to_collection',
      description: 'Add one asset to the "Campaign Q4" collection by id (format A-###). Non-destructive; visible in the right panel.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', pattern: '^A-\\d{3}$', description: 'Asset id, e.g. A-104' } },
        required: ['id'], additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: wrap('add_to_collection', 'write', ({ id }) => addToCollection(id)),
    },
    {
      name: 'delete_asset',
      description: 'Permanently delete an asset by id. Destructive: the user is asked to confirm in the page; if they decline, nothing changes.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string', pattern: '^A-\\d{3}$' } },
        required: ['id'], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
      execute: wrap('delete_asset', 'destructive', async ({ id }) => {
        if (!ID_RE.test(id)) throw new Error('Invalid asset id format. Expected A-###.');
        const a = assets.find((x) => x.id === id);
        if (!a) throw new Error(`Asset ${id} not found.`);
        const yes = await confirmDialog(`An agent wants to delete "${a.name}" (${id}). Allow?`);
        if (!yes) return { deleted: false, reason: 'User declined' };
        return deleteAsset(id);
      }),
    },
    {
      // Optional: gateway-style multiplexed tool (pattern for the UNav discussion)
      name: 'assets_gateway',
      description: 'Gateway tool. action="help" or "list_actions" describes available actions; action="count_by_type" returns counts per asset type.',
      inputSchema: {
        type: 'object',
        properties: { action: { type: 'string', enum: ['help', 'list_actions', 'count_by_type'] } },
        required: ['action'], additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: wrap('assets_gateway', 'read', ({ action }) => {
        if (action === 'count_by_type') {
          return Object.fromEntries(TYPES.map((t) => [t, assets.filter((a) => a.type === t).length]));
        }
        if (action === 'help' || action === 'list_actions') {
          return { actions: ['help', 'list_actions', 'count_by_type'], note: 'Other capabilities are separate tools: search_assets, add_to_collection, delete_asset, app_context.' };
        }
        throw new Error('Unknown action');
      }),
    },
  ];

  async function registerTools() {
    const status = $('status');
    if (new URLSearchParams(location.search).get('webmcp') === 'off') {
      status.textContent = 'WebMCP registration disabled (?webmcp=off) – baseline mode';
      status.className = 'status no';
      return;
    }
    // Spec/Chrome/ChatGPT use document.modelContext; older previews used navigator.modelContext.
    const mc = document.modelContext || navigator.modelContext;
    if (!mc || typeof mc.registerTool !== 'function') {
      status.textContent = 'WebMCP API not available in this browser (enable chrome://flags/#enable-webmcp-testing)';
      status.className = 'status no';
      return;
    }
    try {
      for (const t of tools) await mc.registerTool(t);
      const api = document.modelContext ? 'document.modelContext' : 'navigator.modelContext';
      status.textContent = `WebMCP active via ${api}: ${tools.length} tools registered`;
      status.className = 'status ok';
      console.info('[webmcp-poc] registered', tools.map((t) => t.name));
    } catch (e) {
      status.textContent = 'WebMCP registration failed: ' + (e.message || e);
      status.className = 'status no';
      console.error(e);
    }
  }

  render();
  registerTools();
})();
