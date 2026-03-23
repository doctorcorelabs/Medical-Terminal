import test from 'node:test';
import assert from 'node:assert/strict';

import {
    BROSELOW_WEIGHT_LIMITS,
    getBroselowZone,
    calcPediatricEmergencySummary,
    calcCommonPediatricDose,
    estimateEttByAge,
} from './pediatricCalculations.js';

import { PEDIATRIC_COMMON_DRUGS } from '../data/pediatricDosing.js';

test('BROSELOW_WEIGHT_LIMITS exposes min/max from reference zones', () => {
    assert.ok(BROSELOW_WEIGHT_LIMITS.min > 0);
    assert.ok(BROSELOW_WEIGHT_LIMITS.max >= BROSELOW_WEIGHT_LIMITS.min);
});

test('getBroselowZone returns null for invalid weight', () => {
    assert.strictEqual(getBroselowZone(0), null);
    assert.strictEqual(getBroselowZone(-5), null);
});

test('getBroselowZone returns a zone for valid in-range weight', () => {
    const midWeight = Math.max(1, Math.floor((BROSELOW_WEIGHT_LIMITS.min + BROSELOW_WEIGHT_LIMITS.max) / 2));
    const zone = getBroselowZone(midWeight);
    assert.ok(zone);
    assert.ok(midWeight >= zone.minWeight && midWeight <= zone.maxWeight);
});

test('calcPediatricEmergencySummary returns empty for invalid weight', () => {
    assert.deepStrictEqual(calcPediatricEmergencySummary(0), []);
    assert.deepStrictEqual(calcPediatricEmergencySummary(null), []);
});

test('calcPediatricEmergencySummary returns computed emergency rows', () => {
    const rows = calcPediatricEmergencySummary(20);
    assert.ok(Array.isArray(rows));
    assert.ok(rows.length > 0);
    assert.ok('doseDisplay' in rows[0]);
});

test('calcCommonPediatricDose returns null for unknown drug or invalid weight', () => {
    assert.strictEqual(calcCommonPediatricDose('unknown-drug', 10), null);
    assert.strictEqual(calcCommonPediatricDose(PEDIATRIC_COMMON_DRUGS[0].id, 0), null);
});

test('calcCommonPediatricDose computes dose and fluid bolus for known drug', () => {
    const drug = PEDIATRIC_COMMON_DRUGS[0];
    const result = calcCommonPediatricDose(drug.id, 12);

    assert.ok(result);
    assert.strictEqual(result.id, drug.id);
    assert.ok(result.calculatedDose > 0);
    assert.ok(typeof result.doseDisplay === 'string' && result.doseDisplay.length > 0);
    assert.ok(result.fluidBolus.includes('mL bolus 20 mL/kg'));
});

test('estimateEttByAge returns null for negative age', () => {
    assert.strictEqual(estimateEttByAge(-1), null);
});

test('estimateEttByAge returns cuffed and uncuffed suggestions', () => {
    const result = estimateEttByAge(4);
    assert.ok(result);
    assert.ok(typeof result.uncuffed === 'string');
    assert.ok(typeof result.cuffed === 'string');
});
