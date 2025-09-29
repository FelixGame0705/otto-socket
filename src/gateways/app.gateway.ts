import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ActionLogService } from '../services/action-log.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  path: '/socket.io',
})
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppGateway.name);
  // Rooms explicitly created by API calls (even if no client has joined yet)
  private readonly createdRooms = new Set<string>();
  // Track TTL timers and expiry per room
  private readonly roomExpiryTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly roomExpiryAt: Map<string, number> = new Map();

  constructor(private readonly log: ActionLogService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  // app.gateway.ts
handleJoin(client: Socket, payload: { id: string }) {
  const roomId = payload?.id;
  if (!roomId) return client.emit('error', { message: 'id is required' });

  // Chỉ cho join nếu room đã được tạo bằng API (ensureRoom) hoặc có TTL đã đặt
  const allowed = this.createdRooms.has(roomId);
  if (!allowed) {
    return client.emit('error', { message: 'room not found. Please createRoom first.' });
  }

  client.join(roomId);
  client.emit('joined', { roomId });
  const last = this.log.getLastSequence(roomId) ?? [];
  client.emit('actions', { roomId, actions: last });
}

  emitActions(roomId: string, actions: string[]) {
    this.server.to(roomId).emit('actions', { actions: [...actions], roomId, timestamp: Date.now() });
  }

  ensureRoom(roomId: string) {
    if (roomId) {
      this.createdRooms.add(roomId);
    }
  }

  setRoomTtl(roomId: string, ttlSeconds: number) {
    if (!roomId || !Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return;
    // clear previous
    const prev = this.roomExpiryTimers.get(roomId);
    if (prev) clearTimeout(prev);
    const ttlMs = Math.floor(ttlSeconds * 1000);
    const expireAt = Date.now() + ttlMs;
    this.roomExpiryAt.set(roomId, expireAt);
    const timer = setTimeout(() => {
      this.expireRoom(roomId);
    }, ttlMs);
    this.roomExpiryTimers.set(roomId, timer);
  }

  private expireRoom(roomId: string) {
    // Notify clients
    this.server.to(roomId).emit('roomExpired', { roomId, expiredAt: Date.now() });
    // Disconnect all clients in the room
    const clientIds = this.getRoomClientIds(roomId);
    for (const id of clientIds) {
      const socket = this.server.sockets.sockets.get(id);
      if (socket) {
        try {
          socket.leave(roomId);
          socket.disconnect(true);
        } catch {}
      }
    }
    // Cleanup
    this.createdRooms.delete(roomId);
    const t = this.roomExpiryTimers.get(roomId);
    if (t) clearTimeout(t);
    this.roomExpiryTimers.delete(roomId);
    this.roomExpiryAt.delete(roomId);
  }

  getRoomExpiry(roomId: string): number | undefined {
    return this.roomExpiryAt.get(roomId);
  }

  getActiveRooms(): string[] {
    if (!this.server) return [];
    const { rooms } = this.server.sockets.adapter;
    const socketIds = new Set(this.server.sockets.sockets.keys());
    const result: Set<string> = new Set(this.createdRooms);
    rooms.forEach((_set, roomId) => {
      if (!socketIds.has(roomId)) {
        result.add(roomId);
      }
    });
    return Array.from(result);
  }

  getRoomClientIds(roomId: string): string[] {
    if (!this.server) return [];
    const room = this.server.sockets.adapter.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room);
  }
}


