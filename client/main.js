

const canvasEl = document.getElementById('board');
const cursorLayerEl = document.getElementById('cursor-layer');
const canvas = new Canvas(canvasEl, cursorLayerEl);

const toolbar = {
  brush: document.getElementById('tool-brush'),
  eraser: document.getElementById('tool-eraser'),
  colors: document.querySelectorAll('.color-swatch'),
  width: document.getElementById('width-slider'),
  undo: document.getElementById('undo-btn'),
  redo: document.getElementById('redo-btn'),
  userList: document.getElementById('user-list'),
};

const state = {
  tool: 'brush',
  color: '#111111',
  width: Number(toolbar.width.value),
  activeStrokeId: null,
  myUserId: null,
};

const params = new URLSearchParams(location.search);
const room = params.get('room') || 'default';
const name = params.get('name') || `Guest${Math.floor(Math.random() * 1000)}`;

const socket = new RoomSocket(handleMessage);
socket.whenOpen(() => socket.join(room, name));



toolbar.brush.addEventListener('click', () => setTool('brush'));
toolbar.eraser.addEventListener('click', () => setTool('eraser'));

function setTool(tool) {
  state.tool = tool;
  toolbar.brush.classList.toggle('active', tool === 'brush');
  toolbar.eraser.classList.toggle('active', tool === 'eraser');
}

toolbar.colors.forEach((swatch) => {
  swatch.style.background = swatch.dataset.color;
  swatch.addEventListener('click', () => {
    state.color = swatch.dataset.color;
    toolbar.colors.forEach((s) => s.classList.remove('active'));
    swatch.classList.add('active');
    setTool('brush'); // picking a color implies "I want to draw", not erase
  });
});

toolbar.width.addEventListener('input', () => {
  state.width = Number(toolbar.width.value);
});

toolbar.undo.addEventListener('click', () => socket.undo());
toolbar.redo.addEventListener('click', () => socket.redo());

document.addEventListener('keydown', (e) => {
  const cmdOrCtrl = e.metaKey || e.ctrlKey;
  if (!cmdOrCtrl) return;
  if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); socket.undo(); }
  if (e.key === 'z' && e.shiftKey) { e.preventDefault(); socket.redo(); }
});



function localPoint(e) {
  const rect = canvasEl.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvasEl.addEventListener('pointerdown', (e) => {
  canvasEl.setPointerCapture(e.pointerId);
  const { x, y } = localPoint(e);
  const id = crypto.randomUUID();
  state.activeStrokeId = id;
  canvas.beginStroke(id, state.tool, state.color, state.width, x, y);
  socket.strokeStart(id, state.tool, state.color, state.width, x, y);
});

canvasEl.addEventListener('pointermove', (e) => {
  const { x, y } = localPoint(e);
  socket.cursor(x, y); // always broadcast so others see where you're pointing, drawing or not

  if (!state.activeStrokeId) return;
  canvas.extendStroke(state.activeStrokeId, x, y);
  socket.strokePoint(state.activeStrokeId, x, y);
});

function stopStroke() {
  if (!state.activeStrokeId) return;
  canvas.endStroke(state.activeStrokeId);
  socket.strokeEnd(state.activeStrokeId);
  state.activeStrokeId = null;
}

canvasEl.addEventListener('pointerup', stopStroke);
canvasEl.addEventListener('pointercancel', stopStroke);
canvasEl.addEventListener('pointerleave', (e) => {
 
  if (e.buttons === 0) stopStroke();
});



function handleMessage(msg) {
  switch (msg.type) {
    case 'init':
      state.myUserId = msg.userId;
      canvas.loadSnapshot(msg.strokes);
      renderUserList(msg.users);
      break;

    case 'user-joined':
    case 'user-left':
      
      if (msg.type === 'user-left') {
        canvas.removeCursor(msg.userId);
        removeUserFromList(msg.userId);
      } else {
        addUserToList(msg.user);
      }
      break;

    case 'stroke-start':
      canvas.beginStroke(msg.id, msg.tool, msg.color, msg.width, msg.x, msg.y);
      break;

    case 'stroke-point':
      for (const p of msg.points) canvas.extendStroke(msg.id, p.x, p.y);
      break;

    case 'stroke-end':
      canvas.endStroke(msg.id);
      break;

    case 'undo':
      canvas.setVisible(msg.id, false);
      break;

    case 'redo':
      canvas.setVisible(msg.id, true);
      break;

    case 'cursor': {
      const user = userListCache.get(msg.userId);
      canvas.upsertCursor(msg.userId, user ? user.name : '', user ? user.color : '#999', msg.x, msg.y);
      break;
    }
  }
}

// ---- user list (also doubles as the cursor color/name lookup) ----

const userListCache = new Map();

function renderUserList(users) {
  userListCache.clear();
  toolbar.userList.innerHTML = '';
  users.forEach((u) => { userListCache.set(u.id, u); addUserToList(u); });
}

function addUserToList(user) {
  userListCache.set(user.id, user);
  const li = document.createElement('li');
  li.dataset.userId = user.id;
  li.innerHTML = `<span class="dot" style="background:${user.color}"></span>${user.name}`;
  toolbar.userList.appendChild(li);
}

function removeUserFromList(userId) {
  userListCache.delete(userId);
  const li = toolbar.userList.querySelector(`[data-user-id="${userId}"]`);
  if (li) li.remove();
}
