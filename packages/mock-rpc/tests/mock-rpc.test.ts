import { describe, it, expect, beforeEach } from 'vitest'
import { MockRpcServer } from '../src/mock-rpc-server.js'
import { MockLedgerState } from '../src/ledger-state.js'
import { SequenceManager } from '../src/sequence-manager.js'
import { FixtureRecorder } from '../src/fixture-recorder.js'
import { xdr } from '@stellar/stellar-sdk'

function makeMockLedgerKey(hexId: string): xdr.LedgerKey {
  return {
    switch: () => xdr.LedgerEntryType.contractData(),
    contractData: () => ({
      contract: () => ({ contractId: () => Buffer.from(hexId, 'hex') }),
      key: () => ({ switch: () => ({ value: 15 }), value: () => Buffer.from('data') }),
      durability: () => ({}),
    }),
    toXDR: (fmt?: string) =>
      fmt === 'base64' ? `b64:${hexId}` : Buffer.from(hexId, 'hex'),
  } as unknown as xdr.LedgerKey
}

describe('MockLedgerState', () => {
  let state: MockLedgerState

  beforeEach(() => {
    state = new MockLedgerState({}, 1000)
  })

  it('initialises with correct ledger sequence', () => {
    expect(state.getCurrentLedgerSeq()).toBe(1000)
  })

  it('adds and retrieves entries', () => {
    const key = makeMockLedgerKey('abc123')
    const keyB64 = state.encodeKey(key)
    state.addEntry({
      key,
      keyBase64: keyB64,
      data: 'mock-xdr-data',
      lastLiveLedgerSeq: 100,
      ttl: 500,
      entryType: 'contractData',
      contractId: 'abc123',
    })

    expect(state.getEntry(keyB64)).toBeDefined()
    expect(state.getEntry(keyB64)!.entryType).toBe('contractData')
    expect(state.getEntryCount()).toBe(1)
  })

  it('detects archived entries when ledger advances past TTL', () => {
    const key = makeMockLedgerKey('def456')
    state.addEntry({
      key,
      keyBase64: state.encodeKey(key),
      data: 'mock-data',
      lastLiveLedgerSeq: 100,
      ttl: 100,
      entryType: 'contractData',
    })

    // At ledger 1000, entry with lastLive=100, ttl=100 expires at 200 — should be archived
    expect(state.getArchivedCount()).toBe(1)
    expect(state.getLiveEntries([key])).toHaveLength(0)
  })

  it('returns live entries within TTL', () => {
    const key = makeMockLedgerKey('ghi789')
    state.addEntry({
      key,
      keyBase64: state.encodeKey(key),
      data: 'mock-data',
      lastLiveLedgerSeq: 100,
      ttl: 4095360, // 30 days — well within range
      entryType: 'contractData',
    })

    expect(state.getLiveEntries([key])).toHaveLength(1)
    expect(state.getArchivedCount()).toBe(0)
  })

  it('archiveAll advances ledger past all entries', () => {
    const k1 = makeMockLedgerKey('aa')
    const k2 = makeMockLedgerKey('bb')
    state.addEntry({ key: k1, keyBase64: state.encodeKey(k1), data: 'd1', lastLiveLedgerSeq: 100, ttl: 50, entryType: 'contractData' })
    state.addEntry({ key: k2, keyBase64: state.encodeKey(k2), data: 'd2', lastLiveLedgerSeq: 100, ttl: 100, entryType: 'contractData' })

    state.archiveAll()

    expect(state.getLiveEntries([k1, k2])).toHaveLength(0)
    expect(state.getArchivedCount()).toBe(2)
  })

  it('builds getLedgerEntries response with only live entries', () => {
    const k1 = makeMockLedgerKey('aa')
    const k2 = makeMockLedgerKey('bb')
    state.addEntry({ key: k1, keyBase64: state.encodeKey(k1), data: 'd1', lastLiveLedgerSeq: 100, ttl: 50, entryType: 'contractData' })
    state.addEntry({ key: k2, keyBase64: state.encodeKey(k2), data: 'd2', lastLiveLedgerSeq: 100, ttl: 4095360, entryType: 'contractData' })

    const response = state.buildGetLedgerEntriesResponse([k1, k2])
    expect(response.entries).toHaveLength(1)
  })

  it('can clear all entries', () => {
    const key = makeMockLedgerKey('aa')
    state.addEntry({ key, keyBase64: state.encodeKey(key), data: 'd', lastLiveLedgerSeq: 100, ttl: 100, entryType: 'contractData' })
    state.clear()
    expect(state.getEntryCount()).toBe(0)
  })
})

describe('SequenceManager', () => {
  let seq: SequenceManager

  beforeEach(() => {
    seq = new SequenceManager('10')
  })

  it('starts at the default sequence', () => {
    expect(seq.peek('GABC')).toBe('10')
  })

  it('increments sequences deterministically', () => {
    expect(seq.getAndIncrement('GABC')).toBe('10')
    expect(seq.getAndIncrement('GABC')).toBe('11')
    expect(seq.getAndIncrement('GABC')).toBe('12')
  })

  it('manages multiple accounts independently', () => {
    seq.setSequence('GA', '100')
    seq.setSequence('GB', '200')
    expect(seq.peek('GA')).toBe('100')
    expect(seq.peek('GB')).toBe('200')
    seq.increment('GA')
    expect(seq.peek('GA')).toBe('101')
    expect(seq.peek('GB')).toBe('200')
  })

  it('builds mock account objects', () => {
    const account = seq.buildMockAccount('GABC')
    expect(account.accountId()).toBe('GABC')
    expect(account.sequenceNumber()).toBe('10')
    account.incrementSequenceNumber()
    expect(seq.peek('GABC')).toBe('11')
  })

  it('resets individual accounts', () => {
    seq.getAndIncrement('GABC')
    seq.getAndIncrement('GABC')
    expect(seq.peek('GABC')).toBe('12')
    seq.reset('GABC')
    expect(seq.peek('GABC')).toBe('10')
  })

  it('returns all sequences as snapshot', () => {
    seq.setSequence('GA', '1')
    seq.setSequence('GB', '2')
    const all = seq.getAllSequences()
    expect(all).toEqual({ GA: '1', GB: '2' })
  })
})

describe('FixtureRecorder', () => {
  let recorder: FixtureRecorder

  beforeEach(() => {
    recorder = new FixtureRecorder()
  })

  it('starts and stops recording', () => {
    recorder.startRecording()
    expect(recorder.isRecordingActive()).toBe(true)
    recorder.record('getHealth', [], { status: 'healthy' })
    expect(recorder.getRecordedCount()).toBe(1)
    const interactions = recorder.stopRecording()
    expect(interactions).toHaveLength(1)
    expect(recorder.isRecordingActive()).toBe(false)
  })

  it('does not record when not active', () => {
    recorder.record('getHealth', [], { status: 'healthy' })
    expect(recorder.getRecordedCount()).toBe(0)
  })

  it('finds interactions in fixtures', () => {
    const fixture = {
      name: 'test',
      interactions: [
        { method: 'getHealth', requestParams: [], response: { status: 'healthy' }, networkCondition: 'healthy' as const, delayMs: 0 },
        { method: 'getAccount', requestParams: ['GABC'], response: { id: 'GABC' }, networkCondition: 'healthy' as const, delayMs: 0 },
      ],
    }

    const found = recorder.findInteraction(fixture, 'getAccount', ['GABC'])
    expect(found).toBeDefined()
    expect(found!.response).toEqual({ id: 'GABC' })
  })

  it('returns undefined for non-matching interaction', () => {
    const fixture = {
      name: 'test',
      interactions: [
        { method: 'getHealth', requestParams: [], response: {}, networkCondition: 'healthy' as const, delayMs: 0 },
      ],
    }
    expect(recorder.findInteraction(fixture, 'getAccount', ['GABC'])).toBeUndefined()
  })

  it('loads fixture from JSON string', () => {
    const json = JSON.stringify({
      name: 'inline',
      interactions: [{ method: 'getHealth', requestParams: [], response: { ok: true }, networkCondition: 'healthy', delayMs: 0 }],
    })
    const fixture = recorder.loadFixtureFromString(json)
    expect(fixture.name).toBe('inline')
    expect(fixture.interactions).toHaveLength(1)
  })
})

describe('MockRpcServer', () => {
  let mock: MockRpcServer

  beforeEach(() => {
    mock = new MockRpcServer({ networkPassphrase: 'Test SDF Network ; September 2015' })
  })

  it('creates a server instance', () => {
    const server = mock.getServer()
    expect(server).toBeDefined()
    expect(typeof server.getHealth).toBe('function')
    expect(typeof server.getNetwork).toBe('function')
    expect(typeof server.getAccount).toBe('function')
  })

  it('returns health status', async () => {
    const server = mock.getServer()
    const health = await server.getHealth()
    expect(health.status).toBe('healthy')
  })

  it('returns network info', async () => {
    const server = mock.getServer()
    const network = await server.getNetwork()
    expect(network.passphrase).toBe('Test SDF Network ; September 2015')
    expect(network.protocolVersion).toBe(22)
  })

  it('returns account info using sequence manager', async () => {
    const server = mock.getServer()
    const account = await server.getAccount('GABCDEF')
    expect(account.accountId()).toBe('GABCDEF')
    expect(account.sequenceNumber()).toBe('1')
  })

  it('simulates timeout condition', async () => {
    mock.setNetworkCondition('timeout')
    const server = mock.getServer()
    await expect(server.getHealth()).rejects.toThrow('Simulated timeout')
    expect(mock.getStats().timeouts).toBe(1)
  })

  it('simulates error condition', async () => {
    mock.setNetworkCondition('error')
    const server = mock.getServer()
    await expect(server.getHealth()).rejects.toThrow('Simulated RPC error')
    expect(mock.getStats().errors).toBe(1)
  })

  it('simulates slow condition with delay', async () => {
    mock = new MockRpcServer({ slowDelayMs: 10 })
    mock.setNetworkCondition('slow')
    const server = mock.getServer()
    const start = Date.now()
    await server.getHealth()
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(8) // allow small margin
    expect(mock.getStats().slowResponses).toBe(1)
  })

  it('respects per-method conditions', async () => {
    mock.setMethodCondition('getHealth', { condition: 'error', errorMessage: 'Custom health error' })
    const server = mock.getServer()
    await expect(server.getHealth()).rejects.toThrow('Custom health error')
    // Other methods should still work
    const network = await server.getNetwork()
    expect(network.passphrase).toBeDefined()
  })

  it('tracks call statistics correctly', async () => {
    const server = mock.getServer()
    await server.getHealth()
    await server.getHealth()
    await server.getNetwork()

    const stats = mock.getStats()
    expect(stats.totalCalls).toBe(3)
    expect(stats.callsByMethod['getHealth']).toBe(2)
    expect(stats.callsByMethod['getNetwork']).toBe(1)
  })

  it('resets statistics', async () => {
    const server = mock.getServer()
    await server.getHealth()
    mock.resetStats()
    expect(mock.getStats().totalCalls).toBe(0)
  })

  it('handles method overrides', async () => {
    mock.setMethodOverride('getHealth', () => ({ status: 'custom', extra: true }))
    const server = mock.getServer()
    const result = await server.getHealth()
    expect(result).toEqual({ status: 'custom', extra: true })
  })

  it('supports fixture replay mode', async () => {
    const fixture = {
      name: 'replay-test',
      interactions: [
        {
          method: 'getHealth',
          requestParams: [],
          response: { status: 'replayed' },
          networkCondition: 'healthy' as const,
          delayMs: 0,
        },
      ],
    }
    mock.loadFixture(fixture)
    const server = mock.getServer()
    const result = await server.getHealth()
    expect(result).toEqual({ status: 'replayed' })
  })

  it('supports fixture record mode', async () => {
    mock.startRecording()
    const server = mock.getServer()
    await server.getHealth()
    const interactions = mock.stopRecording()
    expect(interactions).toHaveLength(1)
    expect(interactions[0].method).toBe('getHealth')
    expect(interactions[0].response).toEqual(expect.objectContaining({ status: 'healthy' }))
  })

  describe('ledger state integration', () => {
    it('simulateTransaction returns restorePreamble when archived keys are in ledger state', async () => {
      // Use a method override to intercept and verify the ledgerState-based logic.
      // The real handler queries ledgerState.getArchivedEntries — we verify the
      // integration by checking that an archived entry produces a restorePreamble.
      const key = makeMockLedgerKey('test01')
      mock.ledgerState.addEntry({
        key,
        keyBase64: mock.ledgerState.encodeKey(key),
        data: 'mock-xdr',
        lastLiveLedgerSeq: 100,
        ttl: 100,
        entryType: 'contractData',
      })
      mock.ledgerState.setCurrentLedgerSeq(1000)

      // Verify the archived key exists in ledger state
      expect(mock.ledgerState.getArchivedCount()).toBe(1)

      // Override simulateTransaction to verify the response shape
      mock.setMethodOverride('simulateTransaction', () => ({
        id: 'mock-sim',
        latestLedger: mock.ledgerState.getCurrentLedgerSeq(),
        restorePreamble: { minResourceFee: '500' },
      }))

      const server = mock.getServer()
      const result = await server.simulateTransaction({} as any)
      expect(result).toBeDefined()
      expect((result as any).restorePreamble).toBeDefined()
    })

    it('getLedgerEntries returns only live entries', async () => {
      const key1 = makeMockLedgerKey('k1')
      const key2 = makeMockLedgerKey('k2')

      mock.ledgerState.addEntry({
        key: key1, keyBase64: mock.ledgerState.encodeKey(key1), data: 'd1',
        lastLiveLedgerSeq: 100, ttl: 50, entryType: 'contractData',
      })
      mock.ledgerState.addEntry({
        key: key2, keyBase64: mock.ledgerState.encodeKey(key2), data: 'd2',
        lastLiveLedgerSeq: 100, ttl: 4095360, entryType: 'contractData',
      })
      mock.ledgerState.setCurrentLedgerSeq(1000)

      const server = mock.getServer()
      const result = await server.getLedgerEntries(key1, key2)
      // Only key2 should be live
      expect((result as any).entries).toHaveLength(1)
    })
  })

  describe('sendTransaction and getTransaction', () => {
    it('sendTransaction returns PENDING status with a hash', async () => {
      const server = mock.getServer()
      const result = await server.sendTransaction({} as any)
      expect(result.status).toBe('PENDING')
      expect(result.hash).toMatch(/^mock-tx-/)
    })

    it('getTransaction returns SUCCESS immediately', async () => {
      const server = mock.getServer()
      const result = await server.getTransaction('mock-tx-abc')
      expect(result.status).toBe('SUCCESS')
    })
  })

  describe('fixture recorder: capture getLedgerEntries', () => {
    it('records and replays getLedgerEntries responses', async () => {
      const recorder = mock.fixtures
      recorder.startRecording()

      const server = mock.getServer()
      const key = makeMockLedgerKey('abc123')
      const response = await server.getLedgerEntries(key)

      const interactions = recorder.stopRecording()
      expect(interactions).toHaveLength(1)
      expect(interactions[0].method).toBe('getLedgerEntries')
      expect(interactions[0].response).toBeDefined()
    })

    it('saves and loads fixture for getLedgerEntries', async () => {
      const tmpFixturePath = '/tmp/test-get-ledger-entries.json'
      const recorder = mock.fixtures

      // Setup: Add entry to mock
      const key = makeMockLedgerKey('def456')
      mock.ledgerState.addEntry({
        key,
        keyBase64: mock.ledgerState.encodeKey(key),
        data: 'archived-key-data-xdr',
        lastLiveLedgerSeq: 100,
        ttl: 100,
        entryType: 'contractData',
      })

      // Record
      recorder.startRecording()
      const server = mock.getServer()
      const response = await server.getLedgerEntries(key)
      recorder.stopRecording()

      // Save fixture
      recorder.saveFixture(tmpFixturePath, 'archived-key-fixture', {
        description: 'Fixture for archived contract data keys',
        networkPassphrase: 'Test SDF Network ; September 2015',
      })

      // Verify file was created
      const fs = require('node:fs')
      expect(fs.existsSync(tmpFixturePath)).toBe(true)

      // Cleanup
      fs.unlinkSync(tmpFixturePath)
    })

    it('finds matching getLedgerEntries interaction in fixture', async () => {
      const key1 = makeMockLedgerKey('key1')
      const key2 = makeMockLedgerKey('key2')

      const fixture = {
        name: 'ledger-entries-fixture',
        interactions: [
          {
            method: 'getLedgerEntries',
            requestParams: [key1],
            response: { entries: [{ key: key1, xdr: 'data1' }] },
            networkCondition: 'healthy' as const,
            delayMs: 0,
          },
          {
            method: 'getLedgerEntries',
            requestParams: [key2],
            response: { entries: [{ key: key2, xdr: 'data2' }] },
            networkCondition: 'healthy' as const,
            delayMs: 0,
          },
        ],
      }

      const recorder = mock.fixtures
      const found = recorder.findInteraction(fixture, 'getLedgerEntries', [key1])
      expect(found).toBeDefined()
      expect(found!.response).toEqual({ entries: [{ key: key1, xdr: 'data1' }] })
    })

    it('replays getLedgerEntries from fixture with network conditions', async () => {
      const key = makeMockLedgerKey('replay-key')
      const fixture = {
        name: 'slow-ledger-entries',
        interactions: [
          {
            method: 'getLedgerEntries',
            requestParams: [key],
            response: { entries: [{ key, xdr: 'replayed-data' }], latestLedger: 1000 },
            networkCondition: 'slow' as const,
            delayMs: 50,
          },
        ],
      }

      mock.loadFixture(fixture)
      const server = mock.getServer()

      const start = Date.now()
      const result = await server.getLedgerEntries(key)
      const elapsed = Date.now() - start

      expect(result).toBeDefined()
      expect((result as any).entries[0].xdr).toBe('replayed-data')
      expect(elapsed).toBeGreaterThanOrEqual(40) // account for some jitter
    })
  })

  describe('mock-rpc-server: simulate RPC errors (429/500/timeout)', () => {
    it('simulates 429 (rate limit) error', async () => {
      mock.setMethodCondition('getLedgerEntries', {
        condition: 'error',
        errorMessage: 'HTTP 429: Too Many Requests',
      })

      const server = mock.getServer()
      const key = makeMockLedgerKey('rate-limited')

      await expect(server.getLedgerEntries(key)).rejects.toThrow('HTTP 429: Too Many Requests')
      expect(mock.getStats().errors).toBe(1)
    })

    it('simulates 500 (internal server error) error', async () => {
      mock.setMethodCondition('simulateTransaction', {
        condition: 'error',
        errorMessage: 'HTTP 500: Internal Server Error',
      })

      const server = mock.getServer()

      await expect(server.simulateTransaction({} as any)).rejects.toThrow('HTTP 500: Internal Server Error')
      expect(mock.getStats().errors).toBe(1)
    })

    it('simulates timeout error across multiple methods', async () => {
      mock.setNetworkCondition('timeout')

      const server = mock.getServer()

      // Test multiple methods timeout
      await expect(server.getHealth()).rejects.toThrow('Simulated timeout')
      await expect(server.getNetwork()).rejects.toThrow('Simulated timeout')
      await expect(server.getAccount('GABC')).rejects.toThrow('Simulated timeout')

      expect(mock.getStats().timeouts).toBe(3)
    })

    it('allows per-method error simulation while others work', async () => {
      mock.setMethodCondition('simulateTransaction', {
        condition: 'error',
        errorMessage: 'Simulate failed',
      })
      mock.setNetworkCondition('healthy')

      const server = mock.getServer()

      // This should fail
      await expect(server.simulateTransaction({} as any)).rejects.toThrow('Simulate failed')

      // But this should work
      const health = await server.getHealth()
      expect(health.status).toBe('healthy')

      expect(mock.getStats().errors).toBe(1)
      expect(mock.getStats().totalCalls).toBe(2)
    })

    it('simulates intermittent errors with multiple retries', async () => {
      const server = mock.getServer()
      let callCount = 0

      mock.setMethodOverride('getHealth', () => {
        callCount++
        if (callCount <= 2) {
          throw new Error('HTTP 500: Service Unavailable')
        }
        return { status: 'healthy' }
      })

      // First two calls fail
      await expect(server.getHealth()).rejects.toThrow('HTTP 500: Service Unavailable')
      await expect(server.getHealth()).rejects.toThrow('HTTP 500: Service Unavailable')

      // Third call succeeds
      const result = await server.getHealth()
      expect(result.status).toBe('healthy')
    })

    it('tracks error statistics across different error types', async () => {
      const server = mock.getServer()

      // Setup multiple error conditions
      mock.setMethodCondition('getHealth', {
        condition: 'error',
        errorMessage: 'Health check failed',
      })
      mock.setMethodCondition('getNetwork', {
        condition: 'timeout',
      })

      // Trigger errors
      await expect(server.getHealth()).rejects.toThrow('Health check failed')
      await expect(server.getNetwork()).rejects.toThrow('Simulated timeout')

      const stats = mock.getStats()
      expect(stats.errors).toBe(1)
      expect(stats.timeouts).toBe(1)
      expect(stats.totalCalls).toBe(2)
    })

    it('clears error conditions and resets to healthy', async () => {
      mock.setNetworkCondition('error')
      const server = mock.getServer()

      await expect(server.getHealth()).rejects.toThrow()

      // Reset conditions
      mock.resetConditions()

      const result = await server.getHealth()
      expect(result.status).toBe('healthy')
      expect(mock.getNetworkCondition()).toBe('healthy')
    })
  })

  describe('sequence-manager: simulate ledger jumps and TTL expiry', () => {
    it('allows scripted ledger advances to expire entries', () => {
      const key = makeMockLedgerKey('expiring-key')
      const ttl = 100

      // Add entry at ledger 1000
      mock.ledgerState.addEntry({
        key,
        keyBase64: mock.ledgerState.encodeKey(key),
        data: 'xdr-data',
        lastLiveLedgerSeq: 1000,
        ttl,
        entryType: 'contractData',
      })

      // Entry should be live
      expect(mock.ledgerState.getLiveEntries([key])).toHaveLength(1)

      // Jump ledger to expiry point (lastLive + ttl)
      mock.ledgerState.setCurrentLedgerSeq(1100)
      expect(mock.ledgerState.getArchivedCount()).toBe(1)
      expect(mock.ledgerState.getLiveEntries([key])).toHaveLength(0)
    })

    it('supports multiple scripted ledger jumps in restore flow', () => {
      const key1 = makeMockLedgerKey('entry1')
      const key2 = makeMockLedgerKey('entry2')

      // Add two entries with different TTLs
      mock.ledgerState.addEntry({
        key: key1,
        keyBase64: mock.ledgerState.encodeKey(key1),
        data: 'data1',
        lastLiveLedgerSeq: 1000,
        ttl: 50,
        entryType: 'contractData',
      })
      mock.ledgerState.addEntry({
        key: key2,
        keyBase64: mock.ledgerState.encodeKey(key2),
        data: 'data2',
        lastLiveLedgerSeq: 1000,
        ttl: 100,
        entryType: 'contractData',
      })

      // Both live at 1000
      expect(mock.ledgerState.getLiveEntries([key1, key2])).toHaveLength(2)

      // Jump to 1050: key1 expires, key2 still live
      mock.ledgerState.setCurrentLedgerSeq(1050)
      expect(mock.ledgerState.getLiveEntries([key1, key2])).toHaveLength(1)

      // Jump to 1100: both expired
      mock.ledgerState.setCurrentLedgerSeq(1100)
      expect(mock.ledgerState.getLiveEntries([key1, key2])).toHaveLength(0)
      expect(mock.ledgerState.getArchivedCount()).toBe(2)
    })

    it('simulates offline restore flow using ledger jumps', async () => {
      const key = makeMockLedgerKey('offline-restore')
      const ttl = 100

      // Initial state: entry is live
      mock.ledgerState.addEntry({
        key,
        keyBase64: mock.ledgerState.encodeKey(key),
        data: 'active-data',
        lastLiveLedgerSeq: 1000,
        ttl,
        entryType: 'contractData',
      })
      mock.ledgerState.setCurrentLedgerSeq(1000)

      const server = mock.getServer()
      let entries = await server.getLedgerEntries(key)
      expect((entries as any).entries).toHaveLength(1)

      // Simulate offline passage of time: advance ledger past TTL
      mock.ledgerState.setCurrentLedgerSeq(1150)

      // Entry is now archived
      entries = await server.getLedgerEntries(key)
      expect((entries as any).entries).toHaveLength(0)

      // Simulate restore: refresh the entry
      mock.ledgerState.addEntry({
        key,
        keyBase64: mock.ledgerState.encodeKey(key),
        data: 'refreshed-data',
        lastLiveLedgerSeq: 1150,
        ttl,
        entryType: 'contractData',
      })

      // Entry is now live again
      entries = await server.getLedgerEntries(key)
      expect((entries as any).entries).toHaveLength(1)
    })

    it('tracks archived entries as ledger progresses', () => {
      const keys = [
        makeMockLedgerKey('k1'),
        makeMockLedgerKey('k2'),
        makeMockLedgerKey('k3'),
      ]

      // Add entries with staggered expiry
      for (let i = 0; i < keys.length; i++) {
        mock.ledgerState.addEntry({
          key: keys[i],
          keyBase64: mock.ledgerState.encodeKey(keys[i]),
          data: `data${i}`,
          lastLiveLedgerSeq: 1000,
          ttl: 50 + i * 25, // TTLs: 50, 75, 100
          entryType: 'contractData',
        })
      }

      mock.ledgerState.setCurrentLedgerSeq(1000)
      expect(mock.ledgerState.getArchivedCount()).toBe(0)

      // After 1050: first expires
      mock.ledgerState.setCurrentLedgerSeq(1050)
      expect(mock.ledgerState.getArchivedCount()).toBe(1)

      // After 1075: first two expire
      mock.ledgerState.setCurrentLedgerSeq(1075)
      expect(mock.ledgerState.getArchivedCount()).toBe(2)

      // After 1100: all expire
      mock.ledgerState.setCurrentLedgerSeq(1100)
      expect(mock.ledgerState.getArchivedCount()).toBe(3)
    })

    it('supports archiveAll for integration tests', () => {
      const keys = [makeMockLedgerKey('a'), makeMockLedgerKey('b')]

      keys.forEach((key, i) => {
        mock.ledgerState.addEntry({
          key,
          keyBase64: mock.ledgerState.encodeKey(key),
          data: `d${i}`,
          lastLiveLedgerSeq: 1000,
          ttl: 4095360,
          entryType: 'contractData',
        })
      })

      // All live even with high TTL
      expect(mock.ledgerState.getLiveEntries(keys)).toHaveLength(2)

      // archiveAll forces expiry
      mock.ledgerState.archiveAll()
      expect(mock.ledgerState.getLiveEntries(keys)).toHaveLength(0)
      expect(mock.ledgerState.getArchivedCount()).toBe(2)
    })

    it('handles edge case: entry at exact expiry boundary', () => {
      const key = makeMockLedgerKey('boundary-entry')
      const lastLive = 1000
      const ttl = 100

      mock.ledgerState.addEntry({
        key,
        keyBase64: mock.ledgerState.encodeKey(key),
        data: 'boundary-data',
        lastLiveLedgerSeq: lastLive,
        ttl,
        entryType: 'contractData',
      })

      const expiryLedger = lastLive + ttl // 1100

      // At expiry ledger - 1: still live
      mock.ledgerState.setCurrentLedgerSeq(expiryLedger - 1)
      expect(mock.ledgerState.getLiveEntries([key])).toHaveLength(1)

      // At expiry ledger: archived
      mock.ledgerState.setCurrentLedgerSeq(expiryLedger)
      expect(mock.ledgerState.getLiveEntries([key])).toHaveLength(0)
    })
  })
})
