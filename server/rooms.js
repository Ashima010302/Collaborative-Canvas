

const USER_COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe',
];

const rooms = new Map(); // roomId -> Map<userId, {id, name, color, x, y}>

function getRoom(roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  return rooms.get(roomId);
}

function addUser(roomId, userId, name) {
  const room = getRoom(roomId);
  const color = USER_COLORS[room.size % USER_COLORS.length];
  const user = { id: userId, name: name || `Guest-${userId.slice(0, 4)}`, color, x: 0, y: 0 };
  room.set(userId, user);
  return user;
}

function removeUser(roomId, userId) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(userId);
  if (room.size === 0) rooms.delete(roomId); // don't hold empty rooms in memory forever
}

function updateCursor(roomId, userId, x, y) {
  const user = rooms.get(roomId)?.get(userId);
  if (user) { user.x = x; user.y = y; }
}

function listUsers(roomId) {
  const room = rooms.get(roomId);
  return room ? Array.from(room.values()) : [];
}

module.exports = { addUser, removeUser, updateCursor, listUsers };
