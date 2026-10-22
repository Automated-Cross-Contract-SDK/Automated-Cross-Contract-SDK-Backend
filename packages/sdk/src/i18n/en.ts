// English locale messages for SorobanResurrectError
//
// `en` is the source-of-truth catalog and MUST be total: every
// `SorobanResurrectErrorCode` must have an entry here. Typing it as a
// `Record<...>` makes a missing key a compile-time error, so catalogs can no
// longer silently drift from the error codes (see #426).
import type { SorobanResurrectErrorCode } from '../errors';

export const en: Record<SorobanResurrectErrorCode, string> = {
  'ERR_INVALID_XDR': 'Invalid XDR format: {0}',
  'ERR_KEY_NOT_FOUND': 'Key not found in ledger: {0}',
  'ERR_SIMULATION_FAILED': 'Simulation failed with error: {0}',
  'ERR_INSUFFICIENT_BALANCE': 'Insufficient balance: required {0}, available {1}',
  'ERR_INVALID_CONTRACT': 'Invalid contract address: {0}',
  'ERR_RESTORATION_FAILED': 'Key restoration failed: {0}',
  'ERR_FOOTPRINT_PARSE': 'Failed to parse footprint: {0}',
  'ERR_NETWORK_ERROR': 'Network error communicating with RPC: {0}',
  'ERR_TIMEOUT': 'Operation timed out after {0}ms',
  'ERR_INVALID_PARAMS': 'Invalid parameters: {0}',
};
