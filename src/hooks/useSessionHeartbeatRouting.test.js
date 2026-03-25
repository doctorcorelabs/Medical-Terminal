import test from 'node:test';
import assert from 'node:assert/strict';
import { selectSessionWorkerUrlForUser, __testOnlyHashStringToBucket } from './useSessionHeartbeatRouting.js';

test('selectSessionWorkerUrlForUser returns primary when canary is not configured', () => {
  const selected = selectSessionWorkerUrlForUser({
    userId: 'user-1',
    primaryUrl: 'https://primary.example.com',
    canaryUrl: '',
    canaryPercent: 20,
  });

  assert.equal(selected, 'https://primary.example.com');
});

test('selectSessionWorkerUrlForUser returns canary for users in canary bucket', () => {
  const userId = 'canary-user';
  const bucket = __testOnlyHashStringToBucket(userId);

  const selected = selectSessionWorkerUrlForUser({
    userId,
    primaryUrl: 'https://primary.example.com',
    canaryUrl: 'https://canary.example.com',
    canaryPercent: bucket + 1,
  });

  assert.equal(selected, 'https://canary.example.com');
});

test('selectSessionWorkerUrlForUser returns primary for users outside canary bucket', () => {
  const userId = 'primary-user';
  const bucket = __testOnlyHashStringToBucket(userId);
  const percent = Math.max(0, bucket - 1);

  const selected = selectSessionWorkerUrlForUser({
    userId,
    primaryUrl: 'https://primary.example.com',
    canaryUrl: 'https://canary.example.com',
    canaryPercent: percent,
  });

  assert.equal(selected, 'https://primary.example.com');
});
