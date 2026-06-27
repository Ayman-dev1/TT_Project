/**
 * Tabibi API - Consolidated Service Layer for React
 * Integrates with Django and Express.js Node API, with localStorage sync.
 */
import axios from 'axios';

// Set base URL for axios requests
axios.defaults.baseURL = ''; // Set relative or back-end domain if needed

const KEYS = {
    USER: 'tabibi_user',
    USERS: 'tabibi_users',
    APPOINTMENTS: 'tabibi_appointments',
    FILES: 'tabibi_files',
    CHATS: 'tabibi_chats',
    REVIEWS: 'tabibi_reviews',
    EXTRA_DOCTORS: 'tabibi_extra_doctors',
    LOGS: 'tabibi_logs',
    BROADCAST: 'tabibi_broadcast',
    HERO: 'tabibi_hero',
    DELETED_DOCTORS: 'tabibi_deleted_doctors'
};

const DEFAULT_DOCTORS = [
    { id: "6a3aaae8584cd708d428b0c3", _id: "6a3aaae8584cd708d428b0c3", name: "Dr. Ahmed Mansour", specialty: "General physician", available: true, fee: 50, experience: "2 Years", img: "/assets/images/M1.png", rating: 4.8, reviewsCount: 24, patientsTreated: 45, email: "ahmed@tabibi.com", clinicAddress: "12 El-Galaa St, Cairo" },
    { id: "6a3aaae9584cd708d428b0c5", _id: "6a3aaae9584cd708d428b0c5", name: "Dr. Maryam El-Gohary", specialty: "Gynecologist", available: true, fee: 70, experience: "5 Years", img: "/assets/images/F1.png", rating: 4.9, reviewsCount: 31, patientsTreated: 120, email: "maryam@tabibi.com", clinicAddress: "45 Sphinx Square, Giza" },
    { id: "6a3aaae9584cd708d428b0c7", _id: "6a3aaae9584cd708d428b0c7", name: "Dr. Aya Sami", specialty: "Dermatologist", available: false, fee: 60, experience: "4 Years", img: "/assets/images/F2.png", rating: 4.7, reviewsCount: 18, patientsTreated: 18, email: "aya@tabibi.com", clinicAddress: "88 El-Bahr St, Tanta" },
    { id: "6a3aaae9584cd708d428b0c9", _id: "6a3aaae9584cd708d428b0c9", name: "Dr. Khaled Shouky", specialty: "Neurologist", available: true, fee: 90, experience: "8 Years", img: "/assets/images/M2.png", rating: 4.9, reviewsCount: 42, patientsTreated: 210, email: "khaled@tabibi.com", clinicAddress: "105 El-Nasr St, Heliopolis, Cairo" },
    { id: "6a3aaaea584cd708d428b0cb", _id: "6a3aaaea584cd708d428b0cb", name: "Dr. Youssef Nabil", specialty: "Pediatricians", available: true, fee: 55, experience: "3 Years", img: "/assets/images/image 419.png", rating: 4.8, reviewsCount: 27, patientsTreated: 75, email: "youssef@tabibi.com", clinicAddress: "32 El-Tahrir St, Dokki, Giza" }
];

const _get = (key, def) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : def;
    } catch (e) { return def; }
};

const _set = (key, val) => {
    localStorage.setItem(key, JSON.stringify(val));
};

export const TabibiAPI = {
    getUser: () => _get(KEYS.USER, null),
    saveUser: (u) => {
        _set(KEYS.USER, u);
        if (u && u.email) {
            const users = _get(KEYS.USERS, []);
            const idx = users.findIndex(usr => usr.email === u.email);
            if (idx > -1) {
                users[idx] = { ...users[idx], ...u };
                _set(KEYS.USERS, users);
            }
            if (u.role === 'doctor') {
                const extras = _get(KEYS.EXTRA_DOCTORS, []);
                const extIdx = extras.findIndex(d => d.email === u.email);
                if (extIdx > -1) {
                    extras[extIdx] = { ...extras[extIdx], ...u };
                    _set(KEYS.EXTRA_DOCTORS, extras);
                }
            }
        }
        window.dispatchEvent(new Event('tabibi_user_updated'));
    },
    getToken: () => {
        const user = _get(KEYS.USER, null);
        return user?.token || user?.accessToken || '';
    },
    logout: () => {
        _set(KEYS.USER, null);
        window.location.href = '/';
    },
    calculateConfidenceScore: (rating, reviewsCount, patientsTreated) => {
        const R = Number(rating) || 0;
        const v = Number(reviewsCount) || 0;
        const p = Number(patientsTreated) || 0;
        if (R === 0) return 0;
        const ratingPercentage = (R / 5) * 100;
        const reviewsFactor = v / (v + 5);
        const patientsFactor = p / (p + 15);
        const confidenceFactor = 0.5 * reviewsFactor + 0.5 * patientsFactor;
        return Math.round(ratingPercentage * confidenceFactor);
    },
    getDoctors: () => {
        const registeredUsers = _get(KEYS.USERS, []);
        const registeredDoctors = registeredUsers.filter(u => u.role === 'doctor');
        const extraDoctors = _get(KEYS.EXTRA_DOCTORS, []);
        const deletedDoctors = _get(KEYS.DELETED_DOCTORS, []);
        let allDoctors = [...DEFAULT_DOCTORS];
        
        registeredDoctors.forEach(rd => {
            const existingIdx = allDoctors.findIndex(d => d.email === rd.email);
            const docObj = {
                rating: rd.rating || 4.8,
                reviewsCount: rd.reviewsCount || 0,
                patientsTreated: rd.patientsTreated || rd.patients_treated || 0,
                clinicAddress: rd.clinicAddress || 'Main Clinic',
                ...rd,
                available: rd.available !== false
            };
            if (existingIdx > -1) {
                allDoctors[existingIdx] = { ...allDoctors[existingIdx], ...docObj };
            } else {
                allDoctors.push(docObj);
            }
        });

        extraDoctors.forEach(ed => {
            const existingIdx = allDoctors.findIndex(d => d.email === ed.email || (ed.id && d.id === ed.id));
            const docObj = {
                rating: ed.rating || 4.8,
                reviewsCount: ed.reviewsCount || 0,
                patientsTreated: ed.patientsTreated || ed.patients_treated || 0,
                clinicAddress: ed.clinicAddress || 'Main Clinic',
                ...ed,
                available: ed.available !== false
            };
            if (existingIdx > -1) {
                allDoctors[existingIdx] = { ...allDoctors[existingIdx], ...docObj };
            } else {
                allDoctors.push(docObj);
            }
        });

        allDoctors = allDoctors.filter(d => !deletedDoctors.includes(d.email));

        const allReviews = _get(KEYS.REVIEWS, []);
        allDoctors = allDoctors.map(d => {
            const docId = d.id || d._id;
            const docReviews = allReviews.filter(r => String(r.doctorId) === String(docId));
            const localCount = docReviews.length;
            
            const baseCount = Number(d.reviewsCount) || 0;
            const baseRating = Number(d.rating) || 0;
            const totalCount = baseCount + localCount;
            
            let finalRating = baseRating;
            if (totalCount > 0) {
                const localSum = docReviews.reduce((sum, r) => sum + Number(r.rating || 5), 0);
                finalRating = ((baseRating * baseCount) + localSum) / totalCount;
            }
            
            // Count all confirmed or completed appointments locally for this doctor to update treated count in offline mode
            const allAppointments = _get(KEYS.APPOINTMENTS, []);
            const localTreatedCount = allAppointments.filter(appt => 
                String(appt.doctorId?._id || appt.doctorId) === String(docId) && 
                (appt.status === 'confirmed' || appt.status === 'completed')
            ).length;

            const patients = (Number(d.patientsTreated || d.patients_treated) || 0) + localTreatedCount;
            const confidence = TabibiAPI.calculateConfidenceScore(finalRating, totalCount, patients);
            
            return {
                ...d,
                rating: finalRating,
                reviewsCount: totalCount,
                patientsTreated: patients,
                confidenceScore: confidence,
                img: TabibiAPI.getDoctorImage(d.email || d.userId?.email, d.userId?.image || d.image || d.img)
            };
        });

        return allDoctors;
    },
    getAppointments: () => {
        const raw = _get(KEYS.APPOINTMENTS, []);
        return raw.map(a => {
            let paymentMethod = a.paymentMethod || a.payment || 'cash';
            if (!['cash', 'vodafone', 'instapay'].includes(paymentMethod)) {
                paymentMethod = 'cash';
            }
            return {
                ...a,
                paymentMethod,
                paymentStatus: a.paymentStatus || (a.status === 'confirmed' || a.status === 'Confirmed' ? 'Paid' : 'Pending'),
                transactionRef: a.transactionRef || '',
                rejectionReason: a.rejectionReason || '',
                paymentDate: a.paymentDate || null
            };
        });
    },
    saveAppointments: (appointments) => _set(KEYS.APPOINTMENTS, appointments),
    saveAppointment: (appointment) => {
        const appointments = _get(KEYS.APPOINTMENTS, []);
        let paymentMethod = appointment.paymentMethod || appointment.payment || 'cash';
        if (!['cash', 'vodafone', 'instapay'].includes(paymentMethod)) {
            paymentMethod = 'cash';
        }
        const normalized = {
            ...appointment,
            paymentMethod,
            paymentStatus: appointment.paymentStatus || (paymentMethod === 'cash' ? 'Pending' : 'Pending Verification'),
            transactionRef: appointment.transactionRef || '',
            rejectionReason: appointment.rejectionReason || '',
            paymentDate: appointment.paymentDate || null
        };
        const next = [...appointments, normalized];
        _set(KEYS.APPOINTMENTS, next);
        return normalized;
    },
    updateAppointment: (appointmentId, changes) => {
        const appointments = _get(KEYS.APPOINTMENTS, []);
        const next = appointments.map((appointment) => {
            if (String(appointment.id) === String(appointmentId) || String(appointment._id) === String(appointmentId)) {
                let merged = { ...appointment, ...changes };
                let paymentMethod = merged.paymentMethod || merged.payment || 'cash';
                if (!['cash', 'vodafone', 'instapay'].includes(paymentMethod)) {
                    paymentMethod = 'cash';
                }
                return {
                    ...merged,
                    paymentMethod,
                    paymentStatus: merged.paymentStatus || (paymentMethod === 'cash' ? 'Pending' : 'Pending Verification')
                };
            }
            return appointment;
        });
        _set(KEYS.APPOINTMENTS, next);
        return next.find((appointment) => String(appointment.id) === String(appointmentId) || String(appointment._id) === String(appointmentId));
    },
    getDoctorReviews: (doctorId) => _get(KEYS.REVIEWS, []).filter((review) => String(review.doctorId) === String(doctorId)),
    saveReview: (doctorId, review) => {
        const reviews = _get(KEYS.REVIEWS, []);
        const nextReview = { id: Date.now(), doctorId, date: new Date().toISOString(), ...review };
        _set(KEYS.REVIEWS, [...reviews, nextReview]);
        return nextReview;
    },
    showToast: (msg) => {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },
    isPatient: () => _get(KEYS.USER, null)?.role === 'patient',
    isDoctor: () => _get(KEYS.USER, null)?.role === 'doctor',
    normalizeImg: (path, defaultImg = '/assets/images/M1.png') => {
        if (!path) return defaultImg;
        if (typeof path !== 'string') return defaultImg;
        if (path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/assets/images/')) {
            return path;
        }
        const parts = path.split(/[/\\]/);
        const filename = parts[parts.length - 1];
        if (filename && /\.(png|jpe?g|gif|webp|svg)$/i.test(filename)) {
            return `/assets/images/${filename}`;
        }
        return defaultImg;
    },
    getDoctorImage: (email, backendImg, defaultImg) => {
        // Prioritize actual database truth (Cloudinary url or base64 data)
        if (typeof backendImg === 'string' && (backendImg.startsWith('http://') || backendImg.startsWith('https://') || backendImg.startsWith('data:'))) {
            return backendImg;
        }

        if (!email) return TabibiAPI.normalizeImg(backendImg, defaultImg);
        
        // 1. Check current logged user cache
        const loggedUser = _get(KEYS.USER, null);
        if (loggedUser && loggedUser.email === email && (loggedUser.image || loggedUser.img)) {
            return loggedUser.image || loggedUser.img;
        }
        
        // 2. Check users list
        const registeredUsers = _get(KEYS.USERS, []);
        const regDoc = registeredUsers.find(u => u.email === email);
        if (regDoc && (regDoc.image || regDoc.img)) {
            return regDoc.image || regDoc.img;
        }
        
        // 3. Check extra doctors
        const extraDocs = _get(KEYS.EXTRA_DOCTORS, []);
        const extDoc = extraDocs.find(d => d.email === email);
        if (extDoc && (extDoc.image || extDoc.img)) {
            return extDoc.image || extDoc.img;
        }
        
        // 4. Fallback to backend image
        return TabibiAPI.normalizeImg(backendImg, defaultImg);
    },
    isAdmin: () => _get(KEYS.USER, null)?.role === 'admin' || _get(KEYS.USER, null)?.isAdmin === true,
    isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    calculateAge: (dob) => {
        if (!dob) return 'N/A';
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
        return age;
    },
    getPatientFiles: async (email) => {
        try {
            const token = TabibiAPI.getToken();
            const res = await axios.get(`/api/medical-records?email=${encodeURIComponent(email)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return res.data;
        } catch (err) {
            console.error("Error loading patient records from backend:", err);
            return _get(KEYS.FILES, []).filter(f => f.userEmail === email);
        }
    },
    savePatientFile: async (file) => {
        try {
            const token = TabibiAPI.getToken();
            const res = await axios.post('/api/medical-records', file, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const files = _get(KEYS.FILES, []);
            const syncedFile = { id: res.data._id || Date.now(), date: res.data.uploadDate, ...file };
            _set(KEYS.FILES, [...files, syncedFile]);
            return res.data;
        } catch (err) {
            console.error("Error saving patient record to backend:", err);
            const files = _get(KEYS.FILES, []);
            const fallbackFile = { id: Date.now(), date: new Date().toISOString(), ...file };
            _set(KEYS.FILES, [...files, fallbackFile]);
            return fallbackFile;
        }
    },
    deletePatientFile: async (email, fileId) => {
        try {
            const token = TabibiAPI.getToken();
            await axios.delete(`/api/medical-records/${fileId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const files = _get(KEYS.FILES, []);
            const next = files.filter(f => String(f.id) !== String(fileId) && String(f._id) !== String(fileId));
            _set(KEYS.FILES, next);
            return true;
        } catch (err) {
            console.error("Error deleting patient record on backend:", err);
            const files = _get(KEYS.FILES, []);
            const next = files.filter(f => String(f.id) !== String(fileId) && String(f._id) !== String(fileId));
            _set(KEYS.FILES, next);
            return true;
        }
    },
    getAllUsers: () => _get(KEYS.USERS, []),
    getStats: () => {
        const appointments = _get(KEYS.APPOINTMENTS, []);
        const users = _get(KEYS.USERS, []);
        const doctors = users.filter(u => u.role === 'doctor');
        const patients = users.filter(u => u.role === 'patient');
        return {
            totalAppointments: appointments.length,
            totalDoctors: doctors.length + DEFAULT_DOCTORS.length,
            totalPatients: patients.length,
            revenue: appointments.filter(a => a.paymentStatus === 'Paid').reduce((acc, curr) => acc + (Number(curr.fee || curr.amount) || 0), 0)
        };
    },
    logActivity: (type, message) => {
        const logs = _get(KEYS.LOGS, []);
        const next = [{ id: Date.now(), timestamp: new Date().toISOString(), type, message }, ...logs].slice(0, 50);
        _set(KEYS.LOGS, next);
        axios.post('/api/activity-logs', { type, message }).catch(err => {
            console.warn("Could not sync activity log to server:", err);
        });
    },
    getLogs: () => _get(KEYS.LOGS, []),
    clearAuthLogs: () => {
        _set(KEYS.LOGS, []);
        axios.delete('/api/activity-logs').catch(err => {
            console.warn("Could not clear activity logs on server:", err);
        });
    },

    // Dynamic banner broadcast settings (saved in localStorage cache)
    getBroadcast: () => _get(KEYS.BROADCAST, null),
    saveBroadcast: (msg, type) => {
        _set(KEYS.BROADCAST, { msg, type, active: true });
        window.dispatchEvent(new Event('tabibi_broadcast_updated'));
    },
    clearBroadcast: () => {
        localStorage.removeItem(KEYS.BROADCAST);
        window.dispatchEvent(new Event('tabibi_broadcast_updated'));
    },

    // Homepage hero dynamic slides (saved in localStorage cache)
    getHeroSlides: () => _get(KEYS.HERO, []),
    saveHeroSlides: (slides) => _set(KEYS.HERO, slides),

    // Chat Message Services (saved in localStorage cache)
    getChatMessages: (doctorId, patientEmail) => {
        const chats = _get(KEYS.CHATS, {});
        return chats[`${doctorId}_${patientEmail}`] || [];
    },
    saveChatMessage: (doctorId, patientEmail, msg) => {
        const chats = _get(KEYS.CHATS, {});
        const key = `${doctorId}_${patientEmail}`;
        if (!chats[key]) chats[key] = [];
        chats[key].push({
            id: msg._id || msg.id || Date.now(),
            senderId: msg.senderId,
            senderRole: msg.senderRole,
            text: msg.text,
            timestamp: msg.timestamp || new Date().toISOString(),
            read: msg.read === true
        });
        _set(KEYS.CHATS, chats);
        window.dispatchEvent(new Event('tabibi_chats_updated'));
        return true;
    },
    markChatAsRead: (doctorId, patientEmail) => {
        const chats = _get(KEYS.CHATS, {});
        const key = `${doctorId}_${patientEmail}`;
        const user = _get(KEYS.USER, null);
        if (Array.isArray(chats[key]) && user) {
            chats[key].forEach(m => {
                if (m.senderRole !== user.role) m.read = true;
            });
            _set(KEYS.CHATS, chats);
            window.dispatchEvent(new Event('tabibi_chats_updated'));
        }
    },
    openFileWindow: (file) => {
        const newWindow = window.open();
        if (newWindow) {
            newWindow.document.write(`
                <html>
                    <head>
                        <title>${file.fileName || 'Medical Document'}</title>
                        <style>
                            body { margin: 0; display: flex; justify-content: center; align-items: center; background: #0f172a; height: 100vh; font-family: system-ui, -apple-system, sans-serif; color: white; }
                            img { max-width: 95%; max-height: 80%; border-radius: 8px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3); object-fit: contain; }
                            iframe { width: 95%; height: 80%; border-radius: 8px; border: none; background: white; }
                            .container { text-align: center; width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 20px; box-sizing: border-box; padding: 20px; }
                            .btn-download { padding: 12px 24px; background: #5f6fff; border: none; border-radius: 8px; color: white; font-weight: 600; cursor: pointer; text-decoration: none; transition: background 0.2s; font-size: 15px; }
                            .btn-download:hover { background: #4a5aee; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            ${String(file.fileData).startsWith('data:application/pdf') 
                                ? `<iframe src="${file.fileData}"></iframe>`
                                : `<img src="${file.fileData}" alt="${file.fileName || ''}" />`
                            }
                            <div>
                                <a class="btn-download" href="${file.fileData}" download="${file.fileName || 'download'}">Download File</a>
                            </div>
                        </div>
                    </body>
                </html>
            `);
            newWindow.document.close();
        } else {
            alert("Popup blocked! Please allow popups to view this file.");
        }
    },
    getUnreadMessagesCount: (userObj) => {
        if (!userObj) return 0;
        const chats = _get(KEYS.CHATS, {});
        let count = 0;
        const doctors = TabibiAPI.getDoctors();
        for (let key in chats) {
            const [dId, pEmail] = key.split('_');
            if (userObj.role === 'doctor') {
                const doc = doctors.find(d => d.id === parseInt(dId));
                if (doc && doc.email === userObj.email) {
                    const chatMsgs = Array.isArray(chats[key]) ? chats[key] : [];
                    const unreadMsgs = chatMsgs.filter(m => m.senderRole !== 'doctor' && !m.read).length;
                    count += unreadMsgs;
                }
            } else if (userObj.role === 'patient') {
                if (pEmail === userObj.email) {
                    const chatMsgs = Array.isArray(chats[key]) ? chats[key] : [];
                    const unreadMsgs = chatMsgs.filter(m => m.senderRole !== 'patient' && !m.read).length;
                    count += unreadMsgs;
                }
            }
        }
        return count;
    },
    requestWithdrawal: async (amount) => {
        try {
            const token = TabibiAPI.getToken();
            const res = await axios.post('/api/doctors/withdraw', { amount }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local user cache
            const user = TabibiAPI.getUser();
            if (user) {
                user.walletBalance = res.data.walletBalance;
                user.walletTransactions = res.data.walletTransactions;
                TabibiAPI.saveUser(user);
            }
            return res.data;
        } catch (err) {
            console.warn("Backend withdrawal call failed, using localStorage fallback:", err.message);
            const user = TabibiAPI.getUser();
            if (!user || user.role !== 'doctor') throw new Error("Unauthorized");
            const balance = Number(user.walletBalance || 0);
            if (amount > balance) throw new Error("Insufficient wallet balance");
            const newBalance = Number((balance - amount).toFixed(2));
            user.walletBalance = newBalance;
            if (!user.walletTransactions) user.walletTransactions = [];
            user.walletTransactions.unshift({
                amount,
                type: 'withdrawal',
                description: `Withdrawal processed offline (Amount: $${amount})`,
                status: 'completed',
                date: new Date().toISOString()
            });
            TabibiAPI.saveUser(user);
            
            // Also sync in tabibi_users
            const allUsers = _get(KEYS.USERS, []);
            const idx = allUsers.findIndex(u => u.email === user.email);
            if (idx > -1) {
                allUsers[idx].walletBalance = newBalance;
                if (!allUsers[idx].walletTransactions) allUsers[idx].walletTransactions = [];
                allUsers[idx].walletTransactions.unshift({
                    amount,
                    type: 'withdrawal',
                    description: `Withdrawal processed offline (Amount: $${amount})`,
                    status: 'completed',
                    date: new Date().toISOString()
                });
                _set(KEYS.USERS, allUsers);
            }

            TabibiAPI.logActivity('Withdrawal Processed', `Doctor ${user.email} withdrew $${amount} (Offline)`);
            return user;
        }
    },
    toggleAvailability: async (user, nextAvail) => {
        const u = { ...user, available: nextAvail };
        TabibiAPI.saveUser(u);
        
        const allUsers = _get(KEYS.USERS, []);
        const idx = allUsers.findIndex(usr => usr.email === u.email);
        if (idx > -1) {
            allUsers[idx] = { ...allUsers[idx], available: nextAvail };
            _set(KEYS.USERS, allUsers);
        }

        const extras = _get(KEYS.EXTRA_DOCTORS, []);
        const extIdx = extras.findIndex(d => d.email === u.email);
        if (extIdx > -1) {
            extras[extIdx] = { ...extras[extIdx], available: nextAvail };
            _set(KEYS.EXTRA_DOCTORS, extras);
        }
        
        if (u.role === 'doctor') {
            try {
                const token = TabibiAPI.getToken();
                await axios.patch('/api/doctors/availability', { available: nextAvail }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                return true;
            } catch (err) {
                console.warn("Failed to sync availability to server:", err.message);
                return false;
            }
        }
        return true;
    }
};
