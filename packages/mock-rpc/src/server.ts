import { EventEmitter } from 'events';
import type { MockRpcServerOptions, NetworkCondition, RpcRequest, RpcResponse } from './types';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const NETWORK_CONDITION_DELAYS: Record<NetworkCondition, number> = {
  fast: 0,
  slow: 500,
  timeout: 5000,
};

export class MockRpcServer extends EventEmitter {
  private readonly clock: Clock;
  private networkCondition: NetworkCondition = 'fast';
  private handlers = new Map<string, (params: unknown) => unknown | Promise<unknown>>();

  constructor(options: MockRpcServerOptions = {}) {
    super();
    this.clock = options.clock ?? realClock;
  }

  setNetworkCondition(condition: NetworkCondition): void {
    this.networkCondition = condition;
  }

  getNetworkCondition(): NetworkCondition {
    return this.networkCondition;
  }

  register(method: string, handler: (params: unknown) => unknown | Promise<unknown>): void {
    this.handlers.set(method, handler);
  }

  async handle(request: RpcRequest): Promise<RpcResponse> {
    const delay = NETWORK_CONDITION_DELAYS[this.networkCondition];
    if (delay > 0) {
      await this.clock.sleep(delay);
    }

    if (this.networkCondition === 'timeout') {
      throw new Error(`RPC request timed out after ${delay}ms`);
    }

    const handler = this.handlers.get(request.method);
    if (!handler) {
      throw new Error(`Unknown method: ${request.method}`);
    }

    const result = await handler(request.params);
    return { id: request.id, result };
  }
}
