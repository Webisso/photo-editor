(function () {
  'use strict';

  const GRID_MAX = 12;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const $ = (sel) => document.querySelector(sel);

  const state = {
    img: null,
    cols: 4,
    rows: 2,
    contentBox: { x: 0, y: 0, w: 0, h: 0 },
    vSplits: [0.25, 0.5, 0.75],
    hSplits: [0.5],
    threshold: 248,
    trimPad: 2,
    useContentBox: true,
  };

  function equalSplits(count) {
    if (count <= 1) return [];
    const out = [];
    for (let i = 1; i < count; i += 1) out.push(i / count);
    return out;
  }

  function syncGridInputs() {
    $('#grid-cols').value = String(state.cols);
    $('#grid-rows').value = String(state.rows);
    const total = state.cols * state.rows;
    $('#grid-summary').textContent = `${state.cols} sütun × ${state.rows} satır · ${total} parça`;
  }

  function setGridSize(cols, rows) {
    state.cols = clamp(Math.round(cols), 1, GRID_MAX);
    state.rows = clamp(Math.round(rows), 1, GRID_MAX);
    state.vSplits = equalSplits(state.cols);
    state.hSplits = equalSplits(state.rows);
    syncGridInputs();
    syncOverlay();
  }

  let drag = null;
  let toastTimer = 0;
  let lastPieces = [];

  const uploadZone = $('#upload-zone');
  const fileInput = $('#file-input');
  const workspace = $('#workspace');
  const toolbar = $('#toolbar');
  const imgEl = $('#source-image');
  const gridSvg = $('#grid-svg');
  const modal = $('#modal');
  const pieceZoomModal = $('#piece-zoom-modal');

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2800);
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function isWhite(r, g, b, a, threshold) {
    if (a < 8) return true;
    return r >= threshold && g >= threshold && b >= threshold;
  }

  /** Sadece hücre kenarına beyaz yolla bağlı pikselleri şeffaf yapar; içteki beyaz tasarım kalır. */
  function removeEdgeConnectedWhite(px, sw, sh, threshold) {
    const n = sw * sh;
    const remove = new Uint8Array(n);
    const stack = [];

    function whiteAt(id) {
      const i = id * 4;
      return isWhite(px[i], px[i + 1], px[i + 2], px[i + 3], threshold);
    }

    function push(x, y) {
      if (x < 0 || x >= sw || y < 0 || y >= sh) return;
      const id = y * sw + x;
      if (remove[id] || !whiteAt(id)) return;
      remove[id] = 1;
      stack.push(id);
    }

    for (let x = 0; x < sw; x += 1) {
      push(x, 0);
      push(x, sh - 1);
    }
    for (let y = 0; y < sh; y += 1) {
      push(0, y);
      push(sw - 1, y);
    }

    while (stack.length) {
      const id = stack.pop();
      const x = id % sw;
      const y = (id - x) / sw;
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }

    for (let id = 0; id < n; id += 1) {
      if (remove[id]) px[id * 4 + 3] = 0;
    }
  }

  function detectContentBox(imageData, w, h, threshold) {
    const data = imageData.data;
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        if (!isWhite(data[i], data[i + 1], data[i + 2], data[i + 3], threshold)) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX) return { x: 0, y: 0, w, h };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function getContentBox() {
    if (!state.useContentBox || !state.img) {
      return { x: 0, y: 0, w: state.img.naturalWidth, h: state.img.naturalHeight };
    }
    return state.contentBox;
  }

  function pieceRects() {
    const box = getContentBox();
    const vx = [0, ...state.vSplits, 1];
    const hy = [0, ...state.hSplits, 1];
    const pieces = [];
    let n = 1;
    for (let row = 0; row < hy.length - 1; row += 1) {
      for (let col = 0; col < vx.length - 1; col += 1) {
        const x = box.x + vx[col] * box.w;
        const y = box.y + hy[row] * box.h;
        const w = (vx[col + 1] - vx[col]) * box.w;
        const h = (hy[row + 1] - hy[row]) * box.h;
        pieces.push({
          x: Math.round(x),
          y: Math.round(y),
          w: Math.max(1, Math.round(w)),
          h: Math.max(1, Math.round(h)),
          index: n,
          name: `parca-${String(n).padStart(2, '0')}.png`,
        });
        n += 1;
      }
    }
    return pieces;
  }

  function syncOverlay() {
    if (!state.img) return;
    const nw = state.img.naturalWidth;
    const nh = state.img.naturalHeight;
    const dw = imgEl.clientWidth;
    const dh = imgEl.clientHeight;
    if (!dw || !dh) return;
    gridSvg.setAttribute('width', String(dw));
    gridSvg.setAttribute('height', String(dh));
    gridSvg.setAttribute('viewBox', `0 0 ${nw} ${nh}`);
    renderGrid();
  }

  function renderGrid() {
    if (!state.img) return;
    const box = getContentBox();
    const nw = state.img.naturalWidth;
    const nh = state.img.naturalHeight;
    gridSvg.innerHTML = '';

    const boxRect = document.createElementNS(SVG_NS, 'rect');
    boxRect.setAttribute('class', 'grid-box');
    boxRect.setAttribute('x', String(box.x));
    boxRect.setAttribute('y', String(box.y));
    boxRect.setAttribute('width', String(box.w));
    boxRect.setAttribute('height', String(box.h));
    gridSvg.appendChild(boxRect);

    state.vSplits.forEach((ratio, i) => {
      const x = box.x + ratio * box.w;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'grid-line');
      line.setAttribute('x1', String(x));
      line.setAttribute('x2', String(x));
      line.setAttribute('y1', String(box.y));
      line.setAttribute('y2', String(box.y + box.h));
      gridSvg.appendChild(line);

      const hit = document.createElementNS(SVG_NS, 'line');
      hit.setAttribute('class', 'grid-hit');
      hit.dataset.kind = 'v';
      hit.dataset.index = String(i);
      hit.setAttribute('x1', String(x));
      hit.setAttribute('x2', String(x));
      hit.setAttribute('y1', String(box.y));
      hit.setAttribute('y2', String(box.y + box.h));
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '16');
      gridSvg.appendChild(hit);
    });

    state.hSplits.forEach((ratio, i) => {
      const y = box.y + ratio * box.h;
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('class', 'grid-line');
      line.setAttribute('x1', String(box.x));
      line.setAttribute('x2', String(box.x + box.w));
      line.setAttribute('y1', String(y));
      line.setAttribute('y2', String(y));
      gridSvg.appendChild(line);

      const hit = document.createElementNS(SVG_NS, 'line');
      hit.setAttribute('class', 'grid-hit grid-hit-h');
      hit.dataset.kind = 'h';
      hit.dataset.index = String(i);
      hit.setAttribute('x1', String(box.x));
      hit.setAttribute('x2', String(box.x + box.w));
      hit.setAttribute('y1', String(y));
      hit.setAttribute('y2', String(y));
      hit.setAttribute('stroke', 'transparent');
      hit.setAttribute('stroke-width', '16');
      gridSvg.appendChild(hit);
    });

    const rects = pieceRects();
    rects.forEach((p) => {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('class', 'grid-label');
      t.setAttribute('x', String(cx));
      t.setAttribute('y', String(cy));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'middle');
      t.textContent = String(p.index);
      gridSvg.appendChild(t);
    });
  }

  function pointerToNatural(e) {
    const rect = imgEl.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * state.img.naturalWidth;
    const ny = ((e.clientY - rect.top) / rect.height) * state.img.naturalHeight;
    return { nx, ny, rect };
  }

  function extractPiece(source, rect) {
    const { threshold, trimPad } = state;
    const sw = Math.round(rect.w);
    const sh = Math.round(rect.h);
    const tmp = document.createElement('canvas');
    tmp.width = sw;
    tmp.height = sh;
    const ctx = tmp.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(source, rect.x, rect.y, sw, sh, 0, 0, sw, sh);
    const data = ctx.getImageData(0, 0, sw, sh);
    const px = data.data;
    let minX = sw;
    let minY = sh;
    let maxX = -1;
    let maxY = -1;

    removeEdgeConnectedWhite(px, sw, sh, threshold);

    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < sw; x += 1) {
        const i = (y * sw + x) * 4;
        if (px[i + 3] < 8) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX) {
      return null;
    }

    minX = Math.max(0, minX - trimPad);
    minY = Math.max(0, minY - trimPad);
    maxX = Math.min(sw - 1, maxX + trimPad);
    maxY = Math.min(sh - 1, maxY + trimPad);
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;

    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const octx = out.getContext('2d');
    const trimmed = ctx.createImageData(cw, ch);
    for (let y = 0; y < ch; y += 1) {
      for (let x = 0; x < cw; x += 1) {
        const si = ((minY + y) * sw + (minX + x)) * 4;
        const di = (y * cw + x) * 4;
        trimmed.data[di] = px[si];
        trimmed.data[di + 1] = px[si + 1];
        trimmed.data[di + 2] = px[si + 2];
        trimmed.data[di + 3] = px[si + 3];
      }
    }
    octx.putImageData(trimmed, 0, 0);
    return out;
  }

  function extractRawPiece(source, rect) {
    const sw = Math.max(1, Math.round(rect.w));
    const sh = Math.max(1, Math.round(rect.h));
    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    out.getContext('2d').drawImage(source, rect.x, rect.y, sw, sh, 0, 0, sw, sh);
    return out;
  }

  function buildPieces() {
    if (!state.img) return [];
    const canvas = document.createElement('canvas');
    canvas.width = state.img.naturalWidth;
    canvas.height = state.img.naturalHeight;
    canvas.getContext('2d').drawImage(state.img, 0, 0);
    const pieces = [];
    pieceRects().forEach((rect) => {
      const cropped = extractPiece(state.img, rect);
      if (!cropped) return;
      const raw = extractRawPiece(state.img, rect);
      pieces.push({
        name: rect.name,
        index: rect.index,
        canvas: cropped,
        rawCanvas: raw,
        rect,
      });
    });
    return pieces;
  }

  const zoomPanes = {
    trim: createZoomPane({
      viewport: $('#piece-zoom-viewport-trim'),
      canvas: $('#piece-zoom-canvas-trim'),
      content: $('#piece-zoom-content-trim'),
      levelEl: $('#piece-zoom-level-trim'),
    }),
    raw: createZoomPane({
      viewport: $('#piece-zoom-viewport-raw'),
      canvas: $('#piece-zoom-canvas-raw'),
      content: $('#piece-zoom-content-raw'),
      levelEl: $('#piece-zoom-level-raw'),
    }),
  };

  function createZoomPane({ viewport, canvas, content, levelEl }) {
    const pan = { scale: 1, x: 0, y: 0 };
    let drag = null;

    function updateLabel() {
      levelEl.textContent = `${Math.round(pan.scale * 100)}%`;
    }

    function applyTransform() {
      canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${pan.scale})`;
      updateLabel();
    }

    function fit() {
      const img = content.querySelector('img');
      if (!img || !viewport.clientWidth || !viewport.clientHeight) return;
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      if (!iw || !ih) return;
      const fitScale = Math.min(viewport.clientWidth / iw, viewport.clientHeight / ih) * 0.9;
      pan.scale = fitScale;
      pan.x = (viewport.clientWidth - iw * fitScale) / 2;
      pan.y = (viewport.clientHeight - ih * fitScale) / 2;
      applyTransform();
    }

    function zoomAt(clientX, clientY, factor) {
      const rect = viewport.getBoundingClientRect();
      const cx = clientX - rect.left;
      const cy = clientY - rect.top;
      const before = pan.scale;
      const next = Math.min(12, Math.max(0.08, before * factor));
      const ratio = next / before;
      pan.x = cx - (cx - pan.x) * ratio;
      pan.y = cy - (cy - pan.y) * ratio;
      pan.scale = next;
      applyTransform();
    }

    function setImage(src, alt) {
      content.replaceChildren();
      const img = document.createElement('img');
      img.alt = alt;
      img.draggable = false;
      img.src = src;
      img.addEventListener('load', () => requestAnimationFrame(() => fit()));
      content.appendChild(img);
      if (img.complete) requestAnimationFrame(() => fit());
    }

    viewport.addEventListener('wheel', (event) => {
      if (pieceZoomModal.classList.contains('hidden')) return;
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * 0.0015);
      zoomAt(event.clientX, event.clientY, factor);
    }, { passive: false });

    viewport.addEventListener('pointerdown', (event) => {
      if (pieceZoomModal.classList.contains('hidden') || event.button !== 0) return;
      event.preventDefault();
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      viewport.classList.add('is-panning');
      try { viewport.setPointerCapture(event.pointerId); } catch (err) { /* noop */ }
    });

    viewport.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.id) return;
      pan.x = drag.panX + (event.clientX - drag.x);
      pan.y = drag.panY + (event.clientY - drag.y);
      applyTransform();
    });

    function endDrag(event) {
      if (!drag || event.pointerId !== drag.id) return;
      drag = null;
      viewport.classList.remove('is-panning');
    }

    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    return {
      fit,
      zoomAt,
      setImage,
      viewport,
    };
  }

  function openPieceZoom(piece) {
    if (!piece) return;
    $('#piece-zoom-title').textContent = piece.name;
    const tw = piece.canvas.width;
    const th = piece.canvas.height;
    const rw = piece.rawCanvas.width;
    const rh = piece.rawCanvas.height;
    $('#piece-zoom-sub').textContent = `Kesilmiş ${tw}×${th} px · hücre ${rw}×${rh} px`;
    zoomPanes.trim.setImage(piece.canvas.toDataURL('image/png'), `${piece.name} kesilmiş`);
    zoomPanes.raw.setImage(piece.rawCanvas.toDataURL('image/png'), `${piece.name} hücre`);
    pieceZoomModal.classList.remove('hidden');
    document.body.classList.add('piece-zoom-open');
    requestAnimationFrame(() => {
      zoomPanes.trim.fit();
      zoomPanes.raw.fit();
    });
  }

  function closePieceZoom() {
    pieceZoomModal.classList.add('hidden');
    document.body.classList.remove('piece-zoom-open');
  }

  function pieceForZoom(index) {
    if (!state.img) return null;
    const rect = pieceRects().find((r) => r.index === index);
    if (!rect) return null;
    const cropped = extractPiece(state.img, rect);
    if (!cropped) {
      toast('Bu parça boş — eşik veya çizgileri kontrol edin');
      return null;
    }
    return {
      name: rect.name,
      index,
      canvas: cropped,
      rawCanvas: extractRawPiece(state.img, rect),
      rect,
    };
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('blob'));
      }, 'image/png');
    });
  }

  async function downloadZip() {
    if (typeof JSZip === 'undefined') {
      toast('ZIP kütüphanesi yüklenemedi');
      return;
    }
    const pieces = buildPieces();
    if (!pieces.length) {
      toast('Parça bulunamadı — eşik veya çizgileri kontrol edin');
      return;
    }
    const zip = new JSZip();
    for (const p of pieces) {
      zip.file(p.name, await canvasToBlob(p.canvas));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'beyaz-parcalar.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(`${pieces.length} parça indirildi`);
  }

  function openPreview() {
    lastPieces = buildPieces();
    if (!lastPieces.length) {
      toast('Önizlenecek parça yok');
      return;
    }
    const grid = $('#preview-grid');
    grid.innerHTML = lastPieces.map((p) => `
      <button type="button" class="preview-card" data-piece-index="${p.index}" title="Yakınlaştır">
        <figcaption>${p.name}</figcaption>
        <div class="thumb"><img src="${p.canvas.toDataURL('image/png')}" alt="" draggable="false"></div>
      </button>
    `).join('');
    $('#modal-sub').textContent = `${lastPieces.length} parça · tıklayarak yakınlaştır`;
    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
  }

  function recomputeContentBox() {
    if (!state.img) return;
    const canvas = document.createElement('canvas');
    const w = state.img.naturalWidth;
    const h = state.img.naturalHeight;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(state.img, 0, 0);
    state.contentBox = detectContentBox(ctx.getImageData(0, 0, w, h), w, h, state.threshold);
  }

  function autoGutters() {
    if (!state.img) return;
    const box = getContentBox();
    const canvas = document.createElement('canvas');
    canvas.width = state.img.naturalWidth;
    canvas.height = state.img.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(state.img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const w = canvas.width;
    const threshold = state.threshold;

    function colWhiteRatio(colX) {
      let white = 0;
      let total = 0;
      const x = Math.round(box.x + colX * box.w);
      for (let y = box.y; y < box.y + box.h; y += 2) {
        const i = (y * w + x) * 4;
        total += 1;
        if (isWhite(data[i], data[i + 1], data[i + 2], data[i + 3], threshold)) white += 1;
      }
      return white / total;
    }

    function rowWhiteRatio(rowY) {
      let white = 0;
      let total = 0;
      const y = Math.round(box.y + rowY * box.h);
      for (let x = box.x; x < box.x + box.w; x += 2) {
        const i = (y * w + x) * 4;
        total += 1;
        if (isWhite(data[i], data[i + 1], data[i + 2], data[i + 3], threshold)) white += 1;
      }
      return white / total;
    }

    function findSplit(start, end, isVertical) {
      const samples = 80;
      let best = (start + end) / 2;
      let bestScore = -1;
      for (let s = 0; s <= samples; s += 1) {
        const t = start + ((end - start) * s) / samples;
        const score = isVertical ? colWhiteRatio(t) : rowWhiteRatio(t);
        if (score > bestScore) {
          bestScore = score;
          best = t;
        }
      }
      return best;
    }

    const vOut = [];
    for (let i = 0; i < state.cols - 1; i += 1) {
      const bandStart = i / state.cols + 0.02;
      const bandEnd = (i + 1) / state.cols - 0.02;
      vOut.push(findSplit(bandStart, bandEnd, true));
    }
    const hOut = [];
    for (let i = 0; i < state.rows - 1; i += 1) {
      const bandStart = i / state.rows + 0.02;
      const bandEnd = (i + 1) / state.rows - 0.02;
      hOut.push(findSplit(bandStart, bandEnd, false));
    }

    state.vSplits = vOut.sort((a, b) => a - b);
    state.hSplits = hOut.sort((a, b) => a - b);
    syncOverlay();
    toast('Boşluklar güncellendi');
  }

  function resetGrid() {
    state.vSplits = equalSplits(state.cols);
    state.hSplits = equalSplits(state.rows);
    syncOverlay();
  }

  function loadImage(file) {
    if (!file || !file.type.startsWith('image/')) {
      toast('Geçerli bir görsel seçin');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        state.img = img;
        imgEl.src = ev.target.result;
        setGridSize(state.cols, state.rows);
        recomputeContentBox();
        uploadZone.classList.add('hidden');
        workspace.classList.remove('hidden');
        toolbar.classList.remove('hidden');
        toolbar.classList.add('flex');
        $('#image-info').textContent = `${file.name} — ${img.naturalWidth} × ${img.naturalHeight} px`;
        requestAnimationFrame(() => syncOverlay());
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  gridSvg.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest('[data-kind]');
    if (!hit || !state.img) return;
    e.preventDefault();
    drag = {
      kind: hit.dataset.kind,
      index: Number(hit.dataset.index),
      id: e.pointerId,
    };
    hit.setPointerCapture(e.pointerId);
  });

  gridSvg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { nx, ny } = pointerToNatural(e);
    const box = getContentBox();
    if (drag.kind === 'v') {
      const ratio = clamp((nx - box.x) / box.w, 0.04, 0.96);
      const i = drag.index;
      const lo = i === 0 ? 0.04 : state.vSplits[i - 1] + 0.02;
      const hi = i === state.vSplits.length - 1 ? 0.96 : state.vSplits[i + 1] - 0.02;
      state.vSplits[i] = clamp(ratio, lo, hi);
    } else {
      const ratio = clamp((ny - box.y) / box.h, 0.04, 0.96);
      const i = drag.index;
      const lo = i === 0 ? 0.04 : state.hSplits[i - 1] + 0.02;
      const hi = i === state.hSplits.length - 1 ? 0.96 : state.hSplits[i + 1] - 0.02;
      state.hSplits[i] = clamp(ratio, lo, hi);
    }
    renderGrid();
  });

  gridSvg.addEventListener('pointerup', (e) => {
    if (drag && e.pointerId === drag.id) drag = null;
  });
  gridSvg.addEventListener('pointercancel', (e) => {
    if (drag && e.pointerId === drag.id) drag = null;
  });

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadImage(file);
  });
  $('#upload-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    if (file) loadImage(file);
    fileInput.value = '';
  });

  $('#threshold').addEventListener('input', () => {
    state.threshold = Number($('#threshold').value);
    $('#threshold-val').textContent = String(state.threshold);
    recomputeContentBox();
    syncOverlay();
  });
  $('#trim-pad').addEventListener('input', () => {
    state.trimPad = Number($('#trim-pad').value);
    $('#trim-pad-val').textContent = String(state.trimPad);
  });
  $('#opt-content-box').addEventListener('change', () => {
    state.useContentBox = $('#opt-content-box').checked;
    syncOverlay();
  });

  function onGridDimensionChange() {
    const cols = Number($('#grid-cols').value);
    const rows = Number($('#grid-rows').value);
    if (!Number.isFinite(cols) || !Number.isFinite(rows)) return;
    setGridSize(cols, rows);
  }

  $('#grid-cols').addEventListener('change', onGridDimensionChange);
  $('#grid-rows').addEventListener('change', onGridDimensionChange);
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      setGridSize(Number(btn.dataset.cols), Number(btn.dataset.rows));
    });
  });

  $('#btn-reset-grid').addEventListener('click', resetGrid);
  $('#btn-auto-gutter').addEventListener('click', autoGutters);
  $('#btn-replace').addEventListener('click', () => fileInput.click());
  $('#btn-preview').addEventListener('click', openPreview);
  $('#btn-zip').addEventListener('click', downloadZip);
  $('#modal-zip').addEventListener('click', downloadZip);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', closeModal);

  $('#preview-grid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-piece-index]');
    if (!card) return;
    const index = Number(card.dataset.pieceIndex);
    const piece = pieceForZoom(index);
    if (piece) openPieceZoom(piece);
  });

  $('#piece-zoom-close').addEventListener('click', closePieceZoom);
  document.querySelectorAll('.piece-zoom-fit').forEach((btn) => {
    btn.addEventListener('click', () => zoomPanes[btn.dataset.pane].fit());
  });
  document.querySelectorAll('.piece-zoom-in').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pane = zoomPanes[btn.dataset.pane];
      const rect = pane.viewport.getBoundingClientRect();
      pane.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.25);
    });
  });
  document.querySelectorAll('.piece-zoom-out').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pane = zoomPanes[btn.dataset.pane];
      const rect = pane.viewport.getBoundingClientRect();
      pane.zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.25);
    });
  });

  window.addEventListener('resize', () => {
    syncOverlay();
    if (!pieceZoomModal.classList.contains('hidden')) {
      zoomPanes.trim.fit();
      zoomPanes.raw.fit();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!pieceZoomModal.classList.contains('hidden')) {
      closePieceZoom();
      return;
    }
    if (!modal.classList.contains('hidden')) closeModal();
  });

  syncGridInputs();
})();
