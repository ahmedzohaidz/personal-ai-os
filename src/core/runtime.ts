import type { Clock, IdGenerator } from './contracts.js';

export class SystemClock implements Clock {
  now(): string { return new Date().toISOString(); }
}

export class SequentialIdGenerator implements IdGenerator {
  private value = 0;
  next(prefix: string): string {
    this.value += 1;
    return `${prefix}_${this.value.toString().padStart(4, '0')}`;
  }
}

export class CryptoIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
  }
}
