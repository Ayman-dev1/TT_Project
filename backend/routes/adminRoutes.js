const express = require('express');
const router = express.Router();
const { adminLogin, getStats, getAllDoctorsAdmin, deleteDoctor, getAllAppointmentsAdmin, updateDoctorAdmin, getAllPatientsAdmin, deletePatient, updateAppointmentPaymentAdmin, getAdminAudit } = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/login', adminLogin);
router.get('/stats', protect, authorize('admin'), getStats);
router.get('/doctors', protect, authorize('admin'), getAllDoctorsAdmin);
router.get('/appointments', protect, authorize('admin'), getAllAppointmentsAdmin);
router.get('/patients', protect, authorize('admin'), getAllPatientsAdmin);
router.get('/audit', protect, authorize('admin'), getAdminAudit);
router.patch('/doctors/:id', protect, authorize('admin'), updateDoctorAdmin);
router.patch('/appointments/:id/payment', protect, authorize('admin'), updateAppointmentPaymentAdmin);
router.delete('/doctors/:id', protect, authorize('admin'), deleteDoctor);
router.delete('/patients/:id', protect, authorize('admin'), deletePatient);

module.exports = router;
