const storage = {
  get: (key, callback) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get([key], (res) => callback(res[key]));
      } else {
        const data = localStorage.getItem(key);
        callback(data ? JSON.parse(data) : null);
      }
    } catch (err) {
      console.error("Storage get error:", err);
      callback(null);
    }
  },
  set: (key, val, callback) => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ [key]: val }, callback);
      } else {
        localStorage.setItem(key, JSON.stringify(val));
        if (callback) callback();
      }
    } catch (err) {
      console.error("Storage set error:", err);
      if (callback) callback();
    }
  }
};

const defaultData = [
  { id: '1', type: 'link', title: 'GitHub', url: 'https://github.com' },
  { id: '2', type: 'link', title: 'YouTube', url: 'https://youtube.com' },
  { id: '3', type: 'link', title: 'Reddit', url: 'https://reddit.com' },
  { id: '4', type: 'link', title: 'Twitter / X', url: 'https://x.com' },
  { id: '5', type: 'link', title: 'Wikipedia', url: 'https://wikipedia.org' },
  { id: '6', type: 'link', title: 'Hacker News', url: 'https://news.ycombinator.com' },
  {
    id: 'folder-1',
    type: 'folder',
    title: 'Productivity',
    items: [
      { id: 'f-1', type: 'link', title: 'Google Docs', url: 'https://docs.google.com' },
      { id: 'f-2', type: 'link', title: 'Notion', url: 'https://notion.so' },
      { id: 'f-3', type: 'link', title: 'Figma', url: 'https://figma.com' },
      { id: 'f-4', type: 'link', title: 'ChatGPT', url: 'https://chatgpt.com' }
    ]
  }
];

const defaultAppearance = {
  radius: 14,
  iconBgMode: 'dark',
  tintColor: '#3b82f6',
  tintStrength: 0,
  wpUrl: '',
  wpDim: 50
};

let speedDialData = [];
let appearanceSettings = { ...defaultAppearance };
let activeFolderId = null;
let pendingDelete = null;

const placeholderSvg = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="%2394a3b8"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101"/></svg>';

function normalizeUrl(url) {
  if (!url) return '';
  let trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    trimmed = 'https://' + trimmed;
  }
  return trimmed;
}

function extractHostname(url) {
  try {
    const parsed = new URL(normalizeUrl(url));
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatTitleFromUrl(url) {
  if (!url || !url.trim()) return '';
  try {
    const parsed = new URL(normalizeUrl(url));
    let host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const parts = host.split('.');
    let base = parts[0];
    return base
      .split(/[-_]/)
      .filter(Boolean)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  } catch {
    return url;
  }
}

function getFaviconUrl(url) {
  const hostname = extractHostname(url);
  return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${encodeURIComponent(hostname)}&size=128`;
}

function attachFaviconFallback(imgElement, originalUrl, hasCustomIcon) {
  if (hasCustomIcon) {
    imgElement.addEventListener('error', function errorHandler() {
      imgElement.removeEventListener('error', errorHandler);
      imgElement.src = placeholderSvg;
    });
    return;
  }

  const hostname = extractHostname(originalUrl);
  const fallbacks = [
    `https://icon.horse/icon/${hostname}`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`,
    `https://unavatar.io/${encodeURIComponent(hostname)}`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=128`,
    `https://${hostname}/favicon.ico`,
    placeholderSvg
  ];
  let step = 0;

  imgElement.addEventListener('error', function errorHandler() {
    if (step < fallbacks.length) {
      imgElement.src = fallbacks[step];
      step++;
    } else {
      imgElement.removeEventListener('error', errorHandler);
      imgElement.src = placeholderSvg;
    }
  });
}

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
}

function hexToRgb(hex) {
  let clean = (hex || '#3b82f6').replace('#', '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  const bigint = parseInt(clean, 16) || 0;
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

function applyAppearance(settings) {
  const root = document.documentElement;
  const radius = parseInt(settings.radius, 10);
  root.style.setProperty('--icon-radius', radius >= 26 ? '50%' : `${radius}px`);

  const rgb = hexToRgb(settings.tintColor || '#3b82f6');
  const t = (parseInt(settings.tintStrength, 10) || 0) / 100;
  const mode = settings.iconBgMode || 'dark';

  if (mode === 'light') {
    if (t > 0) {
      root.style.setProperty('--icon-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(0.92 + t * 0.08, 1)})`);
      root.style.setProperty('--ui-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.85 + t * 0.1})`);
      root.style.setProperty('--ui-panel-bg', `rgba(${Math.floor(rgb.r * 0.95 + 10)}, ${Math.floor(rgb.g * 0.95 + 10)}, ${Math.floor(rgb.b * 0.95 + 10)}, 0.98)`);
      root.style.setProperty('--ui-input-bg', `rgba(255, 255, 255, 0.9)`);
      root.style.setProperty('--ui-btn-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`);
      root.style.setProperty('--ui-btn-hover', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.95)`);
      root.style.setProperty('--ui-text', '#ffffff');
      root.style.setProperty('--ui-text-sub', '#e2e8f0');
      root.style.setProperty('--icon-text-color', '#ffffff');
      root.style.setProperty('--ui-border', 'rgba(255, 255, 255, 0.3)');
      root.style.setProperty('--ui-panel-border', 'rgba(255, 255, 255, 0.25)');
    } else {
      root.style.setProperty('--icon-bg', 'rgba(255, 255, 255, 0.92)');
      root.style.setProperty('--ui-bg', 'rgba(255, 255, 255, 0.88)');
      root.style.setProperty('--ui-panel-bg', '#ffffff');
      root.style.setProperty('--ui-input-bg', '#f1f5f9');
      root.style.setProperty('--ui-btn-bg', 'rgba(241, 245, 249, 0.9)');
      root.style.setProperty('--ui-btn-hover', 'rgba(226, 232, 240, 1)');
      root.style.setProperty('--ui-text', '#0f172a');
      root.style.setProperty('--ui-text-sub', '#475569');
      root.style.setProperty('--icon-text-color', '#0f172a');
      root.style.setProperty('--ui-border', 'rgba(0, 0, 0, 0.12)');
      root.style.setProperty('--ui-panel-border', '#cbd5e1');
    }
    root.style.setProperty('--icon-border', 'rgba(255, 255, 255, 0.5)');
  } else if (mode === 'glass') {
    if (t > 0) {
      root.style.setProperty('--icon-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.15 + t * 0.45})`);
      root.style.setProperty('--ui-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.18 + t * 0.35})`);
      root.style.setProperty('--ui-panel-bg', `rgba(${Math.floor(rgb.r * 0.25 + 10)}, ${Math.floor(rgb.g * 0.25 + 15)}, ${Math.floor(rgb.b * 0.25 + 25)}, 0.78)`);
      root.style.setProperty('--ui-btn-bg', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.2 + t * 0.3})`);
      root.style.setProperty('--ui-btn-hover', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.35 + t * 0.4})`);
    } else {
      root.style.setProperty('--icon-bg', 'rgba(255, 255, 255, 0.12)');
      root.style.setProperty('--ui-bg', 'rgba(255, 255, 255, 0.12)');
      root.style.setProperty('--ui-panel-bg', 'rgba(15, 23, 42, 0.75)');
      root.style.setProperty('--ui-btn-bg', 'rgba(255, 255, 255, 0.12)');
      root.style.setProperty('--ui-btn-hover', 'rgba(255, 255, 255, 0.22)');
    }
    root.style.setProperty('--ui-input-bg', 'rgba(0, 0, 0, 0.4)');
    root.style.setProperty('--ui-text', '#f8fafc');
    root.style.setProperty('--ui-text-sub', '#cbd5e1');
    root.style.setProperty('--icon-text-color', '#f8fafc');
    root.style.setProperty('--ui-border', 'rgba(255, 255, 255, 0.25)');
    root.style.setProperty('--ui-panel-border', 'rgba(255, 255, 255, 0.18)');
    root.style.setProperty('--icon-border', 'rgba(255, 255, 255, 0.25)');
  } else {
    if (t > 0) {
      root.style.setProperty('--icon-bg', `linear-gradient(135deg, rgba(15, 23, 42, 0.88), rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.25 + t * 0.6}))`);
      root.style.setProperty('--ui-bg', `linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.2 + t * 0.4}))`);
      root.style.setProperty('--ui-panel-bg', `rgba(${Math.floor(rgb.r * 0.15 + 10)}, ${Math.floor(rgb.g * 0.15 + 14)}, ${Math.floor(rgb.b * 0.15 + 24)}, 0.95)`);
      root.style.setProperty('--ui-btn-bg', `rgba(${Math.floor(rgb.r * 0.25 + 15)}, ${Math.floor(rgb.g * 0.25 + 23)}, ${Math.floor(rgb.b * 0.25 + 42)}, 0.85)`);
      root.style.setProperty('--ui-btn-hover', `rgba(${Math.floor(rgb.r * 0.35 + 20)}, ${Math.floor(rgb.g * 0.35 + 30)}, ${Math.floor(rgb.b * 0.35 + 50)}, 0.95)`);
    } else {
      root.style.setProperty('--icon-bg', 'rgba(15, 23, 42, 0.85)');
      root.style.setProperty('--ui-bg', 'rgba(15, 23, 42, 0.85)');
      root.style.setProperty('--ui-panel-bg', '#0f172a');
      root.style.setProperty('--ui-btn-bg', 'rgba(15, 23, 42, 0.8)');
      root.style.setProperty('--ui-btn-hover', 'rgba(30, 41, 59, 0.95)');
    }
    root.style.setProperty('--ui-input-bg', '#030712');
    root.style.setProperty('--ui-text', '#f1f5f9');
    root.style.setProperty('--ui-text-sub', '#94a3b8');
    root.style.setProperty('--icon-text-color', '#cbd5e1');
    root.style.setProperty('--ui-border', 'rgba(255, 255, 255, 0.12)');
    root.style.setProperty('--ui-panel-border', '#1e293b');
    root.style.setProperty('--icon-border', 'rgba(255, 255, 255, 0.1)');
  }

  const bgLayer = document.getElementById('bg-layer');
  const bgOverlay = document.getElementById('bg-overlay');

  if (settings.wpUrl && settings.wpUrl.trim()) {
    bgLayer.style.backgroundImage = `url('${settings.wpUrl}')`;
    bgOverlay.style.opacity = (settings.wpDim / 100).toString();
  } else {
    bgLayer.style.backgroundImage = 'none';
    bgOverlay.style.opacity = '0';
  }
}

function loadAppearance() {
  storage.get('appearanceSettings', (res) => {
    if (res) {
      appearanceSettings = { ...defaultAppearance, ...res };
    }
    applyAppearance(appearanceSettings);
  });
}

function saveAppearance() {
  storage.set('appearanceSettings', appearanceSettings);
  applyAppearance(appearanceSettings);
}

function saveData() {
  storage.set('speedDialData', speedDialData);
  renderGrid();
  if (activeFolderId) {
    renderFolderModal(activeFolderId);
  }
}

function loadData() {
  storage.get('speedDialData', (res) => {
    if (res && Array.isArray(res) && res.length > 0) {
      speedDialData = res;
    } else {
      speedDialData = defaultData;
      storage.set('speedDialData', defaultData);
    }
    renderGrid();
  });
  loadAppearance();
}

function renderGrid() {
  const container = document.getElementById('grid-container');
  container.innerHTML = '';

  speedDialData.forEach((item) => {
    if (item.type === 'link') {
      container.appendChild(createLinkElement(item, false, null));
    } else if (item.type === 'folder') {
      container.appendChild(createFolderElement(item));
    }
  });
}

function createLinkElement(item, inFolder = false, parentFolderId = null) {
  const speedItem = document.createElement('div');
  speedItem.className = 'speed-item';

  const faviconUrl = item.customIcon || getFaviconUrl(item.url);
  const title = item.title || formatTitleFromUrl(item.url);

  speedItem.innerHTML = `
    <div class="icon-tile">
      <img src="${faviconUrl}" alt="${title}">
      <div class="item-actions">
        <button type="button" class="action-btn action-btn-edit" title="Edit / Move">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
        </button>
        <button type="button" class="action-btn action-btn-del" title="Delete bookmark">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"></path></svg>
        </button>
      </div>
    </div>
    <span class="item-label">${title}</span>
  `;

  const img = speedItem.querySelector('img');
  attachFaviconFallback(img, item.url, !!item.customIcon);

  speedItem.addEventListener('click', (e) => {
    if (e.target.closest('.item-actions')) return;
    window.location.href = normalizeUrl(item.url);
  });

  speedItem.querySelector('.action-btn-edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditLinkModal(item, inFolder, parentFolderId);
  });

  speedItem.querySelector('.action-btn-del').addEventListener('click', (e) => {
    e.stopPropagation();
    promptDelete(item.id, title, inFolder, false);
  });

  return speedItem;
}

function createFolderElement(folder) {
  const speedItem = document.createElement('div');
  speedItem.className = 'speed-item';

  const items = folder.items || [];
  const previewItems = items.slice(0, 4);

  let previewGrid = `<div class="folder-tile-grid">`;
  for (let i = 0; i < 4; i++) {
    if (previewItems[i]) {
      const faviconUrl = previewItems[i].customIcon || getFaviconUrl(previewItems[i].url);
      const isCustom = !!previewItems[i].customIcon;
      previewGrid += `<img src="${faviconUrl}" class="folder-tile-img" data-url="${encodeURIComponent(previewItems[i].url)}" data-custom="${isCustom}">`;
    } else {
      previewGrid += `<div class="folder-tile-empty"></div>`;
    }
  }
  previewGrid += `</div>`;

  speedItem.innerHTML = `
    <div class="icon-tile">
      ${previewGrid}
      <div class="item-actions">
        <button type="button" class="action-btn action-btn-del" title="Delete folder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6L6 18M6 6l12 12"></path></svg>
        </button>
      </div>
    </div>
    <span class="item-label">${folder.title}</span>
  `;

  speedItem.querySelectorAll('.folder-tile-img').forEach(fImg => {
    const rawUrl = decodeURIComponent(fImg.getAttribute('data-url') || '');
    const isCustom = fImg.getAttribute('data-custom') === 'true';
    attachFaviconFallback(fImg, rawUrl, isCustom);
  });

  speedItem.addEventListener('click', (e) => {
    if (e.target.closest('.item-actions')) return;
    openFolderModal(folder.id);
  });

  speedItem.querySelector('.action-btn-del').addEventListener('click', (e) => {
    e.stopPropagation();
    promptDelete(folder.id, folder.title, false, true, items.length);
  });

  return speedItem;
}

function populateFolderSelect(selectedFolderId = '') {
  const select = document.getElementById('link-folder-select');
  select.innerHTML = '<option value="">Main Screen (No Folder)</option>';
  speedDialData.forEach(item => {
    if (item.type === 'folder') {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `Folder: ${item.title}`;
      if (item.id === selectedFolderId) {
        opt.selected = true;
      }
      select.appendChild(opt);
    }
  });
}

function setCustomIconModalState(iconDataUrl) {
  const previewImg = document.getElementById('custom-icon-preview-img');
  const previewPlaceholder = document.getElementById('custom-icon-preview-placeholder');
  const clearBtn = document.getElementById('btn-clear-link-icon');
  const customIconInput = document.getElementById('link-custom-icon');

  customIconInput.value = iconDataUrl || '';

  if (iconDataUrl) {
    previewImg.src = iconDataUrl;
    previewImg.style.display = 'block';
    previewPlaceholder.style.display = 'none';
    clearBtn.style.display = 'inline-block';
  } else {
    previewImg.src = '';
    previewImg.style.display = 'none';
    previewPlaceholder.style.display = 'inline';
    clearBtn.style.display = 'none';
  }
}

function openAddLinkModal(targetFolderId = null) {
  document.getElementById('link-form').reset();
  document.getElementById('link-edit-id').value = '';
  document.getElementById('link-original-folder-id').value = '';
  document.getElementById('link-modal-title').textContent = 'Add New Bookmark';
  document.getElementById('link-submit-btn').textContent = 'Save Link';

  const titleInput = document.getElementById('link-title-input');
  delete titleInput.dataset.touched;

  setCustomIconModalState('');
  populateFolderSelect(targetFolderId || '');
  document.getElementById('link-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('link-url-input').focus(), 50);
}

function openEditLinkModal(item, inFolder, parentFolderId) {
  document.getElementById('link-form').reset();
  document.getElementById('link-edit-id').value = item.id;
  document.getElementById('link-original-folder-id').value = inFolder ? parentFolderId : '';
  document.getElementById('link-modal-title').textContent = 'Edit / Move Link';
  document.getElementById('link-submit-btn').textContent = 'Save Changes';

  document.getElementById('link-url-input').value = item.url || '';
  document.getElementById('link-title-input').value = item.title || '';
  document.getElementById('link-title-input').dataset.touched = 'true';

  setCustomIconModalState(item.customIcon || '');
  populateFolderSelect(inFolder ? parentFolderId : '');
  document.getElementById('link-modal').classList.remove('hidden');
}

function processCustomIconFile(file) {
  if (!file) return;

  if (file.type === 'image/svg+xml') {
    const reader = new FileReader();
    reader.onload = (e) => setCustomIconModalState(e.target.result);
    reader.readAsDataURL(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const maxDim = 128;
      let w = img.width;
      let h = img.height;

      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/png');
      setCustomIconModalState(dataUrl);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

document.getElementById('btn-upload-link-icon').addEventListener('click', () => {
  document.getElementById('link-icon-file-input').click();
});

document.getElementById('link-icon-file-input').addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    processCustomIconFile(e.target.files[0]);
    e.target.value = '';
  }
});

document.getElementById('btn-clear-link-icon').addEventListener('click', () => {
  setCustomIconModalState('');
});

function openAddFolderModal() {
  document.getElementById('folder-form').reset();
  document.getElementById('folder-modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('folder-title-input').focus(), 50);
}

function openBackupModal() {
  document.getElementById('backup-modal').classList.remove('hidden');
}

function openCustomizeModal() {
  document.getElementById('opt-radius').value = appearanceSettings.radius;
  document.getElementById('radius-val').textContent = `${appearanceSettings.radius}px`;

  document.querySelectorAll('.icon-bg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === appearanceSettings.iconBgMode);
  });

  document.getElementById('opt-tint-color').value = appearanceSettings.tintColor || '#3b82f6';
  document.getElementById('opt-tint-strength').value = appearanceSettings.tintStrength || 0;
  document.getElementById('tint-val').textContent = `${appearanceSettings.tintStrength || 0}%`;

  const isDataUrl = (appearanceSettings.wpUrl || '').startsWith('data:');
  document.getElementById('bg-url-input').value = isDataUrl ? '' : (appearanceSettings.wpUrl || '');
  document.getElementById('bg-dim-input').value = appearanceSettings.wpDim !== undefined ? appearanceSettings.wpDim : 50;
  document.getElementById('dim-value-text').textContent = `${document.getElementById('bg-dim-input').value}%`;

  document.getElementById('customize-modal').classList.remove('hidden');
}

function openFolderModal(folderId) {
  activeFolderId = folderId;
  renderFolderModal(folderId);
  document.getElementById('folder-view-modal').classList.remove('hidden');
}

function renderFolderModal(folderId) {
  const folder = speedDialData.find(item => item.id === folderId);
  if (!folder) {
    closeModals();
    return;
  }

  document.getElementById('folder-view-title').textContent = folder.title;
  const count = (folder.items || []).length;
  document.getElementById('folder-items-count').textContent = `${count} link${count === 1 ? '' : 's'}`;

  const container = document.getElementById('folder-grid-container');
  container.innerHTML = '';

  if (!folder.items || folder.items.length === 0) {
    container.innerHTML = `
      <div class="empty-folder-state" style="grid-column: 1 / -1;">
        This folder is currently empty. Click "Add Link" above to add bookmarks here.
      </div>
    `;
    return;
  }

  folder.items.forEach(item => {
    container.appendChild(createLinkElement(item, true, folderId));
  });
}

function promptDelete(id, name, inFolder, isFolder, itemCount = 0) {
  pendingDelete = { id, inFolder, isFolder };
  const msgEl = document.getElementById('delete-modal-msg');
  if (isFolder) {
    msgEl.textContent = `Are you sure you want to delete the folder "${name}" and all ${itemCount} link(s) inside it?`;
  } else {
    msgEl.textContent = `Are you sure you want to delete "${name}"?`;
  }
  document.getElementById('delete-modal').classList.remove('hidden');
}

document.getElementById('btn-confirm-delete').addEventListener('click', () => {
  if (!pendingDelete) return;
  const { id, inFolder, isFolder } = pendingDelete;

  if (isFolder) {
    speedDialData = speedDialData.filter(item => item.id !== id);
  } else if (inFolder && activeFolderId) {
    const folder = speedDialData.find(f => f.id === activeFolderId);
    if (folder) {
      folder.items = (folder.items || []).filter(item => item.id !== id);
    }
  } else {
    speedDialData = speedDialData.filter(item => item.id !== id);
  }

  pendingDelete = null;
  document.getElementById('delete-modal').classList.add('hidden');
  saveData();
});

function closeModals() {
  document.getElementById('link-modal').classList.add('hidden');
  document.getElementById('folder-modal').classList.add('hidden');
  document.getElementById('folder-view-modal').classList.add('hidden');
  document.getElementById('customize-modal').classList.add('hidden');
  document.getElementById('delete-modal').classList.add('hidden');
  document.getElementById('backup-modal').classList.add('hidden');
  pendingDelete = null;
  activeFolderId = null;
}

function exportBackup() {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    speedDialData,
    appearanceSettings
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `speed_dial_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (Array.isArray(parsed)) {
        speedDialData = parsed;
      } else if (parsed && Array.isArray(parsed.speedDialData)) {
        speedDialData = parsed.speedDialData;
        if (parsed.appearanceSettings) {
          appearanceSettings = { ...defaultAppearance, ...parsed.appearanceSettings };
          saveAppearance();
        }
      } else {
        alert('Invalid backup format.');
        return;
      }
      saveData();
      closeModals();
    } catch (err) {
      alert('Failed to parse backup file.');
    }
  };
  reader.readAsText(file);
}

document.getElementById('btn-export-backup').addEventListener('click', exportBackup);
document.getElementById('btn-trigger-import').addEventListener('click', () => {
  document.getElementById('import-file-input').click();
});
document.getElementById('import-file-input').addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleImportFile(e.target.files[0]);
    e.target.value = '';
  }
});

function processLocalWallpaper(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const maxW = 1600;
      const maxH = 900;
      let w = img.width;
      let h = img.height;

      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.75);
      appearanceSettings.wpUrl = optimizedDataUrl;
      document.getElementById('bg-url-input').value = '';
      applyAppearance(appearanceSettings);
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

document.getElementById('btn-upload-local-bg').addEventListener('click', () => {
  document.getElementById('local-bg-input').click();
});

document.getElementById('local-bg-input').addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    processLocalWallpaper(e.target.files[0]);
    e.target.value = '';
  }
});

const linkUrlInput = document.getElementById('link-url-input');
const linkTitleInput = document.getElementById('link-title-input');

linkUrlInput.addEventListener('input', (e) => {
  if (!linkTitleInput.dataset.touched) {
    linkTitleInput.value = formatTitleFromUrl(e.target.value);
  }
});

linkTitleInput.addEventListener('input', (e) => {
  if (e.target.value.trim().length > 0) {
    linkTitleInput.dataset.touched = 'true';
  } else {
    delete linkTitleInput.dataset.touched;
  }
});

document.getElementById('link-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const rawUrl = linkUrlInput.value.trim();
  const title = linkTitleInput.value.trim();
  const editId = document.getElementById('link-edit-id').value;
  const originalFolderId = document.getElementById('link-original-folder-id').value;
  const targetFolderId = document.getElementById('link-folder-select').value;
  const customIcon = document.getElementById('link-custom-icon').value.trim();

  if (!rawUrl) return;

  const url = normalizeUrl(rawUrl);
  const formattedTitle = title || formatTitleFromUrl(url);

  if (editId) {
    if (originalFolderId) {
      const origFolder = speedDialData.find(f => f.id === originalFolderId);
      if (origFolder && origFolder.items) {
        origFolder.items = origFolder.items.filter(i => i.id !== editId);
      }
    } else {
      speedDialData = speedDialData.filter(i => i.id !== editId);
    }

    const updatedItem = {
      id: editId,
      type: 'link',
      title: formattedTitle,
      url: url,
      ...(customIcon ? { customIcon } : {})
    };

    if (targetFolderId) {
      const targetFolder = speedDialData.find(f => f.id === targetFolderId);
      if (targetFolder) {
        if (!targetFolder.items) targetFolder.items = [];
        targetFolder.items.push(updatedItem);
      }
    } else {
      speedDialData.push(updatedItem);
    }
  } else {
    const newLinkObject = {
      id: createId(),
      type: 'link',
      title: formattedTitle,
      url: url,
      ...(customIcon ? { customIcon } : {})
    };

    if (targetFolderId) {
      const folder = speedDialData.find(f => f.id === targetFolderId);
      if (folder) {
        if (!folder.items) folder.items = [];
        folder.items.push(newLinkObject);
      }
    } else {
      speedDialData.push(newLinkObject);
    }
  }

  saveData();
  closeModals();
});

document.getElementById('folder-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('folder-title-input').value.trim();
  if (!title) return;

  const folderObject = {
    id: createId(),
    type: 'folder',
    title: title,
    items: []
  };

  speedDialData.push(folderObject);
  saveData();
  closeModals();
});

document.getElementById('opt-radius').addEventListener('input', (e) => {
  appearanceSettings.radius = parseInt(e.target.value, 10);
  document.getElementById('radius-val').textContent = `${appearanceSettings.radius}px`;
  applyAppearance(appearanceSettings);
});

document.querySelectorAll('.radius-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    const r = parseInt(btn.getAttribute('data-radius'), 10);
    appearanceSettings.radius = r;
    document.getElementById('opt-radius').value = r;
    document.getElementById('radius-val').textContent = `${r}px`;
    applyAppearance(appearanceSettings);
  });
});

document.querySelectorAll('.icon-bg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.icon-bg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    appearanceSettings.iconBgMode = btn.getAttribute('data-mode');
    applyAppearance(appearanceSettings);
  });
});

document.getElementById('opt-tint-color').addEventListener('input', (e) => {
  appearanceSettings.tintColor = e.target.value;
  applyAppearance(appearanceSettings);
});

document.querySelectorAll('.swatch-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.getAttribute('data-color');
    appearanceSettings.tintColor = color;
    document.getElementById('opt-tint-color').value = color;
    if ((appearanceSettings.tintStrength || 0) === 0) {
      appearanceSettings.tintStrength = 30;
      document.getElementById('opt-tint-strength').value = 30;
      document.getElementById('tint-val').textContent = '30%';
    }
    applyAppearance(appearanceSettings);
  });
});

document.getElementById('opt-tint-strength').addEventListener('input', (e) => {
  appearanceSettings.tintStrength = parseInt(e.target.value, 10);
  document.getElementById('tint-val').textContent = `${appearanceSettings.tintStrength}%`;
  applyAppearance(appearanceSettings);
});

document.getElementById('bg-dim-input').addEventListener('input', (e) => {
  appearanceSettings.wpDim = parseInt(e.target.value, 10);
  document.getElementById('dim-value-text').textContent = `${e.target.value}%`;
  applyAppearance(appearanceSettings);
});

document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const url = btn.getAttribute('data-url');
    document.getElementById('bg-url-input').value = url;
    appearanceSettings.wpUrl = url;
    applyAppearance(appearanceSettings);
  });
});

document.getElementById('customize-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const urlVal = document.getElementById('bg-url-input').value.trim();
  if (urlVal) {
    appearanceSettings.wpUrl = urlVal;
  }
  saveAppearance();
  closeModals();
});

document.getElementById('btn-reset-appearance').addEventListener('click', () => {
  appearanceSettings = { ...defaultAppearance };
  saveAppearance();
  closeModals();
});

document.getElementById('btn-open-add-link').addEventListener('click', () => openAddLinkModal());
document.getElementById('btn-open-add-folder').addEventListener('click', () => openAddFolderModal());
document.getElementById('btn-open-backup').addEventListener('click', () => openBackupModal());
document.getElementById('btn-open-customize').addEventListener('click', () => openCustomizeModal());
document.getElementById('btn-add-link-to-current-folder').addEventListener('click', () => {
  openAddLinkModal(activeFolderId);
});
document.getElementById('btn-close-folder-view').addEventListener('click', closeModals);

document.querySelectorAll('.btn-close-modal').forEach(btn => {
  btn.addEventListener('click', closeModals);
});

document.querySelectorAll('.modal-backdrop').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModals();
  });
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModals();
});

loadData();