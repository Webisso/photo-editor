(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────
  // line: { id, type:'v'|'h', ratio, bends:[{ id, pos, offset }] }
  let lines = [];
  let selectedLineId = null;
  let nextLineId = 1;
  let nextBendId = 1;
  let sourceImage = null;
  let cutPieces = [];

  let dragging = null;
  let lastPointer = {}; // lineId -> { time, x, y }

  // shape: { id, type:'circle'|'rect', cx, cy, rw, rh, rotation }
  let editMode = 'lines';
  let shapes = [];
  let selectedShapeId = null;
  let nextShapeId = 1;

  const $ = (sel) => document.querySelector(sel);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const uploadZone    = $('#upload-zone');
  const fileInput     = $('#file-input');
  const uploadBtn     = $('#upload-btn');
  const toolbar       = $('#toolbar');
  const editor        = $('#editor');
  const editorWrapper = $('#editor-wrapper');
  const canvasArea    = $('#canvas-area');
  const imgEl         = $('#source-image');
  const linesSvg      = $('#lines-svg');
  const imageInfo     = $('#image-info');
  const gridInfo      = $('#grid-info');
  const modal         = $('#modal');
  const previewGrid   = $('#preview-grid');
  const modalSubtitle = $('#modal-subtitle');
  const toast         = $('#toast');

  // ── Scroll preservation (fixes horizontal line drag jump) ──
  function preserveScroll(fn) {
    const st = editorWrapper.scrollTop;
    const sl = editorWrapper.scrollLeft;
    fn();
    editorWrapper.scrollTop = st;
    editorWrapper.scrollLeft = sl;
  }

  function syncOverlaySize() {
    const w = imgEl.clientWidth;
    const h = imgEl.clientHeight;
    if (!w || !h) return null;

    linesSvg.setAttribute('width', String(w));
    linesSvg.setAttribute('height', String(h));
    linesSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    linesSvg.style.width = `${w}px`;
    linesSvg.style.height = `${h}px`;

    return { w, h };
  }

  function getDisplaySize() {
    const synced = syncOverlaySize();
    if (synced) return synced;
    const rect = imgEl.getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  function getImageRect() {
    return imgEl.getBoundingClientRect();
  }

  function pointerRatios(e) {
    const rect = getImageRect();
    return {
      x: clamp((e.clientX - rect.left) / rect.width, 0, 1),
      y: clamp((e.clientY - rect.top) / rect.height, 0, 1),
      rect,
    };
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function getUiScale(w, h) {
    const base = Math.min(w, h);
    return Math.max(1, Math.min(1.6, base / 900));
  }

  // ── Upload ─────────────────────────────────────────────
  function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Lütfen geçerli bir görsel dosyası seçin.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        sourceImage = img;
        imgEl.src = e.target.result;
        lines = [];
        shapes = [];
        selectedLineId = null;
        selectedShapeId = null;
        nextLineId = 1;
        nextBendId = 1;
        nextShapeId = 1;
        renderOverlay();

        uploadZone.classList.add('hidden');
        editor.classList.remove('hidden');
        toolbar.classList.remove('hidden');
        toolbar.classList.add('flex');

        imageInfo.textContent = `${file.name} — ${img.naturalWidth} × ${img.naturalHeight} px`;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  uploadZone.addEventListener('click', (e) => {
    if (e.target === uploadBtn || uploadBtn.contains(e.target)) return;
    fileInput.click();
  });
  uploadBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  // ── Line helpers ───────────────────────────────────────
  function addLine(type) {
    const existing = lines.filter(l => l.type === type).map(l => l.ratio);
    let ratio = 0.5;
    while (existing.some(r => Math.abs(r - ratio) < 0.02)) {
      ratio += 0.08;
      if (ratio > 0.95) ratio = 0.05;
    }
    const line = { id: nextLineId++, type, ratio, bends: [] };
    lines.push(line);
    selectedLineId = line.id;
    preserveScroll(renderLines);
  }

  function removeLine(id) {
    lines = lines.filter(l => l.id !== id);
    if (selectedLineId === id) selectedLineId = null;
    preserveScroll(renderLines);
  }

  function clearLines() {
    lines = [];
    selectedLineId = null;
    preserveScroll(renderLines);
  }

  function getLine(id) {
    return lines.find(l => l.id === id);
  }

  function addBend(lineId, pos) {
    const line = getLine(lineId);
    if (!line) return;
    const tooClose = line.bends.some(b => Math.abs(b.pos - pos) < 0.06);
    if (tooClose) return;
    line.bends.push({ id: nextBendId++, pos: clamp(pos, 0.05, 0.95), offset: 0 });
    preserveScroll(renderLines);
  }

  function removeBend(lineId, bendId) {
    const line = getLine(lineId);
    if (!line) return;
    line.bends = line.bends.filter(b => b.id !== bendId);
    preserveScroll(renderLines);
  }

  // ── Curve math ─────────────────────────────────────────
  function buildCurvePoints(line, w, h) {
    const base = line.type === 'h' ? line.ratio * h : line.ratio * w;
    const bends = [...line.bends].sort((a, b) => a.pos - b.pos);

    if (line.type === 'h') {
      const pts = [{ t: 0, x: 0, y: base }];
      bends.forEach(b => pts.push({ t: b.pos, x: b.pos * w, y: base + b.offset * h }));
      pts.push({ t: 1, x: w, y: base });
      return pts;
    }

    const pts = [{ t: 0, x: base, y: 0 }];
    bends.forEach(b => pts.push({ t: b.pos, x: base + b.offset * w, y: b.pos * h }));
    pts.push({ t: 1, x: base, y: h });
    return pts;
  }

  function curveToPath(line, w, h) {
    const pts = buildCurvePoints(line, w, h);
    if (pts.length === 2) {
      return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
    }
    if (pts.length === 3) {
      return `M ${pts[0].x} ${pts[0].y} Q ${pts[1].x} ${pts[1].y} ${pts[2].x} ${pts[2].y}`;
    }

    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const ctrl = pts[i];
      const next = pts[i + 1];
      const endX = (ctrl.x + next.x) / 2;
      const endY = (ctrl.y + next.y) / 2;
      d += ` Q ${ctrl.x} ${ctrl.y} ${endX} ${endY}`;
    }
    const last = pts[pts.length - 1];
    const lastCtrl = pts[pts.length - 2];
    d += ` Q ${lastCtrl.x} ${lastCtrl.y} ${last.x} ${last.y}`;
    return d;
  }

  function sampleCurve(line, w, h, samples = 80) {
    const pts = buildCurvePoints(line, w, h);
    if (pts.length === 2) {
      const result = [];
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        result.push({
          x: pts[0].x + (pts[1].x - pts[0].x) * t,
          y: pts[0].y + (pts[1].y - pts[0].y) * t,
        });
      }
      return result;
    }

    const path = curveToPath(line, w, h);
    const svgNS = 'http://www.w3.org/2000/svg';
    const tempPath = document.createElementNS(svgNS, 'path');
    tempPath.setAttribute('d', path);
    const len = tempPath.getTotalLength();
    const result = [];
    for (let i = 0; i <= samples; i++) {
      const p = tempPath.getPointAtLength((len * i) / samples);
      result.push({ x: p.x, y: p.y });
    }
    return result;
  }

  function lineValueAt(line, coord, w, h) {
    const samples = sampleCurve(line, w, h, 120);
    if (line.type === 'h') {
      let best = samples[0];
      for (const p of samples) {
        if (Math.abs(p.x - coord) < Math.abs(best.x - coord)) best = p;
      }
      return best.y;
    }
    let best = samples[0];
    for (const p of samples) {
      if (Math.abs(p.y - coord) < Math.abs(best.y - coord)) best = p;
    }
    return best.x;
  }

  // ── Render ─────────────────────────────────────────────
  function getLabelMetrics(w, h) {
    const s = getUiScale(w, h);
    return {
      fontSize: 9,
      padX: 3,
      padY: 2,
      width: 18,
      height: 11,
      radius: 2,
      handleR: 4,
      hitWidth: 10 * s,
      strokeWidth: Math.max(1, 1.1 * Math.sqrt(s)),
    };
  }

  function renderBendHandles(g, line, w, h, metrics) {
    g.querySelectorAll('.bend-handle').forEach(el => el.remove());
    if (line.id !== selectedLineId) return;

    line.bends.forEach(bend => {
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const cx = line.type === 'h' ? bend.pos * w : line.ratio * w + bend.offset * w;
      const cy = line.type === 'h' ? line.ratio * h + bend.offset * h : bend.pos * h;
      handle.setAttribute('cx', cx);
      handle.setAttribute('cy', cy);
      handle.setAttribute('r', metrics.handleR);
      handle.classList.add('bend-handle');
      handle.addEventListener('pointerdown', (e) => startBendDrag(e, line.id, bend.id));
      handle.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        removeBend(line.id, bend.id);
      });
      g.appendChild(handle);
    });
  }

  function updateLabelPosition(g, line, w, h, metrics) {
    const labelBg = g.querySelector('.line-label-bg');
    const labelText = g.querySelector('.line-label-text');
    if (!labelBg || !labelText) return;

    if (line.type === 'h') {
      const x = 8 * getUiScale(w, h);
      const y = line.ratio * h;
      labelBg.setAttribute('x', x);
      labelBg.setAttribute('y', y - metrics.height - metrics.padY);
      labelText.setAttribute('x', x + metrics.padX);
      labelText.setAttribute('y', y - metrics.padY - 2);
    } else {
      const x = line.ratio * w + 8 * getUiScale(w, h);
      const y = metrics.height + metrics.padY * 2;
      labelBg.setAttribute('x', x);
      labelBg.setAttribute('y', y - metrics.height);
      labelText.setAttribute('x', x + metrics.padX);
      labelText.setAttribute('y', y - metrics.padY - 2);
    }
  }

  function renderLines() {
    const { w, h } = getDisplaySize();
    if (!w || !h) return;

    const metrics = getLabelMetrics(w, h);
    syncOverlaySize();
    linesSvg.innerHTML = '';

    const vLines = lines.filter(l => l.type === 'v');
    const hLines = lines.filter(l => l.type === 'h');

    lines.forEach(line => {
      const isSelected = line.id === selectedLineId;
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.dataset.id = String(line.id);
      if (isSelected) g.classList.add('line-selected');

      const pathD = curveToPath(line, w, h);

      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      hit.setAttribute('d', pathD);
      hit.classList.add('line-hit', line.type === 'v' ? 'line-hit-v' : 'line-hit-h');
      hit.style.strokeWidth = metrics.hitWidth;
      hit.addEventListener('pointerdown', (e) => onLinePointerDown(e, line.id));

      const visible = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      visible.setAttribute('d', pathD);
      visible.classList.add('line-visible', line.type === 'v' ? 'line-visible-v' : 'line-visible-h');
      visible.style.strokeWidth = metrics.strokeWidth;

      g.appendChild(hit);
      g.appendChild(visible);

      const idx = line.type === 'v' ? vLines.indexOf(line) + 1 : hLines.indexOf(line) + 1;
      const label = line.type === 'v' ? `D${idx}` : `Y${idx}`;

      const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      labelBg.classList.add('line-label-bg', line.type === 'v' ? 'label-bg-v' : 'label-bg-h');
      labelBg.setAttribute('width', metrics.width);
      labelBg.setAttribute('height', metrics.height);
      labelBg.setAttribute('rx', metrics.radius);

      const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      labelText.classList.add('line-label-text', 'label-text');
      labelText.setAttribute('font-size', metrics.fontSize);
      labelText.textContent = label;

      g.appendChild(labelBg);
      g.appendChild(labelText);
      updateLabelPosition(g, line, w, h, metrics);
      renderBendHandles(g, line, w, h, metrics);

      linesSvg.appendChild(g);
    });

    updateGridInfo();
  }

  function addBendAtPointer(e, lineId) {
    const line = getLine(lineId);
    if (!line) return;
    const { x, y } = pointerRatios(e);

    let pos;
    if (line.type === 'h') {
      pos = clamp(x, 0.05, 0.95);
    } else {
      pos = clamp(y, 0.05, 0.95);
    }

    selectedLineId = lineId;
    addBend(lineId, pos);
    showToast('Eğim noktası eklendi — sarı noktayı sürükleyin.');
  }

  function onLinePointerDown(e, lineId) {
    e.preventDefault();
    e.stopPropagation();

    const line = getLine(lineId);
    if (!line) return;

    const now = Date.now();
    const prev = lastPointer[lineId];
    const isDouble = prev
      && now - prev.time < 400
      && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 20;

    if (isDouble) {
      lastPointer[lineId] = null;
      if (dragging) stopDrag();
      addBendAtPointer(e, lineId);
      return;
    }

    lastPointer[lineId] = { time: now, x: e.clientX, y: e.clientY };
    selectedLineId = lineId;

    const ratios = pointerRatios(e);
    dragging = {
      kind: 'line',
      lineId,
      pointerId: e.pointerId,
      startRatio: line.ratio,
      startPointer: ratios.x,
      startPointerY: ratios.y,
      lineType: line.type,
      moved: false,
    };

    e.target.setPointerCapture(e.pointerId);
    document.body.classList.add('is-dragging');
    document.addEventListener('pointermove', onDrag);
    document.addEventListener('pointerup', stopDrag);
    document.addEventListener('pointercancel', stopDrag);

    const { w, h } = getDisplaySize();
    const g = linesSvg.querySelector(`g[data-id="${lineId}"]`);
    if (g && !g.classList.contains('line-selected')) {
      linesSvg.querySelectorAll('g.line-selected').forEach(el => el.classList.remove('line-selected'));
      g.classList.add('line-selected');
      renderBendHandles(g, line, w, h, getLabelMetrics(w, h));
    }
  }

  // ── Drag ───────────────────────────────────────────────
  function startBendDrag(e, lineId, bendId) {
    e.preventDefault();
    e.stopPropagation();

    const line = getLine(lineId);
    if (!line) return;

    const bend = line.bends.find(b => b.id === bendId);
    if (!bend) return;

    selectedLineId = lineId;
    const ratios = pointerRatios(e);

    dragging = {
      kind: 'bend',
      lineId,
      bendId,
      pointerId: e.pointerId,
      startPos: bend.pos,
      startOffset: bend.offset,
      startPointer: ratios.x,
      startPointerY: ratios.y,
    };

    e.target.setPointerCapture(e.pointerId);
    document.body.classList.add('is-dragging');
    document.addEventListener('pointermove', onDrag);
    document.addEventListener('pointerup', stopDrag);
    document.addEventListener('pointercancel', stopDrag);
  }

  function onDrag(e) {
    if (!dragging || (dragging.pointerId !== undefined && e.pointerId !== dragging.pointerId)) return;
    e.preventDefault();

    const line = getLine(dragging.lineId);
    if (!line) return;

    const { x, y } = pointerRatios(e);

    if (dragging.kind === 'line') {
      const current = dragging.lineType === 'v' ? x : y;
      const start = dragging.lineType === 'v' ? dragging.startPointer : dragging.startPointerY;
      if (!dragging.moved && Math.abs(current - start) < 0.004) return;
      dragging.moved = true;

      line.ratio = clamp(dragging.startRatio + (current - start), 0, 1);
      updateLineDom(line);
    } else {
      const bend = line.bends.find(b => b.id === dragging.bendId);
      if (!bend) return;

      const dx = x - (dragging.startPointer ?? 0);
      const dy = y - (dragging.startPointerY ?? 0);

      if (line.type === 'h') {
        bend.pos = clamp(dragging.startPos + dx, 0.05, 0.95);
        bend.offset = clamp(dragging.startOffset + dy, -0.25, 0.25);
      } else {
        bend.pos = clamp(dragging.startPos + dy, 0.05, 0.95);
        bend.offset = clamp(dragging.startOffset + dx, -0.25, 0.25);
      }
      updateLineDom(line);
    }
  }

  function updateLineDom(line) {
    const { w, h } = getDisplaySize();
    const metrics = getLabelMetrics(w, h);
    const g = linesSvg.querySelector(`g[data-id="${line.id}"]`);
    if (!g) return;

    const pathD = curveToPath(line, w, h);
    g.querySelectorAll('path').forEach(p => p.setAttribute('d', pathD));
    updateLabelPosition(g, line, w, h, metrics);
    renderBendHandles(g, line, w, h, metrics);
  }

  function stopDrag(e) {
    if (!dragging) return;
    if (e && dragging.pointerId !== undefined && e.pointerId !== dragging.pointerId) return;

    const wasLineDrag = dragging.kind === 'line';
    const lineId = dragging.lineId;
    dragging = null;

    document.body.classList.remove('is-dragging');
    document.removeEventListener('pointermove', onDrag);
    document.removeEventListener('pointerup', stopDrag);
    document.removeEventListener('pointercancel', stopDrag);

    if (wasLineDrag && lineId) {
      const line = getLine(lineId);
      if (line) updateLineDom(line);
    }
  }

  canvasArea.addEventListener('pointerdown', (e) => {
    if (e.target === imgEl || e.target === linesSvg) {
      if (editMode === 'shapes') {
        selectedShapeId = null;
        preserveScroll(renderShapes);
      } else {
        selectedLineId = null;
        preserveScroll(renderLines);
      }
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (document.activeElement.tagName === 'INPUT') return;
    if (editMode === 'shapes' && selectedShapeId !== null) {
      e.preventDefault();
      removeShape(selectedShapeId);
      return;
    }
    if (editMode === 'lines' && selectedLineId !== null) {
      e.preventDefault();
      removeLine(selectedLineId);
    }
  });

  window.addEventListener('resize', () => preserveScroll(renderOverlay));

  // ── Mode ───────────────────────────────────────────────
  function setEditMode(mode) {
    editMode = mode;
    selectedLineId = null;
    selectedShapeId = null;
    $('#mode-lines').classList.toggle('mode-btn-active', mode === 'lines');
    $('#mode-shapes').classList.toggle('mode-btn-active', mode === 'shapes');
    $('#toolbar-lines').classList.toggle('hidden', mode !== 'lines');
    $('#toolbar-shapes').classList.toggle('hidden', mode !== 'shapes');
    $('#help-lines').classList.toggle('hidden', mode !== 'lines');
    $('#help-shapes').classList.toggle('hidden', mode !== 'shapes');
    preserveScroll(renderOverlay);
    updateGridInfo();
  }

  function renderOverlay() {
    if (editMode === 'shapes') renderShapes();
    else renderLines();
  }

  // ── Shapes ─────────────────────────────────────────────
  function shapeBase(w, h) {
    return Math.min(w, h);
  }

  function shapeRadii(shape, w, h) {
    const base = shapeBase(w, h);
    const rw = shape.rw * base;
    const rh = shape.type === 'circle' ? shape.rw * base : shape.rh * base;
    return { rw, rh };
  }

  function addShape(type) {
    const existing = shapes.length;
    let cx = 0.5;
    let cy = 0.5;
    cx += (existing % 3) * 0.06 - 0.06;
    cy += Math.floor(existing / 3) * 0.06 - 0.06;

    const shape = {
      id: nextShapeId++,
      type,
      cx: clamp(cx, 0.15, 0.85),
      cy: clamp(cy, 0.15, 0.85),
      rw: 0.1,
      rh: type === 'circle' ? 0.1 : 0.1,
      rotation: 0,
    };
    shapes.push(shape);
    selectedShapeId = shape.id;
    preserveScroll(renderShapes);
  }

  function removeShape(id) {
    shapes = shapes.filter(s => s.id !== id);
    if (selectedShapeId === id) selectedShapeId = null;
    preserveScroll(renderShapes);
  }

  function clearShapes() {
    shapes = [];
    selectedShapeId = null;
    preserveScroll(renderShapes);
  }

  function getShape(id) {
    return shapes.find(s => s.id === id);
  }

  function localToWorld(shape, lx, ly, w, h) {
    const cx = shape.cx * w;
    const cy = shape.cy * h;
    const cos = Math.cos(shape.rotation);
    const sin = Math.sin(shape.rotation);
    return {
      x: cx + lx * cos - ly * sin,
      y: cy + lx * sin + ly * cos,
    };
  }

  function worldToLocal(shape, wx, wy, w, h) {
    const cx = shape.cx * w;
    const cy = shape.cy * h;
    const dx = wx - cx;
    const dy = wy - cy;
    const cos = Math.cos(-shape.rotation);
    const sin = Math.sin(-shape.rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos,
    };
  }

  function renderShapeDeleteBtn(g, shapeId, metrics) {
    const r = 10 * metrics.scale;
    const iconSize = 12 * metrics.scale;

    const btn = document.createElementNS(SVG_NS, 'g');
    btn.classList.add('shape-delete-btn');

    const bg = document.createElementNS(SVG_NS, 'circle');
    bg.setAttribute('cx', 0);
    bg.setAttribute('cy', 0);
    bg.setAttribute('r', r);
    btn.appendChild(bg);

    const icon = document.createElementNS(SVG_NS, 'svg');
    icon.setAttribute('x', -iconSize / 2);
    icon.setAttribute('y', -iconSize / 2);
    icon.setAttribute('width', iconSize);
    icon.setAttribute('height', iconSize);
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute(
      'd',
      'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
    );
    icon.appendChild(path);
    btn.appendChild(icon);

    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      removeShape(shapeId);
    });

    g.appendChild(btn);
  }

  function renderShapeHandles(g, shape, w, h, metrics) {
    const { rw, rh } = shapeRadii(shape, w, h);
    const handles = [
      { kind: 'resize', x: -rw, y: -rh },
      { kind: 'resize', x: rw, y: -rh },
      { kind: 'resize', x: rw, y: rh },
      { kind: 'resize', x: -rw, y: rh },
      { kind: 'rotate', x: 0, y: -rh - 22 * metrics.scale },
    ];

    handles.forEach((hnd, i) => {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', hnd.x);
      c.setAttribute('cy', hnd.y);
      c.setAttribute('r', 6 * metrics.scale);
      c.classList.add('shape-handle', hnd.kind === 'rotate' ? 'shape-handle-rotate' : 'shape-handle-resize');
      c.dataset.handle = hnd.kind;
      c.dataset.index = String(i);
      c.addEventListener('pointerdown', (e) => startShapeHandleDrag(e, shape.id, hnd.kind, i));
      g.appendChild(c);
    });
  }

  function renderShapes() {
    const { w, h } = getDisplaySize();
    if (!w || !h) return;

    const metrics = getLabelMetrics(w, h);
    metrics.scale = getUiScale(w, h);
    syncOverlaySize();
    linesSvg.innerHTML = '';

    shapes.forEach((shape, idx) => {
      const isSelected = shape.id === selectedShapeId;
      const g = document.createElementNS(SVG_NS, 'g');
      g.dataset.id = String(shape.id);
      if (isSelected) g.classList.add('shape-selected');

      const cx = shape.cx * w;
      const cy = shape.cy * h;
      const { rw, rh } = shapeRadii(shape, w, h);
      const deg = (shape.rotation * 180) / Math.PI;

      const inner = document.createElementNS(SVG_NS, 'g');
      inner.setAttribute('transform', `translate(${cx},${cy}) rotate(${deg})`);

      let hit;
      if (shape.type === 'circle') {
        hit = document.createElementNS(SVG_NS, 'ellipse');
        hit.setAttribute('cx', 0);
        hit.setAttribute('cy', 0);
        hit.setAttribute('rx', rw);
        hit.setAttribute('ry', rh);
      } else {
        hit = document.createElementNS(SVG_NS, 'rect');
        hit.setAttribute('x', -rw);
        hit.setAttribute('y', -rh);
        hit.setAttribute('width', rw * 2);
        hit.setAttribute('height', rh * 2);
      }
      hit.classList.add('shape-hit');
      hit.addEventListener('pointerdown', (e) => startShapeMoveDrag(e, shape.id));

      inner.appendChild(hit);
      renderShapeDeleteBtn(inner, shape.id, metrics);

      if (isSelected) renderShapeHandles(inner, shape, w, h, metrics);

      const label = document.createElementNS(SVG_NS, 'text');
      label.classList.add('shape-label');
      label.setAttribute('x', -rw + 4);
      label.setAttribute('y', -rh + 12);
      label.textContent = shape.type === 'circle' ? `D${idx + 1}` : `K${idx + 1}`;
      inner.appendChild(label);

      g.appendChild(inner);
      linesSvg.appendChild(g);
    });

    updateGridInfo();
  }

  function startShapeMoveDrag(e, shapeId) {
    e.preventDefault();
    e.stopPropagation();
    const shape = getShape(shapeId);
    if (!shape) return;
    selectedShapeId = shapeId;
    const ratios = pointerRatios(e);
    dragging = {
      kind: 'shape-move',
      shapeId,
      pointerId: e.pointerId,
      startCx: shape.cx,
      startCy: shape.cy,
      startX: ratios.x,
      startY: ratios.y,
    };
    e.target.setPointerCapture(e.pointerId);
    document.body.classList.add('is-dragging');
    document.addEventListener('pointermove', onShapeDrag);
    document.addEventListener('pointerup', stopShapeDrag);
    document.addEventListener('pointercancel', stopShapeDrag);
    renderShapes();
  }

  function startShapeHandleDrag(e, shapeId, handleKind, handleIndex) {
    e.preventDefault();
    e.stopPropagation();
    const shape = getShape(shapeId);
    if (!shape) return;
    selectedShapeId = shapeId;
    const { w, h } = getDisplaySize();
    const base = shapeBase(w, h);
    const dragState = {
      kind: handleKind === 'rotate' ? 'shape-rotate' : 'shape-resize',
      shapeId,
      pointerId: e.pointerId,
      startRw: shape.rw,
      startRh: shape.rh,
      startRot: shape.rotation,
      startCx: shape.cx,
      startCy: shape.cy,
      w,
      h,
    };

    if (handleKind === 'resize' && shape.type === 'rect') {
      const rwPx = shape.rw * base;
      const rhPx = shape.rh * base;
      const corners = [
        { lx: -rwPx, ly: -rhPx },
        { lx: rwPx, ly: -rhPx },
        { lx: rwPx, ly: rhPx },
        { lx: -rwPx, ly: rhPx },
      ];
      const anchor = localToWorld(shape, corners[(handleIndex + 2) % 4].lx, corners[(handleIndex + 2) % 4].ly, w, h);
      dragState.anchorWorldX = anchor.x;
      dragState.anchorWorldY = anchor.y;
    }

    dragging = dragState;
    e.target.setPointerCapture(e.pointerId);
    document.body.classList.add('is-dragging');
    document.addEventListener('pointermove', onShapeDrag);
    document.addEventListener('pointerup', stopShapeDrag);
    document.addEventListener('pointercancel', stopShapeDrag);
  }

  function onShapeDrag(e) {
    if (!dragging || !dragging.kind.startsWith('shape') || e.pointerId !== dragging.pointerId) return;
    e.preventDefault();

    const shape = getShape(dragging.shapeId);
    if (!shape) return;

    const { w, h } = getDisplaySize();
    const base = shapeBase(w, h);
    const ratios = pointerRatios(e);

    if (dragging.kind === 'shape-move') {
      shape.cx = clamp(dragging.startCx + (ratios.x - dragging.startX), 0, 1);
      shape.cy = clamp(dragging.startCy + (ratios.y - dragging.startY), 0, 1);
      updateShapeDom(shape);
      return;
    }

    const rect = getImageRect();
    const px = ratios.x * rect.width;
    const py = ratios.y * rect.height;
    const local = worldToLocal(shape, px, py, w, h);

    if (dragging.kind === 'shape-resize') {
      const minR = 0.03;

      if (shape.type === 'rect' && dragging.anchorWorldX !== undefined) {
        const draggedX = px;
        const draggedY = py;
        const newCx = (dragging.anchorWorldX + draggedX) / 2;
        const newCy = (dragging.anchorWorldY + draggedY) / 2;
        const halfX = draggedX - newCx;
        const halfY = draggedY - newCy;
        const cos = Math.cos(-shape.rotation);
        const sin = Math.sin(-shape.rotation);
        const localHalfX = halfX * cos - halfY * sin;
        const localHalfY = halfX * sin + halfY * cos;

        shape.cx = clamp(newCx / w, 0, 1);
        shape.cy = clamp(newCy / h, 0, 1);
        shape.rw = clamp(Math.abs(localHalfX) / base, minR, 0.48);
        shape.rh = clamp(Math.abs(localHalfY) / base, minR, 0.48);
      } else {
        shape.rw = clamp(Math.abs(local.x) / base, minR, 0.48);
        if (shape.type === 'circle') {
          shape.rh = shape.rw;
        } else {
          shape.rh = clamp(Math.abs(local.y) / base, minR, 0.48);
        }
      }

      updateShapeDom(shape);
      return;
    }

    if (dragging.kind === 'shape-rotate') {
      const cx = shape.cx * w;
      const cy = shape.cy * h;
      shape.rotation = Math.atan2(py - cy, px - cx) + Math.PI / 2;
      updateShapeDom(shape);
    }
  }

  function updateShapeDom(shape) {
    preserveScroll(renderShapes);
  }

  function stopShapeDrag(e) {
    if (!dragging || !dragging.kind.startsWith('shape')) return;
    if (e && dragging.pointerId !== undefined && e.pointerId !== dragging.pointerId) return;
    dragging = null;
    document.body.classList.remove('is-dragging');
    document.removeEventListener('pointermove', onShapeDrag);
    document.removeEventListener('pointerup', stopShapeDrag);
    document.removeEventListener('pointercancel', stopShapeDrag);
  }

  function isInsideShape(shape, px, py, nw, nh) {
    const base = Math.min(nw, nh);
    const cx = shape.cx * nw;
    const cy = shape.cy * nh;
    const rw = shape.rw * base;
    const rh = shape.type === 'circle' ? shape.rw * base : shape.rh * base;
    const dx = px - cx;
    const dy = py - cy;
    const cos = Math.cos(-shape.rotation);
    const sin = Math.sin(-shape.rotation);
    const lx = dx * cos - dy * sin;
    const ly = dx * sin + dy * cos;

    if (shape.type === 'circle') {
      return (lx * lx) / (rw * rw) + (ly * ly) / (rh * rh) <= 1;
    }
    return Math.abs(lx) <= rw && Math.abs(ly) <= rh;
  }

  function getShapeBounds(shape, nw, nh) {
    const base = Math.min(nw, nh);
    const cx = shape.cx * nw;
    const cy = shape.cy * nh;
    const rw = shape.rw * base;
    const rh = shape.type === 'circle' ? shape.rw * base : shape.rh * base;
    const corners = [
      { x: -rw, y: -rh }, { x: rw, y: -rh }, { x: rw, y: rh }, { x: -rw, y: rh },
    ];
    const cos = Math.cos(shape.rotation);
    const sin = Math.sin(shape.rotation);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    corners.forEach(c => {
      const wx = cx + c.x * cos - c.y * sin;
      const wy = cy + c.x * sin + c.y * cos;
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
    });

    return {
      minX: clamp(Math.floor(minX), 0, nw - 1),
      minY: clamp(Math.floor(minY), 0, nh - 1),
      maxX: clamp(Math.ceil(maxX), 0, nw - 1),
      maxY: clamp(Math.ceil(maxY), 0, nh - 1),
    };
  }

  async function cutImageShapes() {
    const nw = sourceImage.naturalWidth;
    const nh = sourceImage.naturalHeight;

    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = nw;
    imgCanvas.height = nh;
    const imgCtx = imgCanvas.getContext('2d');
    imgCtx.drawImage(sourceImage, 0, 0);
    const data = imgCtx.getImageData(0, 0, nw, nh).data;

    const pieces = [];
    const outCanvas = document.createElement('canvas');
    const outCtx = outCanvas.getContext('2d');

    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i];
      const b = getShapeBounds(shape, nw, nh);
      if (b.minX >= b.maxX || b.minY >= b.maxY) continue;

      const w = b.maxX - b.minX + 1;
      const h = b.maxY - b.minY + 1;
      outCanvas.width = w;
      outCanvas.height = h;
      const outData = outCtx.createImageData(w, h);

      for (let py = b.minY; py <= b.maxY; py++) {
        for (let px = b.minX; px <= b.maxX; px++) {
          const di = ((py - b.minY) * w + (px - b.minX)) * 4;
          if (isInsideShape(shape, px, py, nw, nh)) {
            const si = (py * nw + px) * 4;
            outData.data[di] = data[si];
            outData.data[di + 1] = data[si + 1];
            outData.data[di + 2] = data[si + 2];
            outData.data[di + 3] = data[si + 3];
          } else {
            outData.data[di + 3] = 0;
          }
        }
      }

      outCtx.putImageData(outData, 0, 0);
      const blob = await new Promise(res => outCanvas.toBlob(res, 'image/png'));
      const prefix = shape.type === 'circle' ? 'daire' : 'kare';
      const name = `${prefix}_${i + 1}.png`;
      pieces.push({
        blob,
        name,
        url: URL.createObjectURL(blob),
        row: i + 1,
        col: 1,
        label: shape.type === 'circle' ? `D${i + 1}` : `K${i + 1}`,
      });
      await new Promise(r => setTimeout(r, 0));
    }

    return pieces;
  }

  // ── Grid info ──────────────────────────────────────────
  function updateGridInfo() {
    if (editMode === 'shapes') {
      gridInfo.textContent = `Parça: ${shapes.length} şekil`;
      return;
    }
    const cols = lines.filter(l => l.type === 'v').length + 1;
    const rows = lines.filter(l => l.type === 'h').length + 1;
    gridInfo.textContent = `Parça: ${cols} × ${rows} (${cols * rows} adet)`;
  }

  // ── Cut image ──────────────────────────────────────────
  function hasCurvedLines() {
    return lines.some(l => l.bends && l.bends.length > 0);
  }

  function getSortedBoundaries(type, naturalSize) {
    const ratios = lines
      .filter(l => l.type === type)
      .map(l => l.ratio)
      .sort((a, b) => a - b);
    const boundaries = [0, ...ratios.map(r => Math.round(r * naturalSize)), naturalSize];
    return [...new Set(boundaries)];
  }

  function buildLineLookups(nw, nh) {
    const vLines = lines.filter(l => l.type === 'v');
    const hLines = lines.filter(l => l.type === 'h');

    const vLookups = vLines.map(line => {
      const arr = new Float32Array(nh);
      for (let py = 0; py < nh; py++) arr[py] = lineValueAt(line, py, nw, nh);
      return arr;
    });

    const hLookups = hLines.map(line => {
      const arr = new Float32Array(nw);
      for (let px = 0; px < nw; px++) arr[px] = lineValueAt(line, px, nw, nh);
      return arr;
    });

    return { vLookups, hLookups };
  }

  function getCellIndexFromLookups(px, py, vLookups, hLookups) {
    let col = 0;
    let row = 0;
    for (const arr of vLookups) if (px > arr[py]) col++;
    for (const arr of hLookups) if (py > arr[px]) row++;
    return { row, col };
  }

  async function cutImageStraight(nw, nh, cols, rows) {
    const xBounds = getSortedBoundaries('v', nw);
    const yBounds = getSortedBoundaries('h', nh);
    const pieces = [];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = xBounds[col];
        const y = yBounds[row];
        const w = xBounds[col + 1] - x;
        const h = yBounds[row + 1] - y;
        if (w < 1 || h < 1) continue;

        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(sourceImage, x, y, w, h, 0, 0, w, h);

        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const name = `parca_${row + 1}_${col + 1}.png`;
        pieces.push({ blob, name, url: URL.createObjectURL(blob), row: row + 1, col: col + 1 });
      }
    }

    return pieces;
  }

  async function cutImageCurved(nw, nh, cols, rows) {
    const { vLookups, hLookups } = buildLineLookups(nw, nh);
    const totalCells = rows * cols;
    const cellMap = new Int32Array(nw * nh);
    const bounds = Array.from({ length: totalCells }, () => ({
      minX: nw, minY: nh, maxX: -1, maxY: -1, found: false,
    }));

    const chunkRows = 64;
    for (let y0 = 0; y0 < nh; y0 += chunkRows) {
      const y1 = Math.min(nh, y0 + chunkRows);
      for (let py = y0; py < y1; py++) {
        for (let px = 0; px < nw; px++) {
          const { row, col } = getCellIndexFromLookups(px, py, vLookups, hLookups);
          const idx = row * cols + col;
          cellMap[py * nw + px] = idx;
          const b = bounds[idx];
          b.found = true;
          if (px < b.minX) b.minX = px;
          if (py < b.minY) b.minY = py;
          if (px > b.maxX) b.maxX = px;
          if (py > b.maxY) b.maxY = py;
        }
      }
      await new Promise(r => setTimeout(r, 0));
    }

    const imgCanvas = document.createElement('canvas');
    imgCanvas.width = nw;
    imgCanvas.height = nh;
    const imgCtx = imgCanvas.getContext('2d');
    imgCtx.drawImage(sourceImage, 0, 0);
    const data = imgCtx.getImageData(0, 0, nw, nh).data;

    const pieces = [];
    const outCanvas = document.createElement('canvas');
    const outCtx = outCanvas.getContext('2d');

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const idx = row * cols + col;
        const b = bounds[idx];
        if (!b.found) continue;

        const w = b.maxX - b.minX + 1;
        const h = b.maxY - b.minY + 1;
        outCanvas.width = w;
        outCanvas.height = h;
        const outData = outCtx.createImageData(w, h);

        for (let py = b.minY; py <= b.maxY; py++) {
          for (let px = b.minX; px <= b.maxX; px++) {
            const di = ((py - b.minY) * w + (px - b.minX)) * 4;
            if (cellMap[py * nw + px] === idx) {
              const si = (py * nw + px) * 4;
              outData.data[di] = data[si];
              outData.data[di + 1] = data[si + 1];
              outData.data[di + 2] = data[si + 2];
              outData.data[di + 3] = data[si + 3];
            } else {
              outData.data[di + 3] = 0;
            }
          }
        }

        outCtx.putImageData(outData, 0, 0);
        const blob = await new Promise(res => outCanvas.toBlob(res, 'image/png'));
        const name = `parca_${row + 1}_${col + 1}.png`;
        pieces.push({ blob, name, url: URL.createObjectURL(blob), row: row + 1, col: col + 1 });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    return pieces;
  }

  async function cutImage() {
    if (!sourceImage) return [];

    const nw = sourceImage.naturalWidth;
    const nh = sourceImage.naturalHeight;
    const cols = lines.filter(l => l.type === 'v').length + 1;
    const rows = lines.filter(l => l.type === 'h').length + 1;

    if (hasCurvedLines()) {
      return cutImageCurved(nw, nh, cols, rows);
    }
    return cutImageStraight(nw, nh, cols, rows);
  }

  // ── Modal ──────────────────────────────────────────────
  function showModal(pieces) {
    cutPieces = pieces;
    previewGrid.innerHTML = '';
    previewGrid.style.gridTemplateColumns = `repeat(${Math.min(pieces.length, 4)}, minmax(0, 1fr))`;
    modalSubtitle.textContent = `${pieces.length} parça oluşturuldu — onaylarsanız ZIP olarak indirilecek.`;

    pieces.forEach(p => {
      const item = document.createElement('div');
      item.className = 'preview-item';
      item.innerHTML = `
        <img src="${p.url}" alt="${p.name}">
        <div class="preview-item-label">${p.label || `${p.row}-${p.col}`}</div>
      `;
      previewGrid.appendChild(item);
    });

    modal.classList.remove('hidden');
  }

  function closeModal() {
    modal.classList.add('hidden');
    cutPieces.forEach(p => URL.revokeObjectURL(p.url));
    cutPieces = [];
    previewGrid.innerHTML = '';
  }

  async function downloadAll() {
    if (!cutPieces.length) return;
    const zip = new JSZip();
    cutPieces.forEach(p => zip.file(p.name, p.blob));
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'foto-parcalari.zip';
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${cutPieces.length} parça ZIP olarak indirildi!`);
    closeModal();
  }

  let toastTimer = null;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
  }

  // ── Toolbar ────────────────────────────────────────────
  $('#mode-lines').addEventListener('click', (e) => { e.preventDefault(); setEditMode('lines'); });
  $('#mode-shapes').addEventListener('click', (e) => { e.preventDefault(); setEditMode('shapes'); });

  $('#btn-add-v').addEventListener('click', (e) => { e.preventDefault(); addLine('v'); });
  $('#btn-add-h').addEventListener('click', (e) => { e.preventDefault(); addLine('h'); });
  $('#btn-clear').addEventListener('click', (e) => { e.preventDefault(); clearLines(); });

  $('#btn-add-circle').addEventListener('click', (e) => { e.preventDefault(); addShape('circle'); });
  $('#btn-add-rect').addEventListener('click', (e) => { e.preventDefault(); addShape('rect'); });
  $('#btn-clear-shapes').addEventListener('click', (e) => { e.preventDefault(); clearShapes(); });

  $('#btn-complete').addEventListener('click', async (e) => {
    e.preventDefault();
    if (!sourceImage) return;

    if (editMode === 'shapes' && !shapes.length) {
      showToast('Önce en az bir şekil ekleyin.');
      return;
    }

    const btn = $('#btn-complete');
    btn.disabled = true;
    showToast('Parçalar hesaplanıyor...');

    try {
      const pieces = editMode === 'shapes' ? await cutImageShapes() : await cutImage();
      if (!pieces.length) {
        showToast('Kesilecek parça bulunamadı.');
        return;
      }
      showModal(pieces);
    } catch (err) {
      console.error(err);
      showToast('Parçalama sırasında hata oluştu. Tekrar deneyin.');
    } finally {
      btn.disabled = false;
    }
  });

  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-cancel').addEventListener('click', closeModal);
  modal.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  $('#modal-confirm').addEventListener('click', downloadAll);

  imgEl.addEventListener('load', () => preserveScroll(renderOverlay));

  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => {
      preserveScroll(renderOverlay);
    });
    resizeObserver.observe(imgEl);
  }
})();
