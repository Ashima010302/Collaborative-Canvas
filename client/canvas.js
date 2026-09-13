
class Canvas {
  constructor(canvasEl, cursorLayerEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d');
    this.cursorLayer = cursorLayerEl;
    this.strokes = new Map(); 
    this.order = [];          
    this.cursorEls = new Map();

    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.redrawAll();
  }

  loadSnapshot(strokes) {
    this.strokes.clear();
    this.order = [];
    for (const s of strokes) {
      this.strokes.set(s.id, { ...s, points: [...s.points] });
      this.order.push(s.id);
    }
    this.redrawAll();
  }

  beginStroke(id, tool, color, width, x, y) {
    const stroke = { id, tool, color, width, points: [{ x, y }], visible: true };
    this.strokes.set(id, stroke);
    this.order.push(id);
    this._drawSegment(stroke, x, y, x, y); // dot for a single click
  }

  extendStroke(id, x, y) {
    const stroke = this.strokes.get(id);
    if (!stroke) return;
    const last = stroke.points[stroke.points.length - 1];
    stroke.points.push({ x, y });
    this._drawSegment(stroke, last.x, last.y, x, y);
  }

  endStroke() {
   
  }

  setVisible(id, visible) {
    const stroke = this.strokes.get(id);
    if (!stroke) return;
    stroke.visible = visible;
    this.redrawAll(); 
  }

  redrawAll() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    for (const id of this.order) {
      const stroke = this.strokes.get(id);
      if (!stroke || !stroke.visible) continue;
      this._drawFullStroke(stroke);
    }
  }

  _drawFullStroke(stroke) {
    const pts = stroke.points;
    if (pts.length === 0) return;
    if (pts.length === 1) {
      this._drawSegment(stroke, pts[0].x, pts[0].y, pts[0].x, pts[0].y);
      return;
    }
    for (let i = 1; i < pts.length; i++) {
      this._drawSegment(stroke, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    }
  }

  _drawSegment(stroke, x0, y0, x1, y1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.width;
    if (stroke.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color;
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  // --- remote cursor indicators (not part of the raster canvas) ---

  upsertCursor(userId, name, color, x, y) {
    let el = this.cursorEls.get(userId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'remote-cursor';
      el.innerHTML = `<span class="dot"></span><span class="label"></span>`;
      el.querySelector('.dot').style.background = color;
      el.querySelector('.label').textContent = name;
      el.querySelector('.label').style.background = color;
      this.cursorLayer.appendChild(el);
      this.cursorEls.set(userId, el);
    }
    el.style.transform = `translate(${x}px, ${y}px)`;
  }

  removeCursor(userId) {
    const el = this.cursorEls.get(userId);
    if (el) { el.remove(); this.cursorEls.delete(userId); }
  }
}
