import { describe, expect, it } from 'vitest';
import { Keypair, StrKey, xdr } from '@stellar/stellar-sdk';
import {
  detectExpiredAuthEntries,
  extractAuthEntryKeys,
  keysToRestoreForAuthEntries,
} from '../src/auth-entry-restoration.js';

const contractId = (seed: number) => StrKey.encodeContract(Buffer.alloc(32, seed));

function instanceKey(id: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: xdr.ScAddress.scAddressTypeContract(StrKey.decodeContract(id) as never),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
}

function invocation(
  id: string,
  subs: xdr.SorobanAuthorizedInvocation[] = [],
): xdr.SorobanAuthorizedInvocation {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: xdr.ScAddress.scAddressTypeContract(StrKey.decodeContract(id) as never),
        functionName: 'transfer',
        args: [],
      }),
    ),
    subInvocations: subs,
  });
}

function authEntry(
  root: xdr.SorobanAuthorizedInvocation,
  expirationLedger = 1_000,
): xdr.SorobanAuthorizationEntry {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: xdr.ScAddress.scAddressTypeAccount(Keypair.random().xdrPublicKey()),
        nonce: xdr.Int64.fromString('1'),
        signatureExpirationLedger: expirationLedger,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: root,
  });
}

const b64 = (keys: xdr.LedgerKey[]) => keys.map((k) => k.toXDR('base64')).sort();

describe('authorization expiry during restoration', () => {
  const A = contractId(1);
  const B = contractId(2);

  it('extracts the instance key of every contract an entry authorizes, including sub-invocations', () => {
    const entry = authEntry(invocation(A, [invocation(B)]));
    expect(b64(extractAuthEntryKeys(entry))).toEqual(b64([instanceKey(A), instanceKey(B)]));
  });

  it('flags an entry whose nested contract was archived, not just the root', () => {
    const entry = authEntry(invocation(A, [invocation(B)]));
    const scan = detectExpiredAuthEntries([entry], [instanceKey(B)]);
    expect(scan.valid).toHaveLength(0);
    expect(scan.expired).toHaveLength(1);
    expect(b64(scan.expired[0].expiredKeys)).toEqual(b64([instanceKey(B)]));
  });

  it('keeps entries valid when unrelated keys are archived', () => {
    const scan = detectExpiredAuthEntries([authEntry(invocation(A))], [instanceKey(B)]);
    expect(scan.valid).toHaveLength(1);
    expect(scan.expired).toHaveLength(0);
  });

  it('restores each archived dependency exactly once across entries', () => {
    const entries = [authEntry(invocation(A)), authEntry(invocation(B, [invocation(A)]))];
    const scan = detectExpiredAuthEntries(entries, [instanceKey(A), instanceKey(B)]);
    expect(b64(keysToRestoreForAuthEntries(scan))).toEqual(b64([instanceKey(A), instanceKey(B)]));
  });

  it('does not mutate the signed entry while scanning, so signatures stay valid', () => {
    const entry = authEntry(invocation(A), 42);
    const before = entry.toXDR('base64');
    detectExpiredAuthEntries([entry], [instanceKey(A)]);
    expect(entry.toXDR('base64')).toBe(before);
    expect(entry.credentials().address().signatureExpirationLedger()).toBe(42);
  });

  it('ignores non-contract authorizations (e.g. create-contract host fn)', () => {
    const entry = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation: new xdr.SorobanAuthorizedInvocation({
        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractHostFn(
          new xdr.CreateContractArgs({
            contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAsset(
              xdr.Asset.assetTypeNative(),
            ),
            executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
          }),
        ),
        subInvocations: [],
      }),
    });
    expect(extractAuthEntryKeys(entry)).toEqual([]);
  });
});
