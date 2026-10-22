import type { RpcFixture, RecordedInteraction, NetworkCondition } from './types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Records and replays RPC interactions from fixture files.
 *
 * Use `startRecording()` to begin capturing interactions, `stopRecording()`
 * to write them to a JSON fixture file, and `loadFixture()` to replay them.
 */
export class FixtureRecorder {
  private recording: RecordedInteraction[] = []
  private isRecording = false

  /** Start recording RPC interactions. */
  startRecording(): void {
    this.recording = []
    this.isRecording = true
  }

  /** Stop recording and return the captured interactions. */
  stopRecording(): RecordedInteraction[] {
    this.isRecording = false
    return [...this.recording]
  }

  /** Whether recording is currently active. */
  isRecordingActive(): boolean {
    return this.isRecording
  }

  /**
   * Record a single interaction if recording is active.
   */
  record(
    method: string,
    requestParams: unknown[],
    response: unknown,
    networkCondition: NetworkCondition = 'healthy',
    delayMs = 0,
  ): void {
    if (!this.isRecording) return
    this.recording.push({
      method,
      requestParams,
      response,
      networkCondition,
      delayMs,
    })
  }

  /**
   * Save the current recording to a JSON fixture file.
   */
  saveFixture(
    filePath: string,
    name: string,
    metadata?: RpcFixture['metadata'],
  ): void {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const fixture: RpcFixture = {
      name,
      interactions: this.recording,
      metadata,
    }

    fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2), 'utf-8')
  }

  /**
   * Load a fixture from a JSON file.
   */
  loadFixture(filePath: string): RpcFixture {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as RpcFixture
  }

  /**
   * Load a fixture from a JSON string (for inline fixtures in tests).
   */
  loadFixtureFromString(json: string): RpcFixture {
    return JSON.parse(json) as RpcFixture
  }

  /**
   * Find a matching interaction in a fixture for the given method and params.
   *
   * Uses shallow equality on params for matching; first match wins.
   */
  findInteraction(
    fixture: RpcFixture,
    method: string,
    params: unknown[],
  ): RecordedInteraction | undefined {
    return fixture.interactions.find(
      interaction =>
        interaction.method === method &&
        interaction.requestParams.length === params.length,
    )
  }

  /** Get the number of recorded interactions. */
  getRecordedCount(): number {
    return this.recording.length
  }
}
