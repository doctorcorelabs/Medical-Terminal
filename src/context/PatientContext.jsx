import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import * as dataService from '../services/dataService';

const PatientContext = createContext();

export function PatientProvider({ children }) {
    const { user } = useAuth();
    const [patients, setPatients] = useState([]);
    const [selectedPatientId, setSelectedPatientId] = useState(null);

    // Initial load when user logs in
    useEffect(() => {
        if (user) {
            dataService.fetchFromSupabase(user.id).then(data => {
                setPatients(data);
            });
        }
    }, [user]);

    const refreshPatients = useCallback(() => {
        setPatients(dataService.getAllPatients());
        if (user) {
            dataService.syncToSupabase(user.id).catch(() => {}); // Sync in background
        }
    }, [user]);

    const selectedPatient = patients.find(p => p.id === selectedPatientId) || null;

    const addPatient = useCallback((patient) => {
        const newPatient = dataService.addPatient(patient);
        refreshPatients();
        return newPatient;
    }, [refreshPatients]);

    const updatePatient = useCallback((id, updates) => {
        const updated = dataService.updatePatient(id, updates);
        refreshPatients();
        return updated;
    }, [refreshPatients]);

    const deletePatient = useCallback((id) => {
        dataService.deletePatient(id);
        if (selectedPatientId === id) setSelectedPatientId(null);
        refreshPatients();
    }, [selectedPatientId, refreshPatients]);

    const addSymptom = useCallback((patientId, symptom) => {
        const result = dataService.addSymptom(patientId, symptom);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const removeSymptom = useCallback((patientId, symptomId) => {
        const result = dataService.removeSymptom(patientId, symptomId);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const addDailyReport = useCallback((patientId, report) => {
        const result = dataService.addDailyReport(patientId, report);
        // Assuming saveData(patients) was a placeholder for refreshPatients() or a new function
        // Sticking to refreshPatients() as it's consistent with other add/remove operations
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const removeDailyReport = useCallback((patientId, reportId) => {
        const result = dataService.removeDailyReport(patientId, reportId);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const addPhysicalExam = useCallback((patientId, exam) => {
        const result = dataService.addPhysicalExam(patientId, exam);
        // Assuming saveData(patients) was a placeholder for refreshPatients() or a new function
        // Sticking to refreshPatients() as it's consistent with other add/remove operations
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const removePhysicalExam = useCallback((patientId, examId) => {
        const result = dataService.removePhysicalExam(patientId, examId);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const addSupportingExam = useCallback((patientId, exam) => {
        const result = dataService.addSupportingExam(patientId, exam);
        // Assuming saveData(patients) was a placeholder for refreshPatients() or a new function
        // Sticking to refreshPatients() as it's consistent with other add/remove operations
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const removeSupportingExam = useCallback((patientId, examId) => {
        const result = dataService.removeSupportingExam(patientId, examId);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const addPrescription = useCallback((patientId, prescription) => {
        const result = dataService.addPrescription(patientId, prescription);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const removePrescription = useCallback((patientId, prescriptionId) => {
        const result = dataService.removePrescription(patientId, prescriptionId);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const addVitalSign = useCallback((patientId, vitals) => {
        const result = dataService.addVitalSign(patientId, vitals);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const updateVitalSign = useCallback((patientId, vsId, updates) => {
        const result = dataService.updateVitalSign(patientId, vsId, updates);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    const removeVitalSign = useCallback((patientId, vsId) => {
        const result = dataService.removeVitalSign(patientId, vsId);
        refreshPatients();
        return result;
    }, [refreshPatients]);

    return (
        <PatientContext.Provider value={{
            patients,
            selectedPatient,
            selectedPatientId,
            setSelectedPatientId,
            addPatient,
            updatePatient,
            deletePatient,
            addSymptom,
            removeSymptom,
            addDailyReport,
            removeDailyReport,
            addPhysicalExam,
            removePhysicalExam,
            addSupportingExam,
            removeSupportingExam,
            addPrescription,
            removePrescription,
            addVitalSign,
            updateVitalSign,
            removeVitalSign,
            refreshPatients,
        }}>
            {children}
        </PatientContext.Provider>
    );
}

export function usePatients() {
    const context = useContext(PatientContext);
    if (!context) throw new Error('usePatients must be used within PatientProvider');
    return context;
}
