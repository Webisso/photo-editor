(function () {
  'use strict';

  const GEO = {
    pageW: 210,
    pageH: 297,
    bmW: 45,
    bmH: 140,
    cols: 4,
    rows: 2,
    get originX() { return (this.pageW - this.cols * this.bmW) / 2; },
    get originY() { return (this.pageH - this.rows * this.bmH) / 2; },
    cell(index) {
      const col = index % this.cols;
      const row = Math.floor(index / this.cols);
      return {
        x: this.originX + col * this.bmW,
        y: this.originY + row * this.bmH,
      };
    },
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (sel) => document.querySelector(sel);

  const sheet = $('#sheet');
  const fileInput = $('#file-input');
  const modal = $('#modal');
  const toastEl = $('#toast');
  const scaleRange = $('#scale-range');
  const scaleVal = $('#scale-val');
  const marksToggle = $('#opt-marks');

  const OFFSET_KEY = 'kitap-ayraci-back-offset';

  const state = {
    face: 'front',
    flip: 'long',
    marks: true,
    selected: null,
    slots: Array(8).fill(null),
    backOffsetX: 0,
    backOffsetY: 0,
  };

  function loadBackOffset() {
    try {
      const raw = localStorage.getItem(OFFSET_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.x === 'number') state.backOffsetX = data.x;
      if (typeof data.y === 'number') state.backOffsetY = data.y;
    } catch (err) { /* noop */ }
  }

  function saveBackOffset() {
    try {
      localStorage.setItem(OFFSET_KEY, JSON.stringify({
        x: state.backOffsetX,
        y: state.backOffsetY,
      }));
    } catch (err) { /* noop */ }
  }

  function formatMm(value) {
    return value.toFixed(2).replace('.', ',');
  }

  function syncOffsetUi() {
    const x = $('#back-off-x');
    const y = $('#back-off-y');
    if (!x || !y) return;
    x.value = String(state.backOffsetX);
    y.value = String(state.backOffsetY);
    $('#back-off-x-val').textContent = formatMm(state.backOffsetX);
    $('#back-off-y-val').textContent = formatMm(state.backOffsetY);
  }

  function backOffsetForFace(face) {
    if (face !== 'back') return { x: 0, y: 0 };
    return { x: state.backOffsetX, y: state.backOffsetY };
  }

  function feedEdgeForFace(face) {
    if (face === 'front') return 'top';
    return state.flip === 'short' ? 'bottom' : 'top';
  }

  function isEditable() {
    return state.face === 'front';
  }

  function layoutCell(visualIndex) {
    const arrange = state.face === 'front' ? frontArrangement() : backArrangement();
    const cell = arrange[visualIndex];
    return {
      slot: cell.slot,
      rot: cell.rot,
      pos: GEO.cell(visualIndex),
    };
  }

  const tokens = {};
  let picker = null;
  let drag = null;
  let toastTimer = 0;
  const zoomPan = { scale: 1, x: 0, y: 0 };
  let zoomDrag = null;

  const zoomModal = $('#zoom-modal');
  const zoomViewport = $('#zoom-viewport');
  const zoomCanvas = $('#zoom-canvas');

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2800);
  }

  function frontArrangement() {
    return [0, 1, 2, 3, 4, 5, 6, 7].map((slot) => ({ slot, rot: 0 }));
  }

  function backArrangement() {
    if (state.flip === 'short') {
      return [
        { slot: 4, rot: 180 }, { slot: 5, rot: 180 }, { slot: 6, rot: 180 }, { slot: 7, rot: 180 },
        { slot: 0, rot: 180 }, { slot: 1, rot: 180 }, { slot: 2, rot: 180 }, { slot: 3, rot: 180 },
      ];
    }
    return [
      { slot: 3, rot: 0 }, { slot: 2, rot: 0 }, { slot: 1, rot: 0 }, { slot: 0, rot: 0 },
      { slot: 7, rot: 0 }, { slot: 6, rot: 0 }, { slot: 5, rot: 0 }, { slot: 4, rot: 0 },
    ];
  }

  function imageDrawRect(photo) {
    const nw = photo.img.naturalWidth || 1;
    const nh = photo.img.naturalHeight || 1;
    const cover = Math.max(GEO.bmW / nw, GEO.bmH / nh);
    const mmPerPx = cover * photo.scale;
    const w = nw * mmPerPx;
    const h = nh * mmPerPx;
    return {
      x: (GEO.bmW - w) / 2 + photo.panX,
      y: (GEO.bmH - h) / 2 + photo.panY,
      w,
      h,
    };
  }

  function clampPhoto(photo) {
    const rect = imageDrawRect(photo);
    const minOverlap = 8;
    let x = rect.x;
    let y = rect.y;
    const loX = minOverlap - rect.w;
    const hiX = GEO.bmW - minOverlap;
    const loY = minOverlap - rect.h;
    const hiY = GEO.bmH - minOverlap;
    if (loX <= hiX) x = Math.min(hiX, Math.max(loX, x));
    if (loY <= hiY) y = Math.min(hiY, Math.max(loY, y));
    photo.panX += x - rect.x;
    photo.panY += y - rect.y;
  }

  function containScale(photo) {
    const nw = photo.img.naturalWidth || 1;
    const nh = photo.img.naturalHeight || 1;
    const cover = Math.max(GEO.bmW / nw, GEO.bmH / nh);
    const contain = Math.min(GEO.bmW / nw, GEO.bmH / nh);
    return contain / cover;
  }

  function selectedPhoto() {
    if (state.selected == null || !isEditable()) return null;
    return state.slots[state.selected];
  }

  function releasePhoto(photo) {
    if (!photo) return;
    const stillUsed = state.slots.some((slot) => slot && slot.url === photo.url);
    if (!stillUsed) URL.revokeObjectURL(photo.url);
  }

  function eachGuide(line) {
    const x0 = GEO.originX;
    const y0 = GEO.originY;
    const x1 = x0 + GEO.cols * GEO.bmW;
    const y1 = y0 + GEO.rows * GEO.bmH;
    for (let col = 0; col <= GEO.cols; col += 1) {
      const x = x0 + col * GEO.bmW;
      line(x, y0, x, y1);
    }
    for (let row = 0; row <= GEO.rows; row += 1) {
      const y = y0 + row * GEO.bmH;
      line(x0, y, x1, y);
    }
    const tick = 3.5;
    const gap = 0.8;
    const corners = [
      [x0, y0, [[0, -1], [-1, 0]]],
      [x1, y0, [[0, -1], [1, 0]]],
      [x0, y1, [[0, 1], [-1, 0]]],
      [x1, y1, [[0, 1], [1, 0]]],
    ];
    corners.forEach(([x, y, dirs]) => {
      dirs.forEach(([dx, dy]) => {
        line(x + dx * gap, y + dy * gap, x + dx * (gap + tick), y + dy * (gap + tick));
      });
    });
  }

  function cornerRegistrationPaths() {
    const L = 14;
    const M = GEO.pageW;
    const H = GEO.pageH;
    return [
      `M 0 ${L} L 0 0 L ${L} 0`,
      `M ${M - L} 0 L ${M} 0 L ${M} ${L}`,
      `M ${M} ${H - L} L ${M} ${H} L ${M - L} ${H}`,
      `M ${L} ${H} L 0 ${H} L 0 ${H - L}`,
      `M ${M / 2 - 4} 0 V ${L}`,
      `M ${M / 2 + 4} 0 V ${L}`,
      `M ${M / 2 - 4} ${H} V ${H - L}`,
      `M ${M / 2 + 4} ${H} V ${H - L}`,
    ];
  }

  function svgText(x, y, text, opts = {}) {
    const el = document.createElementNS(SVG_NS, 'text');
    el.setAttribute('x', String(x));
    el.setAttribute('y', String(y));
    el.setAttribute('fill', opts.fill || '#27272a');
    el.setAttribute('font-size', String(opts.size || 3));
    el.setAttribute('font-weight', opts.bold ? '700' : '600');
    if (opts.anchor) el.setAttribute('text-anchor', opts.anchor);
    if (opts.rotate) el.setAttribute('transform', `rotate(${opts.rotate} ${x} ${y})`);
    el.textContent = text;
    return el;
  }

  function cornerRegistrationSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'marks marks-corners');
    svg.setAttribute('viewBox', `0 0 ${GEO.pageW} ${GEO.pageH}`);
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', cornerRegistrationPaths().join(' '));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#18181b');
    path.setAttribute('stroke-width', '0.35');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(path);
    return svg;
  }

  function gridMarksSvg() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'marks marks-grid');
    svg.setAttribute('viewBox', `0 0 ${GEO.pageW} ${GEO.pageH}`);
    const parts = [];
    eachGuide((x1, y1, x2, y2) => {
      parts.push(`M ${x1} ${y1} L ${x2} ${y2}`);
    });
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', parts.join(' '));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#6b7280');
    path.setAttribute('stroke-width', '0.2');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(path);
    return svg;
  }

  function sheetChromeSvg(face) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'sheet-chrome');
    svg.setAttribute('viewBox', `0 0 ${GEO.pageW} ${GEO.pageH}`);

    const x0 = GEO.originX;
    const y0 = GEO.originY;
    const x1 = x0 + GEO.cols * GEO.bmW;
    const y1 = y0 + GEO.rows * GEO.bmH;
    const feed = feedEdgeForFace(face);

    const frame = document.createElementNS(SVG_NS, 'rect');
    frame.setAttribute('x', String(x0));
    frame.setAttribute('y', String(y0));
    frame.setAttribute('width', String(x1 - x0));
    frame.setAttribute('height', String(y1 - y0));
    frame.setAttribute('fill', 'none');
    frame.setAttribute('stroke', '#a1a1aa');
    frame.setAttribute('stroke-width', '0.15');
    frame.setAttribute('stroke-dasharray', '1.2 0.8');
    svg.appendChild(frame);

    const faceLabel = face === 'front' ? 'ÖN YÜZ' : 'ARKA YÜZ';
    const stepLabel = face === 'front' ? '1. baskı' : '2. baskı';
    svg.appendChild(svgText(4, 5.5, faceLabel, { size: 4.2, bold: true, fill: '#b45309' }));
    svg.appendChild(svgText(4, 9.2, stepLabel, { size: 2.6, fill: '#52525b' }));

    if (face === 'back') {
      const hint = state.flip === 'long'
        ? 'Sağa-sola çevir · baskı alta'
        : 'Yukarı-aşağı çevir · alt üste';
      svg.appendChild(svgText(4, 12.5, hint, { size: 2.2, fill: '#71717a' }));
    }

    const feedY = feed === 'top' ? 4.2 : GEO.pageH - 2.8;
    const feedLine = document.createElementNS(SVG_NS, 'path');
    if (feed === 'top') {
      feedLine.setAttribute('d', `M ${GEO.pageW / 2 - 8} 1.2 H ${GEO.pageW / 2 + 8}`);
    } else {
      feedLine.setAttribute('d', `M ${GEO.pageW / 2 - 8} ${GEO.pageH - 1.2} H ${GEO.pageW / 2 + 8}`);
    }
    feedLine.setAttribute('stroke', '#16a34a');
    feedLine.setAttribute('stroke-width', '0.45');
    feedLine.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(feedLine);

    const feedText = feed === 'top'
      ? '▲ YAZICI BESLEMESİ — bu kenar ilk girer'
      : '▼ YAZICI BESLEMESİ — bu kenar ilk girer (2. geçiş)';
    svg.appendChild(svgText(GEO.pageW / 2, feedY, feedText, {
      size: 2.5,
      anchor: 'middle',
      bold: true,
      fill: '#15803d',
    }));

    svg.appendChild(svgText(GEO.pageW - 3, GEO.pageH / 2, 'AYRAÇ ALANI', {
      size: 2.4,
      anchor: 'end',
      rotate: -90,
      fill: '#a1a1aa',
    }));

    svg.appendChild(svgText(GEO.pageW / 2, y0 - 1.8, '— kesim / tasarım başlar —', {
      size: 2,
      anchor: 'middle',
      fill: '#a1a1aa',
    }));

    return svg;
  }

  function appendSheetOverlays(parent, face) {
    parent.appendChild(cornerRegistrationSvg());
    if (state.marks) parent.appendChild(gridMarksSvg());
    parent.appendChild(sheetChromeSvg(face));
  }

  function refreshSheetOverlays() {
    sheet.querySelectorAll('.marks, .sheet-chrome').forEach((el) => el.remove());
    const face = state.face === 'front' ? 'front' : 'back';
    appendSheetOverlays(sheet, face);
    if (!state.marks) {
      sheet.querySelectorAll('.marks-grid').forEach((el) => el.remove());
    }
  }

  function paintSelection() {
    if (!isEditable()) return;
    sheet.querySelectorAll('.bm').forEach((bm) => {
      const { slot } = layoutCell(Number(bm.dataset.index));
      bm.classList.toggle('selected', state.selected === slot);
    });
  }

  function positionImage(visualIndex, slotIndex) {
    const bm = sheet.querySelector(`.bm[data-index="${visualIndex}"]`);
    const photo = state.slots[slotIndex];
    const img = bm.querySelector('.bm-img');
    if (!photo || !img) return;
    const rect = imageDrawRect(photo);
    img.style.left = `${(rect.x / GEO.bmW) * 100}%`;
    img.style.top = `${(rect.y / GEO.bmH) * 100}%`;
    img.style.width = `${(rect.w / GEO.bmW) * 100}%`;
    img.style.height = `${(rect.h / GEO.bmH) * 100}%`;
  }

  function renderSlot(visualIndex) {
    const bm = sheet.querySelector(`.bm[data-index="${visualIndex}"]`);
    const { slot, rot, pos } = layoutCell(visualIndex);
    const photo = state.slots[slot];
    const clip = bm.querySelector('.bm-clip');
    let img = clip.querySelector('.bm-img');

    bm.style.left = `${(pos.x / GEO.pageW) * 100}%`;
    bm.style.top = `${(pos.y / GEO.pageH) * 100}%`;
    bm.style.width = `${(GEO.bmW / GEO.pageW) * 100}%`;
    bm.style.height = `${(GEO.bmH / GEO.pageH) * 100}%`;
    bm.querySelector('.bm-num').textContent = String(slot + 1);
    clip.classList.toggle('rot-180', rot === 180);

    if (!photo) {
      if (img) img.remove();
      bm.classList.remove('has-image');
    } else {
      if (!img) {
        img = document.createElement('img');
        img.className = 'bm-img';
        img.alt = '';
        img.draggable = false;
        clip.appendChild(img);
      }
      if (img.dataset.url !== photo.url) {
        img.src = photo.url;
        img.dataset.url = photo.url;
      }
      bm.classList.add('has-image');
      positionImage(visualIndex, slot);
    }

    if (state.face === 'front') {
      bm.title = photo ? `Ayraç ${slot + 1}` : `Ayraç ${slot + 1} — görsel seç`;
      bm.classList.toggle('selected', state.selected === slot);
    } else {
      bm.title = photo
        ? `Ayraç ${slot + 1} · arka önizleme`
        : `Ayraç ${slot + 1} · ön yüz boş`;
      bm.classList.remove('selected');
    }
  }

  function renderAll() {
    for (let i = 0; i < 8; i += 1) renderSlot(i);
  }

  function updateCount() {
    const filled = state.slots.filter(Boolean).length;
    $('#fill-count').textContent = `Dolu ${filled}/8`;
  }

  function updateControls() {
    const empty = $('#controls-empty');
    const preview = $('#controls-preview');
    const photoBox = $('#controls-photo');
    const pickBox = $('#controls-pick');
    const index = state.selected;

    $('#hint-front').classList.toggle('hidden', !isEditable());
    $('#hint-back').classList.toggle('hidden', isEditable());

    if (!isEditable()) {
      empty.classList.add('hidden');
      pickBox.classList.add('hidden');
      photoBox.classList.add('hidden');
      preview.classList.remove('hidden');
      $('#controls-title').textContent = 'Arka yüz önizleme';
      $('#controls-meta').textContent = 'Salt okunur';
      return;
    }

    preview.classList.add('hidden');

    if (index == null) {
      empty.classList.remove('hidden');
      photoBox.classList.add('hidden');
      pickBox.classList.add('hidden');
      $('#controls-title').textContent = 'Ayraç seçilmedi';
      $('#controls-meta').textContent = '';
      return;
    }

    empty.classList.add('hidden');
    $('#controls-title').textContent = `Ayraç ${index + 1} · Ön yüz`;
    $('#controls-meta').textContent = state.slots[index] ? 'Görsel yüklü' : 'Boş';

    const photo = state.slots[index];
    if (!photo) {
      photoBox.classList.add('hidden');
      pickBox.classList.remove('hidden');
      return;
    }

    pickBox.classList.add('hidden');
    photoBox.classList.remove('hidden');
    if (document.activeElement !== scaleRange) {
      scaleRange.value = String(Math.round(photo.scale * 100));
    }
    scaleVal.textContent = `${Math.round(photo.scale * 100)}%`;
  }

  function setFace(face) {
    state.face = face;
    if (face === 'back') state.selected = null;
    sheet.classList.toggle('read-only', face === 'back');
    $('#face-front').classList.toggle('active', face === 'front');
    $('#face-back').classList.toggle('active', face === 'back');
    $('#face-front').setAttribute('aria-selected', face === 'front' ? 'true' : 'false');
    $('#face-back').setAttribute('aria-selected', face === 'back' ? 'true' : 'false');
    refreshSheetOverlays();
    renderAll();
    updateControls();
    if (!zoomModal.classList.contains('hidden')) {
      $('#zoom-modal-sub').textContent = zoomFaceLabel();
      refreshZoomSheet();
    }
  }

  function mapHtml(cells) {
    return cells.map((cell) => {
      const rot = cell.rot ? ' rot' : '';
      const mark = cell.rot ? '<i>180°</i>' : '';
      return `<span class="map-cell${rot}">${cell.slot + 1}${mark}</span>`;
    }).join('');
  }

  function renderMaps() {
    $('#front-map').innerHTML = mapHtml(frontArrangement());
    $('#back-map').innerHTML = mapHtml(backArrangement());
  }

  function zoomFaceLabel() {
    return state.face === 'front'
      ? 'Ön yüz · kesim çizgileri dahil'
      : 'Arka yüz önizleme · ön yüzden otomatik';
  }

  function updateZoomLabel() {
    $('#zoom-level').textContent = `${Math.round(zoomPan.scale * 100)}%`;
  }

  function applyZoomTransform() {
    zoomCanvas.style.transform = `translate(${zoomPan.x}px, ${zoomPan.y}px) scale(${zoomPan.scale})`;
    updateZoomLabel();
  }

  function fitZoom() {
    const page = $('#zoom-content .print-sheet');
    if (!page || !zoomViewport) return;
    const vw = zoomViewport.clientWidth;
    const vh = zoomViewport.clientHeight;
    const pw = page.offsetWidth;
    const ph = page.offsetHeight;
    if (!vw || !vh || !pw || !ph) return;
    const fit = Math.min(vw / pw, vh / ph) * 0.92;
    zoomPan.scale = fit;
    zoomPan.x = (vw - pw * fit) / 2;
    zoomPan.y = (vh - ph * fit) / 2;
    applyZoomTransform();
  }

  function zoomAt(clientX, clientY, factor) {
    const rect = zoomViewport.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const before = zoomPan.scale;
    const next = Math.min(10, Math.max(0.12, before * factor));
    const ratio = next / before;
    zoomPan.x = cx - (cx - zoomPan.x) * ratio;
    zoomPan.y = cy - (cy - zoomPan.y) * ratio;
    zoomPan.scale = next;
    applyZoomTransform();
  }

  function refreshZoomSheet() {
    const face = state.face === 'front' ? 'front' : 'back';
    $('#zoom-content').replaceChildren(buildSheet(face));
    if (zoomModal.classList.contains('hidden')) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitZoom());
    });
  }

  function openZoomModal() {
    $('#zoom-modal-title').textContent = 'Sayfa inceleme';
    $('#zoom-modal-sub').textContent = zoomFaceLabel();
    const face = state.face === 'front' ? 'front' : 'back';
    $('#zoom-content').replaceChildren(buildSheet(face));
    zoomModal.classList.remove('hidden');
    document.body.classList.add('zoom-open');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitZoom());
    });
  }

  function closeZoomModal() {
    zoomModal.classList.add('hidden');
    document.body.classList.remove('zoom-open');
    zoomDrag = null;
    zoomViewport.classList.remove('is-panning');
  }

  function flipNote() {
    if (state.flip === 'short') {
      return 'Kısa kenar: kağıdı yukarı-aşağı çevirin. Baskılı yüz alta gelsin. İlk baskıda yazıcıya önce giren kenar bu kez arkada kalsın; eski alt kenar öne gelsin.';
    }
    return 'Uzun kenar: kağıdı sağa-sola, kitap sayfası gibi çevirin. Baskılı yüz alta gelsin; üst kenar yine üstte kalsın ve aynı kenardan besleyin.';
  }

  function loadFile(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        reject(new Error('type'));
        return;
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ url, img, scale: 1, panX: 0, panY: 0 });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('load'));
      };
      img.src = url;
    });
  }

  async function loadInto(index, file) {
    if (!isEditable()) return;
    const key = String(index);
    tokens[key] = (tokens[key] || 0) + 1;
    const mine = tokens[key];
    let loaded;
    try {
      loaded = await loadFile(file);
    } catch (err) {
      if (tokens[key] === mine) toast('Görsel açılamadı');
      return;
    }
    if (tokens[key] !== mine) {
      URL.revokeObjectURL(loaded.url);
      return;
    }
    const prev = state.slots[index];
    state.slots[index] = loaded;
    releasePhoto(prev);
    state.selected = index;
    renderAll();
    updateControls();
    updateCount();
  }

  function openPicker(index) {
    if (!isEditable()) return;
    state.selected = index;
    paintSelection();
    updateControls();
    picker = index;
    fileInput.value = '';
    fileInput.click();
  }

  function clearPhoto(index) {
    if (!isEditable()) return;
    const photo = state.slots[index];
    if (!photo) return;
    state.slots[index] = null;
    releasePhoto(photo);
    renderAll();
    updateControls();
    updateCount();
  }

  function buildSheet(face) {
    const arrange = face === 'front' ? frontArrangement() : backArrangement();
    const page = document.createElement('div');
    page.className = 'print-sheet';
    const content = document.createElement('div');
    content.className = 'print-content';
    const off = backOffsetForFace(face);
    if (off.x || off.y) {
      content.style.transform = `translate(${off.x}mm, ${off.y}mm)`;
    }
    arrange.forEach((cell, index) => {
      const pos = GEO.cell(index);
      const photo = state.slots[cell.slot];
      const bm = document.createElement('div');
      bm.className = 'print-bm';
      bm.dataset.slot = String(cell.slot + 1);
      bm.dataset.rot = String(cell.rot);
      bm.style.left = `${pos.x}mm`;
      bm.style.top = `${pos.y}mm`;
      bm.style.width = `${GEO.bmW}mm`;
      bm.style.height = `${GEO.bmH}mm`;
      if (cell.rot) bm.style.transform = `rotate(${cell.rot}deg)`;
      if (photo) {
        const img = document.createElement('img');
        img.src = photo.url;
        img.alt = '';
        const rect = imageDrawRect(photo);
        img.style.left = `${rect.x}mm`;
        img.style.top = `${rect.y}mm`;
        img.style.width = `${rect.w}mm`;
        img.style.height = `${rect.h}mm`;
        bm.appendChild(img);
      }
      content.appendChild(bm);
    });
    page.appendChild(content);
    appendSheetOverlays(page, face);
    return page;
  }

  function fitPreview(wrap) {
    const page = wrap.querySelector('.print-sheet');
    if (!page) return;
    const natural = (210 * 96) / 25.4;
    const scale = wrap.clientWidth / natural;
    page.style.transformOrigin = 'top left';
    page.style.transform = `scale(${scale})`;
    wrap.style.height = `${((297 * 96) / 25.4) * scale}px`;
  }

  function openModal() {
    $('#preview-front').replaceChildren(buildSheet('front'));
    $('#preview-back').replaceChildren(buildSheet('back'));
    $('#modal-flip-note').textContent = flipNote();
    modal.classList.remove('hidden');
    fitPreview($('#preview-front'));
    fitPreview($('#preview-back'));
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  function printFace(face) {
    const root = $('#print-root');
    const canvas = renderCanvas(face);

    const cleanup = () => {
      root.replaceChildren();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    canvas.toBlob((blob) => {
      if (!blob) {
        cleanup();
        toast('Baskı hazırlanamadı');
        return;
      }
      const url = URL.createObjectURL(blob);
      const img = document.createElement('img');
      img.className = 'print-sheet-img';
      img.alt = '';
      const wrap = document.createElement('div');
      wrap.className = 'print-sheet';
      wrap.appendChild(img);
      root.replaceChildren(wrap);

      let started = false;
      const startPrint = () => {
        if (started) return;
        started = true;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.print();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          });
        });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        cleanup();
        toast('Baskı görseli yüklenemedi, tekrar deneyin');
      };

      img.onload = startPrint;
      img.src = url;

      const decode = img.decode && img.decode();
      if (decode) decode.then(startPrint).catch(startPrint);
    }, 'image/png');
  }

  function drawCornersCanvas(ctx, scale) {
    const L = 14;
    const M = GEO.pageW;
    const H = GEO.pageH;
    const s = scale;
    const seg = (x1, y1, x2, y2) => {
      ctx.moveTo(x1 * s, y1 * s);
      ctx.lineTo(x2 * s, y2 * s);
    };
    ctx.save();
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 0.35 * s;
    ctx.beginPath();
    seg(0, L, 0, 0); seg(0, 0, L, 0);
    seg(M - L, 0, M, 0); seg(M, 0, M, L);
    seg(M, H - L, M, H); seg(M, H, M - L, H);
    seg(L, H, 0, H); seg(0, H, 0, H - L);
    seg(M / 2 - 4, 0, M / 2 - 4, L);
    seg(M / 2 + 4, 0, M / 2 + 4, L);
    seg(M / 2 - 4, H, M / 2 - 4, H - L);
    seg(M / 2 + 4, H, M / 2 + 4, H - L);
    ctx.stroke();
    ctx.restore();
  }

  function drawChromeCanvas(ctx, scale, face) {
    const x0 = GEO.originX;
    const y0 = GEO.originY;
    const x1 = x0 + GEO.cols * GEO.bmW;
    const y1 = y0 + GEO.rows * GEO.bmH;
    const feed = feedEdgeForFace(face);

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.setLineDash([1.2 * scale, 0.8 * scale]);
    ctx.strokeStyle = '#a1a1aa';
    ctx.lineWidth = 0.15 * scale;
    ctx.strokeRect(x0 * scale, y0 * scale, (x1 - x0) * scale, (y1 - y0) * scale);
    ctx.setLineDash([]);

    ctx.fillStyle = '#b45309';
    ctx.font = `700 ${4.2 * scale}px system-ui, sans-serif`;
    ctx.fillText(face === 'front' ? 'ÖN YÜZ' : 'ARKA YÜZ', 4 * scale, 5.5 * scale);
    ctx.fillStyle = '#52525b';
    ctx.font = `600 ${2.6 * scale}px system-ui, sans-serif`;
    ctx.fillText(face === 'front' ? '1. baskı' : '2. baskı', 4 * scale, 9.2 * scale);

    if (face === 'back') {
      ctx.font = `600 ${2.2 * scale}px system-ui, sans-serif`;
      const hint = state.flip === 'long'
        ? 'Sağa-sola çevir · baskı alta'
        : 'Yukarı-aşağı çevir · alt üste';
      ctx.fillText(hint, 4 * scale, 12.5 * scale);
    }

    const feedText = feed === 'top'
      ? '▲ YAZICI BESLEMESİ — bu kenar ilk girer'
      : '▼ YAZICI BESLEMESİ — bu kenar ilk girer (2. geçiş)';
    ctx.fillStyle = '#15803d';
    ctx.font = `700 ${2.5 * scale}px system-ui, sans-serif`;
    const feedY = (feed === 'top' ? 4.2 : GEO.pageH - 2.8) * scale;
    ctx.textAlign = 'center';
    ctx.fillText(feedText, (GEO.pageW / 2) * scale, feedY);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  function renderCanvas(face) {
    const scale = 300 / 25.4;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(GEO.pageW * scale);
    canvas.height = Math.round(GEO.pageH * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const off = backOffsetForFace(face);
    const oxOff = off.x * scale;
    const oyOff = off.y * scale;

    const arrange = face === 'front' ? frontArrangement() : backArrangement();
    arrange.forEach((cell, index) => {
      const pos = GEO.cell(index);
      const photo = state.slots[cell.slot];
      const ox = pos.x * scale + oxOff;
      const oy = pos.y * scale + oyOff;
      const bw = GEO.bmW * scale;
      const bh = GEO.bmH * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ox, oy, bw, bh);
      ctx.clip();
      if (photo) {
        const rect = imageDrawRect(photo);
        ctx.translate(ox + bw / 2, oy + bh / 2);
        if (cell.rot) ctx.rotate((cell.rot * Math.PI) / 180);
        ctx.translate(-bw / 2, -bh / 2);
        ctx.drawImage(photo.img, rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale);
      }
      ctx.restore();
    });

    drawCornersCanvas(ctx, scale);

    if (state.marks) {
      ctx.save();
      ctx.strokeStyle = '#6b7280';
      ctx.lineWidth = 0.2 * scale;
      ctx.beginPath();
      eachGuide((x1, y1, x2, y2) => {
        ctx.moveTo(x1 * scale, y1 * scale);
        ctx.lineTo(x2 * scale, y2 * scale);
      });
      ctx.stroke();
      ctx.restore();
    }

    drawChromeCanvas(ctx, scale, face);
    return canvas;
  }

  function crc32(bytes) {
    let crc = ~0;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return ~crc >>> 0;
  }

  function u32(value) {
    return new Uint8Array([
      (value >>> 24) & 255,
      (value >>> 16) & 255,
      (value >>> 8) & 255,
      value & 255,
    ]);
  }

  function readU32(bytes, offset) {
    return ((bytes[offset] * 256 + bytes[offset + 1]) * 256 + bytes[offset + 2]) * 256 + bytes[offset + 3];
  }

  function makePhys(ppm) {
    const data = new Uint8Array(9);
    data.set(u32(ppm), 0);
    data.set(u32(ppm), 4);
    data[8] = 1;
    const type = new TextEncoder().encode('pHYs');
    const crcInput = new Uint8Array(13);
    crcInput.set(type, 0);
    crcInput.set(data, 4);
    const crc = u32(crc32(crcInput));
    const chunk = new Uint8Array(21);
    chunk.set(u32(9), 0);
    chunk.set(type, 4);
    chunk.set(data, 8);
    chunk.set(crc, 17);
    return chunk;
  }

  function withDpi(bytes, dpi) {
    const phys = makePhys(Math.round(dpi / 0.0254));
    const parts = [bytes.subarray(0, 8)];
    let offset = 8;
    let inserted = false;
    while (offset + 12 <= bytes.length) {
      const len = readU32(bytes, offset);
      const type = String.fromCharCode(
        bytes[offset + 4],
        bytes[offset + 5],
        bytes[offset + 6],
        bytes[offset + 7]
      );
      const size = 12 + len;
      if (offset + size > bytes.length) break;
      if (type === 'pHYs') {
        offset += size;
        continue;
      }
      if (!inserted && (type === 'IDAT' || type === 'IEND')) {
        parts.push(phys);
        inserted = true;
      }
      parts.push(bytes.subarray(offset, offset + size));
      offset += size;
      if (type === 'IEND') break;
    }
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let cursor = 0;
    parts.forEach((part) => {
      out.set(part, cursor);
      cursor += part.length;
    });
    return out;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('blob'));
      }, 'image/png');
    });
  }

  async function canvasToDpiPng(canvas, dpi) {
    const blob = await canvasToBlob(canvas);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return new Blob([withDpi(bytes, dpi)], { type: 'image/png' });
  }

  function downloadBlob(blob, name) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  async function downloadPng() {
    const button = $('#btn-png');
    if (typeof JSZip === 'undefined') {
      toast('ZIP kütüphanesi yüklenemedi');
      return;
    }
    button.disabled = true;
    toast('PNG hazırlanıyor…');
    try {
      const zip = new JSZip();
      const front = await canvasToDpiPng(renderCanvas('front'), 300);
      const back = await canvasToDpiPng(renderCanvas('back'), 300);
      zip.file('on-yuz.png', front);
      zip.file('arka-yuz.png', back);
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, 'kitap-ayraci.zip');
      toast('PNG paketi indirildi');
    } catch (err) {
      toast('PNG oluşturulamadı');
    } finally {
      button.disabled = false;
    }
  }

  function initSheet() {
    for (let i = 0; i < 8; i += 1) {
      const pos = GEO.cell(i);
      const bm = document.createElement('div');
      bm.className = 'bm';
      bm.dataset.index = String(i);
      bm.style.left = `${(pos.x / GEO.pageW) * 100}%`;
      bm.style.top = `${(pos.y / GEO.pageH) * 100}%`;
      bm.style.width = `${(GEO.bmW / GEO.pageW) * 100}%`;
      bm.style.height = `${(GEO.bmH / GEO.pageH) * 100}%`;
      bm.innerHTML = `
        <div class="bm-clip"></div>
        <div class="bm-empty" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" d="M12 5v14M5 12h14"/>
          </svg>
        </div>
        <span class="bm-num">${i + 1}</span>
      `;
      sheet.appendChild(bm);
    }
    refreshSheetOverlays();
  }

  function onPointerDown(event) {
    if (!isEditable()) return;
    const bm = event.target.closest('.bm');
    if (!bm || event.button !== 0) return;
    event.preventDefault();
    const visualIndex = Number(bm.dataset.index);
    const slot = layoutCell(visualIndex).slot;
    state.selected = slot;
    paintSelection();
    updateControls();
    sheet.focus({ preventScroll: true });
    const photo = state.slots[slot];
    drag = {
      visualIndex,
      slot,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: photo ? photo.panX : 0,
      panY: photo ? photo.panY : 0,
      moved: false,
      has: Boolean(photo),
    };
    try { bm.setPointerCapture(event.pointerId); } catch (err) { /* sentetik veya iptal */ }
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id || !drag.has) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 3) return;
    drag.moved = true;
    sheet.classList.add('is-dragging');
    const photo = state.slots[drag.slot];
    if (!photo) return;
    const ppm = sheet.getBoundingClientRect().width / GEO.pageW;
    photo.panX = drag.panX + dx / ppm;
    photo.panY = drag.panY + dy / ppm;
    clampPhoto(photo);
    positionImage(drag.visualIndex, drag.slot);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const ended = drag;
    drag = null;
    sheet.classList.remove('is-dragging');
    if (!ended.moved && !ended.has) openPicker(ended.slot);
  }

  function onWheel(event) {
    if (!isEditable() || event.ctrlKey) return;
    const bm = event.target.closest('.bm');
    if (!bm) return;
    const visualIndex = Number(bm.dataset.index);
    const slot = layoutCell(visualIndex).slot;
    const photo = state.slots[slot];
    if (!photo) return;
    event.preventDefault();
    state.selected = slot;
    paintSelection();
    const bounds = bm.getBoundingClientRect();
    const ppm = bounds.width / GEO.bmW;
    const localX = (event.clientX - bounds.left) / ppm;
    const localY = (event.clientY - bounds.top) / ppm;
    const before = imageDrawRect(photo);
    const relX = (localX - before.x) / before.w;
    const relY = (localY - before.y) / before.h;
    const factor = Math.exp(-event.deltaY * 0.0012);
    photo.scale = Math.min(6, Math.max(0.2, photo.scale * factor));
    const after = imageDrawRect(photo);
    photo.panX = (localX - relX * after.w) - (GEO.bmW - after.w) / 2;
    photo.panY = (localY - relY * after.h) - (GEO.bmH - after.h) / 2;
    clampPhoto(photo);
    positionImage(visualIndex, slot);
    updateControls();
  }

  function nudge(dx, dy) {
    const photo = selectedPhoto();
    if (!photo) return;
    photo.panX += dx;
    photo.panY += dy;
    clampPhoto(photo);
    renderAll();
  }

  function zoomBy(factor) {
    const photo = selectedPhoto();
    if (!photo) return;
    photo.scale = Math.min(6, Math.max(0.2, photo.scale * factor));
    clampPhoto(photo);
    renderAll();
    updateControls();
  }

  function applyScale(nextScale, resetPan) {
    const photo = selectedPhoto();
    if (!photo) return;
    photo.scale = nextScale;
    if (resetPan) {
      photo.panX = 0;
      photo.panY = 0;
    }
    clampPhoto(photo);
    renderAll();
    updateControls();
  }

  sheet.addEventListener('pointerdown', onPointerDown);
  sheet.addEventListener('pointermove', onPointerMove);
  sheet.addEventListener('pointerup', onPointerUp);
  sheet.addEventListener('pointercancel', onPointerUp);
  sheet.addEventListener('wheel', onWheel, { passive: false });
  sheet.addEventListener('dragstart', (event) => event.preventDefault());

  sheet.addEventListener('dragover', (event) => {
    if (!isEditable()) return;
    const bm = event.target.closest('.bm');
    if (!bm) return;
    event.preventDefault();
    sheet.querySelectorAll('.bm.drag-over').forEach((el) => {
      if (el !== bm) el.classList.remove('drag-over');
    });
    bm.classList.add('drag-over');
  });

  sheet.addEventListener('dragleave', (event) => {
    const bm = event.target.closest('.bm');
    if (bm) bm.classList.remove('drag-over');
  });

  sheet.addEventListener('drop', (event) => {
    if (!isEditable()) return;
    const bm = event.target.closest('.bm');
    if (!bm) return;
    event.preventDefault();
    bm.classList.remove('drag-over');
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    const slot = layoutCell(Number(bm.dataset.index)).slot;
    state.selected = slot;
    loadInto(slot, file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file || picker == null) return;
    loadInto(picker, file);
  });

  $('#face-front').addEventListener('click', () => setFace('front'));
  $('#face-back').addEventListener('click', () => setFace('back'));
  $('#btn-pick').addEventListener('click', () => {
    if (state.selected == null) return;
    openPicker(state.selected);
  });
  $('#btn-replace').addEventListener('click', () => {
    if (state.selected == null) return;
    openPicker(state.selected);
  });
  $('#btn-fill').addEventListener('click', () => applyScale(1, true));
  $('#btn-fit').addEventListener('click', () => {
    const photo = selectedPhoto();
    if (!photo) return;
    applyScale(containScale(photo), true);
  });
  $('#btn-clear').addEventListener('click', () => {
    if (state.selected == null) return;
    clearPhoto(state.selected);
  });
  scaleRange.addEventListener('input', () => {
    const photo = selectedPhoto();
    if (!photo) return;
    photo.scale = Number(scaleRange.value) / 100;
    clampPhoto(photo);
    renderAll();
    scaleVal.textContent = `${Math.round(photo.scale * 100)}%`;
  });

  document.querySelectorAll('input[name="flip"]').forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      state.flip = input.value;
      renderMaps();
      refreshSheetOverlays();
      if (state.face === 'back') renderAll();
      if (!zoomModal.classList.contains('hidden')) refreshZoomSheet();
    });
  });

  marksToggle.addEventListener('change', () => {
    state.marks = marksToggle.checked;
    refreshSheetOverlays();
    if (!zoomModal.classList.contains('hidden')) refreshZoomSheet();
  });

  function onOffsetInput() {
    state.backOffsetX = Number($('#back-off-x').value);
    state.backOffsetY = Number($('#back-off-y').value);
    syncOffsetUi();
    saveBackOffset();
    if (state.face === 'back') renderAll();
    refreshSheetOverlays();
    if (!zoomModal.classList.contains('hidden')) refreshZoomSheet();
    if (!modal.classList.contains('hidden')) {
      $('#preview-back').replaceChildren(buildSheet('back'));
      fitPreview($('#preview-back'));
    }
  }

  $('#back-off-x').addEventListener('input', onOffsetInput);
  $('#back-off-y').addEventListener('input', onOffsetInput);
  $('#btn-off-reset').addEventListener('click', () => {
    state.backOffsetX = 0;
    state.backOffsetY = 0;
    syncOffsetUi();
    saveBackOffset();
    onOffsetInput();
  });

  $('#btn-sheet-zoom').addEventListener('click', openZoomModal);
  $('#zoom-close').addEventListener('click', closeZoomModal);
  $('#zoom-fit').addEventListener('click', fitZoom);
  $('#zoom-in').addEventListener('click', () => {
    const rect = zoomViewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25);
  });
  $('#zoom-out').addEventListener('click', () => {
    const rect = zoomViewport.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.25);
  });

  zoomViewport.addEventListener('wheel', (event) => {
    if (zoomModal.classList.contains('hidden')) return;
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    zoomAt(event.clientX, event.clientY, factor);
  }, { passive: false });

  zoomViewport.addEventListener('pointerdown', (event) => {
    if (zoomModal.classList.contains('hidden') || event.button !== 0) return;
    event.preventDefault();
    zoomDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, panX: zoomPan.x, panY: zoomPan.y };
    zoomViewport.classList.add('is-panning');
    try { zoomViewport.setPointerCapture(event.pointerId); } catch (err) { /* noop */ }
  });

  zoomViewport.addEventListener('pointermove', (event) => {
    if (!zoomDrag || event.pointerId !== zoomDrag.id) return;
    zoomPan.x = zoomDrag.panX + (event.clientX - zoomDrag.x);
    zoomPan.y = zoomDrag.panY + (event.clientY - zoomDrag.y);
    applyZoomTransform();
  });

  function endZoomPan(event) {
    if (!zoomDrag || event.pointerId !== zoomDrag.id) return;
    zoomDrag = null;
    zoomViewport.classList.remove('is-panning');
  }

  zoomViewport.addEventListener('pointerup', endZoomPan);
  zoomViewport.addEventListener('pointercancel', endZoomPan);

  $('#btn-clear-all').addEventListener('click', () => {
    const hasAny = state.slots.some(Boolean);
    if (!hasAny) return;
    if (!window.confirm('Tüm ayraç görselleri silinsin mi?')) return;
    state.slots.forEach((photo, index) => {
      if (!photo) return;
      state.slots[index] = null;
      releasePhoto(photo);
    });
    state.selected = null;
    renderAll();
    updateControls();
    updateCount();
    toast('Tüm görseller silindi');
  });

  $('#btn-print').addEventListener('click', openModal);
  $('#btn-print-front').addEventListener('click', () => printFace('front'));
  $('#btn-print-back').addEventListener('click', () => printFace('back'));
  $('#btn-png').addEventListener('click', downloadPng);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', closeModal);

  window.addEventListener('resize', () => {
    if (!zoomModal.classList.contains('hidden')) fitZoom();
    if (!modal.classList.contains('hidden')) {
      fitPreview($('#preview-front'));
      fitPreview($('#preview-back'));
    }
  });

  document.addEventListener('keydown', (event) => {
    if (!zoomModal.classList.contains('hidden')) {
      if (event.key === 'Escape') closeZoomModal();
      return;
    }
    if (!modal.classList.contains('hidden')) {
      if (event.key === 'Escape') closeModal();
      return;
    }
    if (event.target.closest('input, textarea, select')) return;
    if (!isEditable() || state.selected == null) return;
    const photo = selectedPhoto();
    if ((event.key === 'Delete' || event.key === 'Backspace') && photo) {
      event.preventDefault();
      clearPhoto(state.selected);
      return;
    }
    if (!photo) return;
    const step = event.shiftKey ? 2 : 0.5;
    if (event.key === 'ArrowLeft') nudge(-step, 0);
    else if (event.key === 'ArrowRight') nudge(step, 0);
    else if (event.key === 'ArrowUp') nudge(0, -step);
    else if (event.key === 'ArrowDown') nudge(0, step);
    else if (event.key === '+' || event.key === '=') zoomBy(1.05);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / 1.05);
    else return;
    event.preventDefault();
  });

  loadBackOffset();
  syncOffsetUi();
  initSheet();
  renderMaps();
  updateControls();
  updateCount();
})();
