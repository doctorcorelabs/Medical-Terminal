import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calcBMI,
    calcBSA,
    calcIBW,
    calcEGFR,
    calcMEWS,
    calcCURB65,
    calcCorrectedCalcium,
    calcCorrectedSodium,
    calcAPGAR,
    calcEmergencyDoses,
    calcInfusionRate,
    calcDropRate,
    calcDrugInfusion,
    calcHalfLife,
    calcLoadingDose,
    calcMaintenanceDose,
    calcSteadyStateConcentration,
} from './medCalculations.js';

test('calcBMI returns null for invalid input', () => {
    assert.strictEqual(calcBMI(0, 170), null);
    assert.strictEqual(calcBMI(70, 0), null);
});

test('calcBMI calculates category and display', () => {
    const result = calcBMI(70, 170);
    assert.ok(result);
    assert.strictEqual(result.display, '24.2');
    assert.strictEqual(result.category, 'Berat Badan Normal');
});

test('calcBSA returns expected shape', () => {
    const result = calcBSA(70, 170);
    assert.ok(result);
    assert.strictEqual(result.unit, 'm²');
    assert.ok(Number(result.display) > 1.5);
});

test('calcIBW differs by gender', () => {
    const male = calcIBW(170, 'male');
    const female = calcIBW(170, 'female');
    assert.ok(male && female);
    assert.ok(male.value > female.value);
});

test('calcEGFR returns stage and bounded value', () => {
    const result = calcEGFR(1.0, 30, 'male');
    assert.ok(result);
    assert.ok(typeof result.stage === 'string');
    assert.ok(result.value > 0);
});

test('calcMEWS computes risk total and action', () => {
    const result = calcMEWS(120, 80, 16, 37, 'A');
    assert.ok(result);
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.category, 'Risiko Rendah');
});

test('calcCURB65 computes total from criteria', () => {
    const result = calcCURB65(true, 25, 32, 85, 55, 70);
    assert.ok(result);
    assert.strictEqual(result.total, 5);
    assert.strictEqual(result.category, 'Risiko Sangat Tinggi');
});

test('calcCorrectedCalcium and calcCorrectedSodium return classified outputs', () => {
    const ca = calcCorrectedCalcium(8.0, 3.0);
    const na = calcCorrectedSodium(130, 300);
    assert.ok(ca && na);
    assert.strictEqual(ca.unit, 'mg/dL');
    assert.strictEqual(na.unit, 'mEq/L');
});

test('calcAPGAR computes total and action', () => {
    const result = calcAPGAR(2, 2, 2, 2, 2);
    assert.ok(result);
    assert.strictEqual(result.total, 10);
    assert.strictEqual(result.category, 'Normal');
});

test('calcEmergencyDoses handles mixed definitions', () => {
    const defs = [
        { id: 'd1', type: 'mg_per_kg', dosePerKg: 1, concentrationMgPerMl: 10 },
        { id: 'd2', type: 'mg_per_kg_range', minDosePerKg: 0.1, maxDosePerKg: 0.2, concentrationMgPerMl: 1 },
    ];
    const rows = calcEmergencyDoses(20, defs);
    assert.strictEqual(rows.length, 2);
    assert.ok(rows[0].doseDisplay.length > 0);
    assert.ok(rows[1].volumeDisplay.length > 0);
});

test('infusion and PK helper functions return non-null for valid inputs', () => {
    const inf = calcInfusionRate(500, 5, 0);
    const drop = calcDropRate(500, 120, 20);
    const pump = calcDrugInfusion({ dose: 5, doseUnit: 'mcg/kg/min', weightKg: 20, concentrationMgPerMl: 0.4 });
    const hl = calcHalfLife(0.6, 0.1);
    const ld = calcLoadingDose(0.7, 10, 70, 1);
    const md = calcMaintenanceDose(0.1, 10, 8, 70, 1);
    const css = calcSteadyStateConcentration(500, 1, 0.1, 70, 12);

    assert.ok(inf && drop && pump && hl && ld && md && css);
    assert.strictEqual(inf.unit, 'mL/jam');
    assert.strictEqual(drop.unit, 'gtt/menit');
    assert.strictEqual(pump.unit, 'mL/jam');
});
