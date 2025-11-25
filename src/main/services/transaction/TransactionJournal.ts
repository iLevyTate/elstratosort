/**
 * Transaction Journal - Persistent log of file operations
 * Enables rollback and recovery after crashes
 */
import Database from 'better-sqlite3';
import { logger } from '../../../shared/logger';

logger.setContext('TransactionJournal');

interface Transaction {
  id: string;
  status: 'active' | 'committed' | 'rolled_back';
  created_at: number;
  completed_at: number | null;
  error_message: string | null;
}

interface Operation {
  id: number;
  transaction_id: string;
  step_number: number;
  operation_type: string;
  source_path: string;
  destination_path: string;
  status: 'pending' | 'completed' | 'rolled_back';
  executed_at: number | null;
}

interface OperationInput {
  type: string;
  source: string;
  destination: string;
}

interface TransactionStats {
  transactions: Record<string, number>;
  totalOperations: number;
}

class TransactionJournal {
  private db: Database.Database;

  /**
   * @param journalPath - Path to SQLite journal database
   */
  constructor(journalPath: string) {
    this.db = new Database(journalPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    this._initializeTables();

    logger.info('[Journal] Initialized', { path: journalPath });
  }

  /**
   * Initialize database tables
   * @private
   */
  private _initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        status TEXT CHECK(status IN ('active', 'committed', 'rolled_back')) NOT NULL,
        created_at INTEGER NOT NULL,
        completed_at INTEGER,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT NOT NULL,
        step_number INTEGER NOT NULL,
        operation_type TEXT NOT NULL,
        source_path TEXT NOT NULL,
        destination_path TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'completed', 'rolled_back')) NOT NULL DEFAULT 'pending',
        executed_at INTEGER,
        FOREIGN KEY(transaction_id) REFERENCES transactions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
      CREATE INDEX IF NOT EXISTS idx_operations_transaction ON operations(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(transaction_id, status);
    `);
  }

  /**
   * Begin a new transaction
   * @returns Transaction ID
   */
  beginTransaction(): string {
    const txId = `tx_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const stmt = this.db.prepare(`
      INSERT INTO transactions (id, status, created_at)
      VALUES (?, 'active', ?)
    `);

    stmt.run(txId, Date.now());

    logger.info('[Journal] Transaction started', { transactionId: txId });
    return txId;
  }

  /**
   * Record a completed operation
   *
   * @param txId - Transaction ID
   * @param stepNumber - Step number in the transaction
   * @param operation - Operation details
   */
  recordOperation(txId: string, stepNumber: number, operation: OperationInput): void {
    const stmt = this.db.prepare(`
      INSERT INTO operations (
        transaction_id, step_number, operation_type,
        source_path, destination_path, status, executed_at
      ) VALUES (?, ?, ?, ?, ?, 'completed', ?)
    `);

    stmt.run(
      txId,
      stepNumber,
      operation.type,
      operation.source,
      operation.destination,
      Date.now()
    );

    logger.debug('[Journal] Operation recorded', {
      transactionId: txId,
      step: stepNumber,
      operation: operation.type,
    });
  }

  /**
   * Commit a transaction
   *
   * @param txId - Transaction ID
   */
  commitTransaction(txId: string): void {
    const stmt = this.db.prepare(`
      UPDATE transactions
      SET status = 'committed', completed_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), txId);

    logger.info('[Journal] Transaction committed', { transactionId: txId });

    // Schedule cleanup of old transactions
    setTimeout(() => this._cleanupOldTransactions(), 5000);
  }

  /**
   * Get operations for rollback (in reverse order)
   *
   * @param txId - Transaction ID
   * @returns Operations to rollback
   */
  getOperationsForRollback(txId: string): Operation[] {
    const stmt = this.db.prepare(`
      SELECT * FROM operations
      WHERE transaction_id = ? AND status = 'completed'
      ORDER BY step_number DESC
    `);

    const operations = stmt.all(txId) as Operation[];

    logger.info('[Journal] Retrieved operations for rollback', {
      transactionId: txId,
      count: operations.length,
    });

    return operations;
  }

  /**
   * Mark an operation as rolled back
   *
   * @param operationId - Operation ID
   */
  markOperationRolledBack(operationId: number): void {
    const stmt = this.db.prepare(`
      UPDATE operations
      SET status = 'rolled_back'
      WHERE id = ?
    `);

    stmt.run(operationId);
  }

  /**
   * Mark transaction as rolled back
   *
   * @param txId - Transaction ID
   * @param errorMessage - Why it was rolled back
   */
  markTransactionRolledBack(txId: string, errorMessage: string | null = null): void {
    const stmt = this.db.prepare(`
      UPDATE transactions
      SET status = 'rolled_back', completed_at = ?, error_message = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), errorMessage, txId);

    logger.warn('[Journal] Transaction rolled back', {
      transactionId: txId,
      reason: errorMessage,
    });
  }

  /**
   * Find incomplete transactions (for recovery after crash)
   *
   * @returns Incomplete transactions
   */
  findIncompleteTransactions(): Transaction[] {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions
      WHERE status = 'active'
      ORDER BY created_at ASC
    `);

    const incomplete = stmt.all() as Transaction[];

    if (incomplete.length > 0) {
      logger.warn('[Journal] Found incomplete transactions', {
        count: incomplete.length,
      });
    }

    return incomplete;
  }

  /**
   * Get transaction status
   *
   * @param txId - Transaction ID
   * @returns Transaction info
   */
  getTransaction(txId: string): Transaction | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM transactions WHERE id = ?
    `);

    return stmt.get(txId) as Transaction | undefined;
  }

  /**
   * Clean up old committed/rolled_back transactions
   * Keeps transactions for 7 days for audit purposes
   *
   * @private
   */
  private _cleanupOldTransactions(): void {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    // Delete operations first (foreign key)
    const deleteOpsStmt = this.db.prepare(`
      DELETE FROM operations
      WHERE transaction_id IN (
        SELECT id FROM transactions
        WHERE completed_at < ? AND status IN ('committed', 'rolled_back')
      )
    `);

    const opsDeleted = deleteOpsStmt.run(sevenDaysAgo);

    // Delete transactions
    const deleteTxStmt = this.db.prepare(`
      DELETE FROM transactions
      WHERE completed_at < ? AND status IN ('committed', 'rolled_back')
    `);

    const txDeleted = deleteTxStmt.run(sevenDaysAgo);

    if (opsDeleted.changes > 0 || txDeleted.changes > 0) {
      logger.info('[Journal] Cleaned up old transactions', {
        operationsDeleted: opsDeleted.changes,
        transactionsDeleted: txDeleted.changes,
      });
    }
  }

  /**
   * Get transaction statistics
   *
   * @returns Statistics
   */
  getStatistics(): TransactionStats {
    const stats = this.db.prepare(`
      SELECT
        status,
        COUNT(*) as count
      FROM transactions
      GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    const totalOps = this.db.prepare(`
      SELECT COUNT(*) as count FROM operations
    `).get() as { count: number };

    return {
      transactions: stats.reduce((acc, row) => {
        acc[row.status] = row.count;
        return acc;
      }, {} as Record<string, number>),
      totalOperations: totalOps.count,
    };
  }

  /**
   * Close the database
   */
  close(): void {
    this.db.close();
    logger.info('[Journal] Database closed');
  }
}

export default TransactionJournal;
