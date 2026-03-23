import { BROSelow_ZONES, PEDIATRIC_COMMON_DRUGS } from '../data/pediatricDosing.js';
import { EMERGENCY_DRUGS } from '../data/emergencyDrugs.js';
import { calcEmergencyDoses } from './medCalculations.js';

export const BROSELOW_WEIGHT_LIMITS = {
  min: BROSelow_ZONES[0]?.minWeight ?? 0,
  max: BROSelow_ZONES[BROSelow_ZONES.length - 1]?.maxWeight ?? 0,
};

function formatNumber(value, decimals = 1) {
  return Number(value).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function isWithinPediatricWeightRange(weightKg) {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return false;
  if (!BROSELOW_WEIGHT_LIMITS.min || !BROSELOW_WEIGHT_LIMITS.max) return false;
  return weightKg >= BROSELOW_WEIGHT_LIMITS.min && weightKg <= BROSELOW_WEIGHT_LIMITS.max;
}

export function getBroselowZone(weightKg) {
  if (!isWithinPediatricWeightRange(weightKg)) return null;
  return BROSelow_ZONES.find((zone) => weightKg >= zone.minWeight && weightKg <= zone.maxWeight) ?? null;
}

export function calcPediatricEmergencySummary(weightKg) {
  if (!isWithinPediatricWeightRange(weightKg)) return [];
  return calcEmergencyDoses(weightKg, EMERGENCY_DRUGS);
}

export function calcCommonPediatricDose(drugId, weightKg) {
  const drug = PEDIATRIC_COMMON_DRUGS.find((item) => item.id === drugId);
  if (!drug || !isWithinPediatricWeightRange(weightKg)) return null;

  const numericDose = weightKg * drug.dosePerKg;
  const doseDisplay = drug.unit === 'mEq'
    ? `${formatNumber(numericDose, 2)} mEq`
    : `${formatNumber(numericDose, numericDose < 10 ? 2 : 1)} ${drug.unit}`;

  return {
    ...drug,
    calculatedDose: numericDose,
    doseDisplay,
    fluidBolus: `${formatNumber(weightKg * 20, 0)} mL bolus 20 mL/kg`,
  };
}

export function estimateEttByAge(ageYears) {
  if (ageYears == null || ageYears < 0) return null;
  const uncuffed = (ageYears / 4) + 4;
  const cuffed = uncuffed - 0.5;
  return {
    uncuffed: formatNumber(uncuffed, 1),
    cuffed: formatNumber(cuffed, 1),
  };
}