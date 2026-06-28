const express = require('express');
const router = express.Router();
const { 
    bookAppointment, 
    getUserAppointments, 
    getDoctorAppointments, 
    cancelAppointment, 
    completeAppointment,
    resubmitAppointmentPayment
} = require('../controllers/appointmentController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.post('/', protect, authorize('patient'), bookAppointment);
router.get('/user', protect, authorize('patient'), getUserAppointments);
router.get('/doctor', protect, authorize('doctor'), getDoctorAppointments);
router.patch('/cancel', protect, cancelAppointment);
router.patch('/complete', protect, authorize('doctor'), completeAppointment);
router.patch('/:id/resubmit-payment', protect, authorize('patient'), resubmitAppointmentPayment);

module.exports = router;
