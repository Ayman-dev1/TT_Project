const express = require('express');
const router = express.Router();
const {
    createMedicalRecord,
    getMedicalRecords,
    deleteMedicalRecord
} = require('../controllers/medicalRecordController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/', protect, authorize('patient'), createMedicalRecord);
router.get('/', protect, authorize('patient', 'doctor'), getMedicalRecords);
router.delete('/:id', protect, authorize('patient'), deleteMedicalRecord);

module.exports = router;
