import test from 'node:test';
import assert from 'node:assert/strict';

// ============================================================================
// MEDICAL CALCULATIONS: Infusion rates, BSA, Conversions
// ============================================================================

/**
 * Calculate infusion rate (mL/hour) based on dose/kg/min
 */
function calculateInfusionRate(doseMgKgMin, weightKg, concentrationMgMl) {
    if (typeof doseMgKgMin !== 'number' || typeof weightKg !== 'number' || typeof concentrationMgMl !== 'number') {
        return null;
    }
    if (doseMgKgMin <= 0 || weightKg <= 0 || concentrationMgMl <= 0) {
        return null;
    }

    // dose (mg/kg/min) * weight (kg) * 60 (min/hr) / concentration (mg/mL)
    const ratePerMin = doseMgKgMin * weightKg;
    const ratePerHour = ratePerMin * 60;
    const volumePerHour = ratePerHour / concentrationMgMl;

    return parseFloat(volumePerHour.toFixed(2));
}

/**
 * Calculate infusion rate using dose/kg/hr
 */
function calculateHourlyInfusionRate(dosePerKgPerHour, weightKg, concentrationMgMl) {
    if (typeof dosePerKgPerHour !== 'number' || typeof weightKg !== 'number' || typeof concentrationMgMl !== 'number') {
        return null;
    }
    if (dosePerKgPerHour <= 0 || weightKg <= 0 || concentrationMgMl <= 0) {
        return null;
    }

    // dose (mg/kg/hr) * weight (kg) / concentration (mg/mL)
    const totalDosePerHour = dosePerKgPerHour * weightKg;
    const volumePerHour = totalDosePerHour / concentrationMgMl;

    return parseFloat(volumePerHour.toFixed(2));
}

/**
 * Calculate Body Surface Area (BSA) using multiple formulas
 */
function calculateBSA(heightCm, weightKg) {
    if (typeof heightCm !== 'number' || typeof weightKg !== 'number') {
        return null;
    }
    if (heightCm <= 0 || weightKg <= 0) {
        return null;
    }

    // Mosteller formula: sqrt((height * weight) / 3600)
    const bsaMosteller = Math.sqrt((heightCm * weightKg) / 3600);

    // DuBois formula: 0.007184 * height^0.725 * weight^0.425
    const bsaDuBois = 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);

    return {
        mosteller: parseFloat(bsaMosteller.toFixed(4)),
        dubois: parseFloat(bsaDuBois.toFixed(4)),
        average: parseFloat(((bsaMosteller + bsaDuBois) / 2).toFixed(4)),
    };
}

/**
 * Calculate dose based on BSA
 */
function calculateBSADose(heightCm, weightKg, doseMgPerM2) {
    if (typeof heightCm !== 'number' || typeof weightKg !== 'number' || typeof doseMgPerM2 !== 'number') {
        return null;
    }
    if (heightCm <= 0 || weightKg <= 0 || doseMgPerM2 <= 0) {
        return null;
    }

    const bsa = calculateBSA(heightCm, weightKg);
    if (!bsa) return null;

    return parseFloat((bsa.average * doseMgPerM2).toFixed(2));
}

/**
 * Convert between units
 */
function convertUnits(value, fromUnit, toUnit) {
    if (typeof value !== 'number' || value < 0) {
        return null;
    }

    // Weight conversions
    const weightConversions = {
        'kg_to_lb': 2.20462,
        'lb_to_kg': 0.453592,
        'kg_to_g': 1000,
        'g_to_kg': 0.001,
        'mg_to_g': 0.001,
        'g_to_mg': 1000,
    };

    const key = `${fromUnit}_to_${toUnit}`;
    const factor = weightConversions[key];

    if (!factor) {
        return null;
    }

    return parseFloat((value * factor).toFixed(2));
}

/**
 * Calculate fluid requirements (mL/day) based on weight
 */
function calculateFluidRequirement(weightKg, method = 'holliday-segar') {
    if (typeof weightKg !== 'number' || weightKg <= 0) {
        return null;
    }

    let dailyRequirement = 0;

    if (method === 'holliday-segar') {
        // Holliday-Segar: 100 mL/kg for first 10 kg + 50 mL/kg for next 10 kg + 20 mL/kg for rest
        if (weightKg <= 10) {
            dailyRequirement = weightKg * 100;
        } else if (weightKg <= 20) {
            dailyRequirement = (10 * 100) + ((weightKg - 10) * 50);
        } else {
            dailyRequirement = (10 * 100) + (10 * 50) + ((weightKg - 20) * 20);
        }
    } else if (method === 'simple') {
        // Simple method: 50 mL/kg/day
        dailyRequirement = weightKg * 50;
    }

    return parseFloat(dailyRequirement.toFixed(2));
}

/**
 * Calculate GFR (Glomerular Filtration Rate) for pediatric patients
 * Using Schwartz formula: GFR = (0.41 * height) / creatinine
 */
function calculatePediatricGFR(heightCm, creatinineMgDl) {
    if (typeof heightCm !== 'number' || typeof creatinineMgDl !== 'number') {
        return null;
    }
    if (heightCm <= 0 || creatinineMgDl <= 0) {
        return null;
    }

    // Schwartz formula constant for children
    const gfr = (0.41 * heightCm) / creatinineMgDl;
    return parseFloat(gfr.toFixed(2));
}

/**
 * Calculate corrected serum sodium
 */
function calculateCorrectedSodium(serumSodium, serumGlucose) {
    if (typeof serumSodium !== 'number' || typeof serumGlucose !== 'number') {
        return null;
    }

    // Corrected Na = measured Na + 0.016 * (glucose - 100)
    const correction = 0.016 * (serumGlucose - 100);
    const correctedSodium = serumSodium + correction;

    return parseFloat(correctedSodium.toFixed(1));
}

/**
 * Calculate anion gap
 */
function calculateAnionGap(sodium, chloride, bicarbonate) {
    if (typeof sodium !== 'number' || typeof chloride !== 'number' || typeof bicarbonate !== 'number') {
        return null;
    }

    // AG = [Na+] - ([Cl-] + [HCO3-])
    const ag = sodium - (chloride + bicarbonate);
    return parseFloat(ag.toFixed(1));
}

// ============================================================================
// TESTS: INFUSION RATE CALCULATIONS
// ============================================================================

test('calculateInfusionRate - dopamine infusion for shock', () => {
    // 5 mcg/kg/min dopamine in 20 kg child with concentration of 400 mcg/mL
    // 5 mcg/kg/min = 0.005 mg/kg/min
    const rate = calculateInfusionRate(0.005, 20, 0.4); // 400 mcg/mL = 0.4 mg/mL
    
    // Expected: 0.005 * 20 * 60 / 0.4 = 15 mL/hr
    assert.strictEqual(rate, 15);
});

test('calculateInfusionRate - returns null for invalid inputs', () => {
    assert.strictEqual(calculateInfusionRate('invalid', 20, 0.4), null);
    assert.strictEqual(calculateInfusionRate(0.005, 'invalid', 0.4), null);
    assert.strictEqual(calculateInfusionRate(0.005, 20, 'invalid'), null);
    assert.strictEqual(calculateInfusionRate(0, 20, 0.4), null);
    assert.strictEqual(calculateInfusionRate(0.005, 0, 0.4), null);
});

test('calculateInfusionRate - scales with weight', () => {
    const rate10kg = calculateInfusionRate(0.005, 10, 0.4);
    const rate20kg = calculateInfusionRate(0.005, 20, 0.4);

    // Double weight = double infusion rate
    assert.strictEqual(rate20kg, rate10kg * 2);
});

test('calculateHourlyInfusionRate - calculates volume from hourly dose', () => {
    // 1 mg/kg/hr * 15 kg / 10 mg/mL concentration
    const rate = calculateHourlyInfusionRate(1, 15, 10);
    
    // Expected: 1 * 15 / 10 = 1.5 mL/hr
    assert.strictEqual(rate, 1.5);
});

test('calculateHourlyInfusionRate - returns null for invalid inputs', () => {
    assert.strictEqual(calculateHourlyInfusionRate('invalid', 15, 10), null);
    assert.strictEqual(calculateHourlyInfusionRate(1, 'invalid', 10), null);
    assert.strictEqual(calculateHourlyInfusionRate(1, 15, 'invalid'), null);
    assert.strictEqual(calculateHourlyInfusionRate(0, 15, 10), null);
});

// ============================================================================
// TESTS: BSA CALCULATIONS
// ============================================================================

test('calculateBSA - Mosteller and DuBois formulas', () => {
    // Adult: 170 cm, 70 kg
    const bsa = calculateBSA(170, 70);

    assert.ok(bsa.mosteller > 0);
    assert.ok(bsa.dubois > 0);
    assert.ok(bsa.average > 0);

    // Both formulas should give result close to 1.8-1.9 m² for standard adult
    assert.ok(bsa.mosteller >= 1.8 && bsa.mosteller <= 2.0);
    assert.ok(bsa.dubois >= 1.8 && bsa.dubois <= 2.0);
});

test('calculateBSA - returns null for invalid inputs', () => {
    assert.strictEqual(calculateBSA('invalid', 70), null);
    assert.strictEqual(calculateBSA(170, 'invalid'), null);
    assert.strictEqual(calculateBSA(0, 70), null);
    assert.strictEqual(calculateBSA(170, 0), null);
});

test('calculateBSA - child vs adult', () => {
    const childBSA = calculateBSA(110, 20);
    const adultBSA = calculateBSA(170, 70);

    // Child should have smaller BSA
    assert.ok(childBSA.average < adultBSA.average);
});

test('calculateBSADose - calculates dose from BSA', () => {
    // 110 cm, 20 kg child with 30 mg/m² dose
    const dose = calculateBSADose(110, 20, 30);

    // Verify it's positive and reasonable
    assert.ok(dose > 0);
    assert.ok(dose < 200); // Sanity check
});

test('calculateBSADose - returns null for invalid inputs', () => {
    assert.strictEqual(calculateBSADose('invalid', 20, 30), null);
    assert.strictEqual(calculateBSADose(110, 'invalid', 30), null);
    assert.strictEqual(calculateBSADose(110, 20, 'invalid'), null);
    assert.strictEqual(calculateBSADose(0, 20, 30), null);
    assert.strictEqual(calculateBSADose(110, 0, 30), null);
    assert.strictEqual(calculateBSADose(110, 20, 0), null);
});

// ============================================================================
// TESTS: UNIT CONVERSIONS
// ============================================================================

test('convertUnits - weight conversions', () => {
    // 70 kg to lb
    const lb = convertUnits(70, 'kg', 'lb');
    assert.ok(Math.abs(lb - 154.32) < 0.1);

    // 150 lb to kg
    const kg = convertUnits(150, 'lb', 'kg');
    assert.ok(Math.abs(kg - 68.04) < 0.1);
});

test('convertUnits - mass conversions', () => {
    const kg_to_g = convertUnits(1, 'kg', 'g');
    assert.strictEqual(kg_to_g, 1000);

    const mg_to_g = convertUnits(1000, 'mg', 'g');
    assert.strictEqual(mg_to_g, 1);
});

test('convertUnits - returns null for unknown conversion', () => {
    assert.strictEqual(convertUnits(100, 'invalid', 'unknown'), null);
});

test('convertUnits - returns null for invalid input', () => {
    assert.strictEqual(convertUnits('invalid', 'kg', 'lb'), null);
    assert.strictEqual(convertUnits(-50, 'kg', 'lb'), null);
});

// ============================================================================
// TESTS: FLUID REQUIREMENT CALCULATIONS
// ============================================================================

test('calculateFluidRequirement - Holliday-Segar method for 10 kg child', () => {
    // 10 kg: 10 * 100 = 1000 mL/day
    const requirement = calculateFluidRequirement(10, 'holliday-segar');
    assert.strictEqual(requirement, 1000);
});

test('calculateFluidRequirement - Holliday-Segar method for 20 kg child', () => {
    // 20 kg: (10 * 100) + (10 * 50) = 1500 mL/day
    const requirement = calculateFluidRequirement(20, 'holliday-segar');
    assert.strictEqual(requirement, 1500);
});

test('calculateFluidRequirement - Holliday-Segar method for 30 kg child', () => {
    // 30 kg: (10 * 100) + (10 * 50) + (10 * 20) = 1700 mL/day
    const requirement = calculateFluidRequirement(30, 'holliday-segar');
    assert.strictEqual(requirement, 1700);
});

test('calculateFluidRequirement - Simple method', () => {
    const requirement = calculateFluidRequirement(20, 'simple');
    assert.strictEqual(requirement, 1000); // 20 * 50
});

test('calculateFluidRequirement - returns null for invalid input', () => {
    assert.strictEqual(calculateFluidRequirement('invalid'), null);
    assert.strictEqual(calculateFluidRequirement(0), null);
    assert.strictEqual(calculateFluidRequirement(-5), null);
});

// ============================================================================
// TESTS: GFR CALCULATION (PEDIATRIC)
// ============================================================================

test('calculatePediatricGFR - Schwartz formula', () => {
    // Child: 140 cm, creatinine 0.8 mg/dL
    const gfr = calculatePediatricGFR(140, 0.8);

    // GFR = (0.41 * 140) / 0.8 = 71.75
    assert.ok(Math.abs(gfr - 71.75) < 0.1);
});

test('calculatePediatricGFR - returns reasonable values for normal kidneys', () => {
    const gfr = calculatePediatricGFR(120, 0.7);

    // Normal pediatric GFR should be >60
    assert.ok(gfr > 60);
});

test('calculatePediatricGFR - returns null for invalid inputs', () => {
    assert.strictEqual(calculatePediatricGFR('invalid', 0.8), null);
    assert.strictEqual(calculatePediatricGFR(140, 'invalid'), null);
    assert.strictEqual(calculatePediatricGFR(0, 0.8), null);
    assert.strictEqual(calculatePediatricGFR(140, 0), null);
});

// ============================================================================
// TESTS: SERUM ELECTROLYTE CALCULATIONS
// ============================================================================

test('calculateCorrectedSodium - hyperglycemia correction', () => {
    // Measured Na 130, glucose 400
    // Corrected = 130 + 0.016 * (400 - 100) = 134.8
    const corrected = calculateCorrectedSodium(130, 400);
    assert.ok(Math.abs(corrected - 134.8) < 0.1);
});

test('calculateCorrectedSodium - normal glucose', () => {
    // Measured Na 140, glucose 100 (normal)
    // Corrected = 140 + 0.016 * (100 - 100) = 140
    const corrected = calculateCorrectedSodium(140, 100);
    assert.strictEqual(corrected, 140);
});

test('calculateCorrectedSodium - hypoglycemia', () => {
    // Measured Na 140, glucose 70
    // Corrected = 140 + 0.016 * (70 - 100) = 139.52
    const corrected = calculateCorrectedSodium(140, 70);
    assert.ok(Math.abs(corrected - 139.52) < 0.1);
});

test('calculateCorrectedSodium - returns null for invalid inputs', () => {
    assert.strictEqual(calculateCorrectedSodium('invalid', 100), null);
    assert.strictEqual(calculateCorrectedSodium(140, 'invalid'), null);
});

test('calculateAnionGap - normal anion gap', () => {
    // Na 140, Cl 105, HCO3 24
    // AG = 140 - (105 + 24) = 11
    const ag = calculateAnionGap(140, 105, 24);
    assert.strictEqual(ag, 11);
});

test('calculateAnionGap - elevated anion gap (metabolic acidosis)', () => {
    // Na 138, Cl 102, HCO3 18
    // AG = 138 - (102 + 18) = 18
    const ag = calculateAnionGap(138, 102, 18);
    assert.strictEqual(ag, 18);
});

test('calculateAnionGap - returns null for invalid inputs', () => {
    assert.strictEqual(calculateAnionGap('invalid', 105, 24), null);
    assert.strictEqual(calculateAnionGap(140, 'invalid', 24), null);
    assert.strictEqual(calculateAnionGap(140, 105, 'invalid'), null);
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

test('medical calculations - comprehensive pediatric scenario', () => {
    // Scenario: 15 kg, 105 cm child in shock on dopamine
    const weight = 15;
    const height = 105;

    // 1. Calculate BSA for chemotherapy-like dosing
    const bsa = calculateBSA(height, weight);
    assert.ok(bsa.average > 0.5 && bsa.average < 1.5);

    // 2. Calculate dopamine infusion rate
    const dopaRate = calculateInfusionRate(0.005, weight, 0.4);
    assert.ok(dopaRate > 0 && dopaRate < 50); // Sanity range

    // 3. Calculate daily fluid requirement
    const dailyFluid = calculateFluidRequirement(weight, 'holliday-segar');
    assert.ok(dailyFluid > 0);

    // 4. Convert weight to pounds for documentation
    const weightPounds = convertUnits(weight, 'kg', 'lb');
    assert.ok(Math.abs(weightPounds - 33.07) < 0.5);
});

test('medical calculations - GFR and drug dosing adjustment', () => {
    // Evaluate renal function and adjust dosing
    const height = 130;
    const weight = 28;
    const creatinine = 1.2; // Slightly elevated

    const gfr = calculatePediatricGFR(height, creatinine);
    assert.ok(gfr > 0);

    // If GFR < 60, would need dose adjustment (not tested here, just conceptual)
    if (gfr < 60) {
        assert.ok(true); // Would apply adjustment factor
    }
});
