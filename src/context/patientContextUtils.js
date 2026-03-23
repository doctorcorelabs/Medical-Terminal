export function resolveSelectedPatient(patients, selectedPatientId) {
    if (!Array.isArray(patients) || !selectedPatientId) return null;
    return patients.find((patient) => patient.id === selectedPatientId) || null;
}

export function canAddPatients({ isAdmin, isSpecialist, isIntern, isExpiredSpecialist, patientCount, count = 1 }) {
    if (isAdmin || isSpecialist) return true;
    if (isIntern && !isExpiredSpecialist) {
        return (patientCount + count) <= 2;
    }
    return false;
}

export function canEditPatients(isExpiredSpecialist) {
    return !isExpiredSpecialist;
}
