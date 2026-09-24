export interface PendingUpdate {
  id: string;
  epochId: string;
  bytes: Uint8Array;
}

export class UpdateOutbox {
  readonly pending: PendingUpdate[] = [];

  enqueue(update: PendingUpdate): void {
    this.pending.push(update);
  }

  acknowledge(id: string, epochId: string): PendingUpdate | undefined {
    const head = this.pending[0];
    if (!head || head.id !== id || head.epochId !== epochId) return undefined;
    return this.pending.shift();
  }

  peek(): PendingUpdate | undefined {
    return this.pending[0];
  }

  get dirty(): boolean {
    return this.pending.length > 0;
  }
}
