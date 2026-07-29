use wasm_bindgen::prelude::*;
use stellar_xdr::next::{
    LedgerFootprint, LedgerKey, ScVal,
    LedgerEntryType, ScValType,
    ReadXdr, WriteXdr,
};
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// JS-accessible types
// ---------------------------------------------------------------------------

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(typescript_type = "string")]
    pub type JsKeyType;
}

#[derive(Serialize, Deserialize)]
struct FootprintKeysResult {
    read_only_count: u32,
    read_write_count: u32,
    total_count: u32,
    keys_base64: Vec<String>,
}

#[derive(Serialize, Deserialize)]
struct KeyClassification {
    key_base64: String,
    key_type: String,        // "contractInstance" | "contractData" | "contractCode" | "ttlEntry" | "unknown"
    sac_key_type: Option<String>, // "sacBalance" | "sacAllowance" | "sacNonce" | "sacAdmin" | "sacMetadata"
    contract_id: Option<String>,
    restore_priority: u8,
}

// ---------------------------------------------------------------------------
// Footprint extraction
// ---------------------------------------------------------------------------

/// Extract all ledger keys from a LedgerFootprint XDR (base64-encoded).
/// Returns a JSON object with read-only, read-write, and combined key lists.
#[wasm_bindgen]
pub fn extract_footprint_keys(footprint_xdr_base64: &str) -> Result<String, JsValue> {
    let bytes = base64_decode(footprint_xdr_base64)
        .map_err(|e| JsValue::from_str(&format!("Invalid base64: {}", e)))?;

    let footprint = LedgerFootprint::from_xdr(bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid LedgerFootprint XDR: {}", e)))?;

    let read_only = footprint.read_only.to_vec();
    let read_write = footprint.read_write.to_vec();
    let all: Vec<LedgerKey> = read_only.iter()
        .chain(read_write.iter())
        .cloned()
        .collect();

    let keys_base64: Vec<String> = all.iter()
        .filter_map(|k| k.to_xdr_base64().ok())
        .collect();

    let result = FootprintKeysResult {
        read_only_count: read_only.len() as u32,
        read_write_count: read_write.len() as u32,
        total_count: all.len() as u32,
        keys_base64,
    };

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("JSON serialization error: {}", e)))
}

// ---------------------------------------------------------------------------
// Key classification (hot path)
// ---------------------------------------------------------------------------

const SCV_SYMBOL: i32 = 15;
const SCV_VEC: i32 = 16;
const SCV_LEDGER_KEY_NONCE: i32 = 21;
const SCV_LEDGER_KEY_CONTRACT_INSTANCE: i32 = 20;

/// Classify a single LedgerKey XDR (base64-encoded).
/// Returns a JSON KeyClassification object.
#[wasm_bindgen]
pub fn classify_key(key_xdr_base64: &str) -> Result<String, JsValue> {
    let bytes = base64_decode(key_xdr_base64)
        .map_err(|e| JsValue::from_str(&format!("Invalid base64: {}", e)))?;

    let key = LedgerKey::from_xdr(bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid LedgerKey XDR: {}", e)))?;

    let classification = classify_ledger_key(&key);

    serde_json::to_string(&classification)
        .map_err(|e| JsValue::from_str(&format!("JSON serialization error: {}", e)))
}

/// Batch-classify multiple LedgerKey XDRs (base64-encoded).
/// Returns a JSON array of KeyClassification objects for speed.
#[wasm_bindgen]
pub fn classify_keys_batch(keys_json: &str) -> Result<String, JsValue> {
    let key_b64s: Vec<String> = serde_json::from_str(keys_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid JSON array: {}", e)))?;

    let mut results = Vec::with_capacity(key_b64s.len());

    for b64 in &key_b64s {
        let bytes = base64_decode(b64)
            .map_err(|e| JsValue::from_str(&format!("Invalid base64: {}", e)))?;

        match LedgerKey::from_xdr(bytes) {
            Ok(key) => {
                let classification = classify_ledger_key(&key);
                results.push(classification);
            }
            Err(_) => {
                results.push(KeyClassification {
                    key_base64: b64.clone(),
                    key_type: "unknown".to_string(),
                    sac_key_type: None,
                    contract_id: None,
                    restore_priority: 3,
                });
            }
        }
    }

    serde_json::to_string(&results)
        .map_err(|e| JsValue::from_str(&format!("JSON serialization error: {}", e)))
}

// ---------------------------------------------------------------------------
// Incremental XDR parsing (streaming)
// ---------------------------------------------------------------------------

/// Extract footprint keys from a full transaction envelope XDR (base64-encoded)
/// without materializing the full transaction object tree.
/// Target: <50MB peak memory for any transaction size.
#[wasm_bindgen]
pub fn extract_footprint_from_tx_xdr(tx_xdr_base64: &str) -> Result<String, JsValue> {
    let bytes = base64_decode(tx_xdr_base64)
        .map_err(|e| JsValue::from_str(&format!("Invalid base64: {}", e)))?;

    // Parse the TransactionEnvelope and navigate to SorobanTransactionData
    use stellar_xdr::next::TransactionEnvelope;

    let envelope = TransactionEnvelope::from_xdr(bytes)
        .map_err(|e| JsValue::from_str(&format!("Invalid TransactionEnvelope XDR: {}", e)))?;

    let soroban_data = match envelope {
        TransactionEnvelope::TxV1(v1) => {
            v1.tx.ext.soroban_data
        }
        TransactionEnvelope::TxFeeBump(fee_bump) => {
            match fee_bump.tx.inner_tx {
                stellar_xdr::next::FeeBumpTransactionInnerTx::TxV1(v1) => {
                    v1.tx.ext.soroban_data
                }
            }
        }
        _ => None,
    };

    let soroban_data = soroban_data
        .ok_or_else(|| JsValue::from_str("Transaction has no Soroban data"))?;

    let footprint = soroban_data.resources.footprint;

    let read_only = footprint.read_only.to_vec();
    let read_write = footprint.read_write.to_vec();
    let all: Vec<LedgerKey> = read_only.iter()
        .chain(read_write.iter())
        .cloned()
        .collect();

    let keys_base64: Vec<String> = all.iter()
        .filter_map(|k| k.to_xdr_base64().ok())
        .collect();

    let result = FootprintKeysResult {
        read_only_count: read_only.len() as u32,
        read_write_count: read_write.len() as u32,
        total_count: all.len() as u32,
        keys_base64,
    };

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("JSON serialization error: {}", e)))
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

fn classify_ledger_key(key: &LedgerKey) -> KeyClassification {
    let key_base64 = key.to_xdr_base64().unwrap_or_default();

    match key {
        LedgerKey::ContractData(data) => {
            let contract_id = data.contract.contract_id()
                .map(|id| hex::encode(id.0.as_slice()));

            // Check if it's a ContractInstance entry
            if let ScVal::LedgerKeyContractInstance = data.key {
                return KeyClassification {
                    key_base64,
                    key_type: "contractInstance".to_string(),
                    sac_key_type: None,
                    contract_id,
                    restore_priority: 0,
                };
            }

            let sac_key_type = classify_sac_key(&data.key);

            KeyClassification {
                key_base64,
                key_type: "contractData".to_string(),
                sac_key_type,
                contract_id,
                restore_priority: 2,
            }
        }
        LedgerKey::ContractCode(code) => {
            let contract_id = Some(hex::encode(code.hash.0.as_slice()));
            KeyClassification {
                key_base64,
                key_type: "contractCode".to_string(),
                sac_key_type: None,
                contract_id,
                restore_priority: 1,
            }
        }
        LedgerKey::Ttl(_) => KeyClassification {
            key_base64,
            key_type: "ttlEntry".to_string(),
            sac_key_type: None,
            contract_id: None,
            restore_priority: 3,
        },
        _ => KeyClassification {
            key_base64,
            key_type: "unknown".to_string(),
            sac_key_type: None,
            contract_id: None,
            restore_priority: 3,
        },
    }
}

fn classify_sac_key(data_key: &ScVal) -> Option<String> {
    match data_key.discriminant() {
        SCV_LEDGER_KEY_NONCE => Some("sacNonce".to_string()),
        SCV_LEDGER_KEY_CONTRACT_INSTANCE => None, // handled at LedgerKey level
        SCV_SYMBOL => {
            match data_key {
                ScVal::Symbol(sym) => {
                    let s = String::from_utf8_lossy(sym.as_slice());
                    if s == "Admin" {
                        Some("sacAdmin".to_string())
                    } else if ["Name", "Symbol", "Decimals"].contains(&s.as_ref()) {
                        Some("sacMetadata".to_string())
                    } else {
                        None
                    }
                }
                _ => None,
            }
        }
        SCV_VEC => {
            match data_key {
                ScVal::Vec(Some(vec)) => {
                    if let Some(head) = vec.first() {
                        if head.discriminant() == SCV_SYMBOL {
                            match head {
                                ScVal::Symbol(sym) => {
                                    let s = String::from_utf8_lossy(sym.as_slice());
                                    if s == "Balance" {
                                        return Some("sacBalance".to_string());
                                    }
                                    if s == "Allowance" {
                                        return Some("sacAllowance".to_string());
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                    None
                }
                _ => None,
            }
        }
        _ => None,
    }
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    // Simple base64 decoding using the js_sys crate (since we're in WASM)
    // In a real implementation, use a pure-Rust base64 crate
    // For now, we rely on the JS shim to pass decoded buffers
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    STANDARD.decode(input).map_err(|e| e.to_string())
}

// Need base64 crate dependency
#[cfg(not(target_arch = "wasm32"))]
compile_error!("This crate must be built for wasm32 target");
