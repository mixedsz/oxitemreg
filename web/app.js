'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
    myItems: [],
    oxItems: [],
    oxFiltered: [],
    selectedMy: new Set(),
    selectedOx: new Set(),
    editingItem: null,
    editingOxItem: null,
    oxPage: 0,
    OX_PAGE_SIZE: 120,
    showDuplicatesOnly: false,
};

// ─── NUI Bridge ──────────────────────────────────────────────────────────────
// Capture the resource name ONCE at module load — using optional chaining so
// it can never call itself, and never throws regardless of FiveM version.
const RESOURCE_NAME = (typeof GetParentResourceName === 'function')
    ? GetParentResourceName()
    : 'oxitemreg';

function nuiFetch(endpoint, data = {}) {
    let body;
    try { body = JSON.stringify(data); } catch (_) { body = '{}'; }
    return fetch(`https://${RESOURCE_NAME}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    }).catch(() => {/* swallow network errors silently */});
}

// ─── ox_inventory image path ──────────────────────────────────────────────────
function oxImageSrc(name) {
    return `nui://ox_inventory/web/images/${name}.png`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3500) {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.getElementById('toastContainer').appendChild(el);
    setTimeout(() => el.remove(), duration);
}

// ─── Confirm dialog ───────────────────────────────────────────────────────────
function showConfirm(title, message) {
    return new Promise(resolve => {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmOverlay').classList.remove('hidden');
        const ok = document.getElementById('confirmOk');
        const cancel = document.getElementById('confirmCancel');
        const cleanup = () => {
            document.getElementById('confirmOverlay').classList.add('hidden');
            ok.removeEventListener('click', onOk);
            cancel.removeEventListener('click', onCancel);
        };
        const onOk = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };
        ok.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
    });
}

// ─── Image helpers ────────────────────────────────────────────────────────────
const customImageCache = {};

function resolveImageSrc(item) {
    if (item.imageData) return item.imageData;
    if (item.imageUrl && customImageCache[item.imageUrl]) return customImageCache[item.imageUrl];
    if (item.imageUrl) return item.imageUrl;
    const name = item.image || item.name;
    return name ? oxImageSrc(name) : null;
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cardImageHTML(item) {
    const src = resolveImageSrc(item);
    if (!src) return `<svg style="width:40px;height:40px;color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
    return `<img src="${escHtml(src)}" loading="lazy" decoding="async" alt="" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.display='none'" />`;
}

// ─── Duplicate detection ──────────────────────────────────────────────────────
// Returns a Set of item names whose label is EXACTLY the same (case-sensitive)
// as at least one other item. "Ankle Monitor" and "ankle monitor" are NOT dupes;
// three items all called "Backwood" ARE dupes.
function buildDuplicateLabelSet(items) {
    const labelCount = {};
    items.forEach(it => {
        const key = it.label || it.name;   // exact, no lowercasing
        labelCount[key] = (labelCount[key] || 0) + 1;
    });
    const dupeSet = new Set();
    items.forEach(it => {
        const key = it.label || it.name;
        if (labelCount[key] > 1) dupeSet.add(it.name);
    });
    return dupeSet;
}

// ─── Render – My Items ────────────────────────────────────────────────────────
function renderMyItems(filter = '') {
    const grid    = document.getElementById('gridMy');
    const empty   = document.getElementById('emptyMy');
    const countEl = document.getElementById('countMy');

    const f = filter.toLowerCase();
    const visible = state.myItems.filter(it =>
        it.name.includes(f) || (it.label || '').toLowerCase().includes(f)
    );
    countEl.textContent = `${visible.length} / ${state.myItems.length}`;

    if (state.myItems.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    if (visible.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:20px">No items match your search.</p>';
        return;
    }

    const frag = document.createDocumentFragment();
    visible.forEach(item => {
        const sel = state.selectedMy.has(item.name);
        const div = document.createElement('div');
        div.className = `item-card${sel ? ' selected' : ''}`;
        div.dataset.name = item.name;
        div.dataset.type = 'my';
        div.innerHTML = `
            <input type="checkbox" class="card-checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation()" data-cb-name="${escHtml(item.name)}" data-cb-type="my" />
            <div class="card-image">${cardImageHTML(item)}</div>
            <div class="card-name">${escHtml(item.label || item.name)}</div>
            <div class="card-key">${escHtml(item.name)}</div>
            <div class="card-meta">
                <span class="card-badge">${item.stack !== false ? 'stack' : 'unique'}</span>
                <span class="card-weight">${item.weight || 0}g</span>
            </div>`;
        frag.appendChild(div);
    });
    grid.innerHTML = '';
    grid.appendChild(frag);
}

// ─── Render – Ox Items (paginated) ───────────────────────────────────────────
function applyOxFilter(filter = '') {
    const f = filter.toLowerCase();
    let items = state.oxItems.filter(it =>
        it.name.includes(f) || (it.label || '').toLowerCase().includes(f)
    );
    if (state.showDuplicatesOnly) {
        const dupes = buildDuplicateLabelSet(state.oxItems);
        items = items.filter(it => dupes.has(it.name));
    }
    state.oxFiltered = items;
    state.oxPage = 0;
}

function renderOxPage() {
    const grid    = document.getElementById('gridOx');
    const empty   = document.getElementById('emptyOx');
    const countEl = document.getElementById('countOx');
    const pager   = document.getElementById('oxPager');
    const btnDupe = document.getElementById('btnDeleteDuplicates');
    const btnShow = document.getElementById('btnShowDuplicates');

    // Update duplicate-mode button states
    btnShow.classList.toggle('active-filter', state.showDuplicatesOnly);
    btnShow.textContent = state.showDuplicatesOnly ? 'Show all items' : 'Show duplicates';
    btnDupe.classList.toggle('hidden', !state.showDuplicatesOnly);

    const total    = state.oxFiltered.length;
    const allTotal = state.oxItems.length;
    countEl.textContent = `${total} / ${allTotal}`;

    if (allTotal === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        pager.classList.add('hidden');
        return;
    }
    empty.classList.add('hidden');

    if (total === 0) {
        grid.innerHTML = state.showDuplicatesOnly
            ? '<p style="color:var(--text-muted);font-size:13px;padding:20px">No duplicate labels found.</p>'
            : '<p style="color:var(--text-muted);font-size:13px;padding:20px">No items match your search.</p>';
        pager.classList.add('hidden');
        return;
    }

    const totalPages = Math.ceil(total / state.OX_PAGE_SIZE);
    state.oxPage = Math.min(state.oxPage, totalPages - 1);

    const slice = state.oxFiltered.slice(
        state.oxPage * state.OX_PAGE_SIZE,
        (state.oxPage + 1) * state.OX_PAGE_SIZE
    );

    // Build a per-label colour map so duplicates are visually grouped
    const dupeSet = state.showDuplicatesOnly ? buildDuplicateLabelSet(state.oxItems) : new Set();

    const frag = document.createDocumentFragment();
    slice.forEach(item => {
        const sel = state.selectedOx.has(item.name);
        const isDupe = dupeSet.has(item.name);
        const div = document.createElement('div');
        div.className = `item-card${sel ? ' selected' : ''}${isDupe ? ' dupe-card' : ''}`;
        div.dataset.name = item.name;
        div.dataset.type = 'ox';
        div.innerHTML = `
            <input type="checkbox" class="card-checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation()" data-cb-name="${escHtml(item.name)}" data-cb-type="ox" />
            ${item.sensitive ? '<span class="sensitive-badge">sensitive</span>' : ''}
            ${isDupe ? '<span class="dupe-badge">duplicate</span>' : ''}
            <div class="card-image">${cardImageHTML(item)}</div>
            <div class="card-name">${escHtml(item.label || item.name)}</div>
            <div class="card-key">${escHtml(item.name)}</div>
            <div class="card-meta">
                <span class="card-badge">${item.stack !== false ? 'stack' : 'unique'}</span>
                <span class="card-weight">${item.weight || 0}g</span>
            </div>`;
        frag.appendChild(div);
    });
    grid.innerHTML = '';
    grid.appendChild(frag);

    if (totalPages <= 1) {
        pager.classList.add('hidden');
    } else {
        pager.classList.remove('hidden');
        document.getElementById('oxPageInfo').textContent = `Page ${state.oxPage + 1} of ${totalPages}`;
        document.getElementById('oxPrev').disabled = state.oxPage === 0;
        document.getElementById('oxNext').disabled = state.oxPage === totalPages - 1;
    }
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(item = null, isOxItem = false) {
    state.editingItem   = item ? item.name : null;
    state.editingOxItem = isOxItem ? item : null;

    document.getElementById('modalTitle').textContent = item ? (isOxItem ? 'Override Item' : 'Edit Item') : 'Add Item';
    document.getElementById('modalSave').textContent  = item ? (isOxItem ? 'Override Item' : 'Save Changes') : 'Add Item';

    document.getElementById('fieldName').value      = item ? item.name : '';
    document.getElementById('fieldName').disabled   = !!item;
    document.getElementById('fieldLabel').value     = item ? (item.label || '') : '';
    document.getElementById('fieldWeight').value    = item ? (item.weight || 100) : 100;
    document.getElementById('fieldImage').value     = item ? (item.imageUrl || '') : '';
    document.getElementById('fieldDesc').value      = item ? (item.description || '') : '';
    document.getElementById('fieldStack').checked   = item ? item.stack !== false : true;
    document.getElementById('fieldClose').checked   = item ? item.close !== false : true;
    document.getElementById('fieldConsume').checked = item ? item.consume === true : false;

    updatePreview(item ? resolveImageSrc(item) : null);
    document.getElementById('modalOverlay').classList.remove('hidden');
    if (!item) document.getElementById('fieldName').focus();
}

function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
    document.getElementById('fieldName').classList.remove('error');
    state.editingItem   = null;
    state.editingOxItem = null;
}

function updatePreview(src) {
    const img = document.getElementById('previewImg');
    const ph  = document.querySelector('.preview-placeholder');
    if (src) {
        img.src = src;
        img.style.display = 'block';
        img.onerror = () => { img.style.display = 'none'; if (ph) ph.style.display = ''; };
        if (ph) ph.style.display = 'none';
    } else {
        img.src = ''; img.style.display = 'none';
        if (ph) ph.style.display = '';
    }
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
    document.getElementById('contentMy').classList.toggle('hidden', tab !== 'my');
    document.getElementById('contentAll').classList.toggle('hidden', tab !== 'all');
}

// ─── Form data ────────────────────────────────────────────────────────────────
function collectFormData() {
    return {
        name:        document.getElementById('fieldName').value.trim().toLowerCase().replace(/\s+/g, '_'),
        label:       document.getElementById('fieldLabel').value.trim(),
        weight:      parseInt(document.getElementById('fieldWeight').value) || 100,
        imageUrl:    document.getElementById('fieldImage').value.trim(),
        description: document.getElementById('fieldDesc').value.trim(),
        stack:       document.getElementById('fieldStack').checked,
        close:       document.getElementById('fieldClose').checked,
        consume:     document.getElementById('fieldConsume').checked,
    };
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Tabs
    document.querySelectorAll('.tab').forEach(btn =>
        btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );

    // Close panel
    document.getElementById('btnClose').addEventListener('click', () => nuiFetch('close'));

    // Add item
    document.getElementById('btnAddItem').addEventListener('click', () => openModal());

    // Modal close/cancel
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalCancel').addEventListener('click', closeModal);

    // Image URL → live preview
    document.getElementById('fieldImage').addEventListener('blur', () => {
        const url = document.getElementById('fieldImage').value.trim();
        if (url) updatePreview(url);
    });
    document.getElementById('fieldImage').addEventListener('input', () => {
        if (!document.getElementById('fieldImage').value.trim()) updatePreview(null);
    });

    // Auto-fill label from name
    document.getElementById('fieldName').addEventListener('input', e => {
        const lbl = document.getElementById('fieldLabel');
        if (!lbl.value) {
            lbl.value = e.target.value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
    });

    // Save (add or edit)
    document.getElementById('modalSave').addEventListener('click', async () => {
        const data = collectFormData();
        if (!data.name) {
            document.getElementById('fieldName').classList.add('error');
            toast('Item name is required.', 'error');
            return;
        }
        document.getElementById('fieldName').classList.remove('error');
        if (state.editingItem) {
            nuiFetch('editItem', { name: state.editingItem, updates: data });
        } else {
            if (data.imageUrl) nuiFetch('cacheImage', { url: data.imageUrl });
            nuiFetch('addItem', data);
        }
        closeModal();
    });

    // Apply now
    document.getElementById('btnApply').addEventListener('click', async () => {
        const ok = await showConfirm('Apply Items', 'This will register all your custom items in ox_inventory immediately. Continue?');
        if (ok) { nuiFetch('applyItems'); toast('Applying items to ox_inventory…', 'info'); }
    });

    // Refresh
    document.getElementById('btnRefreshMy').addEventListener('click', () => nuiFetch('getState'));
    document.getElementById('btnRefreshOx').addEventListener('click', () => nuiFetch('getState'));

    // Show/hide duplicates toggle
    document.getElementById('btnShowDuplicates').addEventListener('click', () => {
        state.showDuplicatesOnly = !state.showDuplicatesOnly;
        state.selectedOx.clear();
        document.getElementById('selectAllOx').checked = false;
        applyOxFilter(document.getElementById('searchOx').value);
        renderOxPage();
    });

    // Delete duplicates (only selected items from the duplicate view)
    document.getElementById('btnDeleteDuplicates').addEventListener('click', async () => {
        if (state.selectedOx.size === 0) {
            toast('Select the duplicates you want to delete first.', 'error');
            return;
        }
        const ok = await showConfirm(
            'Delete duplicates',
            `Remove ${state.selectedOx.size} item(s) from ox_inventory on next Apply? This queues them for deletion.`
        );
        if (ok) {
            nuiFetch('deleteItems', { names: [...state.selectedOx] });
            state.selectedOx.clear();
            document.getElementById('selectAllOx').checked = false;
        }
    });

    // Search – debounced
    let searchMyTimer, searchOxTimer;
    document.getElementById('searchMy').addEventListener('input', e => {
        clearTimeout(searchMyTimer);
        searchMyTimer = setTimeout(() => renderMyItems(e.target.value), 150);
    });
    document.getElementById('searchOx').addEventListener('input', e => {
        clearTimeout(searchOxTimer);
        searchOxTimer = setTimeout(() => {
            applyOxFilter(e.target.value);
            renderOxPage();
        }, 150);
    });

    // Pager
    document.getElementById('oxPrev').addEventListener('click', () => {
        if (state.oxPage > 0) { state.oxPage--; renderOxPage(); }
    });
    document.getElementById('oxNext').addEventListener('click', () => {
        state.oxPage++;
        renderOxPage();
    });

    // Select all – My
    document.getElementById('selectAllMy').addEventListener('change', e => {
        if (e.target.checked) state.myItems.forEach(it => state.selectedMy.add(it.name));
        else state.selectedMy.clear();
        renderMyItems(document.getElementById('searchMy').value);
    });

    // Select all – Ox (applies across all pages of the filtered set)
    document.getElementById('selectAllOx').addEventListener('change', e => {
        if (e.target.checked) state.oxFiltered.forEach(it => state.selectedOx.add(it.name));
        else state.selectedOx.clear();
        renderOxPage();
    });

    // Delete selected (My)
    document.getElementById('btnDeleteSelected').addEventListener('click', async () => {
        if (state.selectedMy.size === 0) { toast('No items selected.', 'error'); return; }
        const ok = await showConfirm('Delete Items', `Delete ${state.selectedMy.size} selected item(s)? This cannot be undone.`);
        if (ok) { nuiFetch('deleteItems', { names: [...state.selectedMy] }); state.selectedMy.clear(); }
    });

    // Grid clicks – My
    document.getElementById('gridMy').addEventListener('click', e => {
        const cb = e.target.closest('[data-cb-type="my"]');
        if (cb) {
            const n = cb.dataset.cbName;
            if (cb.checked) state.selectedMy.add(n); else state.selectedMy.delete(n);
            e.target.closest('.item-card')?.classList.toggle('selected', cb.checked);
            return;
        }
        const card = e.target.closest('.item-card[data-type="my"]');
        if (card && !e.target.closest('.card-checkbox')) {
            const item = state.myItems.find(it => it.name === card.dataset.name);
            if (item) openModal(item, false);
        }
    });

    // Grid clicks – Ox
    document.getElementById('gridOx').addEventListener('click', async e => {
        const cb = e.target.closest('[data-cb-type="ox"]');
        if (cb) {
            const n = cb.dataset.cbName;
            if (cb.checked) state.selectedOx.add(n); else state.selectedOx.delete(n);
            e.target.closest('.item-card')?.classList.toggle('selected', cb.checked);
            return;
        }
        const card = e.target.closest('.item-card[data-type="ox"]');
        if (card && !e.target.closest('.card-checkbox')) {
            const item = state.oxItems.find(it => it.name === card.dataset.name);
            if (!item) return;
            if (item.sensitive) {
                const ok = await showConfirm('Sensitive Item', `"${item.label || item.name}" is a weapon/ammo item. Editing may affect gameplay balance. Continue?`);
                if (!ok) return;
            }
            openModal(item, true);
        }
    });

    // Escape key
    document.addEventListener('keydown', e => {
        if (e.key !== 'Escape') return;
        if (!document.getElementById('confirmOverlay').classList.contains('hidden')) {
            document.getElementById('confirmOverlay').classList.add('hidden');
        } else if (!document.getElementById('modalOverlay').classList.contains('hidden')) {
            closeModal();
        } else {
            nuiFetch('close');
        }
    });
});

// ─── NUI Message handler ──────────────────────────────────────────────────────
window.addEventListener('message', e => {
    const { type, data, success, applied, failed, url, b64 } = e.data || {};

    switch (type) {
        case 'setVisible': {
            document.getElementById('panel').classList.toggle('hidden', !e.data.visible);
            if (e.data.visible) nuiFetch('getState');
            break;
        }

        case 'stateResponse': {
            state.myItems = data.myItems || [];
            state.oxItems = (data.oxItems || []).sort((a, b) =>
                (a.label || a.name).localeCompare(b.label || b.name)
            );
            applyOxFilter(document.getElementById('searchOx').value);
            renderMyItems(document.getElementById('searchMy').value);
            renderOxPage();
            break;
        }

        case 'addItemResponse': {
            if (success) {
                state.myItems.push(data);
                renderMyItems(document.getElementById('searchMy').value);
                toast(`Item "${data.label || data.name}" added.`, 'success');
            } else {
                toast(typeof data === 'string' ? data : 'Failed to add item.', 'error');
            }
            break;
        }

        case 'editItemResponse': {
            if (success) {
                const idx = state.myItems.findIndex(it => it.name === data.name);
                if (idx !== -1) state.myItems[idx] = data;
                renderMyItems(document.getElementById('searchMy').value);
                toast(`Item "${data.label || data.name}" updated.`, 'success');
            } else {
                toast(typeof data === 'string' ? data : 'Failed to edit item.', 'error');
            }
            break;
        }

        case 'deleteItemsResponse': {
            if (success) { nuiFetch('getState'); toast('Items deleted.', 'success'); }
            else toast('Failed to delete items.', 'error');
            break;
        }

        case 'applyResponse': {
            const { applied, failed, restarting, errMsg } = e.data;
            if (restarting) {
                toast(`Saved ${applied} item(s) to ox_inventory. Restarting ox_inventory — reconnect in ~5s.`, 'success', 7000);
            } else if (failed > 0) {
                toast(`Apply failed: ${errMsg || 'check server console'}.`, 'error', 6000);
            }
            break;
        }

        case 'imageCached': {
            if (b64) {
                customImageCache[url] = b64;
                state.myItems.forEach(it => { if (it.imageUrl === url) it.imageData = b64; });
                renderMyItems(document.getElementById('searchMy').value);
            }
            break;
        }
    }
});
