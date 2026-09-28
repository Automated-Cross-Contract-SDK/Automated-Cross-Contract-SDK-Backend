import { describe, it, expect, vi, afterEach } from 'vitest';
import { MockRpcServer } from '../src/server';

describe('MockRpcServer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('responds to a basic request', async () => {
    const server = new MockRpcServer();
    const response = await server.handle({ jsonrpc: '2.0', id: 1, method: 'getHealth' });
    expect(response).toMatchObject({ jsonrpc: '2.0', id: 1 });
    expect(response.error).toBeUndefined();
  });

  it('applies the slow network condition delay via the injected clock', async () => {
    vi.useFakeTimers();
    const sleep = vi.fn((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const server = new MockRpcServer({ now: () => Date.now(), sleep });
    server.setNetworkCondition('slow');

    const pending = server.handle({ jsonrpc: '2.0', id: 1, method: 'getHealth' });
    expect(sleep).toHaveBeenCalled();

    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response.error).toBeUndefined();
  });

  it('waits out the timeout condition via the injected clock', async () => {
    vi.useFakeTimers();
    const sleep = vi.fn((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const server = new MockRpcServer({ now: () => Date.now(), sleep });
    server.setNetworkCondition('timeout');

    const pending = server.handle({ jsonrpc: '2.0', id: 1, method: 'getHealth' });
    expect(sleep).toHaveBeenCalled();

    await vi.runAllTimersAsync();
    const response = await pending;
    expect(response).toBeDefined();
  });
});
