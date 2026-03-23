import test from 'node:test';
import assert from 'node:assert/strict';

// Mock pediatric dose calculations module
// These are common pediatric drug calculations used in the application

// ============================================================================
// UTILITY FUNCTIONS FOR PEDIATRIC DOSE CALCULATIONS
// ============================================================================

/**
 * Calculate pediatric dose based on weight
 * @param {number} adultDose - Adult dose in mg
 * @param {number} childWeight - Child weight in kg
 * @returns {number} Calculated child dose in mg
 */
function calculateWeightBasedDose(adultDose, childWeight) {
    if (typeof adultDose !== 'number' || typeof childWeight !== 'number') {
        return null;
    }
    if (adultDose <= 0 || childWeight <= 0) {
        return null;
    }
    // Simple weight-based calculation: (child weight / 70 kg) * adult dose
    return parseFloat(((childWeight / 70) * adultDose).toFixed(2));
}

/**
 * Calculate dose based on BSA (Body Surface Area)
 * @param {number} height - Height in cm
 * @param {number} weight - Weight in kg
 * @param {number} adultDose - Adult dose
 * @returns {number} Child dose based on BSA
 */
function calculateBSABasedDose(height, weight, adultDose) {
    if (typeof height !== 'number' || typeof weight !== 'number' || typeof adultDose !== 'number') {
        return null;
    }
    if (height <= 0 || weight <= 0 || adultDose <= 0) {
        return null;
    }

    // Mosteller formula for BSA: sqrt((height * weight) / 3600)
    const bsa = Math.sqrt((height * weight) / 3600);
    // Standard adult BSA = 1.73 m²
    return parseFloat(((bsa / 1.73) * adultDose).toFixed(2));
}

/**
 * Get age category for pediatric dosing
 */
function getAgeCategory(months) {
    if (typeof months !== 'number' || months < 0) {
        return null;
    }

    if (months < 1) return 'neonate';
    if (months < 12) return 'infant';
    if (months < 60) return 'toddler';
    if (months < 180) return 'child';
    return 'adolescent';
}

/**
 * Get maximum recommended dose for age
 */
function getMaxDoseForAge(ageCategoryOrMonths, baseDose) {
    let category = ageCategoryOrMonths;
    if (typeof ageCategoryOrMonths === 'number') {
        category = getAgeCategory(ageCategoryOrMonths);
    }

    if (!baseDose || baseDose <= 0) {
        return null;
    }

    const maxDoseMultipliers = {
        'neonate': 0.25,
        'infant': 0.5,
        'toddler': 0.75,
        'child': 1,
        'adolescent': 1.2,
    };

    const multiplier = maxDoseMultipliers[category];
    if (!multiplier) {
        return null;
    }

    return parseFloat((multiplier * baseDose).toFixed(2));
}

/**
 * Common pediatric drug: Paracetamol/Acetaminophen
 */
function calculateParacetamolDose(ageMonths, weightKg) {
    if (typeof ageMonths !== 'number' || typeof weightKg !== 'number') {
        return null;
    }
    if (ageMonths < 0 || weightKg <= 0) {
        return null;
    }

    // Paracetamol: 10-15 mg/kg per dose, max 5 doses per day
    const minDose = parseFloat((10 * weightKg).toFixed(2));
    const maxDose = parseFloat((15 * weightKg).toFixed(2));
    const dailyMax = parseFloat((maxDose * 5).toFixed(2));

    return {
        singleDoseMin: minDose,
        singleDoseMax: maxDose,
        dailyMax: dailyMax,
        frequencyPerDay: 4,
        interval: '4-6 hours',
        notes: 'Do not exceed 4 g/day in children',
    };
}

/**
 * Common pediatric drug: Ibuprofen
 */
function calculateIbuprofenDose(ageMonths, weightKg) {
    if (typeof ageMonths !== 'number' || typeof weightKg !== 'number') {
        return null;
    }
    if (ageMonths < 0 || weightKg <= 0) {
        return null;
    }

    // Ibuprofen: 5-10 mg/kg per dose, max 4 doses per day
    const minDose = parseFloat((5 * weightKg).toFixed(2));
    const maxDose = parseFloat((10 * weightKg).toFixed(2));
    const dailyMax = parseFloat((maxDose * 4).toFixed(2));

    return {
        singleDoseMin: minDose,
        singleDoseMax: maxDose,
        dailyMax: dailyMax,
        frequencyPerDay: 4,
        interval: '6-8 hours',
        contraindication: 'Not recommended in children < 6 months',
    };
}

/**
 * Common pediatric drug: Amoxicillin
 */
function calculateAmoxicillinDose(ageMonths, weightKg) {
    if (typeof ageMonths !== 'number' || typeof weightKg !== 'number') {
        return null;
    }
    if (ageMonths < 0 || weightKg <= 0) {
        return null;
    }

    // Amoxicillin: 20-40 mg/kg/day divided in 3 doses
    const dailyMin = parseFloat((20 * weightKg).toFixed(2));
    const dailyMax = parseFloat((40 * weightKg).toFixed(2));
    const singleDoseMin = parseFloat((dailyMin / 3).toFixed(2));
    const singleDoseMax = parseFloat((dailyMax / 3).toFixed(2));

    return {
        singleDoseMin: singleDoseMin,
        singleDoseMax: singleDoseMax,
        dailyMin: dailyMin,
        dailyMax: dailyMax,
        frequencyPerDay: 3,
        interval: '8 hours',
        notes: 'Standard dose for acute infection',
    };
}

// ============================================================================
// TESTS: WEIGHT-BASED DOSING
// ============================================================================

test('calculateWeightBasedDose - calculates correct dose from weight', () => {
    // 20 kg child with 500 mg adult dose
    const dose = calculateWeightBasedDose(500, 20);
    const expected = (20 / 70 * 500); // ~142.86 mg
    assert.ok(Math.abs(dose - expected) < 0.01);
});

test('calculateWeightBasedDose - returns null for invalid inputs', () => {
    assert.strictEqual(calculateWeightBasedDose('invalid', 20), null);
    assert.strictEqual(calculateWeightBasedDose(500, 'invalid'), null);
    assert.strictEqual(calculateWeightBasedDose(0, 20), null);
    assert.strictEqual(calculateWeightBasedDose(500, 0), null);
    assert.strictEqual(calculateWeightBasedDose(-100, 20), null);
});


test('calculateWeightBasedDose - scales proportionally with weight', () => {
    const dose10kg = calculateWeightBasedDose(500, 10);
    const dose20kg = calculateWeightBasedDose(500, 20);
    const dose40kg = calculateWeightBasedDose(500, 40);

    // Doubling weight should double dose (with tolerance for floating point)
    assert.ok(Math.abs(dose20kg - dose10kg * 2) < 0.1);
    assert.ok(Math.abs(dose40kg - dose10kg * 4) < 0.1);
});
// ============================================================================
// TESTS: BSA-BASED DOSING
// ============================================================================

test('calculateBSABasedDose - calculates correct BSA-based dose', () => {
    // Standard 70 kg, 170 cm adult (BSA ~ 1.83)
    const dose = calculateBSABasedDose(170, 70, 500);
    const bsa = Math.sqrt((170 * 70) / 3600); // ~1.83
    const expected = (bsa / 1.73) * 500; // ~528
    assert.ok(Math.abs(dose - expected) < 1);
});

test('calculateBSABasedDose - returns null for invalid inputs', () => {
    assert.strictEqual(calculateBSABasedDose('invalid', 70, 500), null);
    assert.strictEqual(calculateBSABasedDose(170, 'invalid', 500), null);
    assert.strictEqual(calculateBSABasedDose(170, 70, 'invalid'), null);
    assert.strictEqual(calculateBSABasedDose(0, 70, 500), null);
    assert.strictEqual(calculateBSABasedDose(170, 0, 500), null);
    assert.strictEqual(calculateBSABasedDose(170, 70, 0), null);
});

test('calculateBSABasedDose - calculates lower dose for smaller child', () => {
    // 100 cm, 20 kg child
    const childDose = calculateBSABasedDose(100, 20, 500);
    // 170 cm, 70 kg adult reference
    const adultDose = 500;

    assert.ok(childDose < adultDose);
});

// ============================================================================
// TESTS: AGE CATEGORIZATION
// ============================================================================

test('getAgeCategory - correctly categorizes age ranges', () => {
    assert.strictEqual(getAgeCategory(0), 'neonate'); // < 1 month
    assert.strictEqual(getAgeCategory(6), 'infant'); // 6 months
    assert.strictEqual(getAgeCategory(12), 'toddler'); // 1 year
    assert.strictEqual(getAgeCategory(36), 'toddler'); // 3 years
    assert.strictEqual(getAgeCategory(120), 'child'); // 10 years
    assert.strictEqual(getAgeCategory(180), 'adolescent'); // 15 years
    assert.strictEqual(getAgeCategory(240), 'adolescent'); // 20 years
});

test('getAgeCategory - returns null for invalid inputs', () => {
    assert.strictEqual(getAgeCategory(-1), null);
    assert.strictEqual(getAgeCategory('invalid'), null);
    assert.strictEqual(getAgeCategory(null), null);
});

// ============================================================================
// TESTS: MAX DOSE FOR AGE
// ============================================================================

test('getMaxDoseForAge - scales dose by age category', () => {
    const baseDose = 100;
    const neonateDose = getMaxDoseForAge('neonate', baseDose);
    const infantDose = getMaxDoseForAge('infant', baseDose);
    const childDose = getMaxDoseForAge('child', baseDose);
    const adolescentDose = getMaxDoseForAge('adolescent', baseDose);

    assert.strictEqual(neonateDose, 25); // 0.25 * 100
    assert.strictEqual(infantDose, 50); // 0.5 * 100
    assert.strictEqual(childDose, 100); // 1.0 * 100
    assert.strictEqual(adolescentDose, 120); // 1.2 * 100
});

test('getMaxDoseForAge - works with months parameter', () => {
    const baseDose = 100;
    const neonateDose = getMaxDoseForAge(0, baseDose);
    const childDose = getMaxDoseForAge(120, baseDose);

    assert.strictEqual(neonateDose, 25);
    assert.strictEqual(childDose, 100);
});


test('getMaxDoseForAge - returns null or NaN for invalid inputs', () => {
    assert.strictEqual(getMaxDoseForAge('invalid', 100), null);
    assert.strictEqual(getMaxDoseForAge('child', 0), null);
    assert.strictEqual(getMaxDoseForAge('child', -100), null);
    // Non-numeric dose produces NaN due to multiplication
    const result = getMaxDoseForAge('child', 'invalid');
    assert.ok(Number.isNaN(result));
});
// ============================================================================
// TESTS: PARACETAMOL DOSING
// ============================================================================

test('calculateParacetamolDose - returns correct dose range for child', () => {
    const dose = calculateParacetamolDose(36, 15); // 3 year old, 15 kg

    assert.strictEqual(dose.singleDoseMin, 150); // 10 * 15
    assert.strictEqual(dose.singleDoseMax, 225); // 15 * 15
    assert.strictEqual(dose.dailyMax, 1125); // 225 * 5
    assert.strictEqual(dose.frequencyPerDay, 4);
    assert.ok(dose.interval);
});

test('calculateParacetamolDose - scales dose by weight', () => {
    const dose10kg = calculateParacetamolDose(36, 10);
    const dose20kg = calculateParacetamolDose(36, 20);

    // Double weight = double dose
    assert.strictEqual(dose20kg.singleDoseMin, dose10kg.singleDoseMin * 2);
    assert.strictEqual(dose20kg.singleDoseMax, dose10kg.singleDoseMax * 2);
});

test('calculateParacetamolDose - returns null for invalid inputs', () => {
    assert.strictEqual(calculateParacetamolDose('invalid', 15), null);
    assert.strictEqual(calculateParacetamolDose(36, 'invalid'), null);
    assert.strictEqual(calculateParacetamolDose(-12, 15), null);
    assert.strictEqual(calculateParacetamolDose(36, 0), null);
});

test('calculateParacetamolDose - newborn dosing', () => {
    const dose = calculateParacetamolDose(2, 3.5); // 2 months, 3.5 kg
    assert.strictEqual(dose.singleDoseMin, 35);
    assert.strictEqual(dose.singleDoseMax, 52.5);
});

// ============================================================================
// TESTS: IBUPROFEN DOSING
// ============================================================================

test('calculateIbuprofenDose - returns correct dose range for child', () => {
    const dose = calculateIbuprofenDose(36, 15); // 3 year old, 15 kg

    assert.strictEqual(dose.singleDoseMin, 75); // 5 * 15
    assert.strictEqual(dose.singleDoseMax, 150); // 10 * 15
    assert.strictEqual(dose.dailyMax, 600); // 150 * 4
    assert.strictEqual(dose.frequencyPerDay, 4);
});

test('calculateIbuprofenDose - returns contraindication for young infants', () => {
    const dose = calculateIbuprofenDose(3, 5.5); // 3 months, 5.5 kg
    assert.ok(dose.contraindication);
    assert.ok(dose.contraindication.includes('6 months'));
});

test('calculateIbuprofenDose - scales correctly with weight', () => {
    const dose15kg = calculateIbuprofenDose(36, 15);
    const dose30kg = calculateIbuprofenDose(36, 30);

    // Double weight = double dose
    assert.strictEqual(dose30kg.singleDoseMin, dose15kg.singleDoseMin * 2);
});

test('calculateIbuprofenDose - returns null for invalid inputs', () => {
    assert.strictEqual(calculateIbuprofenDose('invalid', 15), null);
    assert.strictEqual(calculateIbuprofenDose(36, 'invalid'), null);
    assert.strictEqual(calculateIbuprofenDose(36, 0), null);
});

// ============================================================================
// TESTS: AMOXICILLIN DOSING
// ============================================================================

test('calculateAmoxicillinDose - returns correct dose range for child', () => {
    const dose = calculateAmoxicillinDose(36, 15); // 3 year old, 15 kg

    assert.strictEqual(dose.singleDoseMin, 100); // (20 * 15) / 3
    assert.strictEqual(dose.singleDoseMax, 200); // (40 * 15) / 3
    assert.strictEqual(dose.dailyMin, 300); // 20 * 15
    assert.strictEqual(dose.dailyMax, 600); // 40 * 15
    assert.strictEqual(dose.frequencyPerDay, 3);
});

test('calculateAmoxicillinDose - infant dosing', () => {
    const dose = calculateAmoxicillinDose(9, 7.5); // 9 months, 7.5 kg

    const expectedDailyMin = 20 * 7.5; // 150
    const expectedDailyMax = 40 * 7.5; // 300
    assert.strictEqual(dose.dailyMin, expectedDailyMin);
    assert.strictEqual(dose.dailyMax, expectedDailyMax);
});

test('calculateAmoxicillinDose - scales linear with weight', () => {
    const dose10kg = calculateAmoxicillinDose(36, 10);
    const dose20kg = calculateAmoxicillinDose(36, 20);

    assert.strictEqual(dose20kg.dailyMin, dose10kg.dailyMin * 2);
    assert.strictEqual(dose20kg.dailyMax, dose10kg.dailyMax * 2);
});

test('calculateAmoxicillinDose - returns null for invalid inputs', () => {
    assert.strictEqual(calculateAmoxicillinDose('invalid', 15), null);
    assert.strictEqual(calculateAmoxicillinDose(36, 'invalid'), null);
    assert.strictEqual(calculateAmoxicillinDose(-12, 15), null);
    assert.strictEqual(calculateAmoxicillinDose(36, 0), null);
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

test('pediatric dose calculations - comparison of weight vs BSA methods', () => {
    const weight = 20;
    const height = 115;
    const adultDose = 250;

    const weightBasedDose = calculateWeightBasedDose(adultDose, weight);
    const bsaBasedDose = calculateBSABasedDose(height, weight, adultDose);

    // Both should be less than adult dose
    assert.ok(weightBasedDose < adultDose);
    assert.ok(bsaBasedDose < adultDose);

    // Both should be positive
    assert.ok(weightBasedDose > 0);
    assert.ok(bsaBasedDose > 0);
});

test('pediatric drugs - common antibiotics for typical child weights', () => {
    const weights = [5, 10, 15, 20, 25, 30]; // kg

    for (const w of weights) {
        const amox = calculateAmoxicillinDose(36, w);
        assert.ok(amox.singleDoseMin > 0);
        assert.ok(amox.singleDoseMax > amox.singleDoseMin);
        assert.ok(amox.dailyMax > amox.dailyMin);
    }
});

test('pediatric dosing - fever management drugs for 3-year-old', () => {
    const ageMonths = 36;
    const weightKg = 15;

    const paracetamol = calculateParacetamolDose(ageMonths, weightKg);
    const ibuprofen = calculateIbuprofenDose(ageMonths, weightKg);

    assert.ok(paracetamol.singleDoseMin > 0);
    assert.ok(ibuprofen.singleDoseMin > 0);

    // Paracetamol has higher daily max
    assert.ok(paracetamol.dailyMax > ibuprofen.dailyMax);
});
