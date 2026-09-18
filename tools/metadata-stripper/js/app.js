(function () {
  'use strict';

  let files = []; // { id, file, previewUrl, status, cleanBlob?, cleanName?, originalMeta?, cleanMeta?, error? }
  let nextId = 1;

  const CAMERAS = [
    { make: 'Canon', model: 'EOS 5D Mark IV', lens: 'EF 24-70mm f/2.8L II USM', software: 'Adobe Lightroom Classic 11.0' },
    { make: 'Nikon', model: 'D850', lens: 'AF-S NIKKOR 50mm f/1.8G', software: 'Capture One 23' },
    { make: 'Sony', model: 'ILCE-7M3', lens: 'FE 85mm f/1.8', software: 'Adobe Photoshop 2022' },
    { make: 'Fujifilm', model: 'X-T4', lens: 'XF35mmF1.4 R', software: 'Fujifilm X RAW Studio' },
    { make: 'Panasonic', model: 'DC-S5', lens: 'LUMIX S 24-105mm F4', software: 'DxO PhotoLab 6' },
    { make: 'Leica', model: 'M10-R', lens: 'Summilux-M 50mm f/1.4', software: 'Leica FOTOS 3.0' },
  ];

  const DESCRIPTIONS = [
    'Stock photography, editorial landscape, royalty-free archive',
    'Historical document scan, museum archive reference',
    'Scientific microscopy specimen, laboratory documentation',
    'Architectural blueprint scan, technical reference drawing',
    'Vintage film negative scan, analog photography archive',
    'Aerial survey map overlay, cartographic reference image',
    'Botanical herbarium specimen, scientific plant catalog',
    'Weather satellite composite, meteorological data overlay',
    'Textile pattern swatch, fabric design reference sample',
    'Ceramic tile catalog, interior design reference board',
  ];

  const KEYWORDS = [
    'archive, reference, stock, editorial, documentary',
    'landscape, nature, scenery, outdoor, wilderness',
    'architecture, building, structure, urban, cityscape',
    'abstract, texture, pattern, background, minimal',
    'vintage, retro, analog, film, historical',
    'scientific, research, specimen, catalog, specimen',
    'aerial, satellite, map, geographic, terrain',
    'interior, design, decor, furniture, home',
  ];

  const LOCATIONS = [
    { lat: 64.1466, lon: -21.9426 },
    { lat: -33.8688, lon: 151.2093 },
    { lat: 35.6762, lon: 139.6503 },
    { lat: 55.7558, lon: 37.6173 },
    { lat: -22.9068, lon: -43.1729 },
    { lat: 59.3293, lon: 18.0686 },
    { lat: 41.9028, lon: 12.4964 },
    { lat: 1.3521, lon: 103.8198 },
    { lat: 43.6532, lon: -79.3832 },
    { lat: 52.3676, lon: 4.9041 },
  ];

  const ARTISTS = [
    'Getty Images Archive', 'Shutterstock Editorial', 'Alamy Stock Photo',
    'Wikimedia Commons', 'Library of Congress', 'Public Domain Archive',
  ];

  const META_LABELS = {
    Make: 'Kamera Markası',
    Model: 'Kamera Modeli',
    LensModel: 'Lens',
    DateTimeOriginal: 'Çekim Tarihi',
    CreateDate: 'Oluşturma Tarihi',
    ModifyDate: 'Değiştirme Tarihi',
    ExposureTime: 'Pozlama Süresi',
    FNumber: 'Diyafram (f)',
    ISO: 'ISO',
    FocalLength: 'Odak Uzaklığı',
    Flash: 'Flaş',
    WhiteBalance: 'Beyaz Dengesi',
    Orientation: 'Yönlendirme',
    ImageWidth: 'Görsel Genişliği',
    ImageHeight: 'Görsel Yüksekliği',
    GPSLatitude: 'GPS Enlem',
    GPSLongitude: 'GPS Boylam',
    GPSAltitude: 'GPS Yükseklik',
    Software: 'Yazılım',
    Artist: 'Sanatçı',
    Copyright: 'Telif',
    latitude: 'GPS Enlem',
    longitude: 'GPS Boylam',
    altitude: 'GPS Yükseklik',
  };

  const $ = (sel) => document.querySelector(sel);

  const fileInput       = $('#file-input');
  const uploadZone      = $('#upload-zone');
  const uploadBtn       = $('#upload-btn');
  const fileList        = $('#file-list');
  const fileCount       = $('#file-count');
  const outputFormat    = $('#output-format');
  const quality         = $('#quality');
  const qualityLabel    = $('#quality-label');
  const qualityField    = $('#quality-field');
  const aiShield        = $('#ai-shield');
  const btnDownload     = $('#btn-download');
  const btnClear        = $('#btn-clear');
  const toast           = $('#toast');
  const metaModal       = $('#meta-modal');
  const modalClose      = $('#modal-close');
  const modalFilename   = $('#modal-filename');
  const modalSummary    = $('#modal-summary');
  const metaTableBody   = $('#meta-table-body');
  const metaTableWrap   = document.querySelector('.meta-table-wrap');
  const modalEmpty      = $('#modal-empty');

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), 3500);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function getExtension(filename) {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  }

  function getBaseName(filename) {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.slice(0, dot) : filename;
  }

  function resolveMime(file, format) {
    if (format === 'original') {
      const ext = getExtension(file.name);
      const map = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', webp: 'image/webp',
        gif: 'image/png', bmp: 'image/png',
      };
      return map[ext] || file.type || 'image/jpeg';
    }
    const formats = {
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    return formats[format] || 'image/jpeg';
  }

  function labelForKey(key) {
    const short = key.split('.').pop();
    return META_LABELS[short] || META_LABELS[key] || key;
  }

  function formatMetaValue(val) {
    if (val == null) return '';
    if (val instanceof Date) return val.toLocaleString('tr-TR');
    if (typeof val === 'number') {
      if (Number.isInteger(val)) return String(val);
      return val.toFixed(4).replace(/\.?0+$/, '');
    }
    if (Array.isArray(val)) return val.map(formatMetaValue).join(', ');
    if (typeof val === 'boolean') return val ? 'Evet' : 'Hayır';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  function flattenMetadata(obj, prefix) {
    const rows = [];
    if (!obj || typeof obj !== 'object') return rows;
    for (const [key, val] of Object.entries(obj)) {
      const fullKey = prefix ? prefix + '.' + key : key;
      if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        rows.push(...flattenMetadata(val, fullKey));
      } else if (val != null && val !== '') {
        rows.push({ key: fullKey, value: formatMetaValue(val) });
      }
    }
    return rows;
  }

  async function parseMetadata(source) {
    try {
      const data = await exifr.parse(source, {
        iptc: true,
        xmp: true,
        icc: true,
        tiff: true,
      });
      if (!data) return [];
      return flattenMetadata(data).sort((a, b) => a.key.localeCompare(b.key));
    } catch {
      return [];
    }
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function toDms(coord) {
    const abs = Math.abs(coord);
    const deg = Math.floor(abs);
    const min = Math.floor((abs - deg) * 60);
    const sec = Math.round((abs - deg - min / 60) * 3600 * 100);
    return [[deg, 1], [min, 1], [sec, 100]];
  }

  function randomDate() {
    const year = randInt(2014, 2020);
    const month = String(randInt(1, 12)).padStart(2, '0');
    const day = String(randInt(1, 28)).padStart(2, '0');
    const hour = String(randInt(6, 20)).padStart(2, '0');
    const min = String(randInt(0, 59)).padStart(2, '0');
    const sec = String(randInt(0, 59)).padStart(2, '0');
    return `${year}:${month}:${day} ${hour}:${min}:${sec}`;
  }

  function generateFakeExif(width, height) {
    const cam = pick(CAMERAS);
    const loc = pick(LOCATIONS);
    const date = randomDate();
    const iso = pick([100, 200, 400, 800, 1600]);
    const fnum = pick([[18, 10], [20, 10], [28, 10], [40, 10], [56, 10], [80, 10]]);
    const exposure = pick([[1, 60], [1, 125], [1, 250], [1, 500], [1, 1000]]);
    const focal = pick([[24, 1], [35, 1], [50, 1], [85, 1], [105, 1], [200, 1]]);

    return {
      '0th': {
        [piexif.ImageIFD.Make]: cam.make,
        [piexif.ImageIFD.Model]: cam.model,
        [piexif.ImageIFD.Software]: cam.software,
        [piexif.ImageIFD.ImageDescription]: pick(DESCRIPTIONS),
        [piexif.ImageIFD.Artist]: pick(ARTISTS),
        [piexif.ImageIFD.Copyright]: 'Public Domain - No Rights Reserved',
        [piexif.ImageIFD.Orientation]: 1,
      },
      Exif: {
        [piexif.ExifIFD.DateTimeOriginal]: date,
        [piexif.ExifIFD.DateTimeDigitized]: date,
        [piexif.ExifIFD.LensModel]: cam.lens,
        [piexif.ExifIFD.ISOSpeedRatings]: iso,
        [piexif.ExifIFD.FNumber]: fnum,
        [piexif.ExifIFD.ExposureTime]: exposure,
        [piexif.ExifIFD.FocalLength]: focal,
        [piexif.ExifIFD.Flash]: 0,
        [piexif.ExifIFD.WhiteBalance]: 0,
        [piexif.ExifIFD.PixelXDimension]: width,
        [piexif.ExifIFD.PixelYDimension]: height,
        [piexif.ExifIFD.UserComment]: pick(KEYWORDS),
      },
      GPS: {
        [piexif.GPSIFD.GPSLatitudeRef]: loc.lat >= 0 ? 'N' : 'S',
        [piexif.GPSIFD.GPSLatitude]: toDms(loc.lat),
        [piexif.GPSIFD.GPSLongitudeRef]: loc.lon >= 0 ? 'E' : 'W',
        [piexif.GPSIFD.GPSLongitude]: toDms(loc.lon),
        [piexif.GPSIFD.GPSAltitudeRef]: 0,
        [piexif.GPSIFD.GPSAltitude]: [randInt(0, 500), 1],
      },
    };
  }

  async function blobToBinary(blob) {
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return binary;
  }

  function binaryToBlob(binary, mime) {
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  async function injectFakeExif(jpegBlob, width, height) {
    const binary = await blobToBinary(jpegBlob);
    const exifObj = generateFakeExif(width, height);
    const exifBytes = piexif.dump(exifObj);
    const inserted = piexif.insert(exifBytes, binary);
    return binaryToBlob(inserted, 'image/jpeg');
  }

  function resolveExt(mime) {
    const map = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return map[mime] || 'jpg';
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

  async function stripMetadata(file, format, qualityVal, useAiShield) {
    const { img, url } = await loadImage(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    let mime = resolveMime(file, format);
    if (useAiShield) mime = 'image/jpeg';

    const q = qualityVal / 100;

    let blob = await new Promise((resolve) => {
      if (mime === 'image/png') {
        canvas.toBlob(resolve, 'image/png');
      } else {
        canvas.toBlob(resolve, mime, q);
      }
    });

    if (!blob) throw new Error('Dönüştürme başarısız');

    let aiShieldApplied = false;
    if (useAiShield && mime === 'image/jpeg') {
      blob = await injectFakeExif(blob, img.naturalWidth, img.naturalHeight);
      aiShieldApplied = true;
    }

    const ext = resolveExt(mime);
    const baseName = getBaseName(file.name);
    const suffix = aiShieldApplied ? '_korunmus' : '_temiz';
    const cleanName = baseName + suffix + '.' + ext;

    return {
      blob,
      cleanName,
      width: img.naturalWidth,
      height: img.naturalHeight,
      aiShieldApplied,
    };
  }

  function openMetaModal(entry) {
    const before = entry.originalMeta || [];
    const after = entry.cleanMeta || [];
    const allKeys = new Set([...before.map(r => r.key), ...after.map(r => r.key)]);
    const beforeMap = new Map(before.map(r => [r.key, r.value]));
    const afterMap = new Map(after.map(r => [r.key, r.value]));

    const fakeCount = after.filter(r => !beforeMap.has(r.key)).length;

    modalFilename.textContent = entry.file.name;
    modalSummary.innerHTML = `
      <div class="meta-stat">
        <div class="meta-stat-label">Önce</div>
        <div class="meta-stat-value before">${before.length}</div>
      </div>
      <div class="meta-stat">
        <div class="meta-stat-label">Sonra</div>
        <div class="meta-stat-value after">${after.length}</div>
      </div>
      <div class="meta-stat">
        <div class="meta-stat-label">Silinen</div>
        <div class="meta-stat-value before">${Math.max(0, before.length - after.filter(r => beforeMap.has(r.key)).length)}</div>
      </div>
      ${entry.aiShieldApplied ? `
      <div class="meta-stat">
        <div class="meta-stat-label">Sahte Eklenen</div>
        <div class="meta-stat-value fake">${fakeCount}</div>
      </div>` : ''}
    `;

    if (!before.length && !after.length) {
      metaTableBody.innerHTML = '';
      modalEmpty.classList.remove('hidden');
      metaTableWrap.style.display = 'none';
    } else {
      modalEmpty.classList.add('hidden');
      metaTableWrap.style.display = '';

      const keys = [...allKeys].sort();
      metaTableBody.innerHTML = keys.map(key => {
        const bVal = beforeMap.get(key);
        const aVal = afterMap.get(key);
        const bCell = bVal
          ? `<span class="meta-val-before">${escapeHtml(bVal)}</span>`
          : `<span class="meta-val-empty">—</span>`;
        const isFake = aVal && !beforeMap.has(key);
        const aCell = aVal
          ? `<span class="meta-val-after${isFake ? ' meta-val-fake' : ''}">${escapeHtml(aVal)}${isFake ? ' <em class="fake-tag">sahte</em>' : ''}</span>`
          : `<span class="meta-val-empty">Silindi</span>`;
        return `<tr>
          <td class="meta-key">${escapeHtml(labelForKey(key))}</td>
          <td>${bCell}</td>
          <td>${aCell}</td>
        </tr>`;
      }).join('');
    }

    metaModal.classList.remove('hidden');
  }

  function closeMetaModal() {
    metaModal.classList.add('hidden');
  }

  function updateUI() {
    const count = files.length;
    fileCount.textContent = count + (count === 1 ? ' dosya' : ' dosya');
    btnClear.classList.toggle('hidden', count === 0);

    const allDone = count > 0 && files.every(f => f.status === 'done');
    btnDownload.disabled = !allDone;
    btnDownload.textContent = count <= 1 ? 'İndir' : 'ZIP İndir';

    const showQuality = outputFormat.value === 'jpeg' ||
      outputFormat.value === 'webp' ||
      outputFormat.value === 'original';
    qualityField.style.display = showQuality ? '' : 'none';
  }

  function renderList() {
    fileList.innerHTML = files.map(f => {
      const statusClass = f.status;
      const statusText = {
        pending: 'Bekliyor',
        processing: 'İşleniyor…',
        done: 'Temizlendi',
        error: 'Hata',
      }[f.status] || f.status;

      const shieldTag = f.aiShieldApplied ? ' · AI Korumalı' : '';
      const metaText = f.status === 'done'
        ? `${f.width}×${f.height} · ${formatBytes(f.file.size)} → ${formatBytes(f.cleanBlob.size)}${shieldTag}`
        : `${formatBytes(f.file.size)}`;

      return `
        <div class="file-card${f.status === 'done' ? ' processed' : ''}" data-id="${f.id}">
          <img class="file-thumb" src="${f.previewUrl}" alt="">
          <div class="file-info">
            <div class="file-name" title="${f.file.name}">${f.file.name}</div>
            <div class="file-meta${f.status === 'done' ? ' clean' : ''}">${metaText}</div>
          </div>
          <div class="file-status">
            ${f.status === 'done' ? `
            <button type="button" class="btn-icon btn-meta" data-id="${f.id}" title="Metadata karşılaştır">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
            </button>` : ''}
            <span class="status-badge ${statusClass}">${statusText}</span>
            <button type="button" class="btn-icon btn-remove" data-id="${f.id}" title="Kaldır">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    fileList.querySelectorAll('.btn-meta').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const entry = files.find(f => f.id === Number(btn.dataset.id));
        if (entry) openMetaModal(entry);
      });
    });

    fileList.querySelectorAll('.btn-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeFile(Number(btn.dataset.id));
      });
    });

    updateUI();
  }

  function addFiles(fileArr) {
    const valid = Array.from(fileArr).filter(f => f.type.startsWith('image/'));
    if (!valid.length) {
      showToast('Lütfen geçerli bir görsel dosyası seçin.');
      return;
    }

    valid.forEach(file => {
      const previewUrl = URL.createObjectURL(file);
      files.push({
        id: nextId++,
        file,
        previewUrl,
        status: 'pending',
      });
    });

    renderList();
    processAll();
  }

  function removeFile(id) {
    const idx = files.findIndex(f => f.id === id);
    if (idx < 0) return;
    URL.revokeObjectURL(files[idx].previewUrl);
    files.splice(idx, 1);
    renderList();
  }

  function clearAll() {
    files.forEach(f => URL.revokeObjectURL(f.previewUrl));
    files = [];
    renderList();
    uploadZone.classList.remove('hidden');
  }

  function resetEntries() {
    files.forEach(f => {
      f.status = 'pending';
      f.cleanBlob = null;
      f.originalMeta = null;
      f.cleanMeta = null;
      f.aiShieldApplied = false;
    });
  }

  async function processAll() {
    const format = outputFormat.value;
    const q = Number(quality.value);
    const useAiShield = aiShield.checked;

    for (const entry of files) {
      if (entry.status === 'done') continue;
      entry.status = 'processing';
      renderList();

      try {
        entry.originalMeta = await parseMetadata(entry.file);
        const result = await stripMetadata(entry.file, format, q, useAiShield);
        entry.cleanBlob = result.blob;
        entry.cleanName = result.cleanName;
        entry.width = result.width;
        entry.height = result.height;
        entry.aiShieldApplied = result.aiShieldApplied;
        entry.cleanMeta = await parseMetadata(entry.cleanBlob);
        entry.status = 'done';
      } catch (err) {
        entry.status = 'error';
        entry.error = err.message;
      }
      renderList();
    }

    const done = files.filter(f => f.status === 'done').length;
    const errors = files.filter(f => f.status === 'error').length;
    if (done > 0) {
      showToast(done + ' görsel temizlendi' + (errors ? ', ' + errors + ' hata' : '') + '.');
    } else if (errors > 0) {
      showToast('Görseller işlenemedi.');
    }
  }

  function downloadSingle(entry) {
    const url = URL.createObjectURL(entry.cleanBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = entry.cleanName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadZip() {
    const done = files.filter(f => f.status === 'done');
    if (!done.length) return;

    if (done.length === 1) {
      downloadSingle(done[0]);
      return;
    }

    const zip = new JSZip();
    done.forEach(f => zip.file(f.cleanName, f.cleanBlob));

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'metadata-temiz.zip';
    a.click();
    URL.revokeObjectURL(url);
    showToast(done.length + ' görsel ZIP olarak indirildi.');
  }

  // Events
  uploadZone.addEventListener('click', () => fileInput.click());
  uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) addFiles(fileInput.files);
    fileInput.value = '';
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  outputFormat.addEventListener('change', () => {
    updateUI();
    if (files.length) { resetEntries(); processAll(); }
  });

  aiShield.addEventListener('change', () => {
    if (files.length) { resetEntries(); processAll(); }
  });

  quality.addEventListener('input', () => {
    qualityLabel.textContent = quality.value + '%';
  });

  quality.addEventListener('change', () => {
    if (files.length) { resetEntries(); processAll(); }
  });

  modalClose.addEventListener('click', closeMetaModal);
  metaModal.querySelector('.modal-backdrop').addEventListener('click', closeMetaModal);

  btnDownload.addEventListener('click', downloadZip);
  btnClear.addEventListener('click', clearAll);

  updateUI();
})();
