import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  }
  const database = new DatabaseSync(path);
  database.function('sha256', (value) =>
    value === null || value === undefined
      ? null
      : createHash('sha256').update(String(value), 'utf8').digest('hex'),
  );
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return database;
}

export function transaction<T>(database: DatabaseSync, callback: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
