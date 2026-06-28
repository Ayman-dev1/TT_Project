const User = require('../models/User');
const Doctor = require('../models/Doctor');
const generateToken = require('../utils/generateToken');

const asString = (value) => typeof value === 'string' ? value.trim() : '';
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
    try {
        const name = asString(req.body?.name);
        const email = asString(req.body?.email).toLowerCase();
        const password = asString(req.body?.password);
        const requestedRole = asString(req.body?.role).toLowerCase();

        if (!name) {
            console.error("Registration validation failed: Full name is missing or invalid");
            return res.status(400).json({ success: false, message: 'Full name is required' });
        }
        if (!isValidEmail(email)) {
            console.error(`Registration validation failed: Invalid email address format - "${email}"`);
            return res.status(400).json({ success: false, message: 'Please provide a valid email address' });
        }
        if (password.length < 8) {
            console.error(`Registration validation failed: Password length is ${password.length} (minimum 8 required)`);
            return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long' });
        }
        if (requestedRole === 'admin') {
            console.error("Registration validation failed: Self-registration of admin accounts is blocked");
            return res.status(403).json({ success: false, message: 'Admin accounts cannot be self-registered' });
        }
        const role = requestedRole === 'doctor' ? 'doctor' : 'patient';

        const userExists = await User.findOne({ email });

        if (userExists) {
            console.error(`Registration validation failed: Email "${email}" is already registered`);
            return res.status(400).json({ success: false, message: 'An account with this email already exists' });
        }

        if (role === 'doctor' && !req.body.clinicAddress) {
            console.error("Registration validation failed: Clinic address is missing for doctor account");
            return res.status(400).json({ success: false, message: 'Clinic address is required for doctor accounts' });
        }

        const user = await User.create({
            name,
            email,
            password,
            role,
            image: asString(req.body.image),
            dob: req.body.dob
        });

        if (user) {
            // If user is a doctor, create a doctor profile
            if (user.role === 'doctor') {
                await Doctor.create({
                    userId: user._id,
                    specialty: req.body.specialty || 'General',
                    experience: parseInt(req.body.experience, 10) || 0,
                    fee: req.body.fee || 0,
                    degree: req.body.degree || 'MBBS',
                    about: req.body.about || '',
                    clinicAddress: req.body.clinicAddress
                });
            }

            const responseData = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id)
            };

            if (user.role === 'doctor') {
                const doctor = await Doctor.findOne({ userId: user._id });
                if (doctor) responseData.doctorId = doctor._id;
            }

            res.status(201).json(responseData);
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        console.error("Registration validation failed:", error);
        res.status(400).json({ success: false, message: error.message });
    }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
    try {
        const email = asString(req.body?.email).toLowerCase();
        const password = asString(req.body?.password);

        if (!isValidEmail(email) || !password) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = await User.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            const responseData = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id)
            };

            if (user.role === 'doctor') {
                const doctor = await Doctor.findOne({ userId: user._id });
                if (doctor) {
                    responseData.doctorId = doctor._id;
                    responseData.available = doctor.available;
                }
            }

            res.json(responseData);
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getUserProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        if (user) {
            const responseData = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                image: user.image,
                dob: user.dob,
                phone: user.phone,
                address: user.address
            };

            if (user.role === 'doctor') {
                const doctor = await Doctor.findOne({ userId: user._id });
                if (doctor) {
                    responseData.available = doctor.available;
                }
            }

            res.json(responseData);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    registerUser,
    loginUser,
    getUserProfile
};
