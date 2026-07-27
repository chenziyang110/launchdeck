import path from 'node:path';
import { controlPlanePaths } from '../../control-plane/state.js';
import { AgentInstallerError } from '../errors.js';

export function installerStatePaths(env = process.env) {
  const controlPlane = controlPlanePaths(env);
  const installerRoot = path.join(controlPlane.homeDir, 'installer');
  const installerDir = path.join(installerRoot, 'v1');
  const receiptsDir = path.join(installerDir, 'receipts');
  const receiptRecordsDir = path.join(receiptsDir, 'records');
  const receiptIndexesDir = path.join(receiptsDir, 'indexes');
  const backupsDir = path.join(installerDir, 'backups');

  return Object.freeze({
    homeDir: controlPlane.homeDir,
    installerRoot,
    installerDir,
    statePath: path.join(installerDir, 'state.json'),
    receiptsDir,
    receiptRecordsDir,
    receiptIndexesDir,
    backupsDir,
    receiptPath(receiptId) {
      return path.join(receiptRecordsDir, `${fileToken(receiptId, 'receiptId')}.json`);
    },
    scopeIndexPath(scopeIdentity) {
      return path.join(receiptIndexesDir, `${fileToken(scopeIdentity, 'scopeIdentity')}.json`);
    },
    backupDir(operationId, backupId) {
      return path.join(
        backupsDir,
        fileToken(operationId, 'operationId'),
        fileToken(backupId, 'backupId')
      );
    }
  });
}

function fileToken(value, label) {
  const text = String(value ?? '').trim();
  if (!text || text === '.' || text === '..' || text.includes('/') || text.includes('\\')) {
    throw statePathError(`${label} is invalid.`);
  }
  const token = text.replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!token) throw statePathError(`${label} is invalid.`);
  return token;
}

function statePathError(message) {
  return new AgentInstallerError('agent_state_path_invalid', message, {
    effectCertainty: 'none'
  });
}
