'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
    myItems: [],
    oxItems: [],
    selectedMy: new Set(),
    selectedOx: new Set(),
    editingItem: null,   // name of item being edited, or null for add
    editingOxItem: null, // ox item being overridden
};

// ─── NUI Bridge ──────────────────────────────────────────────────────────────
function nuiFetch(endpoint, data = {}) {
    return fetch(`https://${GetParentResourceName()}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    }).catch(() => {});
}

function GetParentResourceName() {
    // FiveM injects this; fallback for browser dev
    return (window.GetParentResourceName && window.GetParentResourceName()) || 'oxitemreg';
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
function confirm(title, message) {
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

// ─── Item image helpers ───────────────────────────────────────────────────────
const imageUrlCache = {};

function resolveImageSrc(item) {
    if (item.imageData) return item.imageData; // base64 cached by server
    if (item.imageUrl && imageUrlCache[item.imageUrl]) return imageUrlCache[item.imageUrl];
    if (item.image) return `images/${item.image}.png`;
    return null;
}

function makePlaceholderSVG() {
    return `<svg class="card-image-placeholder" style="width:40px;height:40px;color:var(--text-muted)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
}

function makeImageEl(item) {
    const src = resolveImageSrc(item);
    if (src) {
        return `<img src="${src}" alt="" onerror="this.parentElement.innerHTML='${makePlaceholderSVG().replace(/'/g, "&#39;")}'" style="max-width:100%;max-height:100%;object-fit:contain" />`;
    }
    return makePlaceholderSVG();
}

// ─── Render grids ─────────────────────────────────────────────────────────────
function renderMyItems(filter = '') {
    const grid = document.getElementById('gridMy');
    const empty = document.getElementById('emptyMy');
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

    grid.innerHTML = visible.map(item => {
        const sel = state.selectedMy.has(item.name);
        return `<div class="item-card${sel ? ' selected' : ''}" data-name="${item.name}" data-type="my">
            <input type="checkbox" class="card-checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation()" data-cb-name="${item.name}" data-cb-type="my" />
            <div class="card-image">${makeImageEl(item)}</div>
            <div class="card-name">${escHtml(item.label || item.name)}</div>
            <div class="card-key">${escHtml(item.name)}</div>
            <div class="card-meta">
                <span class="card-badge">${item.stack !== false ? 'stack' : 'unique'}</span>
                <span class="card-weight">${item.weight || 0}g</span>
            </div>
        </div>`;
    }).join('');
}

function renderOxItems(filter = '') {
    const grid = document.getElementById('gridOx');
    const empty = document.getElementById('emptyOx');
    const countEl = document.getElementById('countOx');

    const f = filter.toLowerCase();
    const visible = state.oxItems.filter(it =>
        it.name.includes(f) || (it.label || '').toLowerCase().includes(f)
    );
    countEl.textContent = `${visible.length} / ${state.oxItems.length}`;

    if (state.oxItems.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    if (visible.length === 0) {
        grid.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:20px">No items match your search.</p>';
        return;
    }

    grid.innerHTML = visible.map(item => {
        const sel = state.selectedOx.has(item.name);
        const isSensitive = item.sensitive;
        return `<div class="item-card${sel ? ' selected' : ''}" data-name="${item.name}" data-type="ox">
            <input type="checkbox" class="card-checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation()" data-cb-name="${item.name}" data-cb-type="ox" />
            ${isSensitive ? '<span class="sensitive-badge">sensitive</span>' : ''}
            <div class="card-image">${makeImageEl(item)}</div>
            <div class="card-name">${escHtml(item.label || item.name)}</div>
            <div class="card-key">${escHtml(item.name)}</div>
            <div class="card-meta">
                <span class="card-badge">${item.stack !== false ? 'stack' : 'unique'}</span>
                <span class="card-weight">${item.weight || 0}g</span>
            </div>
        </div>`;
    }).join('');
}

function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(item = null, isOxItem = false) {
    state.editingItem = item ? item.name : null;
    state.editingOxItem = isOxItem ? item : null;

    document.getElementById('modalTitle').textContent = item ? (isOxItem ? 'Override Item' : 'Edit Item') : 'Add Item';
    document.getElementById('modalSave').textContent = item ? (isOxItem ? 'Override Item' : 'Save Changes') : 'Add Item';

    document.getElementById('fieldName').value = item ? item.name : '';
    document.getElementById('fieldName').disabled = !!item; // can't rename
    document.getElementById('fieldLabel').value = item ? (item.label || '') : '';
    document.getElementById('fieldWeight').value = item ? (item.weight || 100) : 100;
    document.getElementById('fieldImage').value = item ? (item.imageUrl || '') : '';
    document.getElementById('fieldDesc').value = item ? (item.description || '') : '';
    document.getElementById('fieldStack').checked = item ? item.stack !== false : true;
    document.getElementById('fieldClose').checked = item ? item.close !== false : true;
    document.getElementById('fieldConsume').checked = item ? item.consume === true : false;

    // Preview image
    updatePreview(item ? resolveImageSrc(item) : null);

    document.getElementById('modalOverlay').classList.remove('hidden');
    if (!item) document.getElementById('fieldName').focus();
}

function closeModal() {
    document.getElementById('modalOverlay').classList.add('hidden');
    document.getElementById('fieldName').classList.remove('error');
    state.editingItem = null;
    state.editingOxItem = null;
}

function updatePreview(src) {
    const img = document.getElementById('previewImg');
    const placeholder = document.querySelector('.preview-placeholder');
    if (src) {
        img.src = src;
        img.style.display = 'block';
        img.onerror = () => { img.style.display = 'none'; if (placeholder) placeholder.style.display = ''; };
        if (placeholder) placeholder.style.display = 'none';
    } else {
        img.src = ''; img.style.display = 'none';
        if (placeholder) placeholder.style.display = '';
    }
}

// ─── Tab switching ────────────────────────────────────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
    document.getElementById('contentMy').classList.toggle('hidden', tab !== 'my');
    document.getElementById('contentAll').classList.toggle('hidden', tab !== 'all');
}

// ─── Collect form data ────────────────────────────────────────────────────────
function collectFormData() {
    const name = document.getElementById('fieldName').value.trim().toLowerCase().replace(/\s+/g, '_');
    const label = document.getElementById('fieldLabel').value.trim();
    const weight = parseInt(document.getElementById('fieldWeight').value) || 100;
    const imageUrl = document.getElementById('fieldImage').value.trim();
    const description = document.getElementById('fieldDesc').value.trim();
    const stack = document.getElementById('fieldStack').checked;
    const close = document.getElementById('fieldClose').checked;
    const consume = document.getElementById('fieldConsume').checked;
    return { name, label, weight, imageUrl, description, stack, close, consume };
}

// ─── Event wiring ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // Tab buttons
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Close panel
    document.getElementById('btnClose').addEventListener('click', () => {
        nuiFetch('close');
    });

    // Add item button
    document.getElementById('btnAddItem').addEventListener('click', () => openModal());

    // Modal close/cancel
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modalCancel').addEventListener('click', closeModal);

    // Image URL preview on blur
    document.getElementById('fieldImage').addEventListener('blur', () => {
        const url = document.getElementById('fieldImage').value.trim();
        if (url) updatePreview(url);
    });
    document.getElementById('fieldImage').addEventListener('input', () => {
        const url = document.getElementById('fieldImage').value.trim();
        if (!url) updatePreview(null);
    });

    // Auto-generate label from name
    document.getElementById('fieldName').addEventListener('input', (e) => {
        const label = document.getElementById('fieldLabel');
        if (!label.value) {
            label.value = e.target.value
                .replace(/_/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase());
        }
    });

    // Save item (add or edit)
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
            // Fetch image data from server if URL provided
            if (data.imageUrl) {
                nuiFetch('cacheImage', { url: data.imageUrl });
            }
            nuiFetch('addItem', data);
        }
        closeModal();
    });

    // Apply button
    document.getElementById('btnApply').addEventListener('click', async () => {
        const ok = await confirm('Apply Items', 'This will register all your custom items in ox_inventory immediately. Continue?');
        if (ok) {
            nuiFetch('applyItems');
            toast('Applying items to ox_inventory…', 'info');
        }
    });

    // Refresh buttons
    document.getElementById('btnRefreshMy').addEventListener('click', () => nuiFetch('getState'));
    document.getElementById('btnRefreshOx').addEventListener('click', () => nuiFetch('getState'));

    // Search – My Items
    document.getElementById('searchMy').addEventListener('input', e => {
        renderMyItems(e.target.value);
    });

    // Search – Ox Items
    document.getElementById('searchOx').addEventListener('input', e => {
        renderOxItems(e.target.value);
    });

    // Select all – My
    document.getElementById('selectAllMy').addEventListener('change', e => {
        if (e.target.checked) {
            state.myItems.forEach(it => state.selectedMy.add(it.name));
        } else {
            state.selectedMy.clear();
        }
        renderMyItems(document.getElementById('searchMy').value);
    });

    // Select all – Ox
    document.getElementById('selectAllOx').addEventListener('change', e => {
        if (e.target.checked) {
            state.oxItems.forEach(it => state.selectedOx.add(it.name));
        } else {
            state.selectedOx.clear();
        }
        renderOxItems(document.getElementById('searchOx').value);
    });

    // Delete selected (My Items)
    document.getElementById('btnDeleteSelected').addEventListener('click', async () => {
        if (state.selectedMy.size === 0) { toast('No items selected.', 'error'); return; }
        const ok = await confirm('Delete Items', `Delete ${state.selectedMy.size} selected item(s)? This cannot be undone.`);
        if (ok) {
            nuiFetch('deleteItems', { names: [...state.selectedMy] });
            state.selectedMy.clear();
        }
    });

    // Grid click delegation
    document.getElementById('gridMy').addEventListener('click', e => {
        const cb = e.target.closest('[data-cb-type="my"]');
        if (cb) {
            const name = cb.dataset.cbName;
            if (cb.checked) state.selectedMy.add(name); else state.selectedMy.delete(name);
            const card = document.querySelector(`.item-card[data-name="${name}"][data-type="my"]`);
            if (card) card.classList.toggle('selected', cb.checked);
            return;
        }
        const card = e.target.closest('.item-card[data-type="my"]');
        if (card && !e.target.closest('.card-checkbox')) {
            const item = state.myItems.find(it => it.name === card.dataset.name);
            if (item) openModal(item, false);
        }
    });

    document.getElementById('gridOx').addEventListener('click', async e => {
        const cb = e.target.closest('[data-cb-type="ox"]');
        if (cb) {
            const name = cb.dataset.cbName;
            if (cb.checked) state.selectedOx.add(name); else state.selectedOx.delete(name);
            const card = document.querySelector(`.item-card[data-name="${name}"][data-type="ox"]`);
            if (card) card.classList.toggle('selected', cb.checked);
            return;
        }
        const card = e.target.closest('.item-card[data-type="ox"]');
        if (card && !e.target.closest('.card-checkbox')) {
            const item = state.oxItems.find(it => it.name === card.dataset.name);
            if (!item) return;
            if (item.sensitive) {
                const ok = await confirm(
                    'Sensitive Item',
                    `"${item.label || item.name}" is marked as sensitive (weapon/ammo). Editing it may affect gameplay balance. Continue?`
                );
                if (!ok) return;
            }
            openModal(item, true);
        }
    });

    // Keyboard: Escape closes modal or panel
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (!document.getElementById('confirmOverlay').classList.contains('hidden')) {
                document.getElementById('confirmOverlay').classList.add('hidden');
                return;
            }
            if (!document.getElementById('modalOverlay').classList.contains('hidden')) {
                closeModal();
                return;
            }
            nuiFetch('close');
        }
    });
});

// ─── NUI Message handler ──────────────────────────────────────────────────────
window.addEventListener('message', e => {
    const { type, data, success, applied, failed, url, b64 } = e.data || {};

    switch (type) {
        case 'setVisible': {
            const hidden = !e.data.visible;
            document.getElementById('backdrop').classList.toggle('hidden', hidden);
            document.getElementById('panel').classList.toggle('hidden', hidden);
            if (!hidden) nuiFetch('getState');
            break;
        }

        case 'stateResponse': {
            state.myItems = data.myItems || [];
            state.oxItems = (data.oxItems || []).sort((a, b) =>
                (a.label || a.name).localeCompare(b.label || b.name)
            );
            renderMyItems(document.getElementById('searchMy').value);
            renderOxItems(document.getElementById('searchOx').value);
            break;
        }

        case 'addItemResponse': {
            if (success) {
                state.myItems.push(data);
                renderMyItems(document.getElementById('searchMy').value);
                toast(`Item "${data.label || data.name}" added.`, 'success');
            } else {
                toast(data || 'Failed to add item.', 'error');
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
                toast(data || 'Failed to edit item.', 'error');
            }
            break;
        }

        case 'deleteItemsResponse': {
            if (success) {
                nuiFetch('getState');
                toast('Selected items deleted.', 'success');
            } else {
                toast('Failed to delete items.', 'error');
            }
            break;
        }

        case 'applyResponse': {
            toast(`Applied: ${applied} item(s). Failed: ${failed}.`, failed > 0 ? 'error' : 'success');
            break;
        }

        case 'imageCached': {
            if (b64) {
                imageUrlCache[url] = b64;
                // Update any item that references this URL
                state.myItems.forEach(it => {
                    if (it.imageUrl === url) it.imageData = b64;
                });
                renderMyItems(document.getElementById('searchMy').value);
            }
            break;
        }
    }
});
