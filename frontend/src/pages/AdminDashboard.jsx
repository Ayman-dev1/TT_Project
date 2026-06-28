import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabibiAPI } from '../utils/TabibiAPI';
import axios from 'axios';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const securityLayerUrl = import.meta.env.VITE_SECURITY_LAYER_URL || '/soc';
    const [securityFrameNonce, setSecurityFrameNonce] = useState(() => Date.now());
    const [currentUser, setCurrentUser] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard');
    const [cachedDocs, setCachedDocs] = useState([]);

    // Stats & Data
    const [stats, setStats] = useState({ totalAppointments: 0, totalDoctors: 0, totalPatients: 0, revenue: 0 });
    const [appointments, setAppointments] = useState([]);
    const [patients, setPatients] = useState([]);
    const [logs, setLogs] = useState([]);
    const [reviews, setReviews] = useState([]);
    const [heroSlides, setHeroSlides] = useState([]);
    
    // Search / Filters
    const [apptSearch, setApptSearch] = useState('');
    const [docSearch, setDocSearch] = useState('');
    const [patientSearch, setPatientSearch] = useState('');
    const [paymentFilter, setPaymentFilter] = useState('all');
    // Payment Approval/Rejection Modal States
    const [paymentModalType, setPaymentModalType] = useState(''); // 'approve', 'reject', or ''
    const [selectedPaymentAppt, setSelectedPaymentAppt] = useState(null);
    const [rejectionReasonSelect, setRejectionReasonSelect] = useState('Invalid Transaction Reference');
    const [customRejectionReason, setCustomRejectionReason] = useState('');
    
    // Broadcast State
    const [broadcastMsg, setBroadcastMsg] = useState('');
    const [broadcastType, setBroadcastType] = useState('info');

    // Add Doctor Form State
    const [addName, setAddName] = useState('');
    const [addEmail, setAddEmail] = useState('');
    const [addPass, setAddPass] = useState('');
    const [addSpec, setAddSpec] = useState('General physician');
    const [addFee, setAddFee] = useState('50');
    const [addExp, setAddExp] = useState('');
    const [addDeg, setAddDeg] = useState('');
    const [addAbout, setAddAbout] = useState('');
    const [addClinicAddress, setAddClinicAddress] = useState('');
    const [newDocImage, setNewDocImage] = useState(null);

    // Edit Doctor Modal State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editDocData, setEditDocData] = useState({
        id: '',
        emailOrig: '',
        name: '',
        email: '',
        specialty: 'General physician',
        fee: 50,
        degree: '',
        experience: '',
        about: '',
        clinicAddress: '',
        available: true,
        img: null
    });
    const [editDocImage, setEditDocImage] = useState(null);

    // Initial Authentication Check
    useEffect(() => {
        const user = TabibiAPI.getUser();
        if (!user || !user.isAdmin) {
            navigate('/admin/login');
        } else {
            setCurrentUser(user);
            loadData();
        }
    }, [navigate]);

    const normalizeDoctor = (d) => {
        const userIdObj = d.userId && typeof d.userId === 'object' ? d.userId : {};
        return {
            id: d._id || d.id,
            _id: d._id || d.id,
            name: userIdObj.name || d.name || 'Unknown Doctor',
            email: userIdObj.email || d.email || '',
            img: TabibiAPI.getDoctorImage(userIdObj.email || d.email, userIdObj.image || d.image || d.img, `https://ui-avatars.com/api/?name=${encodeURIComponent(userIdObj.name || d.name || 'Doc')}&background=EAEFFF&color=5F6FFF&size=300`),
            specialty: d.specialty || 'General physician',
            fee: d.fee || 50,
            experience: typeof d.experience === 'number' ? `${d.experience} Years` : (d.experience || '0 Years'),
            degree: d.degree || 'MBBS',
            about: d.about || '',
            clinicAddress: d.clinicAddress || 'Main Clinic',
            available: d.available !== false
        };
    };

    const normalizeAppointment = (a) => {
        let doctorName = 'Unknown Doctor';
        if (a.doctorId && typeof a.doctorId === 'object') {
            if (a.doctorId.userId && typeof a.doctorId.userId === 'object') {
                doctorName = a.doctorId.userId.name || doctorName;
            } else if (a.doctorId.name) {
                doctorName = a.doctorId.name;
            }
        } else if (a.doctorName) {
            doctorName = a.doctorName;
        }

        let userEmail = '';
        let patientName = 'Patient';
        if (a.patientId && typeof a.patientId === 'object') {
            userEmail = a.patientId.email || '';
            patientName = a.patientId.name || patientName;
        } else if (a.userEmail) {
            userEmail = a.userEmail;
            patientName = a.userName || patientName;
        }

        const paymentMethod = a.paymentMethod || a.payment || 'cash';
        const paymentStatus = a.paymentStatus || (a.status === 'confirmed' || a.status === 'Confirmed' ? 'Paid' : 'Pending');

        return {
            id: a._id || a.id,
            _id: a._id || a.id,
            doctorName,
            userEmail,
            patientName,
            day: a.slotDate || a.day || a.date || '',
            time: a.slotTime || a.time || '',
            fee: a.amount !== undefined ? a.amount : (a.fee || 0),
            status: a.status || 'Confirmed',
            paymentMethod,
            paymentStatus,
            transactionRef: a.transactionRef || '',
            rejectionReason: a.rejectionReason || '',
            paymentDate: a.paymentDate || null
        };
    };

    const loadData = async () => {
        const token = TabibiAPI.getToken();
        const headers = { Authorization: `Bearer ${token}` };

        // 1. Fetch Stats
        let backendStats = null;
        try {
            const statsRes = await axios.get('/api/admin/stats', { headers });
            backendStats = statsRes.data;
        } catch (err) {
            console.error("Failed to fetch admin stats from backend:", err);
        }

        // 2. Fetch Appointments
        let backendAppts = [];
        try {
            const apptsRes = await axios.get('/api/admin/appointments', { headers });
            backendAppts = Array.isArray(apptsRes.data) ? apptsRes.data : [];
        } catch (err) {
            console.error("Failed to fetch appointments from backend:", err);
        }

        // 3. Fetch Doctors
        let backendDocs = [];
        try {
            const docsRes = await axios.get('/api/admin/doctors', { headers });
            backendDocs = Array.isArray(docsRes.data) ? docsRes.data : [];
        } catch (err) {
            console.error("Failed to fetch doctors from backend:", err);
        }

        // 4. Fetch Patients
        let backendPatients = [];
        try {
            const patientsRes = await axios.get('/api/admin/patients', { headers });
            backendPatients = Array.isArray(patientsRes.data) ? patientsRes.data : [];
        } catch (err) {
            console.error("Failed to fetch patients from backend:", err);
        }

        // 5. Fetch Session Logs
        let backendLogs = [];
        try {
            const logsRes = await axios.get('/api/activity-logs');
            backendLogs = Array.isArray(logsRes.data) ? logsRes.data : [];
        } catch (err) {
            console.error("Failed to fetch activity logs from backend:", err);
        }

        // --- MERGE WITH LOCAL STORAGE FALLBACKS ---

        // Local lists for fallback
        const localDocs = TabibiAPI.getDoctors();
        const localAppts = TabibiAPI.getAppointments().filter(a => a.status !== 'cancelled');
        const localUsers = TabibiAPI.getAllUsers();
        const localPatients = localUsers.filter(u => u.role === 'patient');
        const localStats = TabibiAPI.getStats();
        const localLogs = TabibiAPI.getLogs();

        // Doctors list merge
        let finalDocs = [];
        if (backendDocs.length > 0) {
            finalDocs = backendDocs.map(normalizeDoctor);
        } else {
            finalDocs = localDocs;
        }
        setCachedDocs(finalDocs);

        // Appointments list merge
        let finalAppts = [];
        if (backendAppts.length > 0) {
            finalAppts = backendAppts.map(normalizeAppointment).filter(a => a.status !== 'cancelled');
        } else {
            finalAppts = localAppts;
        }
        setAppointments(finalAppts);

        // Patients list merge
        let finalPatients = [];
        if (backendPatients.length > 0) {
            finalPatients = backendPatients.map(p => ({
                id: p._id,
                _id: p._id,
                name: p.name,
                email: p.email,
                role: 'patient'
            }));
        } else {
            finalPatients = localPatients;
        }
        setPatients(finalPatients);

        // Stats merge
        if (backendStats) {
            setStats({
                totalDoctors: backendStats.totalDoctors || 0,
                totalPatients: backendStats.totalPatients || 0,
                totalAppointments: backendStats.totalAppointments || 0,
                revenue: backendStats.totalEarnings || backendStats.revenue || 0
            });
        } else {
            setStats(localStats);
        }

        // Logs merge
        if (backendLogs.length > 0) {
            setLogs(backendLogs);
        } else {
            setLogs(localLogs);
        }

        // Reviews load (kept locally as they have no backend table)
        const rawReviews = localStorage.getItem('tabibi_reviews');
        const reviewsList = [];
        try {
            const parsedReviews = rawReviews ? JSON.parse(rawReviews) : [];
            if (Array.isArray(parsedReviews)) {
                parsedReviews.forEach((r, idx) => {
                    const doc = finalDocs.find(d => String(d.id) === String(r.doctorId) || String(d._id) === String(r.doctorId));
                    const docName = doc ? doc.name : 'Unknown Doctor';
                    reviewsList.push({ ...r, docId: r.doctorId, docName, index: idx });
                });
            } else if (typeof parsedReviews === 'object' && parsedReviews !== null) {
                for (const docId in parsedReviews) {
                    const doc = finalDocs.find(d => String(d.id) === docId || String(d._id) === docId);
                    const docName = doc ? doc.name : 'Unknown Doctor';
                    if (Array.isArray(parsedReviews[docId])) {
                        parsedReviews[docId].forEach((r, idx) => {
                            reviewsList.push({ ...r, docId, docName, index: idx });
                        });
                    }
                }
            }
        } catch (e) {
            console.error("Error parsing reviews:", e);
        }
        setReviews(reviewsList);

        // Load Hero Slides
        const slides = TabibiAPI.getHeroSlides();
        setHeroSlides(slides);
        
        // Broadcast
        const bc = TabibiAPI.getBroadcast();
        if (bc) {
            setBroadcastMsg(bc.msg);
            setBroadcastType(bc.type);
        }
    };

    // Tab switcher helper
    const handleSwitchTab = (tab) => {
        setActiveTab(tab);
        if (tab === 'security-layer') {
            setSecurityFrameNonce(Date.now());
        }
        loadData();
    };

    useEffect(() => {
        const activeItem = document.querySelector(`[data-admin-tab="${activeTab}"]`);
        activeItem?.scrollIntoView({ block: 'nearest' });
    }, [activeTab]);

    // Logout
    const handleLogout = () => {
        TabibiAPI.logActivity('Admin Logout', `Admin logged out: ${currentUser?.email}`);
        TabibiAPI.logout();
    };

    // Cancellation
    const handleCancelAppointment = async (id) => {
        if (!window.confirm('Cancel this appointment permanently?')) return;

        let success = false;
        if (id && /^[a-f\d]{24}$/i.test(id)) {
            try {
                const token = TabibiAPI.getToken();
                await axios.patch('/api/appointments/cancel', { appointmentId: id }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                success = true;
            } catch (err) {
                console.error("Failed to cancel appointment on backend:", err);
            }
        }

        // Offline / Local fallback: update local storage
        const filtered = appointments.filter(a => a.id !== id && a._id !== id);
        TabibiAPI.saveAppointments(filtered);

        const target = appointments.find(a => a.id === id || a._id === id);
        if (target) {
            TabibiAPI.logActivity('Appointment Cancelled', `Admin cancelled booking for ${target.userEmail} with ${target.doctorName}`);
        }
        TabibiAPI.showToast('Appointment cancelled.');
        loadData();
    };

    // Edit Doctor
    const handleOpenEditDoctor = (doc) => {
        setEditDocData({
            id: doc.id || '',
            emailOrig: doc.email || '',
            name: doc.name || '',
            email: doc.email || '',
            specialty: doc.specialty || 'General physician',
            fee: doc.fee || 50,
            degree: doc.degree || '',
            experience: doc.experience || '',
            about: doc.about || '',
            clinicAddress: doc.clinicAddress || 'Main Clinic',
            available: doc.available !== false,
            img: doc.img || null
        });
        setEditDocImage(null);
        setEditModalOpen(true);
    };

    const handleEditDocPicChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await TabibiAPI.scanFile(file, 'Admin edit doctor photo');
        } catch (error) {
            TabibiAPI.showToast(error.message || 'Security scan blocked this image');
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            setEditDocImage(event.target.result);
        };
        reader.readAsDataURL(file);
    };

    const handleSaveEditedDoctor = async (e) => {
        e.preventDefault();
        const { id, emailOrig, name, email, specialty, fee, degree, experience, about, clinicAddress, available, img } = editDocData;
        if (!name || !email) {
            TabibiAPI.showToast('Name and Email are required.');
            return;
        }
        if (!clinicAddress || !clinicAddress.trim()) {
            TabibiAPI.showToast('Clinic address is required.');
            return;
        }

        const parsedExperience = parseInt(experience) || 0;

        let success = false;
        if (id && /^[a-f\d]{24}$/i.test(id)) {
            try {
                const token = TabibiAPI.getToken();
                await axios.patch(`/api/admin/doctors/${id}`, {
                    name,
                    email,
                    specialty,
                    fee: parseFloat(fee) || 50,
                    degree,
                    experience: parsedExperience,
                    about,
                    clinicAddress: clinicAddress.trim(),
                    available,
                    image: editDocImage || img
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                success = true;
            } catch (err) {
                console.error("Failed to update doctor on backend:", err);
            }
        }

        // Local storage update for both sync and fallback
        const origDoc = cachedDocs.find(d => d.email === emailOrig || d.id === id || d._id === id);
        const updatedFields = {
            name, email, specialty,
            fee: parseFloat(fee) || 50, degree, experience: parsedExperience + " Years",
            about, clinicAddress: clinicAddress.trim(), available,
            img: editDocImage || img
        };

        // 1. Update in tabibi_users if present
        const allUsers = TabibiAPI.getAllUsers();
        const userIdx = allUsers.findIndex(u => u.email === emailOrig);
        if (userIdx > -1) {
            allUsers[userIdx] = { ...allUsers[userIdx], ...updatedFields };
            localStorage.setItem('tabibi_users', JSON.stringify(allUsers));
        }

        // 2. Update extra doctors
        const extras = JSON.parse(localStorage.getItem('tabibi_extra_doctors') || '[]');
        const extraIdx = extras.findIndex(d => d.email === emailOrig || d.id === id || d._id === id);
        if (extraIdx > -1) {
            extras[extraIdx] = { ...extras[extraIdx], ...updatedFields };
        } else if (origDoc) {
            extras.push({ ...origDoc, ...updatedFields });
        }
        localStorage.setItem('tabibi_extra_doctors', JSON.stringify(extras));

        TabibiAPI.showToast(`✅ ${name}'s profile updated!`);
        setEditModalOpen(false);
        loadData();
    };

    const handleDeleteDoctor = async (id, email) => {
        if (!window.confirm(`Permanently remove doctor ${email} and their user account?`)) return;

        let success = false;
        if (id && /^[a-f\d]{24}$/i.test(id)) {
            try {
                const token = TabibiAPI.getToken();
                await axios.delete(`/api/admin/doctors/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                success = true;
            } catch (err) {
                console.error("Failed to delete doctor on backend:", err);
            }
        }

        // Local storage cleanup (sync/fallback)
        const allUsers = TabibiAPI.getAllUsers();
        localStorage.setItem('tabibi_users', JSON.stringify(allUsers.filter(u => u.email !== email)));

        const extras = JSON.parse(localStorage.getItem('tabibi_extra_doctors') || '[]');
        localStorage.setItem('tabibi_extra_doctors', JSON.stringify(extras.filter(d => d.email !== email)));

        const deleted = JSON.parse(localStorage.getItem('tabibi_deleted_doctors') || '[]');
        if (!deleted.includes(email)) {
            deleted.push(email);
            localStorage.setItem('tabibi_deleted_doctors', JSON.stringify(deleted));
        }

        TabibiAPI.logActivity('Doctor Deleted', `Admin removed doctor: ${email}`);
        TabibiAPI.showToast('Doctor account deleted.');
        loadData();
    };

    // Add Doctor Photo Preview
    const handleNewDocPicChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await TabibiAPI.scanFile(file, 'Admin add doctor photo');
        } catch (error) {
            TabibiAPI.showToast(error.message || 'Security scan blocked this image');
            e.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            setNewDocImage(event.target.result);
        };
        reader.readAsDataURL(file);
    };

    const handleAddDoctorSubmit = async (e) => {
        e.preventDefault();
        if (!addName || !addEmail || !addPass) {
            TabibiAPI.showToast('Name, Email and Password are required.');
            return;
        }
        if (!addClinicAddress || !addClinicAddress.trim()) {
            TabibiAPI.showToast('Clinic address is required.');
            return;
        }

        const parsedExperience = parseInt(addExp) || 0;
        const defaultImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(addName)}&background=EAEFFF&color=5F6FFF&size=300`;

        let success = false;
        try {
            await axios.post('/api/auth/register', {
                name: addName,
                email: addEmail,
                password: addPass,
                role: 'doctor',
                specialty: addSpec,
                fee: parseFloat(addFee) || 50,
                experience: parsedExperience,
                degree: addDeg,
                about: addAbout || `Dr. ${addName} is a specialist in ${addSpec}.`,
                clinicAddress: addClinicAddress.trim(),
                image: newDocImage || defaultImage
            });
            success = true;
        } catch (err) {
            console.error("Failed to register doctor on backend:", err);
            TabibiAPI.showToast("Server registration failed, registered locally.");
        }

        // Local storage update (sync/fallback)
        const allUsers = TabibiAPI.getAllUsers();
        const newDocId = Date.now();
        const docObj = {
            id: newDocId,
            name: addName,
            email: addEmail,
            password: addPass,
            role: 'doctor',
            img: newDocImage || defaultImage,
            specialty: addSpec,
            fee: parseFloat(addFee),
            experience: parsedExperience + " Years",
            degree: addDeg,
            about: addAbout || `Dr. ${addName} is a specialist in ${addSpec}.`,
            clinicAddress: addClinicAddress.trim(),
            available: true
        };

        allUsers.push(docObj);
        localStorage.setItem('tabibi_users', JSON.stringify(allUsers));

        const extras = JSON.parse(localStorage.getItem('tabibi_extra_doctors') || '[]');
        extras.push(docObj);
        localStorage.setItem('tabibi_extra_doctors', JSON.stringify(extras));

        const deleted = JSON.parse(localStorage.getItem('tabibi_deleted_doctors') || '[]');
        if (deleted.includes(addEmail)) {
            localStorage.setItem('tabibi_deleted_doctors', JSON.stringify(deleted.filter(e => e !== addEmail)));
        }

        TabibiAPI.showToast('Doctor registered successfully!');
        
        // Reset
        setAddName('');
        setAddEmail('');
        setAddPass('');
        setAddSpec('General physician');
        setAddFee('50');
        setAddExp('');
        setAddDeg('');
        setAddAbout('');
        setAddClinicAddress('');
        setNewDocImage(null);
        handleSwitchTab('doctors');
    };

    // Delete Patient Account
    const handleDeletePatient = async (id, email) => {
        if (!window.confirm(`Delete patient account for ${email}?`)) return;

        let success = false;
        if (id && /^[a-f\d]{24}$/i.test(id)) {
            try {
                const token = TabibiAPI.getToken();
                await axios.delete(`/api/admin/patients/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                success = true;
            } catch (err) {
                console.error("Failed to delete patient from backend:", err);
            }
        }

        // Local storage cleanup (sync/fallback)
        const allUsers = TabibiAPI.getAllUsers();
        localStorage.setItem('tabibi_users', JSON.stringify(allUsers.filter(u => u.email !== email)));
        
        TabibiAPI.logActivity('Patient Deleted', `Admin removed patient: ${email}`);
        TabibiAPI.showToast('User account removed.');
        loadData();
    };

    // Review Actions
    const handleDeleteReview = (reviewId, docId, index) => {
        if (!window.confirm('Delete this review permanently?')) return;
        const rawReviews = localStorage.getItem('tabibi_reviews');
        if (!rawReviews) return;

        try {
            const parsedReviews = JSON.parse(rawReviews);
            if (Array.isArray(parsedReviews)) {
                const filtered = parsedReviews.filter(r => r.id !== reviewId);
                localStorage.setItem('tabibi_reviews', JSON.stringify(filtered));
            } else if (typeof parsedReviews === 'object' && parsedReviews !== null) {
                if (parsedReviews[docId] && Array.isArray(parsedReviews[docId])) {
                    parsedReviews[docId].splice(index, 1);
                    localStorage.setItem('tabibi_reviews', JSON.stringify(parsedReviews));
                }
            }
            TabibiAPI.showToast('Review deleted.');
            loadData();
        } catch (e) {
            console.error("Error deleting review:", e);
            TabibiAPI.showToast('Failed to delete review.');
        }
    };

    // Hero management
    const handleAddHeroSlide = () => {
        const title = prompt('Slide Title:', 'Book Appointment With 100+ Trusted Doctors');
        const sub = prompt('Slide Subtitle:', 'Schedule your appointment hassle-free.');
        const img = prompt('Image URL (or keep default):', '/assets/images/HOME/CTA.png');
        if (!title) return;

        const slides = TabibiAPI.getHeroSlides();
        slides.push({ title, subtitle: sub, img });
        TabibiAPI.saveHeroSlides(slides);
        TabibiAPI.showToast('Slide added.');
        loadData();
    };

    const handleDeleteHeroSlide = (idx) => {
        const slides = TabibiAPI.getHeroSlides();
        slides.splice(idx, 1);
        TabibiAPI.saveHeroSlides(slides);
        TabibiAPI.showToast('Slide removed.');
        loadData();
    };

    // Broadcast panel
    const handleSendBroadcast = () => {
        if (!broadcastMsg.trim()) {
            alert('Please enter a message');
            return;
        }
        TabibiAPI.saveBroadcast(broadcastMsg, broadcastType);
        TabibiAPI.showToast('Broadcast sent successfully!');
        TabibiAPI.logActivity('Broadcast Sent', broadcastMsg.substring(0, 30) + '...');
    };

    const handleClearBroadcast = () => {
        TabibiAPI.clearBroadcast();
        setBroadcastMsg('');
        TabibiAPI.showToast('Broadcast cleared.');
    };

    // Clear activity logs
    const handleClearAuthLogs = () => {
        if (!window.confirm('Clear all session logs? This cannot be undone.')) return;
        TabibiAPI.clearAuthLogs();
        TabibiAPI.showToast('Auth logs cleared.');
        loadData();
    };

    // Rendering content based on tabs
    const renderOverview = () => {
        const recentAppts = appointments.slice(-5).reverse();
        return (
            <div>
                <div className="stats-grid">
                    <div className="stat-tile">
                        <div className="stat-icon" style={{ background: '#EBF5FF', color: '#3B82F6' }}><i className="fas fa-user-md"></i></div>
                        <div><span className="val">{stats.totalDoctors}</span><span className="lbl">Total Doctors</span></div>
                    </div>
                    <div className="stat-tile">
                        <div className="stat-icon" style={{ background: '#F0FDF4', color: '#22C55E' }}><i className="fas fa-calendar-check"></i></div>
                        <div><span className="val">{stats.totalAppointments}</span><span className="lbl">Total Bookings</span></div>
                    </div>
                    <div className="stat-tile">
                        <div className="stat-icon" style={{ background: '#FFFBEB', color: '#F59E0B' }}><i className="fas fa-users"></i></div>
                        <div><span className="val">{stats.totalPatients}</span><span className="lbl">Total Patients</span></div>
                    </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                    <div className="data-card">
                        <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>Recently Booked Appointments</h3>
                        {recentAppts.length ? recentAppts.map((a) => (
                            <div key={a.id || a._id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderBottom: '1px solid #F1F5F9' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
                                    {a.doctorName?.charAt(0) || 'D'}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '600', color: 'var(--dark)' }}>{a.doctorName}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--gray)' }}>Patient: {a.userEmail} &bull; {a.day} at {a.time}</div>
                                </div>
                                <button className="btn-action-icon del" onClick={() => handleCancelAppointment(a.id || a._id)}><i className="fas fa-trash-alt"></i></button>
                            </div>
                        )) : <p style={{ color: 'var(--gray)', padding: '20px', textAlign: 'center' }}>No bookings found yet.</p>}
                    </div>
                    
                    <div className="data-card">
                        <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>Recent Security Activity</h3>
                        <div style={{ fontSize: '13px' }}>
                            {logs.length ? logs.slice(0, 8).map((l) => {
                                const isLogin = l.message?.toLowerCase().includes('login') || l.type?.toLowerCase().includes('login');
                                const isMissingSpecialty = l.type?.toLowerCase().includes('missing');
                                let iconColor = '#E11D48';
                                let iconClass = 'fa-sign-out-alt';
                                if (isLogin) {
                                    iconColor = '#22C55E';
                                    iconClass = 'fa-sign-in-alt';
                                } else if (isMissingSpecialty) {
                                    iconColor = '#F59E0B';
                                    iconClass = 'fa-exclamation-triangle';
                                }
                                return (
                                    <div key={l.id} style={{ padding: '10px 0', borderBottom: '1px dashed #eee', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                        <div style={{ color: iconColor, marginTop: '2px' }}>
                                            <i className={`fas ${iconClass}`}></i>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: '600', color: 'var(--dark)' }}>{l.type || 'Activity'}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--light-gray)' }}>
                                                {new Date(l.timestamp).toLocaleTimeString()} &bull; {l.message}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : <p style={{ color: 'var(--gray)', textAlign: 'center' }}>No session activity logged.</p>}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderAppointments = () => {
        const filtered = appointments.filter(a => 
            a.doctorName?.toLowerCase().includes(apptSearch.toLowerCase()) || 
            (a.userEmail || '').toLowerCase().includes(apptSearch.toLowerCase())
        );
        return (
            <div>
                <div className="search-wrap">
                    <i className="fas fa-search"></i>
                    <input 
                        type="text" 
                        placeholder="Search by patient or doctor name..." 
                        value={apptSearch}
                        onChange={(e) => setApptSearch(e.target.value)}
                    />
                </div>
                <div className="data-card">
                    {!filtered.length ? (
                        <p style={{ padding: '40px', textAlign: 'center', color: 'var(--gray)' }}>No appointments match your search.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #F1F5F9', color: 'var(--gray)', fontSize: '13px', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '16px' }}>Date & Time</th>
                                        <th style={{ padding: '16px' }}>Patient</th>
                                        <th style={{ padding: '16px' }}>Doctor</th>
                                        <th style={{ padding: '16px' }}>Fee</th>
                                        <th style={{ padding: '16px' }}>Status</th>
                                        <th style={{ padding: '16px' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(a => (
                                        <tr key={a.id || a._id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '16px', fontWeight: '600' }}>
                                                {a.day} <span style={{ display: 'block', color: 'var(--gray)', fontWeight: '400', fontSize: '12px' }}>{a.time}</span>
                                            </td>
                                            <td style={{ padding: '16px' }}>{a.userEmail}</td>
                                            <td style={{ padding: '16px' }}>{a.doctorName}</td>
                                            <td style={{ padding: '16px', fontWeight: '700', color: 'var(--primary)' }}>${a.fee}</td>
                                            <td style={{ padding: '16px' }}>
                                                <span style={{ background: '#F0FDF4', color: '#22C55E', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                                                    Confirmed
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                <button className="btn-action-icon del" onClick={() => handleCancelAppointment(a.id || a._id)}><i className="fas fa-times"></i></button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderDoctors = () => {
        const filtered = cachedDocs.filter(d =>
            d.name?.toLowerCase().includes(docSearch.toLowerCase()) ||
            d.specialty?.toLowerCase().includes(docSearch.toLowerCase()) ||
            d.email?.toLowerCase().includes(docSearch.toLowerCase())
        );
        return (
            <div>
                <div className="search-wrap">
                    <i className="fas fa-search"></i>
                    <input 
                        type="text" 
                        placeholder="Find a doctor by name, specialty, or email..." 
                        value={docSearch}
                        onChange={(e) => setDocSearch(e.target.value)}
                    />
                </div>
                <div className="doc-grid">
                    {filtered.map(d => (
                        <div className="doc-admin-card" key={d.id || d.email}>
                            <img 
                                src={d.img} 
                                className="doc-admin-img" 
                                alt={d.name}
                                onError={(e) => { e.target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name)}&background=EAEFFF&color=5F6FFF&size=300`; }}
                            />
                            <div className="doc-admin-info" style={{ flex: 1 }}>
                                <h3>{d.name}</h3>
                                <p>{d.specialty} &bull; <span style={{ color: d.available ? '#22C55E' : '#EF4444', fontWeight: '600' }}>{d.available ? '● Available' : '● Unavailable'}</span></p>
                                <div className="action-row">
                                    <button className="btn-action-icon" title="Edit Doctor" onClick={() => handleOpenEditDoctor(d)}><i className="fas fa-edit"></i></button>
                                    <button className="btn-action-icon del" title="Delete Doctor" onClick={() => handleDeleteDoctor(d.id || d._id, d.email)}><i className="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderAddDoctor = () => {
        return (
            <div className="data-card form-section">
                <form onSubmit={handleAddDoctorSubmit}>
                    <div style={{ display: 'flex', gap: '32px', marginBottom: '32px', alignItems: 'center' }}>
                        <div 
                            style={{ 
                                width: '120px', 
                                height: '120px', 
                                borderRadius: '24px', 
                                background: '#F1F5F9', 
                                border: '2px dashed #CBD5E1', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                cursor: 'pointer', 
                                backgroundImage: newDocImage ? `url(${newDocImage})` : 'none',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center'
                            }} 
                            onClick={() => document.getElementById('new-doc-pic').click()}
                        >
                            {!newDocImage && <i className="fas fa-camera" style={{ fontSize: '24px', color: '#94A3B8' }}></i>}
                        </div>
                        <div>
                            <h3 style={{ margin: 0 }}>Doctor Profile Image</h3>
                            <p style={{ color: 'var(--gray)', fontSize: '14px' }}>Recommended: Square image, max 2MB</p>
                            <button type="button" className="btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => document.getElementById('new-doc-pic').click()}>Choose File</button>
                            <input 
                                type="file" 
                                id="new-doc-pic" 
                                accept="image/*"
                                style={{ display: 'none' }} 
                                onChange={handleNewDocPicChange}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-ctrl"><label>Full Name</label><input type="text" placeholder="Dr. John Doe" value={addName} onChange={e => setAddName(e.target.value)} required /></div>
                        <div className="form-ctrl"><label>Email Address</label><input type="email" placeholder="john@tabibi.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} required /></div>
                    </div>
                    <div className="form-row">
                        <div className="form-ctrl">
                            <label>Specialty</label>
                            <select value={addSpec} onChange={e => setAddSpec(e.target.value)}>
                                <option>General physician</option>
                                <option>Gynecologist</option>
                                <option>Dermatologist</option>
                                <option>Pediatricians</option>
                                <option>Neurologist</option>
                                <option>Gastroenterologist</option>
                                <option>Dentist</option>
                            </select>
                        </div>
                        <div className="form-ctrl"><label>Consultation Fee ($)</label><input type="number" value={addFee} onChange={e => setAddFee(e.target.value)} /></div>
                    </div>
                    <div className="form-row">
                        <div className="form-ctrl"><label>Education / Degree</label><input type="text" placeholder="MBBS, MD" value={addDeg} onChange={e => setAddDeg(e.target.value)} /></div>
                        <div className="form-ctrl"><label>Experience (Years)</label><input type="text" placeholder="5 Years" value={addExp} onChange={e => setAddExp(e.target.value)} /></div>
                    </div>
                    <div className="form-row">
                        <div className="form-ctrl"><label>Clinic Address</label><input type="text" placeholder="e.g. 12 El-Galaa St, Cairo" value={addClinicAddress} onChange={e => setAddClinicAddress(e.target.value)} required /></div>
                        <div className="form-ctrl"><label>Create Password</label><input type="password" placeholder="••••••••" value={addPass} onChange={e => setAddPass(e.target.value)} required /></div>
                    </div>
                    <div className="form-ctrl" style={{ marginBottom: '32px' }}><label>Biography / About</label><textarea style={{ height: '100px' }} placeholder="Describe the doctor's expertise..." value={addAbout} onChange={e => setAddAbout(e.target.value)}></textarea></div>
                    
                    <button type="submit" className="btn-primary" style={{ width: '100%', padding: '16px', borderRadius: '14px' }}>Register Doctor Account</button>
                </form>
            </div>
        );
    };

    const renderPatients = () => {
        const filtered = patients.filter(u => 
            u.name?.toLowerCase().includes(patientSearch.toLowerCase()) || 
            u.email?.toLowerCase().includes(patientSearch.toLowerCase())
        );
        return (
            <div>
                <div className="search-wrap">
                    <i className="fas fa-search"></i>
                    <input 
                        type="text" 
                        placeholder="Search patients..." 
                        value={patientSearch}
                        onChange={(e) => setPatientSearch(e.target.value)}
                    />
                </div>
                <div className="data-card">
                    {!filtered.length ? (
                        <p style={{ padding: '40px', textAlign: 'center', color: 'var(--gray)' }}>No patients found.</p>
                    ) : filtered.map(u => (
                        <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderBottom: '1px solid #F1F5F9' }}>
                            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#F1F5F9', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700' }}>
                                {u.name?.charAt(0) || 'P'}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '600', color: 'var(--dark)' }}>{u.name}</div>
                                <div style={{ fontSize: '13px', color: 'var(--gray)' }}>{u.email} &bull; Joined: {new Date(u.id || Date.now()).toLocaleDateString()}</div>
                            </div>
                            <div className="action-row">
                                <button className="btn-action-icon del" onClick={() => handleDeletePatient(u.id || u._id, u.email)}><i className="fas fa-user-minus"></i></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const openApproveModal = (appt) => {
        setSelectedPaymentAppt(appt);
        setPaymentModalType('approve');
    };

    const openRejectModal = (appt) => {
        setSelectedPaymentAppt(appt);
        setPaymentModalType('reject');
        setRejectionReasonSelect('Invalid Transaction Reference');
        setCustomRejectionReason('');
    };

    const executeApprovePayment = async () => {
        if (!selectedPaymentAppt) return;
        const apptId = selectedPaymentAppt.id || selectedPaymentAppt._id;
        const token = TabibiAPI.getToken();
        const isBackendId = /^[a-f\d]{24}$/i.test(String(apptId));
        
        try {
            if (token && isBackendId) {
                await axios.patch(`/api/admin/appointments/${apptId}/payment`, {
                    paymentStatus: 'Paid'
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                TabibiAPI.showToast("Payment approved successfully!");
            } else {
                // Offline fallback
                TabibiAPI.updateAppointment(apptId, {
                    paymentStatus: 'Paid',
                    status: 'confirmed',
                    paymentDate: new Date(),
                    rejectionReason: ''
                });
                TabibiAPI.logActivity('Payment Approved', `Admin approved local payment for Booking ${apptId}`);
                TabibiAPI.showToast("Local payment approved (saved offline)!");
            }
            setPaymentModalType('');
            setSelectedPaymentAppt(null);
            loadData();
        } catch (err) {
            console.error("Failed to approve payment:", err);
            TabibiAPI.showToast("Failed to approve payment");
        }
    };

    const executeRejectPayment = async () => {
        if (!selectedPaymentAppt) return;
        const apptId = selectedPaymentAppt.id || selectedPaymentAppt._id;
        const finalReason = rejectionReasonSelect === 'Custom Reason' ? customRejectionReason.trim() : rejectionReasonSelect;
        
        if (!finalReason) {
            TabibiAPI.showToast("Please provide a rejection reason");
            return;
        }

        const token = TabibiAPI.getToken();
        const isBackendId = /^[a-f\d]{24}$/i.test(String(apptId));
        
        try {
            if (token && isBackendId) {
                await axios.patch(`/api/admin/appointments/${apptId}/payment`, {
                    paymentStatus: 'Rejected',
                    rejectionReason: finalReason
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                TabibiAPI.showToast("Payment rejected.");
            } else {
                // Offline fallback
                TabibiAPI.updateAppointment(apptId, {
                    paymentStatus: 'Rejected',
                    status: 'pending',
                    rejectionReason: finalReason,
                    paymentDate: null
                });
                TabibiAPI.logActivity('Payment Rejected', `Admin rejected local payment for Booking ${apptId}. Reason: ${finalReason}`);
                TabibiAPI.showToast("Local payment rejected (saved offline)!");
            }
            setPaymentModalType('');
            setSelectedPaymentAppt(null);
            loadData();
        } catch (err) {
            console.error("Failed to reject payment:", err);
            TabibiAPI.showToast("Failed to reject payment");
        }
    };

    const renderPaymentsDashboard = () => {
        const paidAppts = appointments.filter(a => a.paymentStatus === 'Paid');
        const totalRev = paidAppts.reduce((sum, a) => sum + (Number(a.fee) || 0), 0);
        
        const pendingVerifyAppts = appointments.filter(a => a.paymentStatus === 'Pending Verification');
        const pendingVerifyCount = pendingVerifyAppts.length;
        
        const pendingPaymentsCount = appointments.filter(a => a.paymentStatus === 'Pending' || a.paymentStatus === 'Pending Verification').length;
        
        const cashCount = appointments.filter(a => a.paymentMethod === 'cash').length;
        const vodafoneCount = appointments.filter(a => a.paymentMethod === 'vodafone').length;
        const instapayCount = appointments.filter(a => a.paymentMethod === 'instapay').length;

        const filteredAppts = appointments.filter(a => {
            if (paymentFilter === 'pending_verification') {
                return a.paymentStatus === 'Pending Verification';
            }
            return true;
        });

        return (
            <div>
                <style dangerouslySetInnerHTML={{ __html: `
                    .payment-stat-tile {
                        background: white;
                        padding: 24px;
                        border-radius: 20px;
                        border: 1px solid #E2E8F0;
                        display: flex;
                        align-items: center;
                        gap: 20px;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    }
                    .payment-stat-tile:hover {
                        transform: translateY(-4px);
                        box-shadow: 0 10px 25px rgba(95, 111, 255, 0.08);
                    }
                    .queue-card-active {
                        border: 2px solid var(--primary) !important;
                        background: var(--primary-light) !important;
                    }
                    .payment-action-btn {
                        padding: 6px 12px;
                        border-radius: 8px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        transition: all 0.2s ease;
                        border: none;
                        font-family: inherit;
                    }
                    .payment-action-btn.btn-approve {
                        background: #D1FAE5;
                        color: #065F46;
                    }
                    .payment-action-btn.btn-approve:hover {
                        background: #10B981;
                        color: white;
                        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
                    }
                    .payment-action-btn.btn-reject {
                        background: #FEE2E2;
                        color: #991B1B;
                    }
                    .payment-action-btn.btn-reject:hover {
                        background: #EF4444;
                        color: white;
                        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
                    }
                `}} />

                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                    <div className="payment-stat-tile" style={{ borderLeft: '4px solid #10B981' }}>
                        <div className="stat-icon" style={{ background: '#ECFDF5', color: '#10B981' }}><i className="fas fa-dollar-sign"></i></div>
                        <div><span className="val">${totalRev}</span><span className="lbl">Total Revenue</span></div>
                    </div>
                    <div className="payment-stat-tile" style={{ borderLeft: '4px solid #D97706' }}>
                        <div className="stat-icon" style={{ background: '#FFFBEB', color: '#D97706' }}><i className="fas fa-clock"></i></div>
                        <div><span className="val">{pendingPaymentsCount}</span><span className="lbl">Pending Payments</span></div>
                    </div>
                    <div className="payment-stat-tile" style={{ borderLeft: '4px solid #3B82F6' }}>
                        <div className="stat-icon" style={{ background: '#EFF6FF', color: '#3B82F6' }}><i className="fas fa-clinic-medical"></i></div>
                        <div><span className="val">{cashCount}</span><span className="lbl">Cash at Clinic</span></div>
                    </div>
                    <div className="payment-stat-tile" style={{ borderLeft: '4px solid #E11D48' }}>
                        <div className="stat-icon" style={{ background: '#FFF1F2', color: '#E11D48' }}><i className="fas fa-mobile-alt"></i></div>
                        <div><span className="val">{vodafoneCount}</span><span className="lbl">Vodafone Cash</span></div>
                    </div>
                    <div className="payment-stat-tile" style={{ borderLeft: '4px solid #8B5CF6' }}>
                        <div className="stat-icon" style={{ background: '#F5F3FF', color: '#8B5CF6' }}><i className="fas fa-university"></i></div>
                        <div><span className="val">{instapayCount}</span><span className="lbl">Instapay</span></div>
                    </div>
                </div>

                <div 
                    className={`payment-stat-tile ${paymentFilter === 'pending_verification' ? 'queue-card-active' : ''}`}
                    onClick={() => setPaymentFilter(prev => prev === 'pending_verification' ? 'all' : 'pending_verification')}
                    style={{ 
                        cursor: 'pointer', 
                        marginBottom: '30px', 
                        padding: '18px 24px', 
                        justifyContent: 'space-between',
                        background: 'white',
                        border: '1px solid #E2E8F0',
                        borderLeft: '4px solid var(--primary)'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className="stat-icon" style={{ background: 'rgba(95, 111, 255, 0.1)', color: 'var(--primary)', width: '44px', height: '44px', borderRadius: '10px' }}>
                            <i className="fas fa-bell"></i>
                        </div>
                        <div>
                            <span style={{ fontSize: '16px', fontWeight: '700', color: 'var(--dark)' }}>Pending Verification Queue</span>
                            <span style={{ fontSize: '13px', color: 'var(--gray)', display: 'block', marginTop: '2px' }}>
                                {paymentFilter === 'pending_verification' ? 'Currently filtering: Showing pending approvals only' : 'Click to filter list by Vodafone Cash / Instapay transfers awaiting review'}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ 
                            background: pendingVerifyCount > 0 ? '#E11D48' : '#64748B', 
                            color: 'white', 
                            padding: '4px 12px', 
                            borderRadius: '12px', 
                            fontSize: '14px', 
                            fontWeight: '700' 
                        }}>
                            {pendingVerifyCount} waiting
                        </span>
                        <i className={`fas ${paymentFilter === 'pending_verification' ? 'fa-filter-circle-xmark' : 'fa-filter'}`} style={{ color: 'var(--primary)', fontSize: '18px' }}></i>
                    </div>
                </div>

                <div className="data-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}>
                            {paymentFilter === 'pending_verification' ? 'Awaiting Verification' : 'All Transactions'}
                        </h3>
                        {paymentFilter === 'pending_verification' && (
                            <button 
                                className="btn-outline" 
                                style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '8px' }}
                                onClick={() => setPaymentFilter('all')}
                            >
                                Clear Filter
                            </button>
                        )}
                    </div>

                    {!filteredAppts.length ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--gray)' }}>
                            No transactions match the selected filter.
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #F1F5F9', color: 'var(--gray)', fontSize: '13px', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '12px' }}>Booking ID</th>
                                        <th style={{ padding: '12px' }}>Patient</th>
                                        <th style={{ padding: '12px' }}>Doctor</th>
                                        <th style={{ padding: '12px' }}>Method</th>
                                        <th style={{ padding: '12px' }}>Ref ID</th>
                                        <th style={{ padding: '12px' }}>Amount</th>
                                        <th style={{ padding: '12px' }}>Status</th>
                                        <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAppts.map(a => (
                                        <tr key={a._id || a.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '12px', fontWeight: '600', fontSize: '14px' }}>
                                                #{String(a._id || a.id).slice(-6)}
                                            </td>
                                            <td style={{ padding: '12px', fontSize: '14px' }}>
                                                <div style={{ fontWeight: '600', color: 'var(--dark)' }}>{a.patientName || 'Patient'}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--gray)' }}>{a.userEmail}</div>
                                            </td>
                                            <td style={{ padding: '12px', fontSize: '14px', fontWeight: '500' }}>
                                                {a.doctorName}
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '3px 8px', borderRadius: '6px', background: '#F3F4F6', color: '#374151', fontWeight: 600
                                                }}>
                                                    {a.paymentMethod === 'cash' && <><i className="fas fa-clinic-medical"></i> Cash</>}
                                                    {a.paymentMethod === 'vodafone' && <><i className="fas fa-mobile-alt"></i> Vodafone</>}
                                                    {a.paymentMethod === 'instapay' && <><i className="fas fa-university"></i> Instapay</>}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: '13px', fontWeight: '600' }}>
                                                {a.transactionRef || <span style={{ color: 'var(--light-gray)' }}>&mdash;</span>}
                                            </td>
                                            <td style={{ padding: '12px', fontWeight: '700', color: 'var(--primary)' }}>
                                                ${a.fee}
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 8px', borderRadius: '6px', fontWeight: 700,
                                                    ...(a.paymentStatus === 'Paid' && { background: '#D1FAE5', color: '#065F46' }),
                                                    ...(a.paymentStatus === 'Pending' && { background: '#FEF3C7', color: '#92400E' }),
                                                    ...(a.paymentStatus === 'Pending Verification' && { background: '#DBEAFE', color: '#1E40AF' }),
                                                    ...(a.paymentStatus === 'Rejected' && { background: '#FEE2E2', color: '#991B1B' })
                                                }}>
                                                    {a.paymentStatus}
                                                </span>
                                                {a.paymentStatus === 'Rejected' && a.rejectionReason && (
                                                    <div style={{ fontSize: '11px', color: '#991B1B', marginTop: '2px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {a.rejectionReason}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px', textAlign: 'right' }}>
                                                {(a.paymentStatus === 'Pending Verification' || a.paymentStatus === 'Pending') && (
                                                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                                                        <button 
                                                            className="payment-action-btn btn-approve"
                                                            onClick={() => openApproveModal(a)}
                                                        >
                                                            <i className="fas fa-check"></i> Approve
                                                        </button>
                                                        <button 
                                                            className="payment-action-btn btn-reject"
                                                            onClick={() => openRejectModal(a)}
                                                        >
                                                            <i className="fas fa-times"></i> Reject
                                                        </button>
                                                    </div>
                                                )}
                                                {a.paymentStatus === 'Paid' && (
                                                    <span style={{ fontSize: '13px', color: '#10B981', fontWeight: 600 }}>
                                                        <i className="fas fa-check-double"></i> Verified
                                                    </span>
                                                )}
                                                {a.paymentStatus === 'Rejected' && (
                                                    <span style={{ fontSize: '13px', color: '#EF4444', fontWeight: 600 }}>
                                                        <i className="fas fa-ban"></i> Rejected
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderPaymentSecurity = () => {
        const refGroups = {};
        appointments.forEach(a => {
            if (a.transactionRef && a.transactionRef.trim() !== '') {
                const ref = a.transactionRef.trim();
                if (!refGroups[ref]) {
                    refGroups[ref] = [];
                }
                refGroups[ref].push(a);
            }
        });
        const duplicateRefs = [];
        Object.entries(refGroups).forEach(([ref, appts]) => {
            if (appts.length > 1) {
                duplicateRefs.push({ ref, appts });
            }
        });
        const duplicateCount = duplicateRefs.length;

        const suspiciousTransactions = [];
        appointments.forEach(a => {
            const isOnline = a.paymentMethod === 'vodafone' || a.paymentMethod === 'instapay';
            const doc = cachedDocs.find(d => String(d._id || d.id) === String(a.doctorId?._id || a.doctorId) || d.name === a.doctorName);
            const doctorFee = doc ? doc.fee : null;
            
            const isEmptyRef = isOnline && (!a.transactionRef || a.transactionRef.trim() === '');
            const isNonNumericRef = isOnline && a.transactionRef && !/^\d+$/.test(a.transactionRef.trim());
            const isFeeMismatch = doctorFee !== null && Number(a.fee) !== Number(doctorFee);
            
            if (isEmptyRef || isNonNumericRef || isFeeMismatch) {
                suspiciousTransactions.push({
                    appt: a,
                    isEmptyRef,
                    isNonNumericRef,
                    isFeeMismatch,
                    expectedFee: doctorFee,
                    actualFee: a.fee
                });
            }
        });
        const suspiciousCount = suspiciousTransactions.length;

        const resubmittedCount = appointments.filter(a => a.rejectionReason && a.rejectionReason.trim() !== '' && a.paymentStatus === 'Pending Verification').length;
        
        const paymentLogTypes = ['Payment Submitted', 'Payment Approved', 'Payment Rejected', 'Reference Resubmitted', 'Suspicious Attempt'];
        const paymentLogs = logs.filter(l => paymentLogTypes.includes(l.type));

        return (
            <div>
                <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                    <div className="stat-tile" style={{ borderLeft: '4px solid #EF4444' }}>
                        <div className="stat-icon" style={{ background: '#FEE2E2', color: '#EF4444' }}><i className="fas fa-shield-virus"></i></div>
                        <div><span className="val">{suspiciousCount}</span><span className="lbl">Suspicious Claims</span></div>
                    </div>
                    <div className="stat-tile" style={{ borderLeft: '4px solid #F59E0B' }}>
                        <div className="stat-icon" style={{ background: '#FEF3C7', color: '#F59E0B' }}><i className="fas fa-copy"></i></div>
                        <div><span className="val">{duplicateCount}</span><span className="lbl">Duplicate References</span></div>
                    </div>
                    <div className="stat-tile" style={{ borderLeft: '4px solid #3B82F6' }}>
                        <div className="stat-icon" style={{ background: '#EFF6FF', color: '#3B82F6' }}><i className="fas fa-history"></i></div>
                        <div><span className="val">{resubmittedCount}</span><span className="lbl">Resubmitted References</span></div>
                    </div>
                </div>

                <div className="data-card" style={{ marginBottom: '30px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}>
                        <i className="fas fa-exclamation-triangle" style={{ color: '#F59E0B', marginRight: '8px' }}></i>
                        Duplicate Reference Check
                    </h3>
                    {!duplicateRefs.length ? (
                        <p style={{ color: 'var(--gray)', fontSize: '14px', margin: 0 }}>No duplicate reference codes detected across bookings.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {duplicateRefs.map(group => (
                                <div key={group.ref} style={{ border: '1px solid #FEF3C7', borderRadius: '12px', background: '#FFFBEB', padding: '16px' }}>
                                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#B45309', marginBottom: '8px' }}>
                                        Reference Code: <span style={{ fontFamily: 'monospace' }}>{group.ref}</span> (Used {group.appts.length} times)
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                                        {group.appts.map(a => (
                                            <div key={a._id || a.id} style={{ background: 'white', border: '1px solid #E2E8F0', padding: '10px 12px', borderRadius: '8px', fontSize: '13px' }}>
                                                <div>Booking ID: <strong>#{String(a._id || a.id).slice(-6)}</strong></div>
                                                <div>Patient: <strong>{a.patientName}</strong> ({a.userEmail})</div>
                                                <div>Doctor: <strong>{a.doctorName}</strong></div>
                                                <div>Status: <strong>{a.paymentStatus}</strong></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="data-card" style={{ marginBottom: '30px' }}>
                    <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}>
                        <i className="fas fa-shield-virus" style={{ color: '#EF4444', marginRight: '8px' }}></i>
                        Suspicious Transactions Flagged
                    </h3>
                    {!suspiciousTransactions.length ? (
                        <p style={{ color: 'var(--gray)', fontSize: '14px', margin: 0 }}>No suspicious transaction attributes detected.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #F1F5F9', color: 'var(--gray)', fontSize: '13px', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '12px' }}>Booking</th>
                                        <th style={{ padding: '12px' }}>Doctor</th>
                                        <th style={{ padding: '12px' }}>Details</th>
                                        <th style={{ padding: '12px' }}>Amount vs Expected</th>
                                        <th style={{ padding: '12px' }}>Threat Reason</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {suspiciousTransactions.map(flag => {
                                        const a = flag.appt;
                                        return (
                                            <tr key={a._id || a.id} style={{ borderBottom: '1px solid #F1F5F9', background: '#FFF5F5' }}>
                                                <td style={{ padding: '12px', fontWeight: '600', fontSize: '13px' }}>
                                                    #{String(a._id || a.id).slice(-6)}
                                                    <div style={{ fontSize: '11px', color: 'var(--gray)', fontWeight: 'normal' }}>{a.userEmail}</div>
                                                </td>
                                                <td style={{ padding: '12px', fontSize: '13px', fontWeight: '500' }}>
                                                    {a.doctorName}
                                                </td>
                                                <td style={{ padding: '12px', fontSize: '12px' }}>
                                                    Method: <strong>{a.paymentMethod}</strong><br />
                                                    Ref: <strong style={{ fontFamily: 'monospace' }}>{a.transactionRef || 'NONE'}</strong>
                                                </td>
                                                <td style={{ padding: '12px', fontSize: '13px' }}>
                                                    <strong style={{ color: '#DC2626' }}>${flag.actualFee}</strong> vs <strong style={{ color: '#166534' }}>${flag.expectedFee || 'N/A'}</strong>
                                                </td>
                                                <td style={{ padding: '12px' }}>
                                                    <span style={{
                                                        padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5'
                                                    }}>
                                                        {flag.isEmptyRef && "Missing Transaction Reference"}
                                                        {flag.isNonNumericRef && "Non-numeric reference ID"}
                                                        {flag.isFeeMismatch && "Amount !== Doctor Consultation Fee"}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="data-card">
                    <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}>
                        <i className="fas fa-history" style={{ color: 'var(--primary)', marginRight: '8px' }}></i>
                        Payment Activities Audit Trail
                    </h3>
                    {!paymentLogs.length ? (
                        <p style={{ padding: '20px', textAlign: 'center', color: 'var(--gray)' }}>No payment activities recorded yet.</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #F1F5F9', color: 'var(--gray)', fontSize: '13px', textTransform: 'uppercase' }}>
                                        <th style={{ padding: '12px' }}>Timestamp</th>
                                        <th style={{ padding: '12px' }}>Action Type</th>
                                        <th style={{ padding: '12px' }}>Description</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paymentLogs.map(l => (
                                        <tr key={l.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '12px', fontSize: '13px', color: 'var(--gray)' }}>
                                                {new Date(l.timestamp).toLocaleString()}
                                            </td>
                                            <td style={{ padding: '12px' }}>
                                                <span style={{
                                                    padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                                                    ...(l.type === 'Payment Approved' && { background: '#D1FAE5', color: '#065F46' }),
                                                    ...(l.type === 'Payment Rejected' && { background: '#FEE2E2', color: '#991B1B' }),
                                                    ...(l.type === 'Payment Submitted' && { background: '#EFF6FF', color: 'var(--primary)' }),
                                                    ...(l.type === 'Reference Resubmitted' && { background: '#F5F3FF', color: '#8B5CF6' }),
                                                    ...(l.type === 'Suspicious Attempt' && { background: '#FEF3C7', color: '#D97706' })
                                                }}>
                                                    {l.type}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px', fontSize: '13px', color: '#475569' }}>
                                                {l.message}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderReviews = () => {
        return (
            <div className="data-card">
                <h3 style={{ margin: '0 0 20px' }}>Pending & Recent Reviews</h3>
                {!reviews.length ? (
                    <p style={{ textAlign: 'center', color: 'var(--gray)' }}>No user reviews yet.</p>
                ) : reviews.map((r, i) => (
                    <div key={i} style={{ padding: '16px', border: '1px solid #F1F5F9', borderRadius: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontWeight: '700', fontSize: '15px' }}>{r.userName} <span style={{ fontWeight: 400, color: 'var(--gray)', fontSize: '12px' }}>reviewed</span> {r.docName}</div>
                            <div style={{ color: '#FFC700', margin: '4px 0' }}>
                                {Array.from({ length: r.stars || 5 }).map((_, starIdx) => <i key={starIdx} className="fas fa-star"></i>)}
                            </div>
                            <p style={{ color: 'var(--gray)', fontSize: '14px', margin: 0 }}>{r.text}</p>
                        </div>
                        <button className="btn-action-icon del" onClick={() => handleDeleteReview(r.id, r.docId, r.index)}><i className="fas fa-trash-alt"></i></button>
                    </div>
                ))}
            </div>
        );
    };

    const renderHero = () => {
        return (
            <div className="data-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0 }}>Hero Slides</h3>
                    <button className="btn-primary" onClick={handleAddHeroSlide}><i className="fas fa-plus"></i> Add Slide</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                    {heroSlides.map((s, i) => (
                        <div key={i} style={{ background: 'white', borderRadius: '16px', border: '1px solid #eee', overflow: 'hidden' }}>
                            <div style={{ height: '140px', backgroundImage: `url(${s.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }}></div>
                            <div style={{ padding: '15px' }}>
                                <div style={{ fontWeight: '700' }}>{s.title}</div>
                                <p style={{ fontSize: '12px', color: 'var(--gray)', margin: '5px 0' }}>{s.subtitle}</p>
                                <button className="btn-outline" style={{ width: '100%', borderColor: '#EF4444', color: '#EF4444', padding: '6px' }} onClick={() => handleDeleteHeroSlide(i)}>Delete</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderBroadcastPanel = () => {
        return (
            <div className="data-card form-section" style={{ maxWidth: '600px' }}>
                <h3>Send System-wide Message</h3>
                <p style={{ color: 'var(--gray)', fontSize: '14px', marginBottom: '20px' }}>This message will appear as a banner on all pages for all users.</p>
                <div className="form-ctrl">
                    <label>Message Content</label>
                    <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} style={{ height: '100px' }} placeholder="e.g. Scheduled maintenance tonight at 12:00 AM..."></textarea>
                </div>
                <div className="form-ctrl" style={{ marginTop: '10px' }}>
                    <label>Banner Color</label>
                    <select value={broadcastType} onChange={e => setBroadcastType(e.target.value)}>
                        <option value="info">Blue (Info)</option>
                        <option value="success">Green (Success)</option>
                        <option value="warning">Yellow (Warning)</option>
                        <option value="error">Red (Critical)</option>
                    </select>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <button className="btn-primary" style={{ flex: 1 }} onClick={handleSendBroadcast}>Send Broadcast</button>
                    <button className="btn-outline" style={{ flex: 1 }} onClick={handleClearBroadcast}>Clear Current</button>
                </div>
            </div>
        );
    };

    const renderLogs = () => {
        return (
            <div className="data-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0 }}>User Session Logs</h3>
                    <button className="btn-outline" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={handleClearAuthLogs}>Clear All Logs</button>
                </div>
                {!logs.length ? (
                    <p style={{ padding: '40px', textAlign: 'center', color: 'var(--gray)' }}>No authentication events recorded yet.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #F1F5F9', color: 'var(--gray)', fontSize: '13px', textTransform: 'uppercase' }}>
                                <th style={{ padding: '16px' }}>Timestamp</th>
                                <th style={{ padding: '16px' }}>Event</th>
                                <th style={{ padding: '16px' }}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map(l => (
                                <tr key={l.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                    <td style={{ padding: '16px', fontSize: '14px' }}>{new Date(l.timestamp).toLocaleString()}</td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: '#EFF6FF', color: 'var(--primary)' }}>
                                            {l.type || 'Event'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', color: 'var(--gray)', fontSize: '13px' }}>{l.message}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        );
    };

    // Helper for centering text / helper styling for icon center
    const justify = (val) => val;

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--admin-bg)' }}>
            <style dangerouslySetInnerHTML={{ __html: `
                :root {
                    --sidebar-w: 280px;
                    --admin-bg: #F8FAFC;
                }
                body {
                    padding-top: 0 !important;
                }
                .admin-sidebar {
                    width: var(--sidebar-w);
                    background: white;
                    border-right: 1px solid #E2E8F0;
                    display: flex;
                    flex-direction: column;
                    position: fixed;
                    height: 100vh;
                    z-index: 100;
                }
                .sidebar-header {
                    padding: 18px 24px;
                    border-bottom: 1px solid #F1F5F9;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                .sidebar-nav {
                    padding: 12px;
                    flex-grow: 1;
                    overflow-y: auto;
                }
                .sidebar-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 9px 16px;
                    border-radius: 12px;
                    color: #64748B;
                    font-weight: 500;
                    cursor: pointer;
                    transition: 0.2s;
                    margin-bottom: 4px;
                }
                .sidebar-item:hover {
                    background: #F8FAFC;
                    color: var(--primary);
                }
                .sidebar-item.active {
                    background: var(--primary-light);
                    color: var(--primary);
                }
                .admin-main {
                    margin-left: var(--sidebar-w);
                    flex-grow: 1;
                    padding: 15px 40px;
                    width: calc(100% - var(--sidebar-w));
                }
                .admin-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .page-title h1 { margin: 0; font-size: 28px; font-weight: 700; color: var(--dark); }
                .page-title p { margin: 4px 0 0; color: var(--gray); font-size: 15px; }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 24px;
                    margin-bottom: 40px;
                }
                .stat-tile {
                    background: white;
                    padding: 24px;
                    border-radius: 20px;
                    border: 1px solid #E2E8F0;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    transition: 0.3s;
                }
                .stat-tile:hover { transform: translateY(-5px); box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
                .stat-icon {
                    width: 54px; height: 54px;
                    border-radius: 14px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 22px;
                }
                .val { font-size: 24px; font-weight: 700; color: var(--dark); display: block; }
                .lbl { font-size: 14px; color: var(--gray); font-weight: 500; }
                .data-card {
                    background: white;
                    border-radius: 24px;
                    border: 1px solid #E2E8F0;
                    padding: 24px;
                    margin-top: 24px;
                }
                .search-wrap {
                    position: relative;
                    margin-bottom: 24px;
                }
                .search-wrap i { position: absolute; left: 16px; top: 14px; color: var(--light-gray); }
                .search-wrap input {
                    width: 100%;
                    padding: 12px 16px 12px 42px;
                    border-radius: 12px;
                    border: 1.5px solid #F1F5F9;
                    background: #F8FAFC;
                    outline: none;
                    font-family: inherit;
                }
                .doc-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 20px;
                }
                .doc-admin-card {
                    border: 1px solid #F1F5F9;
                    padding: 20px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    background: #FDFDFF;
                }
                .doc-admin-img { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid var(--primary-light); }
                .doc-admin-info h3 { margin: 0; font-size: 17px; color: var(--dark); }
                .doc-admin-info p { margin: 2px 0 10px; font-size: 13px; color: var(--gray); }
                .action-row { display: flex; gap: 8px; }
                .btn-action-icon {
                    background: #F1F5F9;
                    color: #64748B;
                    border: none;
                    width: 32px; height: 32px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: 0.2s;
                }
                .btn-action-icon:hover { background: var(--primary); color: white; }
                .btn-action-icon.del:hover { background: #EF4444; }
                .form-section { max-width: 800px; margin: 0 auto; }
                .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                .form-ctrl label { display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #475569; }
                .form-ctrl input, .form-ctrl select, .form-ctrl textarea {
                    width: 100%; padding: 12px; border-radius: 10px; border: 1.5px solid #E2E8F0; outline: none; font-family: inherit;
                }
                .form-ctrl input:focus, .form-ctrl select:focus, .form-ctrl textarea:focus { border-color: var(--primary); }
                .edit-modal-overlay {
                    position: fixed; inset: 0;
                    background: rgba(15,23,42,0.45);
                    backdrop-filter: blur(4px);
                    z-index: 1000;
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; pointer-events: none;
                    transition: opacity 0.28s ease;
                }
                .edit-modal-overlay.open {
                    opacity: 1; pointer-events: all;
                }
                .payment-action-overlay {
                    position: fixed; inset: 0;
                    background: rgba(15,23,42,0.45);
                    backdrop-filter: blur(4px);
                    z-index: 1100;
                    display: flex; align-items: center; justify-content: center;
                    opacity: 0; pointer-events: none;
                    transition: opacity 0.25s ease;
                }
                .payment-action-overlay.open {
                    opacity: 1; pointer-events: all;
                }
                .payment-action-modal {
                    background: white;
                    border-radius: 20px;
                    width: 480px;
                    max-width: calc(100vw - 32px);
                    padding: 28px;
                    box-shadow: 0 20px 50px rgba(0,0,0,0.12);
                    transform: translateY(15px);
                    transition: transform 0.25s ease;
                }
                .payment-action-overlay.open .payment-action-modal {
                    transform: translateY(0);
                }
                .edit-modal {
                    background: white;
                    border-radius: 24px;
                    width: 680px;
                    max-width: calc(100vw - 48px);
                    max-height: 90vh;
                    overflow-y: auto;
                    padding: 36px;
                    box-shadow: 0 24px 64px rgba(0,0,0,0.15);
                    transform: translateY(24px) scale(0.98);
                    transition: transform 0.28s cubic-bezier(.4,0,.2,1);
                }
                .edit-modal-overlay.open .edit-modal {
                    transform: translateY(0) scale(1);
                }
                .edit-modal-header {
                    display: flex; align-items: center; justify-content: space-between;
                    margin-bottom: 28px;
                }
                .edit-modal-header h2 { margin: 0; font-size: 22px; font-weight: 700; color: var(--dark); }
                .btn-close-modal {
                    width: 36px; height: 36px; border-radius: 10px;
                    background: #F1F5F9; color: #64748B; border: none;
                    font-size: 16px; cursor: pointer; transition: 0.2s;
                    display: flex; align-items: center; justify-content: center;
                }
                .btn-close-modal:hover { background: #EF4444; color: white; }
                .edit-img-row {
                    display: flex; gap: 24px; align-items: center; margin-bottom: 28px;
                    padding: 20px; background: #F8FAFC; border-radius: 16px;
                }
                .edit-doc-preview-box {
                    width: 96px; height: 96px; border-radius: 20px;
                    background: #E2E8F0; border: 2px dashed #CBD5E1;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer; background-size: cover; background-position: center;
                    flex-shrink: 0; transition: 0.2s;
                }
                .edit-doc-preview-box:hover { border-color: var(--primary); }
                .admin-main.security-active {
                    padding: 0;
                    background: #020c1b;
                }
                .security-frame-wrap {
                    width: 100%;
                    height: 100vh;
                    background: #020c1b;
                }
                .security-frame-wrap iframe {
                    width: 100%;
                    height: 100%;
                    border: none;
                    display: block;
                    background: #020c1b;
                }
                @media (max-width: 900px) {
                    .admin-sidebar { width: 80px; }
                    .sidebar-item span, .sidebar-header h2 { display: none; }
                    .admin-main { margin-left: 80px; width: calc(100% - 80px); }
                    .admin-main.security-active { padding: 0; }
                    .form-row { grid-template-columns: 1fr; }
                }
            `}} />

            {/* SIDEBAR */}
            <aside className="admin-sidebar">
                <div className="sidebar-header" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                    <div style={{ width: '40px', height: '40px' }}>
                        <svg viewBox="0 0 100 100"><path d="M10 25 H90 L82 40 H58 V70 L42 85 V40 H18 L10 25 Z" fill="var(--yellow)"/><path d="M5 52 H32 L37 38 L43 65 L50 18 L58 82 L65 45 L70 52 H95" stroke="var(--primary)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                    <h2 style={{ fontSize: '20px', margin: 0, fontWeight: '800', color: 'var(--navy)' }}>TABIBI <span style={{ color: 'var(--primary)', fontSize: '12px', display: 'block', fontWeight: '400' }}>Admin Panel</span></h2>
                </div>
                
                <div className="sidebar-nav">
                    <div data-admin-tab="dashboard" className={`sidebar-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => handleSwitchTab('dashboard')}><i className="fas fa-chart-pie"></i> <span>Overview</span></div>
                    <div data-admin-tab="appointments" className={`sidebar-item ${activeTab === 'appointments' ? 'active' : ''}`} onClick={() => handleSwitchTab('appointments')}><i className="fas fa-calendar-check"></i> <span>Manage Bookings</span></div>
                    <div data-admin-tab="doctors" className={`sidebar-item ${activeTab === 'doctors' ? 'active' : ''}`} onClick={() => handleSwitchTab('doctors')}><i className="fas fa-user-md"></i> <span>Doctors Directory</span></div>
                    <div data-admin-tab="add-doctor" className={`sidebar-item ${activeTab === 'add-doctor' ? 'active' : ''}`} onClick={() => handleSwitchTab('add-doctor')}><i className="fas fa-plus-circle"></i> <span>Add New Doctor</span></div>
                    <div data-admin-tab="patients" className={`sidebar-item ${activeTab === 'patients' ? 'active' : ''}`} onClick={() => handleSwitchTab('patients')}><i className="fas fa-users"></i> <span>Patients</span></div>
                    <div style={{ margin: '8px 16px 6px', fontSize: '11px', textTransform: 'uppercase', color: '#94A3B8', fontWeight: 700, letterSpacing: '1px' }}>Management</div>
                    <div data-admin-tab="payments" className={`sidebar-item ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => handleSwitchTab('payments')}><i className="fas fa-wallet"></i> <span>Payments Dashboard</span></div>
                    <div data-admin-tab="reviews" className={`sidebar-item ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => handleSwitchTab('reviews')}><i className="fas fa-star"></i> <span>Reviews</span></div>
                    <div data-admin-tab="hero" className={`sidebar-item ${activeTab === 'hero' ? 'active' : ''}`} onClick={() => handleSwitchTab('hero')}><i className="fas fa-images"></i> <span>Hero Slider</span></div>
                    <div data-admin-tab="broadcast" className={`sidebar-item ${activeTab === 'broadcast' ? 'active' : ''}`} onClick={() => handleSwitchTab('broadcast')}><i className="fas fa-bullhorn"></i> <span>Broadcast</span></div>
                    <div data-admin-tab="auth-logs" className={`sidebar-item ${activeTab === 'auth-logs' ? 'active' : ''}`} onClick={() => handleSwitchTab('auth-logs')}><i className="fas fa-history"></i> <span>Auth Logs</span></div>
                    <div style={{ margin: '8px 16px 6px', borderTop: '1px solid #E2E8F0', paddingTop: '8px', fontSize: '11px', textTransform: 'uppercase', color: '#94A3B8', fontWeight: 700, letterSpacing: '1px' }}>Security</div>
                    <div data-admin-tab="payment-security" className={`sidebar-item ${activeTab === 'payment-security' ? 'active' : ''}`} onClick={() => handleSwitchTab('payment-security')}><i className="fas fa-shield-virus"></i> <span>Payment Security</span></div>
                    <div data-admin-tab="security-layer" className={`sidebar-item ${activeTab === 'security-layer' ? 'active' : ''}`} onClick={() => handleSwitchTab('security-layer')}><i className="fas fa-shield-alt"></i> <span>Security Layer</span></div>
                </div>
                
                <div style={{ padding: '12px 24px' }}>
                    <button className="sidebar-item" style={{ width: '100%', background: '#FEF2F2', color: '#EF4444', border: 'none' }} onClick={handleLogout}><i className="fas fa-sign-out-alt"></i> <span>Sign Out</span></button>
                </div>
            </aside>

            {/* MAIN */}
            <main className={`admin-main ${activeTab === 'security-layer' ? 'security-active' : ''}`} style={{ transition: 'background 0.3s ease' }}>
                {activeTab !== 'security-layer' && <header className="admin-header">
                    <div className="page-title">
                        <h1>{activeTab === 'payments' ? 'Payments Dashboard' : activeTab === 'payment-security' ? 'Payment Security Monitoring' : (activeTab.charAt(0).toUpperCase() + activeTab.slice(1))}</h1>
                        <p>{activeTab === 'payments' ? 'Track and verify clinic consultation transactions.' : activeTab === 'payment-security' ? 'Monitor payment flags and transaction logs.' : 'Welcome back, Administrator.'}</p>
                    </div>
                    <div className="admin-profile" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: 'var(--dark)' }}>{currentUser?.name || 'Admin'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--gray)' }}>System Master</div>
                        </div>
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--primary)', border: 'none', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800' }}>
                            {currentUser?.name?.charAt(0) || 'A'}
                        </div>
                    </div>
                </header>}

                {activeTab === 'dashboard' && renderOverview()}
                {activeTab === 'appointments' && renderAppointments()}
                {activeTab === 'doctors' && renderDoctors()}
                {activeTab === 'add-doctor' && renderAddDoctor()}
                {activeTab === 'patients' && renderPatients()}
                {activeTab === 'payments' && renderPaymentsDashboard()}
                {activeTab === 'payment-security' && renderPaymentSecurity()}
                {activeTab === 'reviews' && renderReviews()}
                {activeTab === 'hero' && renderHero()}
                {activeTab === 'broadcast' && renderBroadcastPanel()}
                {activeTab === 'auth-logs' && renderLogs()}
                {activeTab === 'security-layer' && (
                    <div className="security-frame-wrap">
                        <iframe
                            key={securityFrameNonce}
                            title="TABIBI Security Layer"
                            src={`${securityLayerUrl}${securityLayerUrl.includes('?') ? '&' : '?'}_=${securityFrameNonce}`}
                        />
                    </div>
                )}
            </main>

            {/* EDIT DOCTOR MODAL */}
            <div className={`edit-modal-overlay ${editModalOpen ? 'open' : ''}`} onClick={(e) => { if (e.target.classList.contains('edit-modal-overlay')) setEditModalOpen(false); }}>
                <div className="edit-modal" role="dialog" aria-modal="true">
                    <div className="edit-modal-header">
                        <h2><i className="fas fa-user-edit" style={{ color: 'var(--primary)', marginRight: '10px' }}></i>Edit Doctor Profile</h2>
                        <button className="btn-close-modal" onClick={() => setEditModalOpen(false)}><i className="fas fa-times"></i></button>
                    </div>

                    <form onSubmit={handleSaveEditedDoctor}>
                        <div className="edit-img-row">
                            <div 
                                className="edit-doc-preview-box" 
                                onClick={() => document.getElementById('edit-doc-pic').click()}
                                style={{
                                    backgroundImage: editDocImage ? `url(${editDocImage})` : (editDocData.img ? `url(${editDocData.img})` : 'none')
                                }}
                            >
                                {!editDocImage && !editDocData.img && <i className="fas fa-camera" style={{ fontSize: '22px', color: '#94A3B8' }}></i>}
                            </div>
                            <div>
                                <div style={{ fontWeight: 600, color: 'var(--dark)', marginBottom: '4px' }}>Profile Photo</div>
                                <div style={{ fontSize: '13px', color: 'var(--gray)', marginBottom: '12px' }}>Square image recommended (max 2 MB)</div>
                                <button type="button" className="btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={() => document.getElementById('edit-doc-pic').click()}>Change Photo</button>
                                <input type="file" id="edit-doc-pic" accept="image/*" style={{ display: 'none' }} onChange={handleEditDocPicChange} />
                            </div>
                        </div>

                        <div className="form-row">
                            <div className="form-ctrl"><label>Full Name</label><input type="text" value={editDocData.name} onChange={e => setEditDocData({...editDocData, name: e.target.value})} placeholder="Dr. John Doe" required /></div>
                            <div className="form-ctrl"><label>Email Address</label><input type="email" value={editDocData.email} onChange={e => setEditDocData({...editDocData, email: e.target.value})} placeholder="john@tabibi.com" required /></div>
                        </div>
                        <div className="form-row">
                            <div className="form-ctrl">
                                <label>Specialty</label>
                                <select value={editDocData.specialty} onChange={e => setEditDocData({...editDocData, specialty: e.target.value})}>
                                    <option>General physician</option>
                                    <option>Gynecologist</option>
                                    <option>Dermatologist</option>
                                    <option>Pediatricians</option>
                                    <option>Neurologist</option>
                                    <option>Gastroenterologist</option>
                                    <option>Dentist</option>
                                </select>
                            </div>
                            <div className="form-ctrl"><label>Consultation Fee ($)</label><input type="number" value={editDocData.fee} onChange={e => setEditDocData({...editDocData, fee: e.target.value})} /></div>
                        </div>
                        <div className="form-row">
                            <div className="form-ctrl"><label>Education / Degree</label><input type="text" value={editDocData.degree} onChange={e => setEditDocData({...editDocData, degree: e.target.value})} placeholder="MBBS, MD" /></div>
                            <div className="form-ctrl"><label>Experience (Years)</label><input type="text" value={editDocData.experience} onChange={e => setEditDocData({...editDocData, experience: e.target.value})} placeholder="5 Years" /></div>
                        </div>
                        <div className="form-row">
                            <div className="form-ctrl">
                                <label>Availability</label>
                                <select value={editDocData.available ? 'true' : 'false'} onChange={e => setEditDocData({...editDocData, available: e.target.value === 'true'})}>
                                    <option value="true">Available</option>
                                    <option value="false">Not Available</option>
                                </select>
                            </div>
                            <div className="form-ctrl">
                                <label>Clinic Address</label>
                                <input type="text" value={editDocData.clinicAddress} onChange={e => setEditDocData({...editDocData, clinicAddress: e.target.value})} placeholder="e.g. 12 El-Galaa St, Cairo" required />
                            </div>
                        </div>
                        <div className="form-ctrl" style={{ marginBottom: '28px' }}>
                            <label>Biography / About</label>
                            <textarea style={{ height: '100px', resize: 'vertical' }} value={editDocData.about} onChange={e => setEditDocData({...editDocData, about: e.target.value})} placeholder="Doctor's expertise and background..."></textarea>
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button type="submit" className="btn-primary" style={{ flex: 1, padding: '14px', borderRadius: '12px' }}>
                                <i className="fas fa-save" style={{ marginRight: '8px' }}></i>Save Changes
                            </button>
                            <button type="button" onClick={() => setEditModalOpen(false)} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: '1.5px solid #E2E8F0', background: 'white', color: 'var(--gray)', fontFamily: 'inherit', fontSize: '15px', fontWeight: 600, cursor: 'pointer' }}>
                                Cancel
                            </button>
                        </div>
                    </form>
            </div>
        </div>

            {/* PAYMENT APPROVE/REJECT MODALS */}
            <div className={`payment-action-overlay ${paymentModalType ? 'open' : ''}`} onClick={(e) => { if (e.target.classList.contains('payment-action-overlay')) { setPaymentModalType(''); setSelectedPaymentAppt(null); } }}>
                {paymentModalType && selectedPaymentAppt && (
                    <div className="payment-action-modal">
                        {paymentModalType === 'approve' && (
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--dark)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <i className="fas fa-check-circle" style={{ color: '#10B981' }}></i>
                                    Approve Payment?
                                </h3>
                                <p style={{ color: 'var(--gray)', fontSize: '14px', margin: '0 0 20px', lineHeight: '1.5' }}>
                                    Are you sure you want to approve this payment of <strong>${selectedPaymentAppt.fee}</strong> for patient <strong>{selectedPaymentAppt.patientName}</strong>? This will confirm the booking.
                                </p>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                    <button 
                                        type="button"
                                        className="btn-modal-action" 
                                        style={{ border: '1px solid #ccc', background: 'white', color: 'var(--gray)', padding: '10px 20px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }} 
                                        onClick={() => { setPaymentModalType(''); setSelectedPaymentAppt(null); }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="button"
                                        className="btn-modal-action" 
                                        style={{ border: 'none', background: '#10B981', color: 'white', padding: '10px 20px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }} 
                                        onClick={executeApprovePayment}
                                    >
                                        Yes, Approve
                                    </button>
                                </div>
                            </div>
                        )}

                        {paymentModalType === 'reject' && (
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--dark)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <i className="fas fa-times-circle" style={{ color: '#EF4444' }}></i>
                                    Reject Payment
                                </h3>
                                <p style={{ color: 'var(--gray)', fontSize: '14px', margin: '0 0 16px', lineHeight: '1.5' }}>
                                    Specify the reason for rejecting this payment for patient <strong>{selectedPaymentAppt.patientName}</strong>:
                                </p>
                                
                                <div className="form-ctrl" style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', marginStyle: 'none', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#475569' }}>Rejection Reason</label>
                                    <select 
                                        value={rejectionReasonSelect} 
                                        onChange={(e) => setRejectionReasonSelect(e.target.value)}
                                        style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px solid #E2E8F0', outline: 'none', fontFamily: 'inherit' }}
                                    >
                                        <option value="Invalid Transaction Reference">Invalid Transaction Reference</option>
                                        <option value="Payment Not Received">Payment Not Received</option>
                                        <option value="Amount Mismatch">Amount Mismatch</option>
                                        <option value="Incorrect Payment Method Used">Incorrect Payment Method Used</option>
                                        <option value="Transaction Reference Already Used">Transaction Reference Already Used</option>
                                        <option value="Custom Reason">Custom Reason...</option>
                                    </select>
                                </div>

                                {rejectionReasonSelect === 'Custom Reason' && (
                                    <div className="form-ctrl" style={{ marginBottom: '20px' }}>
                                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '14px', color: '#475569' }}>Custom Rejection Reason</label>
                                        <input 
                                            type="text" 
                                            value={customRejectionReason} 
                                            onChange={(e) => setCustomRejectionReason(e.target.value)}
                                            placeholder="Enter custom rejection reason..."
                                            style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px solid #E2E8F0', outline: 'none', fontFamily: 'inherit' }}
                                        />
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                                    <button 
                                        type="button"
                                        className="btn-modal-action" 
                                        style={{ border: '1px solid #ccc', background: 'white', color: 'var(--gray)', padding: '10px 20px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }} 
                                        onClick={() => { setPaymentModalType(''); setSelectedPaymentAppt(null); }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="button"
                                        className="btn-modal-action" 
                                        style={{ border: 'none', background: '#EF4444', color: 'white', padding: '10px 20px', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }} 
                                        onClick={executeRejectPayment}
                                    >
                                        Reject Payment
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
