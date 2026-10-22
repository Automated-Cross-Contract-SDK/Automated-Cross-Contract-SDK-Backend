#!/usr/bin/env node

/**
 * Codemod for migrating from @soroban-resurrect/sdk to modular packages
 * 
 * This script automatically updates import statements to use the new modular
 * package structure instead of the monolithic @soroban-resurrect/sdk.
 * 
 * Usage:
 *   npx tsx scripts/codemods/migrate-to-modular.ts <file-or-directory>
 * 
 * Example:
 *   npx tsx scripts/codemods/migrate-to-modular.ts src/
 *   npx tsx scripts/codemods/migrate-to-modular.ts src/myFile.ts
 */

import * as fs from 'fs'
import * as path from 'path'

interface ImportMapping {
  [key: string]: {
    newPackage: string
    exports: string[]
  }
}

const importMappings: ImportMapping = {
  SorobanResurrect: {
    newPackage: '@soroban-resurrect/core',
    exports: ['SorobanResurrect']
  },
  extractKeysFromFootprint: {
    newPackage: '@soroban-resurrect/footprint-parser',
    exports: ['extractKeysFromFootprint', 'classifyLedgerKey', 'classifySacKey', 'encodeLedgerKey', 'extractFootprintFromTransaction', 'extractFootprintFromTransactionStreaming', 'classifyDeferredKeys', 'STREAMING_PARSER_MEMORY_TARGET', 'STREAMING_THRESHOLD_BYTES']
  },
  FootprintKeys: {
    newPackage: '@soroban-resurrect/footprint-parser',
    exports: ['FootprintKeys', 'DeferredArchivedKey']
  },
  SorobanResurrectError: {
    newPackage: '@soroban-resurrect/errors',
    exports: ['SorobanResurrectError']
  },
  ArchivedKey: {
    newPackage: '@soroban-resurrect/types',
    exports: ['ArchivedKey', 'SacKeyType', 'RestorePriority', 'SorobanResurrectConfig', 'SimulationCheckResult', 'RestoreTransactionResult', 'RestoreBatchResult', 'RestoreAllBatchesResult', 'ConcurrentRestoreResult', 'ContractKeyGroup', 'ExecutionResult', 'FailedRestoreState', 'PreFlightConfig', 'FeeBumpMetadata', 'SorobanResurrectErrorContext', 'SorobanResurrectErrorBase', 'SorobanResurrectEvents', 'WsTransactionStatusEvent', 'TransactionWaitResult', 'RetryPolicy', 'RpcEndpointHealth', 'RpcFailoverConfig', 'SimulationCacheConfig', 'FootprintCacheConfig', 'CacheStatistics', 'FootprintCacheStatistics']
  },
  FeatureFlags: {
    newPackage: '@soroban-resurrect/types',
    exports: ['FeatureFlags']
  },
  ExponentialBackoff: {
    newPackage: '@soroban-resurrect/rpc',
    exports: ['ExponentialBackoff', 'FixedDelay', 'JitterBackoff', 'CircuitBreaker', 'DEFAULT_RETRY_POLICY', 'SimulationCache', 'FootprintCache', 'RpcFailoverManager']
  },
  batchKeysByContract: {
    newPackage: '@soroban-resurrect/utils',
    exports: ['batchKeysByContract', 'groupKeysByPriority', 'createBatches', 'delay', 'pollWithRetry', 'hashString', 'DEFAULT_MAX_CONCURRENCY', 'MAX_RETRIES', 'RETRY_DELAY_MS', 'DEFAULT_POLL_ATTEMPTS', 'POLL_INTERVAL_MS', 'MAX_XDR_SIZE_BYTES', 'DEFAULT_RESTORE_FEE']
  },
  BatchingOptions: {
    newPackage: '@soroban-resurrect/utils',
    exports: ['BatchingOptions', 'PollingOptions']
  }
}

function processFile(filePath: string): void {
  console.log(`Processing: ${filePath}`)
  
  const content = fs.readFileSync(filePath, 'utf-8')
  let modified = false
  let newContent = content

  // Pattern 1: import { ... } from '@soroban-resurrect/sdk'
  const importRegex = /import\s+{([^}]+)}\s+from\s+['"]@soroban-resurrect\/sdk['"]/g
  
  newContent = newContent.replace(importRegex, (match, imports) => {
    const importList = imports.split(',').map(s => s.trim()).filter(s => s)
    const groupedImports: { [package: string]: string[] } = {}

    importList.forEach(imp => {
      const [name] = imp.split(' as ').map(s => s.trim())
      
      // Find which package this import belongs to
      for (const [key, mapping] of Object.entries(importMappings)) {
        if (mapping.exports.includes(name)) {
          if (!groupedImports[mapping.newPackage]) {
            groupedImports[mapping.newPackage] = []
          }
          groupedImports[mapping.newPackage].push(imp)
          break
        }
      }
    })

    // If we couldn't map some imports, keep them in the original import
    const unmappedImports = importList.filter(imp => {
      const [name] = imp.split(' as ').map(s => s.trim())
      return !Object.values(importMappings).some(m => m.exports.includes(name))
    })

    if (Object.keys(groupedImports).length === 0 && unmappedImports.length === 0) {
      return match // No changes needed
    }

    modified = true
    const newImports: string[] = []

    // Add grouped imports
    for (const [pkg, imports] of Object.entries(groupedImports)) {
      newImports.push(`import { ${imports.join(', ')} } from '${pkg}'`)
    }

    // Add unmapped imports (they might be wallet adapters or other SDK-specific exports)
    if (unmappedImports.length > 0) {
      newImports.push(`import { ${unmappedImports.join(', ')} } from '@soroban-resurrect/sdk'`)
    }

    return newImports.join('\n')
  })

  // Pattern 2: import X from '@soroban-resurrect/sdk'
  const defaultImportRegex = /import\s+(\w+)\s+from\s+['"]@soroban-resurrect\/sdk['"]/g
  
  newContent = newContent.replace(defaultImportRegex, (match, name) => {
    // Handle default imports (usually SorobanResurrect)
    if (name === 'SorobanResurrect') {
      modified = true
      return `import { SorobanResurrect } from '@soroban-resurrect/core'`
    }
    return match
  })

  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf-8')
    console.log(`✓ Updated: ${filePath}`)
  } else {
    console.log(`- No changes needed: ${filePath}`)
  }
}

function processDirectory(dirPath: string): void {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    
    if (entry.isDirectory()) {
      // Skip node_modules and other common exclusions
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
        continue
      }
      processDirectory(fullPath)
    } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) {
      processFile(fullPath)
    }
  }
}

function main(): void {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.error('Usage: npx tsx scripts/codemods/migrate-to-modular.ts <file-or-directory>')
    process.exit(1)
  }

  const target = args[0]
  
  if (!fs.existsSync(target)) {
    console.error(`Error: ${target} does not exist`)
    process.exit(1)
  }

  console.log('🔄 Starting migration to modular packages...\n')

  if (fs.statSync(target).isDirectory()) {
    processDirectory(target)
  } else {
    processFile(target)
  }

  console.log('\n✅ Migration complete!')
  console.log('\nPlease review the changes and ensure your build still works.')
  console.log('Some manual adjustments may be needed for:')
  console.log('  - Wallet adapter imports (still in @soroban-resurrect/sdk)')
  console.log('  - Custom import aliases')
  console.log('  - Complex import patterns')
}

main()
