
const rooms = new Map(); // roomId -> { strokesById, order, undoStack, redoStack }

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      strokesById: new Map(),
      order: [],      
      undoStack: [],  // ids of currently-visible, completed strokes, oldest first
      redoStack: [],  // ids most recently undone, oldest first
    });
  }
  return rooms.get(roomId);
}

function startStroke(roomId, strokeId, userId, tool, color, width, x, y) {
  const room = getRoom(roomId);
  const stroke = { id: strokeId, userId, tool, color, width, points: [{ x, y }], visible: true, done: false };
  room.strokesById.set(strokeId, stroke);
  room.order.push(strokeId);
  return stroke;
}

function addPoint(roomId, strokeId, x, y) {
  const stroke = rooms.get(roomId)?.strokesById.get(strokeId);
  if (stroke) stroke.points.push({ x, y });
}

function endStroke(roomId, strokeId) {
  const room = getRoom(roomId);
  const stroke = room.strokesById.get(strokeId);
  if (!stroke) return;
  stroke.done = true;
  room.undoStack.push(strokeId);
  room.redoStack.length = 0; 
}

function undo(roomId) {
  const room = getRoom(roomId);
  const id = room.undoStack.pop();
  if (!id) return null;
  room.strokesById.get(id).visible = false;
  room.redoStack.push(id);
  return id;
}

function redo(roomId) {
  const room = getRoom(roomId);
  const id = room.redoStack.pop();
  if (!id) return null;
  room.strokesById.get(id).visible = true;
  room.undoStack.push(id);
  return id;
}


function getSnapshot(roomId) {
  const room = getRoom(roomId);
  return room.order
    .map((id) => room.strokesById.get(id))
    .filter((s) => s.visible);
}

function clearRoom(roomId) {
  rooms.delete(roomId);
}

module.exports = { startStroke, addPoint, endStroke, undo, redo, getSnapshot, clearRoom };
