import { Injectable } from '@nestjs/common';

export interface LoggedAction {
  roomId: string;
  action: string;
  timestamp: number;
}

@Injectable()
export class ActionLogService {
  private static readonly TTL_MS = 15 * 60 * 1000; // 15 minutes
  private readonly roomIdToActions: Map<string, LoggedAction[]> = new Map();
  private readonly roomIdToLastSequence: Map<string, { sequence: string[]; savedAt: number }> = new Map();

  record(roomId: string, action: string): LoggedAction {
    const now = Date.now();
    const cutoff = now - ActionLogService.TTL_MS;
    const entry: LoggedAction = { roomId, action, timestamp: now };
    const list = (this.roomIdToActions.get(roomId) ?? []).filter((e) => e.timestamp > cutoff);
    list.push(entry);
    this.roomIdToActions.set(roomId, list);
    return entry;
  }

  list(roomId: string): LoggedAction[] {
    const now = Date.now();
    const cutoff = now - ActionLogService.TTL_MS;
    const filtered = (this.roomIdToActions.get(roomId) ?? []).filter((e) => e.timestamp > cutoff);
    // compact stored list to avoid unbounded growth
    if (filtered.length !== (this.roomIdToActions.get(roomId)?.length ?? 0)) {
      this.roomIdToActions.set(roomId, filtered);
    }
    return [...filtered];
  }

  listActions(roomId: string): string[] {
    return this.list(roomId).map((e) => e.action);
  }

  clear(roomId: string): number {
    const size = this.roomIdToActions.get(roomId)?.length ?? 0;
    this.roomIdToActions.delete(roomId);
    return size;
  }

  setLastSequence(roomId: string, sequence: string[]) {
    this.roomIdToLastSequence.set(roomId, { sequence: [...sequence], savedAt: Date.now() });
  }

  getLastSequence(roomId: string): string[] | undefined {
    const now = Date.now();
    const data = this.roomIdToLastSequence.get(roomId);
    if (!data) return undefined;
    if (data.savedAt + ActionLogService.TTL_MS <= now) {
      this.roomIdToLastSequence.delete(roomId);
      return undefined;
    }
    return [...data.sequence];
  }

  clearLastSequence(roomId: string): boolean {
    return this.roomIdToLastSequence.delete(roomId);
  }
}


