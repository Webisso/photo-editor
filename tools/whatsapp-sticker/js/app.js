(function () {
  'use strict';

  const MIN_STICKERS = 3;
  const MAX_STICKERS = 30;
  const STICKER_SIZE = 512;
  const STICKER_MARGIN = 16;
  const MAX_STICKER_BYTES = 100 * 1024;
  const MAX_TRAY_BYTES = 50 * 1024;

  let stickers = []; // { id, file, name, emojis, previewUrl, trayCustom? }
  let nextId = 1;
  let customTrayFile = null;
  let customTrayUrl = null;
  let lastZipBlob = null;
  let dragId = null;

  const $ = (sel) => document.querySelector(sel);

  const packName      = $('#pack-name');
  const packPublisher = $('#pack-publisher');
  const packId        = $('#pack-id');
  const packEmail     = $('#pack-email');
  const fileInput     = $('#file-input');
  const uploadZone    = $('#upload-zone');
  const uploadBtn     = $('#upload-btn');
  const stickerList   = $('#sticker-list');
  const stickerCount  = $('#sticker-count');
  const btnSave       = $('#btn-save');
  const trayPreview   = $('#tray-preview');
  const trayInput     = $('#tray-input');
  const btnTray       = $('#btn-tray');
  const btnTrayReset  = $('#btn-tray-reset');
  const modal         = $('#modal');
  const modalSubtitle = $('#modal-subtitle');
  const btnDownloadZip = $('#btn-download-zip');
  const toast         = $('#toast');

  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._ -]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 64) || 'sticker_pack';
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Görsel yüklenemedi'));
      };
      img.src = url;
    });
  }

  function drawStickerCanvas(img) {
    const canvas = document.createElement('canvas');
    canvas.width = STICKER_SIZE;
    canvas.height = STICKER_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, STICKER_SIZE, STICKER_SIZE);

    const inner = STICKER_SIZE - STICKER_MARGIN * 2;
    const scale = Math.min(inner / img.width, inner / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (STICKER_SIZE - w) / 2;
    const y = (STICKER_SIZE - h) / 2;
    ctx.drawImage(img, x, y, w, h);
    return canvas;
  }

  async function canvasToWebP(canvas, maxBytes) {
    let quality = 0.9;
    let blob = null;
    while (quality >= 0.2) {
      blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', quality));
      if (blob && blob.size <= maxBytes) return blob;
      quality -= 0.04;
    }
    return blob;
  }

  async function canvasToPngUnder(canvas, maxBytes) {
    let blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    if (blob.size <= maxBytes) return blob;

    const small = document.createElement('canvas');
    small.width = 96;
    small.height = 96;
    small.getContext('2d').drawImage(canvas, 0, 0, 96, 96);
    blob = await new Promise((res) => small.toBlob(res, 'image/png'));
    return blob;
  }

  function updateTrayPreview() {
    trayPreview.innerHTML = '';
    if (customTrayUrl) {
      const img = document.createElement('img');
      img.src = customTrayUrl;
      img.alt = 'Tray';
      trayPreview.appendChild(img);
      return;
    }
    if (stickers.length) {
      const img = document.createElement('img');
      img.src = stickers[0].previewUrl;
      img.alt = 'Tray';
      trayPreview.appendChild(img);
      return;
    }
    trayPreview.innerHTML = '<span class="text-zinc-600 text-xs">Otomatik</span>';
  }

  function updateUI() {
    stickerCount.textContent = `${stickers.length} / ${MAX_STICKERS}`;
    const valid = stickers.length >= MIN_STICKERS
      && packName.value.trim()
      && packPublisher.value.trim();
    btnSave.disabled = !valid;
    updateTrayPreview();
  }

  function renderStickers() {
    stickerList.innerHTML = '';
    stickers.forEach((s, index) => {
      const card = document.createElement('div');
      card.className = 'sticker-card';
      card.draggable = true;
      card.dataset.id = s.id;

      card.innerHTML = `
        <div class="flex flex-col items-center gap-1">
          <span class="drag-handle" title="Sürükle">⠿</span>
          <img class="sticker-thumb" src="${s.previewUrl}" alt="">
          <span class="sticker-meta">#${index + 1}</span>
        </div>
        <div class="sticker-fields">
          <input type="text" data-field="name" value="${escapeHtml(s.name.slice(0, 125))}" placeholder="Sticker adı / erişilebilirlik metni" maxlength="125">
          <input type="text" data-field="emojis" value="${escapeHtml(s.emojis.slice(0, 30))}" placeholder="Emoji (max 3, örn: 😀,🔥,❤️)" maxlength="30">
          <span class="sticker-meta">${s.file.name}</span>
        </div>
        <div class="sticker-actions">
          <button type="button" class="btn-icon btn-delete" title="Sil">✕</button>
        </div>
      `;

      card.querySelector('[data-field="name"]').addEventListener('input', (e) => {
        s.name = e.target.value;
      });
      card.querySelector('[data-field="emojis"]').addEventListener('input', (e) => {
        s.emojis = e.target.value;
      });
      card.querySelector('.btn-delete').addEventListener('click', () => removeSticker(s.id));

      card.addEventListener('dragstart', (e) => {
        dragId = s.id;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        dragId = null;
        card.classList.remove('dragging');
        stickerList.querySelectorAll('.sticker-card').forEach(c => c.classList.remove('drag-over'));
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragId && dragId !== s.id) card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (!dragId || dragId === s.id) return;
        const from = stickers.findIndex(x => x.id === dragId);
        const to = stickers.findIndex(x => x.id === s.id);
        const [item] = stickers.splice(from, 1);
        stickers.splice(to, 0, item);
        renderStickers();
        updateUI();
      });

      stickerList.appendChild(card);
    });
    updateUI();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  async function addFiles(files) {
    const remaining = MAX_STICKERS - stickers.length;
    if (remaining <= 0) {
      showToast(`En fazla ${MAX_STICKERS} sticker ekleyebilirsiniz.`);
      return;
    }

    const toAdd = Array.from(files).filter(f => f.type.startsWith('image/')).slice(0, remaining);
    if (!toAdd.length) {
      showToast('Geçerli görsel dosyası seçin.');
      return;
    }

    for (const file of toAdd) {
      try {
        const { img, url } = await loadImage(file);
        const canvas = drawStickerCanvas(img);
        const previewUrl = canvas.toDataURL('image/png');
        URL.revokeObjectURL(url);

        const baseName = file.name.replace(/\.[^.]+$/, '').slice(0, 40);
        stickers.push({
          id: nextId++,
          file,
          name: baseName,
          emojis: '😀',
          previewUrl,
        });
      } catch {
        showToast(`${file.name} yüklenemedi.`);
      }
    }

    if (!packId.value.trim() && packName.value.trim()) {
      packId.value = slugify(packName.value.trim());
    }

    renderStickers();
  }

  function removeSticker(id) {
    stickers = stickers.filter(x => x.id !== id);
    renderStickers();
  }

  async function processTrayImage() {
    let img;
    if (customTrayFile) {
      const loaded = await loadImage(customTrayFile);
      img = loaded.img;
      URL.revokeObjectURL(loaded.url);
    } else if (stickers.length) {
      const loaded = await loadImage(stickers[0].file);
      img = loaded.img;
      URL.revokeObjectURL(loaded.url);
    } else {
      throw new Error('Tray ikonu için görsel yok');
    }

    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 96, 96);
    const scale = Math.min(96 / img.width, 96 / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (96 - w) / 2, (96 - h) / 2, w, h);
    return canvasToPngUnder(canvas, MAX_TRAY_BYTES);
  }

  async function buildWastickers() {
    const zip = new JSZip();
    const warnings = [];
    const title = packName.value.trim().slice(0, 128);
    const author = packPublisher.value.trim().slice(0, 128);

    zip.file('title.txt', title);
    zip.file('author.txt', author);

    const coverBlob = await processTrayImage();
    if (coverBlob.size > MAX_TRAY_BYTES) {
      warnings.push(`Tray ikonu ${Math.round(coverBlob.size / 1024)}KB (50KB limiti)`);
    }
    zip.file('cover.png', coverBlob);

    let ts = Math.floor(Date.now() / 1000);
    for (let i = 0; i < stickers.length; i++) {
      const s = stickers[i];
      const { img, url } = await loadImage(s.file);
      const canvas = drawStickerCanvas(img);
      URL.revokeObjectURL(url);

      const blob = await canvasToWebP(canvas, MAX_STICKER_BYTES);
      if (!blob) throw new Error(`"${s.name}" WebP dönüşümü başarısız`);

      if (blob.size > MAX_STICKER_BYTES) {
        throw new Error(`"${s.name}" 100KB altına indirilemedi (${Math.round(blob.size / 1024)}KB)`);
      }

      ts += 1;
      zip.file(`${ts}.webp`, blob);
    }

    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    return { zipBlob, warnings };
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  async function savePack() {
    if (stickers.length < MIN_STICKERS) {
      showToast(`En az ${MIN_STICKERS} sticker gerekli.`);
      return;
    }
    if (!packName.value.trim() || !packPublisher.value.trim()) {
      showToast('Paket adı ve yayıncı zorunlu.');
      return;
    }

    btnSave.disabled = true;
    showToast('Paket hazırlanıyor...');

    try {
      const { zipBlob, warnings } = await buildWastickers();
      lastZipBlob = zipBlob;

      if (warnings.length) {
        showToast(`Uyarı: ${warnings[0]}`);
      }

      modalSubtitle.textContent = `"${packName.value.trim()}" — ${stickers.length} sticker (.wastickers)`;
      modal.classList.remove('hidden');
      showToast('Paket hazır! .wastickers dosyasını indirin.');
    } catch (err) {
      console.error(err);
      showToast('Paket oluşturulamadı: ' + err.message);
    } finally {
      btnSave.disabled = false;
      updateUI();
    }
  }

  function downloadZip() {
    if (!lastZipBlob) return;
    const name = slugify(packName.value.trim() || 'sticker_pack') + '.wastickers';
    const url = URL.createObjectURL(lastZipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    showToast('.wastickers dosyası indirildi!');
  }

  // Events
  packName.addEventListener('input', () => {
    if (!packId.dataset.manual) {
      packId.value = slugify(packName.value.trim());
    }
    updateUI();
  });
  packPublisher.addEventListener('input', updateUI);
  packId.addEventListener('input', () => { packId.dataset.manual = '1'; });

  uploadZone.addEventListener('click', (e) => {
    if (e.target === uploadBtn) return;
    fileInput.click();
  });
  uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) addFiles(fileInput.files);
    fileInput.value = '';
  });
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  btnTray.addEventListener('click', () => trayInput.click());
  trayInput.addEventListener('change', async () => {
    const file = trayInput.files[0];
    if (!file) return;
    if (customTrayUrl) URL.revokeObjectURL(customTrayUrl);
    customTrayFile = file;
    customTrayUrl = URL.createObjectURL(file);
    updateTrayPreview();
    trayInput.value = '';
  });
  btnTrayReset.addEventListener('click', () => {
    customTrayFile = null;
    if (customTrayUrl) URL.revokeObjectURL(customTrayUrl);
    customTrayUrl = null;
    updateTrayPreview();
  });

  btnSave.addEventListener('click', savePack);
  btnDownloadZip.addEventListener('click', downloadZip);
  $('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  updateUI();
})();
