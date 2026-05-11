const { createJsonRoomPersistence } = require('../server/roomPersistence');

type RoomSnapshot = {
  rooms: Record<string, any>;
};

export function loadRoomSnapshot(filePath: string): RoomSnapshot {
  return createJsonRoomPersistence({
    filePath,
    encryptionSecret: process.env.FAIRVALUE_ROOM_SNAPSHOT_SECRET || '',
  }).load();
}
