const express = require('express');
const router = express.Router();
const { getDoctors, getDoctorById, updateDoctorProfile, toggleAvailability, requestWithdrawal } = require('../controllers/doctorController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.get('/', getDoctors);
router.get('/:id', getDoctorById);
router.patch('/profile', protect, authorize('doctor'), upload.single('image'), updateDoctorProfile);
router.patch('/availability', protect, authorize('doctor'), toggleAvailability);
router.post('/withdraw', protect, authorize('doctor'), requestWithdrawal);

module.exports = router;
