import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { TabibiAPI } from '../utils/TabibiAPI';
import QRComponent from '../components/QRComponent';

const MyAppointments = () => {
    const navigate = useNavigate();
    const user = TabibiAPI.getUser();
    const isAdmin = user?.isAdmin || user?.role === 'admin';

    const [appointments, setAppointments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('clinic'); // 'clinic' for doctor dashboard, 'personal' for medical visits
    
    // Modals state
    const [cancelTargetId, setCancelTargetId] = useState(null);
    const [confirmVisible, setConfirmVisible] = useState(false);
    
    const [recordsVisible, setRecordsVisible] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState({ email: '', name: '' });
    const [patientRecords, setPatientRecords] = useState([]);

    const [receiptVisible, setReceiptVisible] = useState(false);
    const [selectedAppt, setSelectedAppt] = useState(null);
    const matchedDoc = selectedAppt ? TabibiAPI.getDoctors().find(d => String(d.id) === String(selectedAppt.doctorId?._id || selectedAppt.doctorId) || String(d._id) === String(selectedAppt.doctorId?._id || selectedAppt.doctorId)) : null;

    useEffect(() => {
        if (!user) return;
        fetchAppointments();
    }, []);

    const handleResubmitReference = async (apptId, refCode, method) => {
        try {
            const token = TabibiAPI.getToken();
            const isBackendId = /^[a-f\d]{24}$/i.test(String(apptId));
            
            if (token && isBackendId) {
                await axios.patch(`/api/appointments/${apptId}/resubmit-payment`, {
                    transactionRef: refCode
                }, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                
                // Update local representation
                TabibiAPI.updateAppointment(apptId, {
                    transactionRef: refCode,
                    paymentStatus: 'Pending Verification',
                    rejectionReason: ''
                });
                TabibiAPI.showToast('Reference resubmitted successfully!');
                fetchAppointments();
            } else {
                // Local check for duplicates
                const localAppts = TabibiAPI.getAppointments() || [];
                const dup = localAppts.find(a => a.transactionRef === refCode && a.paymentMethod === method && String(a.id) !== String(apptId));
                if (dup) {
                    TabibiAPI.showToast('Transaction reference already used');
                    return;
                }
                
                TabibiAPI.updateAppointment(apptId, {
                    transactionRef: refCode,
                    paymentStatus: 'Pending Verification',
                    rejectionReason: ''
                });
                
                TabibiAPI.logActivity('Reference Resubmitted', `Patient resubmitted payment reference ${refCode} for Local Booking ${apptId}`);
                TabibiAPI.showToast('Reference resubmitted successfully! (Local)');
                fetchAppointments();
            }
        } catch (err) {
            if (err.response) {
                const errMsg = err.response.data?.message || 'Failed to resubmit reference';
                TabibiAPI.showToast(errMsg);
            } else {
                // Local fallback duplicate check
                const localAppts = TabibiAPI.getAppointments() || [];
                const dup = localAppts.find(a => a.transactionRef === refCode && a.paymentMethod === method && String(a.id) !== String(apptId));
                if (dup) {
                    TabibiAPI.showToast('Transaction reference already used');
                    return;
                }
                
                TabibiAPI.updateAppointment(apptId, {
                    transactionRef: refCode,
                    paymentStatus: 'Pending Verification',
                    rejectionReason: ''
                });
                
                TabibiAPI.logActivity('Reference Resubmitted', `Patient resubmitted payment reference ${refCode} for Booking ${apptId} (Offline)`);
                TabibiAPI.showToast('Reference resubmitted offline (saved locally)');
                fetchAppointments();
            }
        }
    };

    const fetchAppointments = async () => {
        setLoading(true);
        try {
            const token = TabibiAPI.getToken();
            let res;
            if (isAdmin) {
                res = await axios.get('/api/admin/appointments', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setAppointments(Array.isArray(res.data) ? res.data : []);
                return;
            } else if (user.role === 'doctor') {
                res = await axios.get('/api/appointments/doctor', {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                res = await axios.get('/api/appointments/user', {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }

            // Retrieve current cached appointments in localStorage
            const localAppts = TabibiAPI.getAppointments() || [];

            // Filter out appointments of other users to avoid wiping them out
            const otherUsersAppts = localAppts.filter(a => {
                if (user.role === 'doctor') {
                    const docId = user.doctorId || user.id;
                    return String(a.doctorId?._id || a.doctorId) !== String(docId);
                } else {
                    return a.userEmail !== user.email && String(a.patientId?._id || a.patientId) !== String(user._id || user.id);
                }
            });

            // Preserve local/offline-only appointments belonging to the current user
            const currentUserOfflineAppts = localAppts.filter(a => {
                const belongsToUser = user.role === 'doctor'
                    ? String(a.doctorId?._id || a.doctorId) === String(user.doctorId || user.id)
                    : (a.userEmail === user.email || String(a.patientId?._id || a.patientId) === String(user._id || user.id));

                if (!belongsToUser) return false;

                const isNumericId = typeof a.doctorId === 'number' || /^\d+$/.test(String(a.doctorId));
                const isTempLocal = !a._id && !/^[a-f\d]{24}$/i.test(String(a.id));
                return isNumericId || isTempLocal;
            });

            // Merge everything
            const mergedAppts = [...otherUsersAppts, ...res.data, ...currentUserOfflineAppts];

            // Deduplicate by key (id or _id)
            const uniqueMap = new Map();
            mergedAppts.forEach(a => {
                const key = a._id || a.id;
                uniqueMap.set(String(key), a);
            });
            const deduplicated = Array.from(uniqueMap.values());

            // Save deduplicated list back to cache
            TabibiAPI.saveAppointments(deduplicated);

            // Filter the final list to show in this view
            let finalAppts = [];
            if (user.role === 'doctor') {
                const docId = user.doctorId || user.id;
                finalAppts = deduplicated.filter(a => String(a.doctorId?._id || a.doctorId) === String(docId) && a.status !== 'cancelled');
            } else {
                finalAppts = deduplicated.filter(a => (a.userEmail === user.email || String(a.patientId?._id || a.patientId) === String(user._id || user.id)) && a.status !== 'cancelled');
            }

            setAppointments(finalAppts);
        } catch (err) {
            if (err.response) {
                const errMsg = err.response.data?.message || 'Failed to fetch appointments';
                TabibiAPI.showToast(errMsg);
            } else {
                // Fallback to local data
                const localAppts = TabibiAPI.getAppointments() || [];
                if (user.role === 'doctor') {
                    const docId = user.doctorId || user.id;
                    setAppointments(localAppts.filter(a => String(a.doctorId?._id || a.doctorId) === String(docId) && a.status !== 'cancelled'));
                } else if (isAdmin) {
                    setAppointments(localAppts);
                } else {
                    setAppointments(localAppts.filter(a => (a.userEmail === user.email || String(a.patientId?._id || a.patientId) === String(user._id || user.id)) && a.status !== 'cancelled'));
                }
            }
        } finally {
            setLoading(false);
        }
    };

    const handleCancelClick = (id) => {
        setCancelTargetId(id);
        setConfirmVisible(true);
    };

    const confirmCancel = async () => {
        const isBackendId = /^[a-f\d]{24}$/i.test(String(cancelTargetId));

        if (!isBackendId) {
            // Cancel it locally/offline
            const appts = TabibiAPI.getAppointments().filter(a => String(a.id) !== String(cancelTargetId) && String(a._id) !== String(cancelTargetId));
            TabibiAPI.saveAppointments(appts);
            TabibiAPI.showToast('Appointment cancelled (Local)');
            setConfirmVisible(false);
            setCancelTargetId(null);
            fetchAppointments();
            return;
        }

        try {
            const token = TabibiAPI.getToken();
            await axios.patch('/api/appointments/cancel', { appointmentId: cancelTargetId }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Update local copy too to keep state synced
            const appts = TabibiAPI.getAppointments().map(a => 
                String(a.id) === String(cancelTargetId) || String(a._id) === String(cancelTargetId)
                    ? { ...a, status: 'cancelled' }
                    : a
            );
            TabibiAPI.saveAppointments(appts);
            TabibiAPI.showToast('Appointment cancelled successfully');
        } catch (err) {
            if (err.response) {
                const errMsg = err.response.data?.message || 'Failed to cancel appointment';
                TabibiAPI.showToast(errMsg);
            } else {
                // Local fallback
                const appts = TabibiAPI.getAppointments().map(a => 
                    String(a.id) === String(cancelTargetId) || String(a._id) === String(cancelTargetId)
                        ? { ...a, status: 'cancelled' }
                        : a
                );
                TabibiAPI.saveAppointments(appts);
                TabibiAPI.showToast('Appointment cancelled (Offline)');
            }
        }
        setConfirmVisible(false);
        setCancelTargetId(null);
        fetchAppointments();
    };

    const viewPatientFiles = async (email, name) => {
        setSelectedPatient({ email, name });
        try {
            const files = await TabibiAPI.getPatientFiles(email);
            setPatientRecords(files);
        } catch (err) {
            console.error("Error loading patient records:", err);
            setPatientRecords([]);
        }
        setRecordsVisible(true);
    };

    const showReceipt = (appt) => {
        setSelectedAppt(appt);
        setReceiptVisible(true);
    };

    const triggerPrint = () => {
        window.print();
    };

    if (!user) {
        return (
            <div className="login-required" style={{ textAlign: 'center', padding: '100px 40px' }}>
                <h2>Please login first</h2>
                <p style={{ color: 'var(--gray)', marginBottom: '24px' }}>You need to be logged in to view your appointments.</p>
                <button className="btn-primary" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>Go to Login</button>
            </div>
        );
    }

    const docProfile = TabibiAPI.getDoctors().find(d => d.email === user.email);

    return (
        <div className="main" style={{ padding: '30px 80px', minHeight: '80vh' }}>
            {/* Embedded styles for premium visuals */}
            <style dangerouslySetInnerHTML={{ __html: `
                .appointments-page-container {
                    animation: fadeInUp 0.5s ease-out forwards;
                }
                .premium-tabs {
                    display: flex;
                    gap: 8px;
                    margin: 20px 0 32px;
                    background: #fff;
                    padding: 8px;
                    border-radius: 18px;
                    width: fit-content;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.03);
                    border: 1px solid #E5E7EB;
                }
                .premium-tab-btn {
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    padding: 12px 24px;
                    border-radius: 14px;
                    fontWeight: 600;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 15px;
                    font-family: inherit;
                    color: var(--gray);
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .premium-tab-btn:hover {
                    color: var(--primary);
                    background: rgba(95, 111, 255, 0.05);
                }
                .premium-tab-btn.active {
                    background: var(--primary);
                    color: white;
                    box-shadow: 0 4px 12px rgba(95, 111, 255, 0.2);
                    font-weight: 600;
                }
                .appt-card-premium {
                    background: white;
                    border-radius: 24px;
                    padding: 24px;
                    display: flex;
                    gap: 24px;
                    border: 1.5px solid #F3F4F6;
                    align-items: center;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.01);
                }
                .appt-card-premium:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 16px 36px rgba(95, 111, 255, 0.08);
                    border-color: rgba(95, 111, 255, 0.25);
                }
                .appt-img-wrapper {
                    width: 100px;
                    height: 100px;
                    border-radius: 18px;
                    overflow: hidden;
                    background: var(--primary-light);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid #E5E7EB;
                    transition: transform 0.3s ease;
                }
                .appt-card-premium:hover .appt-img-wrapper {
                    transform: scale(1.04);
                }
                .doctor-patient-avatar {
                    width: 80px;
                    height: 80px;
                    border-radius: 50%;
                    background: var(--primary-light);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    color: var(--primary);
                    font-weight: 700;
                    border: 2px solid white;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
                    transition: transform 0.3s ease;
                }
                .appt-card-premium:hover .doctor-patient-avatar {
                    transform: scale(1.05) rotate(3deg);
                }
                .action-btn-pill {
                    padding: 9px 16px;
                    border-radius: 10px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    transition: all 0.2s ease;
                    border: 1.5px solid transparent;
                    font-family: inherit;
                }
                .action-btn-pill.btn-chat {
                    background: var(--primary-light);
                    color: var(--primary);
                    border: 1px solid rgba(95, 111, 255, 0.15);
                }
                .action-btn-pill.btn-chat:hover {
                    background: var(--primary);
                    color: white;
                    box-shadow: 0 4px 12px rgba(95, 111, 255, 0.2);
                }
                .action-btn-pill.btn-message-patient {
                    background: #10B981;
                    color: white;
                    border: none;
                }
                .action-btn-pill.btn-message-patient:hover {
                    background: #059669;
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
                }
                .action-btn-pill.btn-edit {
                    background: white;
                    border: 1px solid #E5E7EB;
                    color: var(--gray);
                }
                .action-btn-pill.btn-edit:hover {
                    background: #F9FAFB;
                    border-color: var(--light-gray);
                }
                .action-btn-pill.btn-rate {
                    background: #FFFBEB;
                    border: 1px solid #FDE68A;
                    color: #D97706;
                }
                .action-btn-pill.btn-rate:hover {
                    background: #FEF3C7;
                }
                .action-btn-pill.btn-receipt {
                    background: #F3F4F6;
                    border: 1px solid #E5E7EB;
                    color: var(--gray);
                }
                .action-btn-pill.btn-receipt:hover {
                    background: #E5E7EB;
                }
                .action-btn-pill.btn-cancel {
                    background: #FEF2F2;
                    border: 1px solid #FCA5A5;
                    color: #DC2626;
                }
                .action-btn-pill.btn-cancel:hover {
                    background: #DC2626;
                    color: white;
                    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.15);
                }
                .action-btn-pill.btn-status-pending {
                    background: #FFFBEB;
                    color: #D97706;
                    border: 1px solid #FDE68A;
                    cursor: default;
                }
                .action-btn-pill.btn-status-confirmed {
                    background: #F0FDF4;
                    color: #166534;
                    border: 1px solid #BBF7D0;
                    cursor: default;
                }
                .premium-empty-state {
                    text-align: center;
                    padding: 80px 40px;
                    background: white;
                    border-radius: 28px;
                    border: 1.5px solid #F3F4F6;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.02);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                }
                .premium-empty-icon-container {
                    width: 120px;
                    height: 120px;
                    border-radius: 50%;
                    background: var(--primary-light);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 24px;
                }
                .premium-empty-icon-container i {
                    font-size: 48px;
                    color: var(--primary);
                    animation: bounceSlow 3s ease-in-out infinite;
                }
                @keyframes bounceSlow {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-8px); }
                }
                .modal-blur-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(15, 23, 42, 0.4);
                    backdrop-filter: blur(8px);
                    -webkit-backdrop-filter: blur(8px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    animation: fadeIn 0.2s ease-out;
                }
                .modal-content-premium {
                    background: white;
                    border-radius: 24px;
                    box-shadow: 0 30px 60px rgba(0, 0, 0, 0.12);
                    animation: scaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
                    overflow: hidden;
                    border: 1px solid rgba(255,255,255,0.7);
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes scaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .btn-modal-action {
                    padding: 11px 22px;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: inherit;
                }
            `}} />

            <div className="appointments-page-container">
                <div className="page-title" style={{ fontSize: '28px', fontWeight: '700', color: 'var(--dark)', marginBottom: '20px' }}>
                    {isAdmin ? 'Appointments' : user.role === 'doctor' ? 'My Dashboard' : 'My Appointments'}
                </div>

                {/* Admin View */}
                {isAdmin && (
                    <div className="tab-content active">
                        {loading ? (
                            <div className="premium-empty-state">
                                <h3>Loading appointments...</h3>
                            </div>
                        ) : appointments.length === 0 ? (
                            <div className="premium-empty-state">
                                <div className="premium-empty-icon-container">
                                    <i className="fas fa-calendar-check"></i>
                                </div>
                                <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--dark)' }}>No appointments yet</h3>
                                <p style={{ color: 'var(--gray)', fontSize: '16px' }}>Platform bookings will appear here.</p>
                            </div>
                        ) : (
                            <div className="appt-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {appointments.map(a => {
                                    const patientName = a.patientId?.name || a.userName || 'Patient';
                                    const patientEmail = a.patientId?.email || a.userEmail || '';
                                    const doctorName = a.doctorId?.userId?.name || a.doctorName || 'Doctor';

                                    return (
                                        <div className="appt-card-premium" key={a._id || a.id}>
                                            <div className="doctor-patient-avatar">
                                                {(patientName || 'P').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="appt-info" style={{ flex: 1 }}>
                                                <div className="appt-name" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}>{patientName}</div>
                                                <div className="appt-spec" style={{ fontSize: '14px', color: 'var(--gray)', margin: '4px 0' }}>{patientEmail}</div>
                                                <div className="appt-datetime" style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '14px', flexWrap: 'wrap' }}>
                                                    <div><i className="fas fa-user-md" style={{ color: 'var(--primary)', marginRight: '6px' }}></i> Doctor: <strong>{doctorName}</strong></div>
                                                    <div><i className="far fa-calendar-alt" style={{ color: 'var(--primary)', marginRight: '6px' }}></i> Date: <strong>{new Date(a.date).toLocaleDateString()}</strong></div>
                                                    <div><i className="far fa-clock" style={{ color: 'var(--primary)', marginRight: '6px' }}></i> Time: <strong>{a.time}</strong></div>
                                                </div>
                                                <div className="appt-payment-row" style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <span className="payment-status-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px', borderRadius: '8px', background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', fontWeight: 600 }}>
                                                        Status: {a.status || 'pending'}
                                                    </span>
                                                    <span className="payment-status-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px', borderRadius: '8px', background: '#EEF2FF', color: '#3730A3', border: '1px solid #C7D2FE', fontWeight: 600 }}>
                                                        Payment: {a.paymentStatus || 'Pending'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="appt-actions" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <button className="action-btn-pill btn-receipt" onClick={() => showReceipt(a)}>
                                                    <i className="fas fa-receipt"></i> Receipt
                                                </button>
                                                <button className="action-btn-pill btn-edit" onClick={() => navigate('/admin')}>
                                                    <i className="fas fa-user-shield"></i> Admin Panel
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Patients View (Appointments List) */}
                {(!user.role || user.role === 'patient') && (
                    <div className="tab-content active">
                        {loading ? (
                            <div className="premium-empty-state">
                                <h3>Loading appointments...</h3>
                            </div>
                        ) : appointments.length === 0 ? (
                            <div className="premium-empty-state">
                                <div className="premium-empty-icon-container">
                                    <i className="fas fa-folder-open"></i>
                                </div>
                                <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--dark)' }}>No appointments yet</h3>
                                <p style={{ color: 'var(--gray)', fontSize: '16px', maxWidth: '400px', margin: '8px auto 24px' }}>Book your first consultation with our top specialists.</p>
                                <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '12px 32px' }} onClick={() => navigate('/doctors')}>
                                    <i className="fas fa-stethoscope"></i> Find a Doctor
                                </button>
                            </div>
                        ) : (
                            <div className="appt-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {appointments.map(a => {
                                    const apptDocId = a.doctorId?._id || a.doctorId;
                                    const matchedDoc = TabibiAPI.getDoctors().find(d => String(d.id) === String(apptDocId) || String(d._id) === String(apptDocId));
                                    const docName = a.doctorId?.userId?.name || a.doctorName || matchedDoc?.name || 'Doctor';
                                    const docSpec = a.doctorId?.specialty || a.specialty || matchedDoc?.specialty || 'General';
                                    const docImg = TabibiAPI.normalizeImg(a.doctorId?.userId?.image || a.doctorImg || matchedDoc?.img || matchedDoc?.image);
                                    return (
                                        <div className="appt-card-premium" key={a._id || a.id}>
                                            <div className="appt-img-wrapper">
                                                <img src={docImg} alt={docName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                            <div className="appt-info" style={{ flex: 1 }}>
                                                <div className="appt-name" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}>{docName}</div>
                                                <div className="appt-spec" style={{ fontSize: '14px', color: 'var(--gray)', margin: '4px 0' }}>{docSpec}</div>
                                                <div className="appt-datetime" style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '14px' }}>
                                                    <div><i className="far fa-calendar-alt" style={{ color: 'var(--primary)', marginRight: '6px' }}></i> Date: <strong>{new Date(a.date).toLocaleDateString()}</strong></div>
                                                    <div><i className="far fa-clock" style={{ color: 'var(--primary)', marginRight: '6px' }}></i> Time: <strong>{a.time}</strong></div>
                                                </div>

                                                {/* Payment details integration */}
                                                <div className="appt-payment-row" style={{ display: 'flex', gap: '12px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    <span className="payment-badge-pill" style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px', borderRadius: '8px', background: '#F3F4F6', color: '#374151', border: '1px solid #E5E7EB', fontWeight: 600
                                                    }}>
                                                        {a.paymentMethod === 'cash' && <><i className="fas fa-clinic-medical"></i> Cash at Clinic</>}
                                                        {a.paymentMethod === 'vodafone' && <><i className="fas fa-mobile-alt"></i> Vodafone Cash</>}
                                                        {a.paymentMethod === 'instapay' && <><i className="fas fa-university"></i> Instapay</>}
                                                    </span>

                                                    <span className="payment-status-pill" style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '4px 10px', borderRadius: '8px', fontWeight: 600,
                                                        ...(a.paymentStatus === 'Paid' && { background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' }),
                                                        ...(a.paymentStatus === 'Pending' && { background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }),
                                                        ...(a.paymentStatus === 'Pending Verification' && { background: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE' }),
                                                        ...(a.paymentStatus === 'Rejected' && { background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' })
                                                    }}>
                                                        {a.paymentStatus === 'Paid' && <><i className="fas fa-check-circle"></i> Paid</>}
                                                        {a.paymentStatus === 'Pending' && <><i className="fas fa-clock"></i> Pending Payment</>}
                                                        {a.paymentStatus === 'Pending Verification' && <><i className="fas fa-spinner fa-spin"></i> Pending Verification</>}
                                                        {a.paymentStatus === 'Rejected' && <><i className="fas fa-exclamation-circle"></i> Rejected</>}
                                                    </span>

                                                    {a.transactionRef && (
                                                        <span style={{ fontSize: '12px', color: 'var(--gray)' }}>
                                                            Ref: <strong>{a.transactionRef}</strong>
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Resubmit flow for rejected references */}
                                                {a.paymentStatus === 'Rejected' && (
                                                    <div style={{ marginTop: '12px', padding: '12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        <div style={{ fontSize: '13px', color: '#991B1B', fontWeight: 600 }}>
                                                            <i className="fas fa-exclamation-triangle"></i> Rejection Reason: <span style={{ fontWeight: 500 }}>{a.rejectionReason || 'Invalid Reference'}</span>
                                                        </div>
                                                        
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <input 
                                                                type="text" 
                                                                id={`resubmit-ref-${a._id || a.id}`} 
                                                                placeholder="Enter new reference ID" 
                                                                style={{
                                                                    flex: 1, padding: '6px 12px', border: '1.5px solid #FCA5A5', borderRadius: '8px', fontSize: '13px', outline: 'none'
                                                                }}
                                                            />
                                                            <button 
                                                                className="action-btn-pill" 
                                                                style={{
                                                                    background: '#DC2626', color: 'white', border: 'none', padding: '7px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer'
                                                                }}
                                                                onClick={async () => {
                                                                    const input = document.getElementById(`resubmit-ref-${a._id || a.id}`);
                                                                    const refVal = input?.value || '';
                                                                    if (!refVal.trim()) {
                                                                        TabibiAPI.showToast('Please enter a transaction reference number');
                                                                        return;
                                                                    }
                                                                    await handleResubmitReference(a._id || a.id, refVal, a.paymentMethod);
                                                                }}
                                                            >
                                                                Resubmit Reference
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="appt-actions" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {a.status === 'pending' && (
                                                    <button className="action-btn-pill btn-status-pending">
                                                        <i className="fas fa-clock"></i> Pending Confirm
                                                    </button>
                                                )}
                                                {a.status === 'confirmed' && (
                                                    <button className="action-btn-pill btn-status-confirmed">
                                                        <i className="fas fa-check-circle"></i> Confirmed ✓
                                                    </button>
                                                )}
                                                {a.status === 'completed' && (
                                                    <button className="action-btn-pill btn-status-confirmed" style={{ background: '#E0F2FE', color: '#0369A1', borderColor: '#BAE6FD' }}>
                                                        <i className="fas fa-check-double"></i> Completed ✓
                                                    </button>
                                                )}
                                                {a.status === 'cancelled' && (
                                                    <button className="action-btn-pill" style={{ background: '#FEF2F2', color: '#DC2626', border: '1.5px solid #FCA5A5', cursor: 'default' }}>
                                                        <i className="fas fa-times-circle"></i> Cancelled
                                                    </button>
                                                )}
                                                <button 
                                                    className="action-btn-pill btn-chat" 
                                                    onClick={() => navigate(`/messages?doctorId=${apptDocId}&patient=${encodeURIComponent(user.email)}`)}
                                                >
                                                    <i className="fas fa-comment-dots"></i> Chat with Doctor
                                                </button>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {a.status !== 'cancelled' && a.status !== 'completed' && (
                                                        <button className="action-btn-pill btn-edit" style={{ flex: 1 }} onClick={() => navigate(`/appointment?id=${apptDocId}&edit=${a._id || a.id}`)}>
                                                            <i className="fas fa-edit"></i> Edit
                                                        </button>
                                                    )}
                                                    <button className="action-btn-pill btn-rate" style={{ flex: 1 }} onClick={() => navigate(`/appointment?id=${apptDocId}#reviews`)}>
                                                        <i className="fas fa-star"></i> Rate
                                                    </button>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button className="action-btn-pill btn-receipt" style={{ flex: 1 }} onClick={() => showReceipt(a)}>
                                                        <i className="fas fa-receipt"></i> Receipt
                                                    </button>
                                                    {a.status !== 'cancelled' && a.status !== 'completed' && (
                                                        <button className="action-btn-pill btn-cancel" style={{ flex: 1 }} onClick={() => handleCancelClick(a._id || a.id)}>
                                                            <i className="fas fa-times"></i> Cancel
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Doctor Clinic view */}
                {user.role === 'doctor' && activeTab === 'clinic' && (
                    <div className="tab-content active">
                        {loading ? (
                            <div className="premium-empty-state">
                                <h3>Loading patient bookings...</h3>
                            </div>
                        ) : appointments.length === 0 ? (
                            <div className="premium-empty-state">
                                <div className="premium-empty-icon-container">
                                    <i className="fas fa-calendar-times"></i>
                                </div>
                                <h3 style={{ fontSize: '22px', fontWeight: '700', color: 'var(--dark)' }}>No Patients Yet</h3>
                                <p style={{ color: 'var(--gray)', fontSize: '16px' }}>Upcoming appointments booked by patients will appear here.</p>
                            </div>
                        ) : (
                            <div className="appt-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {Array.from(new Set(appointments.map(a => a.patientId?._id || a.patientId || a.userEmail))).map(patientKey => {
                                    const firstAppt = appointments.find(a => (a.patientId?._id || a.patientId || a.userEmail) === patientKey);
                                    const pUser = firstAppt?.patientId || { name: firstAppt?.userName || patientKey, email: firstAppt?.userEmail || patientKey };
                                    return (
                                        <div className="appt-card-premium" key={patientKey}>
                                            <div className="doctor-patient-avatar">
                                                {(pUser.name || 'P').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="appt-info" style={{ flex: 1 }}>
                                                <div className="appt-name" style={{ fontSize: '20px', fontWeight: '700', color: 'var(--dark)' }}>{pUser.name}</div>
                                                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '14px', color: 'var(--gray)' }}>
                                                    <div><i className="fas fa-envelope" style={{ width: '20px', color: 'var(--primary)' }}></i> {pUser.email}</div>
                                                    {pUser.phone && <div><i className="fas fa-phone-alt" style={{ width: '20px', color: 'var(--primary)' }}></i> {pUser.phone}</div>}
                                                </div>
                                            </div>
                                            <div className="appt-actions" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <button className="action-btn-pill btn-message-patient" onClick={() => navigate(`/messages?doctorId=${docProfile?.id || 1}&patient=${encodeURIComponent(pUser.email)}`)}>
                                                    <i className="fas fa-comment-dots"></i> Message Patient
                                                </button>
                                                <button className="action-btn-pill btn-edit" onClick={() => viewPatientFiles(pUser.email, pUser.name)}>
                                                    <i className="fas fa-folder-open" style={{ color: 'var(--primary)' }}></i> Patient Records
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Cancel Confirm Modal */}
            {confirmVisible && (
                <div className="modal-blur-overlay">
                    <div className="modal-content-premium" style={{ padding: '30px', textAlign: 'center', maxWidth: '400px', width: '90%' }}>
                        <h3 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--dark)' }}>Cancel Appointment?</h3>
                        <p style={{ color: 'var(--gray)', margin: '14px 0 24px' }}>Are you sure you want to cancel this appointment?</p>
                        <div className="confirm-btns" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button className="btn-modal-action" style={{ border: '1px solid #ccc', background: 'white', color: 'var(--gray)' }} onClick={() => setConfirmVisible(false)}>Keep it</button>
                            <button className="btn-modal-action" style={{ border: 'none', background: '#DC2626', color: 'white' }} onClick={confirmCancel}>Yes, Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Records Modal */}
            {recordsVisible && (
                <div className="modal-blur-overlay">
                    <div className="modal-content-premium" style={{ padding: '30px', width: '600px', maxWidth: '90%', textAlign: 'left' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '20px', fontWeight: '700' }}>Medical Records: {selectedPatient.name}</h3>
                            <button onClick={() => setRecordsVisible(false)} style={{ background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: 'var(--gray)' }}>&times;</button>
                        </div>
                        <div className="file-grid-modal" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px', maxHeight: '400px', overflowY: 'auto' }}>
                            {patientRecords.length === 0 ? (
                                <p style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px', color: 'var(--gray)' }}>No files uploaded by this patient.</p>
                            ) : (
                                patientRecords.map(f => (
                                    <div className="file-card" key={f.id} style={{ border: '1px solid #E5E7EB', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: '#F9FAFB' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <i className="fas fa-file-medical" style={{ color: 'var(--primary)', fontSize: '20px' }}></i>
                                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '600', fontSize: '14px' }}>{f.fileName}</div>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--gray)' }}>Uploaded: {new Date(f.uploadDate).toLocaleDateString()}</div>
                                        <button className="fc-btn fc-view" style={{ width: '100%', background: 'var(--primary-light)', border: 'none', padding: '8px', borderRadius: '8px', color: 'var(--primary)', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }} onClick={() => TabibiAPI.openFileWindow(f)}>
                                            Open Document
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Receipt Modal */}
            {receiptVisible && selectedAppt && (
                <div className="modal-blur-overlay" onClick={e => e.target.classList.contains('modal-blur-overlay') && setReceiptVisible(false)}>
                    <div className="modal-content-premium" style={{ width: '380px', maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="receipt-header" style={{ background: 'var(--primary)', color: 'white', padding: '24px', textAlign: 'center' }}>
                            <h2 style={{ fontSize: '20px', letterSpacing: '1px', margin: 0, fontWeight: '700' }}><i className="fas fa-hospital"></i> TABIBI CLINIC</h2>
                            <p style={{ fontSize: '12px', opacity: 0.8, margin: '4px 0 0' }}>Official Appointment Receipt</p>
                        </div>
                        <div className="receipt-body" style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Booking ID</span>
                                <span style={{ fontWeight: '600' }}>#{String(selectedAppt._id || selectedAppt.id).slice(-6)}</span>
                            </div>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Doctor</span>
                                <span style={{ fontWeight: '600' }}>{selectedAppt.doctorId?.userId?.name || selectedAppt.doctorName || matchedDoc?.name || 'Doctor'}</span>
                            </div>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Specialty</span>
                                <span style={{ fontWeight: '600' }}>{selectedAppt.doctorId?.specialty || selectedAppt.specialty || matchedDoc?.specialty || 'General'}</span>
                            </div>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Clinic Address</span>
                                <span style={{ fontWeight: '600', maxWidth: '200px', textAlign: 'right', wordBreak: 'break-word' }}>
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAppt.doctorId?.clinicAddress || matchedDoc?.clinicAddress || matchedDoc?.clinic_address || selectedAppt.clinicAddress || 'Main Clinic')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: 'var(--primary)', textDecoration: 'underline' }}
                                    >
                                        {selectedAppt.doctorId?.clinicAddress || matchedDoc?.clinicAddress || matchedDoc?.clinic_address || selectedAppt.clinicAddress || 'Main Clinic'} <i className="fas fa-map-marker-alt" style={{ marginLeft: '4px' }}></i>
                                    </a>
                                </span>
                            </div>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Date & Time</span>
                                <span style={{ fontWeight: '600' }}>{new Date(selectedAppt.date).toLocaleDateString()} | {selectedAppt.time}</span>
                            </div>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Patient</span>
                                <span style={{ fontWeight: '600' }}>{selectedAppt.userName || user.name}</span>
                            </div>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Amount</span>
                                <span style={{ fontWeight: '700', color: 'var(--primary)' }}>${selectedAppt.fee || selectedAppt.amount || matchedDoc?.fee || 0}</span>
                            </div>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Payment Method</span>
                                <span style={{ fontWeight: '600' }}>
                                    {selectedAppt.paymentMethod === 'cash' && 'Cash at Clinic'}
                                    {selectedAppt.paymentMethod === 'vodafone' && 'Vodafone Cash'}
                                    {selectedAppt.paymentMethod === 'instapay' && 'Instapay'}
                                </span>
                            </div>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Transaction Ref</span>
                                <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{selectedAppt.transactionRef || 'N/A'}</span>
                            </div>
                            <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0' }}>
                                <span style={{ color: 'var(--gray)' }}>Paid On</span>
                                <span style={{ fontWeight: '600' }}>
                                    {selectedAppt.paymentStatus === 'Paid' && selectedAppt.paymentDate 
                                        ? new Date(selectedAppt.paymentDate).toLocaleString() 
                                        : 'Not Paid Yet'}
                                </span>
                            </div>
                            {selectedAppt.paymentStatus === 'Rejected' && (
                                <div className="receipt-row" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #E5E7EB', padding: '10px 0', color: '#991B1B' }}>
                                    <span>Rejection Reason</span>
                                    <span style={{ fontWeight: '600' }}>{selectedAppt.rejectionReason || 'Invalid Reference'}</span>
                                </div>
                            )}
                            <div className="receipt-row" style={{
                                display: 'flex', justifyContent: 'space-between', marginTop: '14px', padding: '12px', borderRadius: '12px',
                                ...(selectedAppt.paymentStatus === 'Paid' && { background: '#D1FAE5', color: '#065F46' }),
                                ...(selectedAppt.paymentStatus === 'Pending' && { background: '#FEF3C7', color: '#92400E' }),
                                ...(selectedAppt.paymentStatus === 'Pending Verification' && { background: '#DBEAFE', color: '#1E40AF' }),
                                ...(selectedAppt.paymentStatus === 'Rejected' && { background: '#FEE2E2', color: '#991B1B' })
                            }}>
                                <span style={{ fontWeight: '600' }}>Payment Status</span>
                                <span style={{ fontWeight: '700' }}>
                                    {selectedAppt.paymentStatus === 'Paid' && 'Paid ✓'}
                                    {selectedAppt.paymentStatus === 'Pending' && 'Pending Payment'}
                                    {selectedAppt.paymentStatus === 'Pending Verification' && 'Pending Verification'}
                                    {selectedAppt.paymentStatus === 'Rejected' && 'Rejected'}
                                </span>
                            </div>
                            
                            <div className="qr-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px' }}>
                                <QRComponent value={`TABIBI-RCPT: ID:${selectedAppt._id || selectedAppt.id}, Doctor:${selectedAppt.doctorId?.userId?.name || selectedAppt.doctorName || 'Doctor'}, Patient:${selectedAppt.userName || user.name}, Time:${selectedAppt.time}`} size={120} />
                                <p className="qr-hint" style={{ fontSize: '11px', color: 'var(--gray)', marginTop: '8px' }}>Scan to verify appointment details</p>
                            </div>
                        </div>
                        <div className="receipt-footer" style={{ padding: '0 24px 24px', display: 'flex', gap: '12px' }}>
                            <button className="btn-modal-action" style={{ flex: 1, background: 'var(--primary)', color: 'white', border: 'none' }} onClick={triggerPrint}><i className="fas fa-print"></i> Print</button>
                            <button className="btn-modal-action" style={{ flex: 1, background: '#f3f4f6', color: 'var(--gray)', border: 'none' }} onClick={() => setReceiptVisible(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyAppointments;
