import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  classifyReceiptOwnership,
  createReceiptStore
} from '../../../src/agent/state/receipt-store.js';
import { resolveInstallationScope } from '../../../src/agent/state/scope-resolver.js';
import { createIsolatedStateFixture } from '../../fixtures/agent-state/isolated-state-fixture.js';

const BUILD_IDENTITY = `sha256:${'b'.repeat(64)}`;

test('receipt commit writes an immutable record before atomically publishing the scope index', (t) => {
  const fixture = createIsolatedStateFixture(t, 'receipt-commit');
  const scope = resolveInstallationScope({
    scope: 'project',
    projectRoot: fixture.projectRoot,
    env: fixture.env
  });
  const store = createReceiptStore({
    env: fixture.env,
    clock: () => new Date('2026-07-23T12:00:00.000Z')
  });
  const receipt = receiptFixture(scope);
  const committed = store.commit(receipt);

  assert.deepEqual(committed, store.read(receipt.receiptId));
  assert.deepEqual(committed, store.readCurrent(scope));
  assert.equal(Object.isFrozen(committed), true);
  assert.equal(Object.isFrozen(committed.targets), true);
  assert.equal(fs.existsSync(store.paths.receiptPath(receipt.receiptId)), true);
  assert.equal(fs.existsSync(store.paths.scopeIndexPath(scope.scopeIdentity)), true);

  const index = JSON.parse(fs.readFileSync(store.paths.scopeIndexPath(scope.scopeIdentity), 'utf8'));
  assert.equal(index.receiptId, receipt.receiptId);
  assert.match(committed.receiptDigest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(index.receiptDigest, committed.receiptDigest);
  assert.equal(
    fs.existsSync(store.paths.receiptPath(index.receiptId)),
    true,
    'current pointer never names a missing immutable receipt'
  );
  assert.equal(
    listTemporaryFiles(fixture.launchdeckHome).length,
    0,
    'atomic replacement leaves no temporary state behind'
  );
});

test('receipt IDs are immutable and project/user current indexes remain distinct', (t) => {
  const fixture = createIsolatedStateFixture(t, 'receipt-isolation');
  const projectScope = resolveInstallationScope({
    scope: 'project',
    projectRoot: fixture.projectRoot,
    env: fixture.env
  });
  const userScope = resolveInstallationScope({
    scope: 'user',
    userHome: fixture.userRoot,
    env: fixture.env
  });
  const store = createReceiptStore({ env: fixture.env });
  const projectReceipt = receiptFixture(projectScope);
  const userReceipt = receiptFixture(userScope, {
    receiptId: 'receipt_user_0123456789',
    projectIdentity: null
  });

  store.commit(projectReceipt);
  store.commit(userReceipt);

  assert.equal(store.readCurrent(projectScope).receiptId, projectReceipt.receiptId);
  assert.equal(store.readCurrent(userScope).receiptId, userReceipt.receiptId);
  assert.notEqual(
    store.paths.scopeIndexPath(projectScope.scopeIdentity),
    store.paths.scopeIndexPath(userScope.scopeIdentity)
  );
  assert.throws(
    () => store.commit({
      ...projectReceipt,
      buildIdentity: `sha256:${'9'.repeat(64)}`
    }),
    { code: 'agent_receipt_immutable' }
  );
  assert.equal(store.read(projectReceipt.receiptId).buildIdentity, BUILD_IDENTITY);
});

test('receipt ownership is exact-boundary and digest based; force cannot claim unrelated content', (t) => {
  createIsolatedStateFixture(t, 'receipt-ownership');
  const owned = {
    targetId: 'claude:project:mcp',
    ownershipBoundary: 'mcpServers.launchdeck',
    desiredDigest: `sha256:${'d'.repeat(64)}`
  };

  assert.deepEqual(classifyReceiptOwnership(owned, {
    targetId: owned.targetId,
    ownershipBoundary: owned.ownershipBoundary,
    observedDigest: owned.desiredDigest,
    exists: true
  }), {
    classification: 'verified',
    removable: true,
    repairable: false
  });

  assert.deepEqual(classifyReceiptOwnership(owned, {
    targetId: owned.targetId,
    ownershipBoundary: owned.ownershipBoundary,
    observedDigest: `sha256:${'e'.repeat(64)}`,
    exists: true
  }), {
    classification: 'divergent',
    removable: false,
    repairable: false
  });

  assert.deepEqual(classifyReceiptOwnership(owned, {
    targetId: 'foreign:project:mcp',
    ownershipBoundary: 'mcpServers.foreign',
    observedDigest: owned.desiredDigest,
    exists: true,
    force: true
  }), {
    classification: 'unrelated',
    removable: false,
    repairable: false
  });
});

test('receipt commit fails closed for non-plain roots, nested records, and scope binding drift', (t) => {
  const fixture = createIsolatedStateFixture(t, 'receipt-canonicality');
  const projectScope = resolveInstallationScope({
    scope: 'project',
    projectRoot: fixture.projectRoot,
    env: fixture.env
  });
  const userScope = resolveInstallationScope({
    scope: 'user',
    userHome: fixture.userRoot,
    env: fixture.env
  });
  const store = createReceiptStore({
    env: fixture.env,
    clock: () => new Date('2026-07-23T13:00:00.000Z')
  });
  const projectReceipt = receiptFixture(projectScope, {
    receiptId: 'receipt_project_12345678'
  });
  const userReceipt = receiptFixture(userScope, {
    receiptId: 'receipt_user_12345678',
    projectIdentity: null
  });

  for (const [name, expectedCode, candidate] of [
    [
      'custom root prototype',
      'agent_receipt_invalid',
      Object.assign(Object.create({ ambiguous: true }), projectReceipt)
    ],
    [
      'null root prototype',
      'agent_receipt_invalid',
      Object.assign(Object.create(null), projectReceipt)
    ],
    ['nested target prototype', 'agent_receipt_invalid', {
      ...projectReceipt,
      receiptId: 'receipt_project_12345679',
      targets: [Object.assign(Object.create({ ambiguous: true }), projectReceipt.targets[0])]
    }],
    ['nested evidence prototype', 'agent_receipt_verification_invalid', {
      ...projectReceipt,
      receiptId: 'receipt_project_12345680',
      verificationEvidence: [Object.assign(
        Object.create({ ambiguous: true }),
        projectReceipt.verificationEvidence[0]
      )]
    }],
    ['extra root field', 'agent_receipt_evidence_invalid', {
      ...projectReceipt,
      receiptId: 'receipt_project_12345681',
      unsupported: true
    }],
    ['substituted project identity', 'agent_receipt_scope_invalid', {
      ...projectReceipt,
      receiptId: 'receipt_project_12345682',
      projectIdentity: fixture.userRoot
    }],
    ['noncanonical project path', 'agent_receipt_scope_invalid', {
      ...projectReceipt,
      receiptId: 'receipt_project_12345683',
      projectIdentity: `${projectScope.projectIdentity}${path.sep}.`
    }],
    ['wrong scope pair', 'agent_receipt_scope_invalid', {
      ...projectReceipt,
      receiptId: 'receipt_project_12345684',
      scope: 'user',
      projectIdentity: projectScope.projectIdentity,
      scopeIdentity: userScope.scopeIdentity
    }],
    [
      'scope reference custom prototype',
      'agent_receipt_scope_invalid',
      Object.assign(Object.create({ ambiguous: true }), projectScope)
    ],
    ['scope reference noncanonical project path', 'agent_receipt_scope_invalid', {
      ...projectScope,
      projectIdentity: `${projectScope.projectIdentity}${path.sep}.`
    }]
  ]) {
    assert.throws(
      () => (name.startsWith('scope reference')
        ? store.readCurrent(candidate)
        : store.commit(candidate)),
      { code: expectedCode },
      name
    );
  }

  assert.throws(
    () => store.commit({
      ...userReceipt,
      receiptId: 'receipt_user_12345679',
      projectIdentity: projectScope.projectIdentity
    }),
    { code: 'agent_receipt_scope_invalid' }
  );
});

test('receipt commit accepts exact canonical project and user receipts and current scopes', (t) => {
  const fixture = createIsolatedStateFixture(t, 'receipt-canonical-positive');
  const projectScope = resolveInstallationScope({
    scope: 'project',
    projectRoot: fixture.projectRoot,
    env: fixture.env
  });
  const userScope = resolveInstallationScope({
    scope: 'user',
    userHome: fixture.userRoot,
    env: fixture.env
  });
  const store = createReceiptStore({
    env: fixture.env,
    clock: () => new Date('2026-07-23T14:00:00.000Z')
  });
  const projectReceipt = receiptFixture(projectScope, {
    receiptId: 'receipt_project_87654321'
  });
  const userReceipt = receiptFixture(userScope, {
    receiptId: 'receipt_user_87654321',
    projectIdentity: null
  });

  const committedProject = store.commit(projectReceipt);
  const committedUser = store.commit(userReceipt);

  assert.equal(committedProject.scopeIdentity, projectScope.scopeIdentity);
  assert.equal(committedProject.projectIdentity, projectScope.projectIdentity);
  assert.equal(committedUser.scopeIdentity, userScope.scopeIdentity);
  assert.equal(committedUser.projectIdentity, null);
  assert.equal(store.readCurrent(projectScope).receiptId, projectReceipt.receiptId);
  assert.equal(store.readCurrent(userScope).receiptId, userReceipt.receiptId);
});

function receiptFixture(scope, overrides = {}) {
  return {
    receiptId: 'receipt_project_01234567',
    scope: scope.scope,
    scopeIdentity: scope.scopeIdentity,
    projectIdentity: scope.projectIdentity,
    buildIdentity: BUILD_IDENTITY,
    targets: [{
      targetId: 'codex:project:skill',
      ownershipBoundary: 'launchdeck-agent',
      desiredDigest: `sha256:${'d'.repeat(64)}`
    }],
    ownedDigests: [`sha256:${'d'.repeat(64)}`],
    verificationEvidence: [{
      kind: 'skill-digest',
      digest: `sha256:${'d'.repeat(64)}`
    }],
    committedAt: '2026-07-23T12:00:00.000Z',
    supersedesReceiptId: null,
    ...overrides
  };
}

function listTemporaryFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => /\.tmp$/.test(entry) || /\.tmp[\\/]/.test(entry));
}
