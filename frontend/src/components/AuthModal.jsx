import React, { useState } from 'react';
import axios from 'axios';
import { TabibiAPI } from '../utils/TabibiAPI';


const AuthModal = ({ visible, mode, onClose, onSwitch }) => {
    const [loginRole, setLoginRole] = useState('patient');
    const [registerRole, setRegisterRole] = useState('patient');
    const [profilePic, setProfilePic] = useState(null);

    // ── Controlled state for login form ────────────────────────────────────────
    const [loginEmail, setLoginEmail] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    // ── Controlled state for register form ────────────────────────────────────
    const [regName, setRegName] = useState('');
    const [regEmail, setRegEmail] = useState('');
    const [regDob, setRegDob] = useState('');
    const [regPassword, setRegPassword] = useState('');
    const [regSpecialty, setRegSpecialty] = useState('General physician');
    const [regExperience, setRegExperience] = useState('');
    const [regFee, setRegFee] = useState('');
    const [regClinicAddress, setRegClinicAddress] = useState('');
    const [regDoctorCode, setRegDoctorCode] = useState('');

    if (!visible) return null;

    const showToast = (msg) => {
        let t = document.getElementById('toast');
        if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
        t.textContent = msg; t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    };

    const handleProfilePic = async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                await TabibiAPI.scanFile(file, 'Registration profile photo');
            } catch (error) {
                showToast(error.message || 'Security scan blocked this image');
                e.target.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = (ev) => setProfilePic(ev.target.result);
            reader.readAsDataURL(file);
        }
    };

    const loginLocally = (email, pass) => {
        const users = JSON.parse(localStorage.getItem('tabibi_users') || '[]');
        const user  = users.find(u => u.email === email && u.password === pass);
        if (!user) return showToast('Invalid email or password');
        if (loginRole === 'doctor'  && user.role !== 'doctor')  return showToast('This account is registered as a Patient');
        if (loginRole === 'patient' && user.role !== 'patient') return showToast('This account is registered as a Doctor');
        localStorage.setItem('tabibi_user', JSON.stringify(user));
        showToast('Welcome back (Offline), ' + user.name + '!');
        onClose();
        if (window.onUserLogin) window.onUserLogin();
        else window.location.reload();
    };

    const doLogin = () => {
        const email = loginEmail.trim();
        const pass  = loginPassword;

        // Diagnostic log — visible in browser DevTools console
        console.log('[Tabibi Auth] doLogin called with:', { email, hasPassword: !!pass, role: loginRole });

        if (!email) return showToast('Please enter your email');
        if (!pass)  return showToast('Please enter your password');
        
        const loginData = { email, password: pass };
        axios.post('/api/auth/login', loginData)
        .then(response => {
            const backendUser = response.data;
            
            // Check if the selected login role matches the user's actual role
            if (loginRole === 'doctor' && backendUser.role !== 'doctor') {
                return showToast('This account is registered as a Patient');
            }
            if (loginRole === 'patient' && backendUser.role !== 'patient') {
                return showToast('This account is registered as a Doctor');
            }

            const users = JSON.parse(localStorage.getItem('tabibi_users') || '[]');
            const localUser = users.find(u => u.email === email) || {};
            const fullUser = {
                ...localUser,
                ...backendUser,
                id: backendUser.role === 'doctor' ? (backendUser.doctorId || backendUser._id) : backendUser._id,
                _id: backendUser.role === 'doctor' ? (backendUser.doctorId || backendUser._id) : backendUser._id,
                userId: backendUser._id,
                token: backendUser.token,
                available: backendUser.role === 'doctor' ? (localUser.available !== false) : undefined
            };
            localStorage.setItem('tabibi_user', JSON.stringify(fullUser));
            TabibiAPI.trackSession(fullUser, 'LOGIN_SUCCESS');
            
            const idx = users.findIndex(u => u.email === email);
            if (idx > -1) {
                users[idx] = fullUser;
            } else {
                users.push(fullUser);
            }
            localStorage.setItem('tabibi_users', JSON.stringify(users));

            showToast('Welcome back, ' + fullUser.name + '!');
            onClose();
            if (window.onUserLogin) window.onUserLogin();
            else window.location.reload();
        })
        .catch(err => {
            if (!err.response) {
                // Backend completely offline
                loginLocally(email, pass);
            } else {
                const errMsg = err.response?.data?.message || 'Invalid email or password';
                showToast(errMsg);
            }
        });
    };

    const registerLocally = (regData) => {
        const users = JSON.parse(localStorage.getItem('tabibi_users') || '[]');
        if (users.find(u => u.email === regData.email)) return showToast('Email already registered');
        const user = {
            id: Date.now(),
            ...regData,
            img: profilePic || `https://ui-avatars.com/api/?name=${encodeURIComponent(regData.name)}&background=5F6FFF&color=fff&size=300`,
            available: regData.role === 'doctor',
        };
        users.push(user);
        localStorage.setItem('tabibi_users', JSON.stringify(users));
        localStorage.setItem('tabibi_user', JSON.stringify(user));

        const deleted = JSON.parse(localStorage.getItem('tabibi_deleted_doctors') || '[]');
        if (deleted.includes(regData.email)) {
            localStorage.setItem('tabibi_deleted_doctors', JSON.stringify(deleted.filter(e => e !== regData.email)));
        }

        showToast('Account created (Offline)! Welcome, ' + regData.name);
        onClose();
        if (window.onUserLogin) window.onUserLogin();
        else window.location.reload();
    };

    const doRegister = () => {
        // Read from React state — no DOM querying
        const name  = regName.trim();
        const email = regEmail.trim();
        const dob   = regDob;
        const pass  = regPassword;

        // Diagnostic log — visible in browser DevTools console and Railway logs
        const formSnapshot = { name, email, dob, hasPassword: !!pass, role: registerRole };
        console.log('[Tabibi Auth] doRegister called with:', formSnapshot);

        // Field-specific validation so the user knows exactly what is missing
        if (!name)  return showToast('Please enter your full name');
        if (!email) return showToast('Please enter your email address');
        if (!dob)   return showToast('Please select your date of birth');
        if (!pass)  return showToast('Please enter a password');
        if (pass.length < 8) return showToast('Password must be at least 8 characters');

        if (registerRole === 'doctor') {
            if (!regDoctorCode || regDoctorCode.trim().toUpperCase() !== 'TABIBI-DOC-2026')
                return showToast('Invalid doctor access code');
            if (!regClinicAddress.trim())
                return showToast('Clinic address is required');
        }
        
        const regData = {
            name,
            email,
            password: pass,
            role: registerRole,
            dob,
            specialty: registerRole === 'doctor' ? regSpecialty : '',
            fee: registerRole === 'doctor' ? parseFloat(regFee) || 50 : 0,
            experience: registerRole === 'doctor' ? parseInt(regExperience, 10) || 0 : 0,
            clinicAddress: registerRole === 'doctor' ? regClinicAddress.trim() : '',
        };

        axios.post('/api/auth/register', regData)
        .then(response => {
            const backendUser = response.data;
            const fullUser = {
                ...regData,
                ...backendUser,
                id: backendUser.role === 'doctor' ? (backendUser.doctorId || backendUser._id) : backendUser._id,
                _id: backendUser.role === 'doctor' ? (backendUser.doctorId || backendUser._id) : backendUser._id,
                userId: backendUser._id,
                token: backendUser.token,
                available: regData.role === 'doctor'
            };
            localStorage.setItem('tabibi_user', JSON.stringify(fullUser));
            TabibiAPI.trackSession(fullUser, 'SIGNUP_SUCCESS');
            
            const users = JSON.parse(localStorage.getItem('tabibi_users') || '[]');
            const idx = users.findIndex(u => u.email === email);
            if (idx > -1) {
                users[idx] = fullUser;
            } else {
                users.push(fullUser);
            }
            localStorage.setItem('tabibi_users', JSON.stringify(users));

            const deleted = JSON.parse(localStorage.getItem('tabibi_deleted_doctors') || '[]');
            if (deleted.includes(email)) {
                localStorage.setItem('tabibi_deleted_doctors', JSON.stringify(deleted.filter(e => e !== email)));
            }

            showToast('Account created! Welcome, ' + name);
            onClose();
            if (window.onUserLogin) window.onUserLogin();
            else window.location.reload();
        })
        .catch(err => {
            if (!err.response) {
                // Backend completely offline
                registerLocally(regData);
            } else {
                const errMsg = err.response?.data?.message || 'Registration failed';
                showToast(errMsg);
            }
        });
    };

    return (
        <div className="modal-overlay show" id="authModal" onClick={(e) => e.target.id === 'authModal' && onClose()}>
            <div className="modal">
                <button className="modal-close" onClick={onClose}>×</button>
                {mode === 'login' ? (
                    <div id="loginForm">
                        <h2>Login</h2>
                        <p>Please login to book appointment</p>
                        <label style={{ fontWeight: 'normal', textTransform: 'none', marginBottom: '8px', display: 'block', fontSize: '14px', color: 'var(--gray)' }}>Login as:</label>
                        <div className="role-selector">
                            <div className={`role-option${loginRole === 'patient' ? ' selected' : ''}`} onClick={() => setLoginRole('patient')}>
                                <span className="icon"><i className="fas fa-user"></i></span>Patient
                            </div>
                            <div className={`role-option${loginRole === 'doctor' ? ' selected' : ''}`} onClick={() => setLoginRole('doctor')}>
                                <span className="icon"><i className="fas fa-stethoscope"></i></span>Doctor
                            </div>
                        </div>
                        <label>Email</label>
                        <input type="email" id="loginEmail" placeholder="Your email"
                            value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                        <label>Password</label>
                        <input type="password" id="loginPassword" placeholder="Password"
                            value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
                        <button className="btn-primary" onClick={doLogin}>Login</button>
                        <p className="switch">Don't have an account? <a onClick={() => onSwitch('register')}>Sign up here</a></p>
                    </div>
                ) : (
                    <div id="registerForm">
                        <h2>Create Account</h2>
                        <p>Please sign up to book appointment</p>
                        <label style={{ fontWeight: 'normal', textTransform: 'none', marginBottom: '8px', display: 'block', fontSize: '14px', color: 'var(--gray)' }}>Register as:</label>
                        <div className="role-selector">
                            <div className={`role-option${registerRole === 'patient' ? ' selected' : ''}`} onClick={() => setRegisterRole('patient')}>
                                <span className="icon"><i className="fas fa-user"></i></span>Patient
                            </div>
                            <div className={`role-option${registerRole === 'doctor' ? ' selected' : ''}`} onClick={() => setRegisterRole('doctor')}>
                                <span className="icon"><i className="fas fa-stethoscope"></i></span>Doctor
                            </div>
                        </div>
                        <div className="profile-upload-wrap">
                            <div className="profile-preview" onClick={() => document.getElementById('profilePicInput').click()}
                                style={profilePic ? { backgroundImage: `url(${profilePic})` } : {}}>
                                {!profilePic && <i className="fas fa-camera"></i>}
                            </div>
                            <label onClick={() => document.getElementById('profilePicInput').click()}>Upload Photo</label>
                            <input type="file" id="profilePicInput" accept="image/*" style={{ display: 'none' }} onChange={handleProfilePic} />
                        </div>
                        <div className="form-grid-2">
                            <div><label>Full Name</label>
                                <input type="text" id="regName" placeholder="Name"
                                    value={regName} onChange={(e) => setRegName(e.target.value)} /></div>
                            <div><label>Email</label>
                                <input type="email" id="regEmail" placeholder="Your email"
                                    value={regEmail} onChange={(e) => setRegEmail(e.target.value)} /></div>
                        </div>
                        <div className="form-grid-2">
                            <div><label>Date of Birth</label>
                                <input type="date" id="regDob"
                                    value={regDob} onChange={(e) => setRegDob(e.target.value)} /></div>
                            <div><label>Password</label>
                                <input type="password" id="regPassword" placeholder="Min 6 chars"
                                    value={regPassword} onChange={(e) => setRegPassword(e.target.value)} /></div>
                        </div>
                        {registerRole === 'doctor' && (
                            <div style={{ background: 'var(--primary-light)', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
                                <div className="form-grid-2">
                                    <div>
                                        <label>Specialty</label>
                                        <select id="regSpecialty" value={regSpecialty}
                                            onChange={(e) => setRegSpecialty(e.target.value)}>
                                            <option>General physician</option><option>Gynecologist</option><option>Dermatologist</option>
                                            <option>Pediatricians</option><option>Neurologist</option><option>Gastroenterologist</option>
                                            <option>Dentist</option>
                                        </select>
                                    </div>
                                    <div><label>Experience</label>
                                        <input type="text" id="regExperience" placeholder="e.g. 3 Years"
                                            value={regExperience} onChange={(e) => setRegExperience(e.target.value)} /></div>
                                </div>
                                <div className="form-grid-2">
                                    <div><label>Consultation Fee ($)</label>
                                        <input type="number" id="regFee" placeholder="50"
                                            value={regFee} onChange={(e) => setRegFee(e.target.value)} /></div>
                                    <div><label>Clinic Address</label>
                                        <input type="text" id="regClinicAddress" placeholder="e.g. 12 El-Galaa St, Cairo"
                                            value={regClinicAddress} onChange={(e) => setRegClinicAddress(e.target.value)} /></div>
                                </div>
                                <div style={{ marginTop: '12px' }}>
                                    <label>Access Code</label>
                                    <input type="text" id="regDoctorCode" placeholder="Enter access code"
                                        value={regDoctorCode} onChange={(e) => setRegDoctorCode(e.target.value)} />
                                </div>
                            </div>
                        )}
                        <button className="btn-primary" onClick={doRegister}>Create account</button>
                        <p className="switch">Already have an account? <a onClick={() => onSwitch('login')}>Login here</a></p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AuthModal;
