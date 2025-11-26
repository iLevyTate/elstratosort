/**
 * Manual test for Transaction System
 * Tests rollback functionality and crash recovery
 *
 * Usage: node test/manual/test-transaction-rollback.js
 */
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const {
  FileOrganizationSaga,
  TransactionalFileOperations,
} = require('../../src/main/services/transaction');

// Create a temporary test directory
async function setupTestEnvironment() {
  const testDir = path.join(os.tmpdir(), `stratosort-tx-test-${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });

  // Create test files
  const sourceDir = path.join(testDir, 'source');
  const destDir = path.join(testDir, 'dest');

  await fs.mkdir(sourceDir, { recursive: true });
  await fs.mkdir(destDir, { recursive: true });

  // Create 5 test files
  const files = [];
  for (let i = 1; i <= 5; i++) {
    const filePath = path.join(sourceDir, `test${i}.txt`);
    await fs.writeFile(filePath, `Test content ${i}`);
    files.push(filePath);
  }

  return { testDir, sourceDir, destDir, files };
}
async function cleanup(testDir) {
  try {
    await fs.rm(testDir, { recursive: true, force: true });
    console.log(`✓ Cleaned up test directory: ${testDir}`);
  } catch (_error) {
    console.error(`✗ Failed to cleanup: ${error.message}`);
  }
}

// TEST 1: Successful transaction with commit
async function testSuccessfulTransaction(env) {
  console.log('\n=== TEST 1: Successful Transaction ===');

  const journalPath = path.join(env.testDir, 'journal-success.db');
  const saga = new FileOrganizationSaga(journalPath);

  const operations = env.files.slice(0, 3).map((file, index) => ({
    type: 'move',
    source: file,
    destination: path.join(env.destDir, `moved${index + 1}.txt`),
  }));

  try {
    const result = await saga.execute(operations);

    if (result.success && result.successCount === 3) {
      console.log('✓ Transaction committed successfully');
      console.log(`  - Moved ${result.successCount} files`);

      // Verify files were moved
      for (const op of operations) {
        const exists = await fs
          .access(op.destination)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          console.log(
            `  ✓ File exists at destination: ${path.basename(op.destination)}`,
          );
        } else {
          console.log(
            `  ✗ File NOT found at destination: ${path.basename(op.destination)}`,
          );
          return false;
        }
      }

      return true;
    } else {
      console.log('✗ Transaction failed unexpectedly');
      console.log(`  Error: ${result.error || 'Unknown'}`);
      return false;
    }
  } catch (_error) {
    console.log(`✗ Test failed with exception: ${error.message}`);
    return false;
  }
}

// TEST 2: Failed transaction with automatic rollback
async function testFailedTransactionRollback(env) {
  console.log('\n=== TEST 2: Failed Transaction with Rollback ===');

  const journalPath = path.join(env.testDir, 'journal-rollback.db');
  const saga = new FileOrganizationSaga(journalPath);

  // Create operations where the 3rd will fail (non-existent source)
  const operations = [
    {
      type: 'move',
      source: env.files[3], // File 4 (exists)
      destination: path.join(env.destDir, 'rollback1.txt'),
    },
    {
      type: 'move',
      source: env.files[4], // File 5 (exists)
      destination: path.join(env.destDir, 'rollback2.txt'),
    },
    {
      type: 'move',
      source: path.join(env.sourceDir, 'nonexistent.txt'), // THIS WILL FAIL
      destination: path.join(env.destDir, 'rollback3.txt'),
    },
  ];

  try {
    const result = await saga.execute(operations);

    if (!result.success && result.rolledBack) {
      console.log('✓ Transaction failed as expected and rolled back');
      console.log(`  - Failed at step: ${result.failedStep}`);
      console.log(`  - Error: ${result.error}`);

      // Verify files were rolled back (should be back in source directory)
      const file4Exists = await fs
        .access(env.files[3])
        .then(() => true)
        .catch(() => false);
      const file5Exists = await fs
        .access(env.files[4])
        .then(() => true)
        .catch(() => false);

      if (file4Exists && file5Exists) {
        console.log('✓ Files successfully rolled back to original locations');
        return true;
      } else {
        console.log('✗ Rollback failed - files not restored');
        console.log(`  File 4 exists: ${file4Exists}`);
        console.log(`  File 5 exists: ${file5Exists}`);
        return false;
      }
    } else {
      console.log('✗ Expected transaction to fail and rollback');
      return false;
    }
  } catch (_error) {
    console.log(`✗ Test failed with exception: ${error.message}`);
    return false;
  }
}

// TEST 3: TransactionalFileOperations wrapper API
async function testTransactionalFileOperationsAPI(env) {
  console.log('\n=== TEST 3: TransactionalFileOperations API ===');

  const journalPath = path.join(env.testDir, 'journal-api.db');
  const txOps = new TransactionalFileOperations(journalPath);

  try {
    await txOps.initialize();
    const txId = await txOps.beginTransaction({ test: 'api-test' });

    console.log(`✓ Transaction started: ${txId}`);

    // Create a new file for this test
    const testFile = path.join(env.sourceDir, 'api-test.txt');
    await fs.writeFile(testFile, 'API test content');

    // Perform operations
    const dest1 = path.join(env.destDir, 'api-moved.txt');
    await txOps.move(txId, testFile, dest1);
    console.log('✓ Move operation completed');

    // Copy the moved file
    const dest2 = path.join(env.destDir, 'api-copied.txt');
    await txOps.copy(txId, dest1, dest2);
    console.log('✓ Copy operation completed');

    // Create a directory
    const newDir = path.join(env.destDir, 'api-dir');
    await txOps.mkdir(txId, newDir);
    console.log('✓ Mkdir operation completed');

    // Commit
    await txOps.commit(txId);
    console.log('✓ Transaction committed');

    // Verify results
    const movedExists = await fs
      .access(dest1)
      .then(() => true)
      .catch(() => false);
    const copiedExists = await fs
      .access(dest2)
      .then(() => true)
      .catch(() => false);
    const dirExists = await fs
      .access(newDir)
      .then(() => true)
      .catch(() => false);

    if (movedExists && copiedExists && dirExists) {
      console.log('✓ All operations verified successfully');
      return true;
    } else {
      console.log('✗ Verification failed');
      console.log(`  Moved exists: ${movedExists}`);
      console.log(`  Copied exists: ${copiedExists}`);
      console.log(`  Directory exists: ${dirExists}`);
      return false;
    }
  } catch (_error) {
    console.log(`✗ Test failed with exception: ${error.message}`);
    console.log(`  Stack: ${error.stack}`);
    return false;
  } finally {
    txOps.close();
  }
}

// TEST 4: Manual rollback test
async function testManualRollback(env) {
  console.log('\n=== TEST 4: Manual Rollback ===');

  const journalPath = path.join(env.testDir, 'journal-manual.db');
  const txOps = new TransactionalFileOperations(journalPath);

  try {
    await txOps.initialize();
    const txId = await txOps.beginTransaction({ test: 'manual-rollback' });

    // Create test file
    const testFile = path.join(env.sourceDir, 'manual-test.txt');
    await fs.writeFile(testFile, 'Manual rollback test');

    const dest = path.join(env.destDir, 'manual-moved.txt');
    await txOps.move(txId, testFile, dest);

    console.log('✓ File moved');

    // Manually trigger rollback
    await txOps.rollback(txId, 'User cancelled operation');

    console.log('✓ Rollback completed');

    // Verify file was moved back
    const sourceExists = await fs
      .access(testFile)
      .then(() => true)
      .catch(() => false);
    const destExists = await fs
      .access(dest)
      .then(() => true)
      .catch(() => false);

    if (sourceExists && !destExists) {
      console.log('✓ File successfully restored to source');
      return true;
    } else {
      console.log('✗ Rollback verification failed');
      console.log(`  Source exists: ${sourceExists}`);
      console.log(`  Destination exists: ${destExists}`);
      return false;
    }
  } catch (_error) {
    console.log(`✗ Test failed with exception: ${error.message}`);
    return false;
  } finally {
    txOps.close();
  }
}

// Run all tests
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  StratoSort Transaction System Test Suite             ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  let env;

  try {
    env = await setupTestEnvironment();
    console.log(`\n✓ Test environment created: ${env.testDir}`);

    const results = [];

    results.push(await testSuccessfulTransaction(env));
    results.push(await testFailedTransactionRollback(env));
    results.push(await testTransactionalFileOperationsAPI(env));
    results.push(await testManualRollback(env));

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  Test Results Summary                                  ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    const passed = results.filter(Boolean).length;
    const total = results.length;

    console.log(`\nTests Passed: ${passed}/${total}`);

    if (passed === total) {
      console.log(
        '\n✓✓✓ All tests passed! Transaction system is working correctly. ✓✓✓\n',
      );
    } else {
      console.log(
        `\n✗✗✗ ${total - passed} test(s) failed. Please review the errors above. ✗✗✗\n`,
      );
    }

    await cleanup(env.testDir);

    process.exit(passed === total ? 0 : 1);
  } catch (_error) {
    console.error(`\n✗ Fatal error during testing: ${error.message}`);
    console.error(error.stack);

    if (env) {
      await cleanup(env.testDir);
    }

    process.exit(1);
  }
}

// Run tests if this is the main module
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };
