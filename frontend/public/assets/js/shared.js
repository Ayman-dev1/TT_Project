/**
 * Tabibi - Shared Functions (Professional Edition)
 * Central logic for RBAC, Data Persistence, and UI Utilities.
 * Uses TabibiCache (js/cache.js) for in-memory caching.
 * Exposes window.Tabibi namespace for backward compatibility.
 */

console.log("Tabibi Professional System Loaded");

// ===== STORAGE KEYS =====
const KEYS = {
  USER:          'tabibi_user',
  USERS:         'tabibi_users',
  APPOINTMENTS:  'tabibi_appointments',
  FILES:         'tabibi_files',
  CHATS:         'tabibi_chats',
  REVIEWS:       'tabibi_reviews',
  EXTRA_DOCTORS: 'tabibi_extra_doctors',
  LOGS:          'tabibi_logs',
  BROADCAST:     'tabibi_broadcast',
  HERO:          'tabibi_hero'
};

// Helper: Activity Logging
function logActivity(action, details = '') {
  try {
    const logs = _get(KEYS.LOGS, []);
    logs.push({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      action,
      details,
      user: getUser() ? getUser().name : 'System'
    });
    // Keep only last 50 logs to save space
    _set(KEYS.LOGS, logs.slice(-50));
  } catch (e) { console.error("Logger error:", e); }
}

// Helper: cache-aware read shorthand
function _get(key, def) {
  if (window.TabibiCache) return window.TabibiCache.getData(key, def);
  try { return JSON.parse(localStorage.getItem(key)) || def; }
  catch(e) { return def; }
}

// Helper: cache-aware write shorthand
function _set(key, val) {
  if (window.TabibiCache) { window.TabibiCache.setData(key, val); return; }
  localStorage.setItem(key, JSON.stringify(val));
}

// Helper: cache-aware remove
function _remove(key) {
  if (window.TabibiCache) { window.TabibiCache.removeData(key); return; }
  localStorage.removeItem(key);
}

// ===== DOCTOR ACCESS CODE =====
const DOCTOR_ACCESS_CODE = 'TABIBI-DOC-2026';

function validateDoctorCode(code) {
  return code.trim().toUpperCase() === DOCTOR_ACCESS_CODE.toUpperCase();
}

window._tabibivdc = DOCTOR_ACCESS_CODE; // expose for admin panel only

// ===== 🩺 DOCTORS DATA MANAGEMENT (Optimized with Memoization) =====
const DEFAULT_DOCTORS = [
  { id: "6a3a7822678ba26d693e6256", _id: "6a3a7822678ba26d693e6256", name: "Dr. Ahmed Mansour", specialty: "General physician", available: true, fee: 50, experience: "2 Years", degree: "MBBS, General Medicine", about: "Dedicated to providing comprehensive primary care with a patient-first approach.", img: "assets/images/M1.png", rating: 4.8, reviewsCount: 24, patientsTreated: 45, email: "ahmed@tabibi.com", clinicAddress: "12 El-Galaa St, Cairo", certificates: [{name: 'Medical_Council_Certificate.png', type: 'image/png', data: '#'}] },
  { id: "6a3a7822678ba26d693e6258", _id: "6a3a7822678ba26d693e6258", name: "Dr. Maryam El-Gohary", specialty: "Gynecologist", available: true, fee: 70, experience: "5 Years", degree: "MBBS, MSc Gynecology", about: "Specialist in women's health with compassionate, evidence-based care.", img: "assets/images/F1.png", rating: 4.9, reviewsCount: 31, patientsTreated: 120, email: "maryam@tabibi.com", clinicAddress: "45 Sphinx Square, Giza" },
  { id: "6a3a7823678ba26d693e625a", _id: "6a3a7823678ba26d693e625a", name: "Dr. Aya Sami", specialty: "Dermatologist", available: false, fee: 60, experience: "4 Years", degree: "MBBS, Dermatology Board", about: "Expert in medical and cosmetic dermatology treatments.", img: "assets/images/F2.png", rating: 4.7, reviewsCount: 18, patientsTreated: 18, email: "aya@tabibi.com", clinicAddress: "88 El-Bahr St, Tanta" },
  { id: "6a3a7823678ba26d693e625c", _id: "6a3a7823678ba26d693e625c", name: "Dr. Khaled Shouky", specialty: "Neurologist", available: true, fee: 90, experience: "8 Years", degree: "MBBS, Neurology Fellowship", about: "Specialist in neurological disorders and brain health.", img: "assets/images/M2.png", rating: 4.9, reviewsCount: 42, patientsTreated: 210, email: "khaled@tabibi.com", clinicAddress: "105 El-Nasr St, Heliopolis, Cairo" },
  { id: "6a3a7824678ba26d693e625e", _id: "6a3a7824678ba26d693e625e", name: "Dr. Youssef Nabil", specialty: "Pediatricians", available: true, fee: 55, experience: "3 Years", degree: "MBBS, Pediatrics", about: "Gentle, child-focused care for infants and adolescents.", img: "assets/images/image 419.png", rating: 4.8, reviewsCount: 27, patientsTreated: 75, email: "youssef@tabibi.com", clinicAddress: "32 El-Tahrir St, Dokki, Giza" }
];

let _doctorsCache = null;

function calculateConfidenceScore(rating, reviewsCount, patientsTreated) {
  const R = Number(rating) || 0;
  const v = Number(reviewsCount) || 0;
  const p = Number(patientsTreated) || 0;
  if (R === 0) return 0;
  const ratingPercentage = (R / 5) * 100;
  const reviewsFactor = v / (v + 5);
  const patientsFactor = p / (p + 15);
  const confidenceFactor = 0.5 * reviewsFactor + 0.5 * patientsFactor;
  return Math.round(ratingPercentage * confidenceFactor);
}

function getDoctors() {
  if (_doctorsCache) return _doctorsCache;

  const registeredUsers = _get(KEYS.USERS, []);
  const registeredDoctors = registeredUsers.filter(u => u.role === 'doctor');
  const extraDocs = _get(KEYS.EXTRA_DOCTORS, []);

  let allDoctors = [...DEFAULT_DOCTORS];

  // 1. Process Registered Doctors
  registeredDoctors.forEach(rd => {
    const existingIdx = allDoctors.findIndex(d => d.email === rd.email);
    const defaultDoctor = DEFAULT_DOCTORS.find(d => d.email === rd.email);

    const doctorData = {
      id: rd.id || (existingIdx > -1 ? allDoctors[existingIdx].id : rd.email),
      name: rd.name,
      specialty: rd.specialty || "General physician",
      available: rd.available !== undefined ? rd.available : true,
      fee: rd.fee || 50,
      experience: rd.experience || "1 Year",
      degree: rd.degree || "MBBS",
      about: rd.about || "Professional healthcare provider.",
      img: (defaultDoctor ? defaultDoctor.img : rd.img) || `https://ui-avatars.com/api/?name=${encodeURIComponent(rd.name)}&background=5F6FFF&color=fff&size=300`,
      rating: rd.rating || 4.8,
      reviewsCount: rd.reviewsCount || 0,
      patientsTreated: rd.patientsTreated || rd.patients_treated || 0,
      clinicAddress: rd.clinicAddress || (defaultDoctor ? defaultDoctor.clinicAddress : "Main Clinic"),
      email: rd.email,
      role: 'doctor'
    };

    if (existingIdx > -1) allDoctors[existingIdx] = doctorData;
    else allDoctors.push(doctorData);
  });

  // 2. Process Extra Doctors
  extraDocs.forEach(ed => {
    const existingIdx = allDoctors.findIndex(d => d.id === ed.id || (ed.email && d.email === ed.email));
    if (existingIdx > -1) {
      allDoctors[existingIdx] = { ...allDoctors[existingIdx], ...ed };
    } else {
      allDoctors.push(ed);
    }
  });

  // 3. Compute dynamic ratings and confidence scores
  allDoctors = allDoctors.map(d => {
    const docReviews = getDoctorReviews(d.id);
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
      String(appt.doctorId?._id || appt.doctorId) === String(d.id || d._id) && 
      (appt.status === 'confirmed' || appt.status === 'completed')
    ).length;

    const patients = Number(d.patientsTreated || d.patients_treated || 0) + localTreatedCount;
    const confidence = calculateConfidenceScore(finalRating, totalCount, patients);
    
    return {
      ...d,
      rating: finalRating,
      reviewsCount: totalCount,
      patientsTreated: patients,
      confidenceScore: confidence
    };
  });

  _doctorsCache = allDoctors;
  return allDoctors;
}

// Global accessor that clears cache on demand
const DOCTORS = getDoctors();

// ===== USER & AUTH MANAGEMENT =====
function getUser() {
  return _get(KEYS.USER, null);
}

function saveUser(u) {
  _set(KEYS.USER, u);
  // Also sync to users list
  const users = _get(KEYS.USERS, []);
  const idx = users.findIndex(x => x.email === u.email);
  if (idx > -1) {
    users[idx] = u;
    _set(KEYS.USERS, users);
  }
  // Invalidate doctors cache since availability may have changed
  if (window.TabibiCache) window.TabibiCache.invalidate(KEYS.USERS);
}

function logout() {
  const u = getUser();
  if (u) logActivity('User Logout', `${u.name} (${u.role}) logged out.`);
  _remove(KEYS.USER);
  window.location.href = 'index.html';
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function calculateAge(dob) {
  if (!dob) return "N/A";
  const birthDate = new Date(dob);
  const difference = Date.now() - birthDate.getTime();
  const ageDate = new Date(difference);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

// ===== APPOINTMENT MANAGEMENT =====
function getAppointments() {
  return _get(KEYS.APPOINTMENTS, []);
}

function saveAppointments(a) {
  _set(KEYS.APPOINTMENTS, a);
}

// ===== MEDICAL FILES (Multi-role support) =====
function getPatientFiles(email) {
  const all = _get(KEYS.FILES, {});
  return all[email] || [];
}

function savePatientFile(email, data) {
  try {
    const all = _get(KEYS.FILES, {});
    if (!all[email]) all[email] = [];
    const currentUser = getUser();
    all[email].push({
      id: Date.now(),
      fileName: data.fileName,
      fileType: data.fileType,
      fileData: data.fileData,
      fileSize: data.fileSize,
      uploadDate: new Date().toISOString(),
      uploadedBy: currentUser ? currentUser.name : 'System',
      uploaderRole: currentUser ? currentUser.role : 'patient'
    });
    _set(KEYS.FILES, all);
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      alert("Storage limit reached! Please delete some old files.");
    }
    console.error("File save error:", e);
    return false;
  }
}

function deletePatientFile(email, fileId) {
  try {
    const all = _get(KEYS.FILES, {});
    if (all[email]) {
      all[email] = all[email].filter(f => f.id !== fileId);
      _set(KEYS.FILES, all);
      return true;
    }
    return false;
  } catch { return false; }
}

// ===== CHAT SYSTEM =====
function getChatMessages(doctorId, patientEmail) {
  const chats = _get(KEYS.CHATS, {});
  return chats[`${doctorId}_${patientEmail}`] || [];
}

function saveChatMessage(doctorId, patientEmail, msg) {
  try {
    const chats = _get(KEYS.CHATS, {});
    // Invalidate cache so next read is fresh
    if (window.TabibiCache) window.TabibiCache.invalidate(KEYS.CHATS);

    const freshChats = JSON.parse(localStorage.getItem(KEYS.CHATS) || '{}');
    const key = `${doctorId}_${patientEmail}`;
    if (!freshChats[key]) freshChats[key] = [];
    freshChats[key].push({
      id: msg._id || msg.id || Date.now(),
      senderId: msg.senderId,
      senderRole: msg.senderRole,
      text: msg.text,
      timestamp: msg.timestamp || new Date().toISOString(),
      read: msg.read === true
    });
    _set(KEYS.CHATS, freshChats);
    return true;
  } catch (e) {
    console.error("Chat error:", e);
    return false;
  }
}

function markChatAsRead(doctorId, patientEmail) {
  try {
    const currentUser = getUser();
    if (!currentUser) return;
    const chats = JSON.parse(localStorage.getItem(KEYS.CHATS) || '{}');
    const key = `${doctorId}_${patientEmail}`;
    if (Array.isArray(chats[key])) {
      chats[key].forEach(m => { if (m.senderRole !== currentUser.role) m.read = true; });
      _set(KEYS.CHATS, chats);
    }
  } catch { }
}

// ===== ⭐ REVIEWS =====
function getDoctorReviews(doctorId) {
  const all = _get(KEYS.REVIEWS, {});
  return all[doctorId] || [];
}

function saveReview(doctorId, review) {
  try {
    const all = _get(KEYS.REVIEWS, {});
    if (!all[doctorId]) all[doctorId] = [];
    all[doctorId].push({ ...review, id: Date.now(), date: new Date().toISOString() });
    _set(KEYS.REVIEWS, all);
    return true;
  } catch { return false; }
}

// ===== PERMISSIONS =====
function isDoctor()  { const u = getUser(); return u && u.role === 'doctor'; }
function isPatient() { const u = getUser(); return u && u.role === 'patient'; }
function isAdmin()   { const u = getUser(); return u && u.email === 'admin@tabibi.com'; }

// ===== UI UTILS =====
function updateNav() {
  const user = getUser();
  const navRight = document.getElementById('navRight');
  const navLinks = document.querySelector('.nav-links');

  // 1. Standardize Nav Links
  if (navLinks) {
    const p = window.location.pathname;
    const is = (path) => p.endsWith(path) || (path === 'index.html' && (p === '/' || p === '' || p.endsWith('/')));

    navLinks.innerHTML = `
      <a href="index.html" class="${is('index.html') ? 'active' : ''}">Home</a>
      <a href="doctors.html" class="${is('doctors.html') ? 'active' : ''}">All Doctors</a>
      <a href="chatbot.html" class="${is('chatbot.html') ? 'active' : ''}"><i class="fas fa-robot"></i> Shifaa AI</a>
    `;

    // Re-attach mobile close-on-click
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        const overlay = document.querySelector('.mobile-nav-overlay');
        if (overlay) overlay.classList.remove('show');
        const btn = document.querySelector('.hamburger');
        if (btn) btn.classList.remove('open');
      });
    });
  }

  // 2. Standardize User Menu / Login Buttons
  if (navRight) {
    if (user) {
      const doctorMatch = getDoctors().find(d => d.email === user.email);
      const doctorId = doctorMatch ? doctorMatch.id : 1;

      const initials = user.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
      const roleIcon = user.role === 'doctor' ? '<i class="fas fa-stethoscope"></i>' : '<i class="fas fa-user-circle"></i>';
      const userImgStyle = user.img ? `background-image:url(${user.img}); background-size:cover; background-position:center; border:none;` : '';

      navRight.innerHTML = `
        <div class="user-menu">
          <div class="user-avatar" style="${userImgStyle}" aria-label="User menu">${user.img ? '' : initials}</div>
          <div class="user-dropdown">

            <!-- Premium Header -->
            <div class="dropdown-header">
              <div class="dropdown-avatar" style="${userImgStyle}">${user.img ? '' : initials}</div>
              <div class="dropdown-info">
                <strong>${user.name}</strong>
                <span>${user.email}</span>
                <div class="role-badge-pill ${user.role}">${roleIcon} ${user.role === 'doctor' ? 'Doctor' : 'Patient'}</div>
              </div>
            </div>

            <!-- Doctor Status Toggle -->
            ${isDoctor() ? `
              <div class="status-toggle-container" onclick="event.stopPropagation();">
                <span>Status: <strong class="${user.available ? 'text-green' : 'text-red'}">${user.available ? '● Available' : '● Unavailable'}</strong></span>
                <label class="nav-switch">
                  <input type="checkbox" ${user.available ? 'checked' : ''} onclick="Tabibi.toggleGlobalAvailability()" aria-label="Toggle availability">
                  <span class="nav-slider"></span>
                </label>
              </div>
              <div class="dropdown-divider"></div>
            ` : '<div class="dropdown-divider"></div>'}

            <!-- Links -->
            <div class="dropdown-links">
              <a href="profile.html">
                <span class="link-icon"><i class="fas fa-circle-user"></i></span> My Profile
              </a>
              ${isDoctor()
          ? `<a href="my-appointments.html"><span class="link-icon"><i class="fas fa-users"></i></span> My Patients</a>`
          : `<a href="my-appointments.html"><span class="link-icon"><i class="fas fa-calendar-check"></i></span> My Appointments</a>`
        }
              ${isDoctor()
          ? `<a href="appointment.html?id=${doctorId}"><span class="link-icon"><i class="fas fa-stethoscope"></i></span> My Public Page</a>`
          : ''
        }
              <div class="dropdown-divider"></div>
              <a href="#" onclick="logout();return false;" class="logout-link">
                <span class="link-icon"><i class="fas fa-right-from-bracket"></i></span> Logout
              </a>
            </div>

          </div>
        </div>`;
    } else {
      // Logged out state
      navRight.innerHTML = `
          <button class="btn-primary" onclick="window.location.href='index.html?auth=login'">Login</button>
          <button class="btn-primary" style="background:white;color:var(--primary);border:1px solid var(--primary);" onclick="window.location.href='index.html?auth=register'">Create account</button>
        `;
    }
  }
}

function initUI() {
  updateNav();

  // ── Hamburger menu ──────────────────────────────────────────────
  const hamburger = document.querySelector('.hamburger');
  const navLinks  = document.querySelector('.nav-links');

  if (hamburger && navLinks) {
    // Create overlay element if not present
    let overlay = document.querySelector('.mobile-nav-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'mobile-nav-overlay';
      document.body.appendChild(overlay);
    }

    hamburger.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      hamburger.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-expanded', isOpen);
      overlay.classList.toggle('show', isOpen);
    });

    overlay.addEventListener('click', () => {
      navLinks.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      overlay.classList.remove('show');
    });
  }

  // ── Scroll Reveal Observer ──────────────────────────────────────
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('active');
    });
  }, { threshold: 0.15 });

  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));
  
  checkBroadcastBanner();
}

function checkBroadcastBanner() {
  const data = _get(KEYS.BROADCAST, null);
  if (!data || !data.active) return;

  const colors = {
    info:    { bg: '#3B82F6', text: '#fff' },
    success: { bg: '#10B981', text: '#fff' },
    warning: { bg: '#F59E0B', text: '#fff' },
    error:   { bg: '#EF4444', text: '#fff' }
  };
  const theme = colors[data.type] || colors.info;

  const banner = document.createElement('div');
  banner.id = 'broadcast-banner';
  banner.style = `position:fixed; top:80px; left:0; right:0; background:${theme.bg}; color:${theme.text}; padding:10px 20px; text-align:center; font-size:14px; font-weight:600; z-index:4000; box-shadow:0 2px 10px rgba(0,0,0,0.1); display:flex; align-items:center; justify-content:center; gap:15px;`;
  banner.innerHTML = `<span><i class="fas fa-bullhorn"></i> ${data.msg}</span> <button onclick="this.parentElement.remove()" style="background:none; border:none; color:inherit; cursor:pointer; font-size:18px; line-height:1">&times;</button>`;
  
  document.body.appendChild(banner);
  document.body.style.paddingTop = (parseInt(getComputedStyle(document.body).paddingTop) + 45) + 'px';
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI);
} else {
  initUI();
}

function toggleGlobalAvailability() {
  const u = getUser();
  if (!u || u.role !== 'doctor') return;
  u.available = !u.available;
  saveUser(u);
  updateNav();
  // Dispatch event for specialized pages (like Profile) to re-render their local content
  window.dispatchEvent(new CustomEvent('tabibiStatusChanged', { detail: u.available }));
}

// ===== TOAST UTILITY =====
function showToast(msg) {
  let t = document.getElementById('toast');
  if(!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function invalidateDoctorsCache() {
  _doctorsCache = null;
  if (window.TabibiCache) window.TabibiCache.invalidate(KEYS.USERS);
}

// Global exports — identical namespace for backward compatibility
window.Tabibi = {
  getUser, saveUser, logout, isValidEmail, calculateAge,
  getAppointments, saveAppointments, getDoctors, invalidateDoctorsCache,
  getPatientFiles, savePatientFile, deletePatientFile,
  getChatMessages, saveChatMessage, markChatAsRead,
  getDoctorReviews, saveReview,
  isDoctor, isPatient, isAdmin,
  updateNav, initUI, toggleGlobalAvailability,
  validateDoctorCode, showToast, logActivity,
  DOCTOR_ACCESS_CODE,
  get DOCTORS() { return getDoctors(); }
};