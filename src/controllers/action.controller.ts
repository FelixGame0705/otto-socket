import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { AppGateway } from '../gateways/app.gateway';
import { ActionLogService } from '../services/action-log.service';

const ACTIONS = ['forward', 'turnRight', 'turnLeft', 'turnBack'] as const;
type ActionType = typeof ACTIONS[number];

@ApiTags('actions')
@Controller()
export class ActionController {
  constructor(
    private readonly gateway: AppGateway,
    private readonly log: ActionLogService,
  ) {}
  @Post('createRoom')
  @ApiTags('FronendUse')
  @ApiOperation({ summary: 'Create a room by id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'room-123' },
        roomTtlSec: { type: 'number', example: 900, description: 'Optional TTL for this room in seconds' },
      },
      required: ['id'],
    },
  })
  async createRoom(@Body() body: { id: string; roomTtlSec?: number }) {
    this.gateway.ensureRoom(body.id);
    if (Number.isFinite(body.roomTtlSec as number) && (body.roomTtlSec as number) > 0) {
      this.gateway.setRoomTtl(body.id, body.roomTtlSec as number);
    }
    if(this.gateway.getRoomClientIds(body.id).length > 0) {
      return { ok: false, roomId: body.id, message: 'Room already has clients' };
    }
    return { ok: true, roomId: body.id };
  }

  @ApiTags('FronendUse')
  @Post('sendActions')
  @ApiOperation({ summary: 'Emit a sequence of actions to a room by id' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'room-123' },
        actions: {
          type: 'array',
          items: { type: 'string', enum: [...ACTIONS] as unknown as string[] },
          example: ['forward', 'turnRight', 'turnLeft'],
          description: 'Optional. If provided, send these in order',
        },
        // delayMs: { type: 'number', example: 300, description: 'Optional delay between actions' },
        roomTtlSec: { type: 'number', example: 900, description: 'Optional TTL for this room in seconds' },
      },
      required: ['id', 'actions'],
    },
  })
  async sendActions(
    @Body()
    body: { id?: string; actions?: string[]; roomTtlSec?: number },
  ) {
    const id = (body?.id ?? '').trim();
    if (!id) throw new BadRequestException('id is required');

    // const delayMs = Number.isFinite(body?.delayMs as number) ? Math.max(0, Number(body?.delayMs)) : 0;
    const many = (Array.isArray(body?.actions) ? body?.actions : undefined) as ActionType[] | undefined;
    if (!many || many.length === 0) {
      throw new BadRequestException('actions is required and must be a non-empty array');
    }

    const validate = (a: string): a is ActionType => (ACTIONS as readonly string[]).includes(a);

    const invalid = many!.filter((a) => !validate(a));
    if (invalid.length) {
      throw new BadRequestException(`Invalid actions: ${invalid.join(', ')}. Allowed: ${ACTIONS.join(', ')}`);
    }

    this.gateway.ensureRoom(id);
    if (Number.isFinite(body.roomTtlSec as number) && (body.roomTtlSec as number) > 0) {
      this.gateway.setRoomTtl(id, body.roomTtlSec as number);
    }
    // overwrite cached sequence for this room
    this.log.setLastSequence(id, many);
    // emit only the array to clients
    this.gateway.emitActions(id, many);
    // optionally still record to internal history for TTL housekeeping
    // for (const a of many!) {
    //   this.log.record(id, a);
    //   if (delayMs > 0) {
    //     await new Promise((r) => setTimeout(r, delayMs));
    //   }
    // }
    return { ok: true, roomId: id, actions: many };
  }

  @Get('rooms/:id/history')
  @ApiOperation({ summary: 'Get latest actions (sequence) of a room' })
  @ApiParam({ name: 'id', description: 'Room id' })
  getHistory(@Param('id') id: string) {
    return { ok: true, roomId: id, actions: this.log.getLastSequence(id) ?? [] };
  }

  @Post('rooms/:id/history/clear')
  @ApiOperation({ summary: 'Clear action history of a room' })
  @ApiParam({ name: 'id', description: 'Room id' })
  clearHistory(@Param('id') id: string) {
    const removed = this.log.clear(id);
    return { ok: true, roomId: id, removed };
  }

  @Get('rooms')
  @ApiOperation({ summary: 'List active rooms' })
  listRooms() {
    return { ok: true, rooms: this.gateway.getActiveRooms() };
  }

  @Get('rooms/:id/clients')
  @ApiOperation({ summary: 'List client socket ids in a room' })
  @ApiParam({ name: 'id', description: 'Room id' })
  listRoomClients(@Param('id') id: string) {
    return { ok: true, roomId: id, clients: this.gateway.getRoomClientIds(id) };
  }

  @Get('rooms/:id/last-sequence')
  @ApiOperation({ summary: 'Get cached last action sequence of a room' })
  @ApiParam({ name: 'id', description: 'Room id' })
  getLastSequence(@Param('id') id: string) {
    return { ok: true, roomId: id, sequence: this.log.getLastSequence(id) ?? [] };
  }

  @Post('rooms/:id/last-sequence/clear')
  @ApiOperation({ summary: 'Clear cached last action sequence of a room' })
  @ApiParam({ name: 'id', description: 'Room id' })
  clearLastSequence(@Param('id') id: string) {
    const cleared = this.log.clearLastSequence(id);
    return { ok: true, roomId: id, cleared };
  }
}


