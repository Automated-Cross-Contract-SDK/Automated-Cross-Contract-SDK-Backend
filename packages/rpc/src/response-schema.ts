/**
 * RPC response schema validation
 *
 * Checks that a JSON-RPC `result` has the fields the SDK reads for each
 * method, for every protocol line in the supported compatibility matrix
 * (protocols 20 to 22). Fields that only exist on some protocols are listed
 * per protocol, so a node on protocol 20 is not rejected for omitting a field
 * introduced later.
 */

export const SCHEMA_PROTOCOL_LINES = [20, 21, 22] as const
export type SchemaProtocolLine = (typeof SCHEMA_PROTOCOL_LINES)[number]

export type SchemaMethod =
  | 'getHealth'
  | 'getNetwork'
  | 'getLatestLedger'
  | 'getLedgerEntries'
  | 'simulateTransaction'
  | 'sendTransaction'
  | 'getTransaction'

type FieldType = 'string' | 'number' | 'array' | 'object'

interface MethodSchema {
  /** Fields required on every supported protocol. */
  required: Record<string, FieldType>
  /** Extra required fields, keyed by the first protocol that requires them. */
  since?: Partial<Record<SchemaProtocolLine, Record<string, FieldType>>>
}

const SCHEMAS: Record<SchemaMethod, MethodSchema> = {
  getHealth: { required: { status: 'string' } },
  getNetwork: { required: { passphrase: 'string', protocolVersion: 'number' } },
  getLatestLedger: { required: { id: 'string', protocolVersion: 'number', sequence: 'number' } },
  getLedgerEntries: { required: { entries: 'array', latestLedger: 'number' } },
  simulateTransaction: { required: { latestLedger: 'number' } },
  sendTransaction: { required: { status: 'string', hash: 'string', latestLedger: 'number' } },
  getTransaction: {
    required: { status: 'string', latestLedger: 'number' },
    since: { 22: { txHash: 'string' } },
  },
}

export class RpcSchemaError extends Error {
  public readonly method: string
  public readonly protocolVersion: number
  public readonly field?: string

  constructor(message: string, method: string, protocolVersion: number, field?: string) {
    super(message)
    this.name = 'RpcSchemaError'
    this.method = method
    this.protocolVersion = protocolVersion
    this.field = field
  }
}

function typeOf(value: unknown): FieldType | 'null' | 'other' {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  const t = typeof value
  return t === 'string' || t === 'number' || t === 'object' ? t : 'other'
}

/**
 * Validates `result` for `method` against the schema of `protocolVersion`.
 *
 * Unknown extra fields are allowed. Unknown methods and protocol versions
 * outside the matrix are rejected, so a caller cannot silently skip
 * validation for a node the SDK has not been tested against.
 *
 * @throws {RpcSchemaError}
 */
export function validateRpcResultSchema(method: string, result: unknown, protocolVersion: number): void {
  if (!(SCHEMA_PROTOCOL_LINES as readonly number[]).includes(protocolVersion)) {
    throw new RpcSchemaError(
      `Protocol ${protocolVersion} is outside the supported matrix (${SCHEMA_PROTOCOL_LINES.join(', ')})`,
      method,
      protocolVersion,
    )
  }
  const schema = SCHEMAS[method as SchemaMethod]
  if (!schema) {
    throw new RpcSchemaError(`No response schema for method ${method}`, method, protocolVersion)
  }
  if (typeOf(result) !== 'object') {
    throw new RpcSchemaError(`${method} result must be an object`, method, protocolVersion)
  }

  const fields: Record<string, FieldType> = { ...schema.required }
  for (const line of SCHEMA_PROTOCOL_LINES) {
    if (line <= protocolVersion) Object.assign(fields, schema.since?.[line])
  }

  const record = result as Record<string, unknown>
  for (const [field, expected] of Object.entries(fields)) {
    if (!(field in record)) {
      throw new RpcSchemaError(
        `${method} result is missing ${field} (protocol ${protocolVersion})`,
        method,
        protocolVersion,
        field,
      )
    }
    const actual = typeOf(record[field])
    if (actual !== expected) {
      throw new RpcSchemaError(
        `${method} result field ${field} must be ${expected}, received ${actual} (protocol ${protocolVersion})`,
        method,
        protocolVersion,
        field,
      )
    }
  }
}
