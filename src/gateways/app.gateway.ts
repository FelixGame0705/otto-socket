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
  handleJoin(client: Socket, payload: { id: string }) {
    const roomId = payload?.id;
    if (!roomId) return client.emit('error', { message: 'id is required' });

    // Auto-create room if it doesn't exist
    this.ensureRoom(roomId);

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
}


