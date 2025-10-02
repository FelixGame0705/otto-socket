import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppGateway } from '../gateways/app.gateway';
import { ActionLogService } from '../services/action-log.service';

const ACTIONS = ['forward', 'turnRight', 'turnLeft', 'turnBack', 'victory', 'defeat'] as const;
type ActionType = typeof ACTIONS[number];

@Controller()
export class ActionController {
  constructor(
    private readonly gateway: AppGateway,
    private readonly log: ActionLogService,
  ) {}

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
      },
      required: ['id', 'actions'],
    },
  })
  async sendActions(
    @Body()
    body: { id?: string; actions?: string[] },
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

}


