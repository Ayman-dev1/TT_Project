import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { TabibiAPI } from '../utils/TabibiAPI';

const Profile = () => {
    const user = TabibiAPI.getUser();

    const [editing, setEditing] = useState(false);
    const [phone, setPhone] = useState(user?.phone || '');
    const [address, setAddress] = useState(user?.address || '');
    const [gender, setGender] = useState(user?.gender || 'Male');
    const [dob, setDob] = useState(user?.dob ? new Date(user.dob).toISOString().slice(0, 10) : '');
    const [avatar, setAvatar] = useState(user?.image || user?.img || '');
    const [available, setAvailable] = useState(user?.available !== false);
    const [clinicAddress, setClinicAddress] = useState(user?.clinicAddress || '');

    // Repository state
    const [files, setFiles] = useState([]);
    const [currentFilter, setCurrentFilter] = useState('all');
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [dragOver, setDragOver] = useState(false);

    // Doctor wallet state
    const [walletBalance, setWalletBalance] = useState(user?.walletBalance || 0);
    const [totalEarnings, setTotalEarnings] = useState(user?.totalEarnings || 0);
    const [walletTransactions, setWalletTransactions] = useState(user?.walletTransactions || []);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawing, setWithdrawing] = useState(false);

    const fetchDoctorProfile = async () => {
        try {
            const token = TabibiAPI.getToken();
            const docId = user.doctorId || user._id || user.id;
            if (token && docId && /^[a-f\d]{24}$/i.test(String(docId))) {
                const res = await axios.get(`/api/doctors/${docId}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const doc = res.data;
                if (doc) {
                    setWalletBalance(doc.walletBalance || 0);
                    setTotalEarnings(doc.totalEarnings || 0);
                    setWalletTransactions(doc.walletTransactions || []);
                    
                    // Also update local cached user to keep sync
                    const u = TabibiAPI.getUser();
                    if (u) {
                        u.walletBalance = doc.walletBalance;
                        u.totalEarnings = doc.totalEarnings;
                        u.walletTransactions = doc.walletTransactions;
                        TabibiAPI.saveUser(u);
                    }
                }
            } else {
                // Local fallback loading
                const u = TabibiAPI.getUser();
                if (u) {
                    setWalletBalance(u.walletBalance || 0);
                    setTotalEarnings(u.totalEarnings || 0);
                    setWalletTransactions(u.walletTransactions || []);
                }
            }
        } catch (err) {
            console.warn("Failed to fetch backend doctor details, using local storage cache:", err.message);
            // Local fallback
            const u = TabibiAPI.getUser();
            if (u) {
                setWalletBalance(u.walletBalance || 0);
                setTotalEarnings(u.totalEarnings || 0);
                setWalletTransactions(u.walletTransactions || []);
            }
        }
    };

    const handleWithdraw = async () => {
        const amt = parseFloat(withdrawAmount);
        if (isNaN(amt) || amt <= 0) {
            TabibiAPI.showToast("Please enter a valid amount");
            return;
        }
        if (amt > walletBalance) {
            TabibiAPI.showToast("Insufficient balance to withdraw");
            return;
        }

        setWithdrawing(true);
        try {
            const updated = await TabibiAPI.requestWithdrawal(amt);
            TabibiAPI.showToast(`✓ Cash-out of $${amt} successful!`);
            setWithdrawAmount('');
            
            // Reload wallet state
            if (updated) {
                setWalletBalance(updated.walletBalance || 0);
                setWalletTransactions(updated.walletTransactions || []);
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || "Failed to process withdrawal";
            TabibiAPI.showToast(msg);
        } finally {
            setWithdrawing(false);
        }
    };

    useEffect(() => {
        if (user) {
            loadFiles();
            if (user.role === 'doctor') {
                fetchDoctorProfile();
            }
        }
    }, [user?.email]);

    const loadFiles = async () => {
        if (!user) return;
        const patientFiles = await TabibiAPI.getPatientFiles(user.email);
        setFiles(patientFiles);
    };

    const handleProfilePicUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            TabibiAPI.showToast('Image is too large (Max 2MB)');
            return;
        }
        try {
            await TabibiAPI.scanFile(file, 'Profile picture upload');
        } catch (error) {
            TabibiAPI.showToast(error.message || 'Security scan blocked this image');
            event.target.value = '';
            return;
        }

        // Show locally first for instant feedback
        const localReader = new FileReader();
        localReader.onload = (e) => {
            setAvatar(e.target.result);
        };
        localReader.readAsDataURL(file);

        if (user && user.role === 'doctor') {
            try {
                const token = TabibiAPI.getToken();
                const formData = new FormData();
                formData.append('image', file);
                formData.append('clinicAddress', clinicAddress || user.clinicAddress || 'Main Clinic');
                formData.append('specialty', user.specialty || 'General physician');
                formData.append('experience', parseInt(user.experience) || 1);
                formData.append('fee', parseFloat(user.fee) || 50);

                await axios.patch('/api/doctors/profile', formData, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });

                // Fetch updated user from /api/auth/me to get the secure Cloudinary URL
                const meRes = await axios.get('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (meRes.data && meRes.data.image) {
                    const updatedUser = { ...user, image: meRes.data.image, img: meRes.data.image };
                    TabibiAPI.saveUser(updatedUser);
                    setAvatar(meRes.data.image);
                    TabibiAPI.showToast('✓ Profile picture synced to server');
                } else {
                    TabibiAPI.showToast('✓ Profile picture uploaded');
                }
            } catch (err) {
                console.error("Failed to sync profile picture to server:", err);
                TabibiAPI.showToast("Failed to sync to server, saved locally.");
                
                const reader = new FileReader();
                reader.onload = (e) => {
                    const updatedUser = { ...user, image: e.target.result, img: e.target.result };
                    TabibiAPI.saveUser(updatedUser);
                };
                reader.readAsDataURL(file);
            }
        } else {
            // Patient / local fallback
            const reader = new FileReader();
            reader.onload = (e) => {
                const updatedUser = { ...user, image: e.target.result, img: e.target.result };
                TabibiAPI.saveUser(updatedUser);
                TabibiAPI.showToast('✓ Profile picture updated');
            };
            reader.readAsDataURL(file);
        }
    };

    const toggleAvailability = async () => {
        const nextAvail = !available;
        setAvailable(nextAvail);
        await TabibiAPI.toggleAvailability(user, nextAvail);
        TabibiAPI.showToast(nextAvail ? 'You are now Online' : 'You are now Offline');
    };

    const saveProfile = async () => {
        if (user.role === 'doctor' && !clinicAddress.trim()) {
            TabibiAPI.showToast('Clinic address is required');
            return;
        }
        const updatedUser = { ...user, phone, address, gender, dob, clinicAddress: user.role === 'doctor' ? clinicAddress.trim() : '' };

        if (user && user.role === 'doctor') {
            try {
                const token = TabibiAPI.getToken();
                const formData = new FormData();
                formData.append('clinicAddress', clinicAddress.trim());
                formData.append('specialty', user.specialty || 'General physician');
                formData.append('experience', parseInt(user.experience) || 1);
                formData.append('fee', parseFloat(user.fee) || 50);

                await axios.patch('/api/doctors/profile', formData, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data'
                    }
                });

                TabibiAPI.saveUser(updatedUser);
                TabibiAPI.showToast('✓ Profile updated on server');
            } catch (err) {
                console.error("Failed to sync profile to server:", err);
                TabibiAPI.saveUser(updatedUser);
                TabibiAPI.showToast('✓ Profile updated locally');
            }
        } else {
            TabibiAPI.saveUser(updatedUser);
            TabibiAPI.showToast('✓ Profile updated');
        }
        setEditing(false);
    };

    const handleFileUpload = (event) => {
        const fileArr = Array.from(event.target.files || event.dataTransfer.files);
        if (!fileArr.length) return;

        setUploading(true);
        setUploadProgress(0);

        let done = 0;
        fileArr.forEach(async (file, index) => {
            if (file.size > 10 * 1024 * 1024) {
                TabibiAPI.showToast(file.name + ' is too large (Max 10MB)');
                done++;
                if (done === fileArr.length) setUploading(false);
                return;
            }

            try {
                await TabibiAPI.scanFile(file, 'Patient medical repository');
            } catch (error) {
                const reviewPrefix = error.scanStatus === 'Suspicious' ? 'Needs Security review: ' : '';
                TabibiAPI.showToast(file.name + ': ' + reviewPrefix + (error.message || 'Security scan failed'));
                done++;
                const progress = Math.round((done / fileArr.length) * 100);
                setUploadProgress(progress);
                if (done === fileArr.length) setUploading(false);
                return;
            }

            const reader = new FileReader();
            reader.onload = async (e) => {
                const name = file.name.toLowerCase();
                let type = 'report';
                if (name.includes('xray') || name.includes('x-ray') || name.includes('scan') || name.includes('mri')) type = 'xray';
                else if (name.includes('lab') || name.includes('blood') || name.includes('test')) type = 'lab';

                try {
                    await TabibiAPI.savePatientFile({
                        userEmail: user.email,
                        fileName: file.name,
                        fileType: type,
                        fileData: e.target.result,
                        fileSize: file.size,
                        uploadDate: new Date().toISOString()
                    });
                } catch (err) {
                    console.error("Upload error:", err);
                }

                done++;
                const progress = Math.round((done / fileArr.length) * 100);
                setUploadProgress(progress);

                if (done === fileArr.length) {
                    setTimeout(() => {
                        setUploading(false);
                        loadFiles();
                        TabibiAPI.showToast('✓ ' + done + ' file(s) uploaded');
                    }, 600);
                }
            };
            reader.readAsDataURL(file);
        });
    };

    const deleteFile = async (id) => {
        if (window.confirm('Are you sure you want to delete this file?')) {
            await TabibiAPI.deletePatientFile(user.email, id);
            loadFiles();
            TabibiAPI.showToast('🗑 File removed');
        }
    };

    if (!user) {
        return (
            <div className="main-card" style={{ textAlign: 'center', padding: '100px 40px' }}>
                <div style={{ fontSize: '64px', marginBottom: '24px', opacity: 0.1 }}><i className="fas fa-lock"></i></div>
                <h2 style={{ fontSize: '28px', color: 'var(--navy)', marginBottom: '12px' }}>Authentication Required</h2>
                <p style={{ color: 'var(--gray)', marginBottom: '32px', fontSize: '18px' }}>Please login or register to access your personalized medical dashboard.</p>
                <button className="btn-save" onClick={() => window.location.href = '/?auth=login'}>Login Now</button>
            </div>
        );
    }

    const filteredFiles = currentFilter === 'all' ? files : files.filter(f => f.fileType === currentFilter);
    const xrayCount = files.filter(f => f.fileType === 'xray').length;
    const labCount = files.filter(f => f.fileType === 'lab').length;
    const reportCount = files.filter(f => f.fileType === 'report').length;

    const initials = user.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

    return (
        <div className="main" style={{ padding: '30px 80px' }}>
            <style dangerouslySetInnerHTML={{ __html: `
                .profile-btn-save {
                    width: 100%;
                    padding: 12px;
                    background: var(--primary);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .profile-btn-save:hover {
                    background: #4a5aee;
                    transform: translateY(-2px);
                    box-shadow: 0 6px 15px rgba(95, 111, 255, 0.25);
                }

                .profile-btn-edit {
                    width: 100%;
                    padding: 12px;
                    background: white;
                    border: 1px solid var(--primary);
                    color: var(--primary);
                    border-radius: 12px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .profile-btn-edit:hover {
                    background: var(--primary-light);
                    transform: translateY(-2px);
                    box-shadow: 0 6px 15px rgba(95, 111, 255, 0.12);
                }

                .profile-btn-cancel {
                    width: 100%;
                    padding: 12px;
                    background: white;
                    border: 1px solid #e2e8f0;
                    color: #64748b;
                    border-radius: 12px;
                    cursor: pointer;
                    font-weight: 600;
                    margin-top: 8px;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .profile-btn-cancel:hover {
                    background: #f1f5f9;
                    color: #334155;
                    border-color: #cbd5e1;
                    transform: translateY(-2px);
                }

                .avatar-upload-btn {
                    transition: all 0.2s ease;
                }
                .avatar-upload-btn:hover {
                    transform: scale(1.1);
                    background: #4a5aee !important;
                    box-shadow: 0 4px 15px rgba(95, 111, 255, 0.4);
                }

                .availability-card {
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .availability-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 20px rgba(16, 185, 129, 0.12);
                }
                .availability-card.offline:hover {
                    box-shadow: 0 8px 20px rgba(239, 68, 68, 0.12);
                }

                .upload-compact {
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .upload-compact:hover {
                    background: #f1f5f9 !important;
                    border-color: #818cf8 !important;
                    box-shadow: 0 8px 24px rgba(95, 111, 255, 0.06);
                }

                .filter-tab {
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .filter-tab:not(.active):hover {
                    background: #e2e8f0 !important;
                    color: #1e293b !important;
                }
                .filter-tab.active:hover {
                    background: #4a5aee !important;
                    box-shadow: 0 4px 12px rgba(95, 111, 255, 0.2);
                }

                .fc-btn {
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .fc-btn.fc-view:hover {
                    background: var(--primary) !important;
                    color: white !important;
                    transform: scale(1.1);
                }
                .fc-btn.fc-del:hover {
                    background: #ef4444 !important;
                    color: white !important;
                    transform: scale(1.1);
                }

                .edit-input-mod {
                    transition: all 0.2s ease;
                }
                .edit-input-mod:hover {
                    border-color: #cbd5e1 !important;
                }
                .edit-input-mod:focus {
                    border-color: var(--primary) !important;
                    box-shadow: 0 0 0 3px rgba(95, 111, 255, 0.1) !important;
                }
            `}} />

            <div className="profile-dashboard" style={{ display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
                
                {/* Sidebar */}
                <div className="profile-sidebar" style={{ flex: '1 1 300px' }}>
                    <div className="sidebar-card" style={{ background: 'white', borderRadius: '24px', padding: '32px', border: '1px solid #E5E7EB', textAlign: 'center' }}>
                        <div className="avatar-wrapper" style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 20px' }}>
                            <div className="avatar-big" style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '36px', fontWeight: '700', overflow: 'hidden', backgroundImage: avatar ? `url(${TabibiAPI.normalizeImg(avatar)})` : 'none', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                                {!avatar && initials}
                            </div>
                            <label className="avatar-upload-btn" htmlFor="profilePicInput" style={{ position: 'absolute', bottom: 0, right: 0, width: '36px', height: '36px', background: 'var(--primary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.15)' }}>
                                <i className="fas fa-camera"></i>
                            </label>
                            <input type="file" id="profilePicInput" accept="image/*" style={{ display: 'none' }} onChange={handleProfilePicUpload} />
                        </div>
                        <h3 className="sidebar-name" style={{ fontSize: '22px', fontWeight: '700', color: 'var(--dark)' }}>{user.name}</h3>
                        <p className="sidebar-role" style={{ fontSize: '14px', color: 'var(--gray)', margin: '4px 0 20px' }}>
                            {user.role === 'doctor' ? 'Professional Healthcare Provider' : 'Registered Patient'}
                        </p>
                        
                        <div className="stat-pills" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div className="stat-pill" style={{ background: '#F9FAFB', padding: '12px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '600' }}>
                                <span><i className="fas fa-file-medical" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> Records</span>
                                <span>{files.length}</span>
                            </div>
                        </div>

                        <div className="btn-row" style={{ marginTop: '24px' }}>
                            {editing ? (
                                <>
                                    <button className="profile-btn-save" onClick={saveProfile}><i className="fas fa-check"></i> Save Details</button>
                                    <button className="profile-btn-cancel" onClick={() => setEditing(false)}><i className="fas fa-times"></i> Cancel</button>
                                </>
                            ) : (
                                <button className="profile-btn-edit" onClick={() => setEditing(true)}><i className="fas fa-cog"></i> Edit Profile</button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="profile-main" style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    
                    {user.role === 'doctor' && (
                        <div className={`availability-card ${available ? '' : 'offline'}`} onClick={toggleAvailability} style={{ background: available ? '#f0fdf4' : '#fef2f2', border: '1px solid', borderColor: available ? '#bbf7d0' : '#fca5a5', padding: '20px', borderRadius: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                <div className="avail-icon" style={{ width: '48px', height: '48px', borderRadius: '50%', background: available ? '#10B981' : '#EF4444', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>
                                    <i className={`fas ${available ? 'fa-check' : 'fa-power-off'}`}></i>
                                </div>
                                <div className="avail-info">
                                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>{available ? 'Practice Status: Online' : 'Practice Status: Offline'}</h4>
                                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--gray)' }}>{available ? 'Patients can now book new appointments with you' : 'New bookings are temporarily disabled'}</p>
                                </div>
                            </div>
                            <div className="nav-switch">
                                <input type="checkbox" checked={available} readOnly />
                                <span className="nav-slider"></span>
                            </div>
                        </div>
                    )}

                    {/* Doctor Financial Wallet Section */}
                    {user.role === 'doctor' && (
                        <div className="main-card" style={{ background: 'white', borderRadius: '24px', padding: '32px', border: '1px solid #E5E7EB' }}>
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '16px', marginBottom: '24px' }}>
                                <div className="card-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}>
                                    <i className="fas fa-wallet" style={{ marginRight: '8px', color: 'var(--primary)' }}></i> Doctor Financial Wallet
                                </div>
                                <span style={{ fontSize: '12px', color: 'var(--gray)', fontWeight: '600' }}>Platform Commission: 15%</span>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                                {/* Wallet Balance Card */}
                                <div style={{ background: 'linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)', border: '1px solid #BFDBFE', padding: '24px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 4px 12px rgba(95, 111, 255, 0.05)' }}>
                                    <span style={{ fontSize: '13px', color: '#1E40AF', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Withdrawable Balance</span>
                                    <span style={{ fontSize: '32px', fontWeight: '800', color: '#1E3A8A' }}>${walletBalance.toFixed(2)}</span>
                                    <span style={{ fontSize: '11px', color: '#3B82F6' }}>Net amount ready to withdraw</span>
                                </div>

                                {/* Lifetime Earnings Card */}
                                <div style={{ background: 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)', border: '1px solid #A7F3D0', padding: '24px', borderRadius: '20px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.05)' }}>
                                    <span style={{ fontSize: '13px', color: '#065F46', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Net Earnings</span>
                                    <span style={{ fontSize: '32px', fontWeight: '800', color: '#064E3B' }}>${totalEarnings.toFixed(2)}</span>
                                    <span style={{ fontSize: '11px', color: '#10B981' }}>Lifetime platform earnings (After 15% fee)</span>
                                </div>
                            </div>

                            {/* Withdrawal Section */}
                            <div style={{ background: '#F8FAF9', border: '1px solid #E5E7EB', padding: '24px', borderRadius: '20px', marginBottom: '30px' }}>
                                <h4 style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: '700', color: 'var(--dark)' }}>Request Wallet Cash-Out</h4>
                                <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--gray)' }}>Specify the amount you wish to withdraw from your wallet. Funds will be transferred to your registered clinic mobile/bank details.</p>
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    <div style={{ position: 'relative', flex: '1 1 200px' }}>
                                        <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', fontWeight: '700', fontSize: '16px' }}>$</span>
                                        <input 
                                            type="number" 
                                            value={withdrawAmount} 
                                            onChange={e => setWithdrawAmount(e.target.value)}
                                            placeholder="Amount to withdraw" 
                                            disabled={withdrawing}
                                            style={{
                                                width: '100%', padding: '12px 16px 12px 32px', borderRadius: '12px', border: '1.5px solid #E5E7EB', fontSize: '15px', fontWeight: '600', outline: 'none', transition: 'border-color 0.2s', fontFamily: 'inherit'
                                            }}
                                        />
                                    </div>
                                    <button 
                                        className="profile-btn-save" 
                                        onClick={handleWithdraw}
                                        disabled={withdrawing || !withdrawAmount}
                                        style={{ flex: '0 0 auto', width: 'auto', padding: '12px 28px', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        {withdrawing ? <><i className="fas fa-spinner fa-spin"></i> Processing...</> : <><i className="fas fa-paper-plane"></i> Request Withdrawal</>}
                                    </button>
                                </div>
                            </div>

                            {/* Transaction History Table */}
                            <div>
                                <h4 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: '700', color: 'var(--dark)' }}><i className="fas fa-history" style={{ marginRight: '6px', color: 'var(--primary)' }}></i> Wallet Ledger / Transaction History</h4>
                                <div style={{ overflowX: 'auto', border: '1px solid #E5E7EB', borderRadius: '16px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                                        <thead>
                                            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                                                <th style={{ padding: '14px 16px', color: 'var(--gray)', fontWeight: '700' }}>Date & Time</th>
                                                <th style={{ padding: '14px 16px', color: 'var(--gray)', fontWeight: '700' }}>Type</th>
                                                <th style={{ padding: '14px 16px', color: 'var(--gray)', fontWeight: '700' }}>Description</th>
                                                <th style={{ padding: '14px 16px', color: 'var(--gray)', fontWeight: '700' }}>Amount</th>
                                                <th style={{ padding: '14px 16px', color: 'var(--gray)', fontWeight: '700' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {walletTransactions.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: 'var(--gray)' }}>No wallet activity logged yet.</td>
                                                </tr>
                                            ) : (
                                                walletTransactions.map((tx, idx) => (
                                                    <tr key={tx._id || idx} style={{ borderBottom: idx < walletTransactions.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                                                        <td style={{ padding: '14px 16px', fontWeight: '500' }}>{new Date(tx.date).toLocaleString()}</td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <span style={{
                                                                display: 'inline-flex', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
                                                                background: tx.type === 'earning' ? '#D1FAE5' : '#FEF2F2',
                                                                color: tx.type === 'earning' ? '#065F46' : '#DC2626'
                                                            }}>
                                                                {tx.type === 'earning' ? 'DEPOSIT' : 'WITHDRAWAL'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', color: '#4B5563' }}>{tx.description}</td>
                                                        <td style={{ padding: '14px 16px', fontWeight: '700', color: tx.type === 'earning' ? '#10B981' : '#EF4444' }}>
                                                            {tx.type === 'earning' ? '+' : '-'}${tx.amount.toFixed(2)}
                                                        </td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600',
                                                                color: tx.status === 'completed' ? '#10B981' : (tx.status === 'pending' ? '#F59E0B' : '#EF4444')
                                                            }}>
                                                                ● {tx.status}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Account Info Form Card */}
                    <div className="main-card" style={{ background: 'white', borderRadius: '24px', padding: '32px', border: '1px solid #E5E7EB' }}>
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB', paddingBottom: '16px', marginBottom: '24px' }}>
                            <div className="card-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}><i className="fas fa-user-circle" style={{ marginRight: '8px', color: 'var(--primary)' }}></i> Account Information</div>
                            <span className={`role-badge ${user.role}`} style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>{user.role}</span>
                        </div>
                        <div className="info-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px' }}>
                            <div className="info-item">
                                <label className="info-label" style={{ display: 'block', fontSize: '12px', color: 'var(--gray)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>Full Name</label>
                                <div className="info-value" style={{ fontSize: '15px', fontWeight: '600' }}><i className="fas fa-user" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> {user.name}</div>
                            </div>
                            <div className="info-item">
                                <label className="info-label" style={{ display: 'block', fontSize: '12px', color: 'var(--gray)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>Email Address</label>
                                <div className="info-value" style={{ fontSize: '15px', fontWeight: '600' }}><i className="fas fa-envelope" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> {user.email}</div>
                            </div>
                            <div className="info-item">
                                <label className="info-label" style={{ display: 'block', fontSize: '12px', color: 'var(--gray)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>Phone Number</label>
                                {editing ? (
                                    <input className="edit-input-mod" value={phone} onChange={e => setPhone(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', outline: 'none' }} />
                                ) : (
                                    <div className="info-value" style={{ fontSize: '15px', fontWeight: '600' }}><i className="fas fa-phone" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> {phone || 'Not provided'}</div>
                                )}
                            </div>
                            <div className="info-item">
                                <label className="info-label" style={{ display: 'block', fontSize: '12px', color: 'var(--gray)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>Physical Address</label>
                                {editing ? (
                                    <input className="edit-input-mod" value={address} onChange={e => setAddress(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', outline: 'none' }} />
                                ) : (
                                    <div className="info-value" style={{ fontSize: '15px', fontWeight: '600' }}><i className="fas fa-map-marker-alt" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> {address || 'Not provided'}</div>
                                )}
                            </div>
                            {user.role === 'doctor' && (
                                <div className="info-item">
                                    <label className="info-label" style={{ display: 'block', fontSize: '12px', color: 'var(--gray)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>Clinic Address</label>
                                    {editing ? (
                                        <input className="edit-input-mod" value={clinicAddress} onChange={e => setClinicAddress(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', outline: 'none' }} required />
                                    ) : (
                                        <div className="info-value" style={{ fontSize: '15px', fontWeight: '600' }}>
                                            <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinicAddress || 'Main Clinic')}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                style={{ color: 'var(--primary)', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                            >
                                                <i className="fas fa-hospital"></i> {clinicAddress || 'Not provided'}
                                            </a>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="info-item">
                                <label className="info-label" style={{ display: 'block', fontSize: '12px', color: 'var(--gray)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>Date of Birth</label>
                                {editing ? (
                                    <input type="date" className="edit-input-mod" value={dob} onChange={e => setDob(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', outline: 'none' }} />
                                ) : (
                                    <div className="info-value" style={{ fontSize: '15px', fontWeight: '600' }}><i className="fas fa-birthday-cake" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> {dob || 'Not provided'}</div>
                                )}
                            </div>
                            <div className="info-item">
                                <label className="info-label" style={{ display: 'block', fontSize: '12px', color: 'var(--gray)', fontWeight: '600', textTransform: 'uppercase', marginBottom: '6px' }}>Gender</label>
                                {editing ? (
                                    <select className="edit-input-mod" value={gender} onChange={e => setGender(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', outline: 'none' }}>
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                    </select>
                                ) : (
                                    <div className="info-value" style={{ fontSize: '15px', fontWeight: '600' }}><i className="fas fa-venus-mars" style={{ color: 'var(--primary)', marginRight: '8px' }}></i> {gender || 'Not provided'}</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Repository / Medical Repository Card */}
                    <div className="files-card" style={{ background: 'white', borderRadius: '24px', padding: '32px', border: '1px solid #E5E7EB' }}>
                        <div className="files-top">
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div className="card-title" style={{ fontSize: '18px', fontWeight: '700', color: 'var(--dark)' }}><i className="fas fa-folder-open" style={{ marginRight: '8px', color: 'var(--primary)' }}></i> Medical Repository</div>
                                <span className="files-count" style={{ fontSize: '13px', color: 'var(--gray)' }}>{files.length} documents securely stored</span>
                            </div>
                            
                            {/* Upload Drop Zone */}
                            <div 
                                className={`upload-compact${dragOver ? ' drag-over' : ''}`} 
                                onClick={() => document.getElementById('fileInput').click()}
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e); }}
                                style={{ border: '2px dashed var(--primary)', borderRadius: '16px', padding: '24px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'var(--primary-light)' : '#F9FAFB', display: 'flex', alignItems: 'center', gap: '20px', transition: '0.2s' }}
                            >
                                <input type="file" id="fileInput" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileUpload} multiple style={{ display: 'none' }} />
                                <div className="upload-icon-small" style={{ fontSize: '32px', color: 'var(--primary)' }}><i className="fas fa-cloud-upload-alt"></i></div>
                                <div className="upload-text-small" style={{ textAlign: 'left' }}>
                                    <h5 style={{ margin: 0, fontSize: '15px', fontWeight: '700' }}>Cloud Upload Center</h5>
                                    <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--gray)' }}>Drag & drop medical reports, X-rays or prescriptions (Max 10MB per file)</p>
                                </div>
                            </div>

                            {uploading && (
                                <div className="upload-progress-wrap" style={{ marginTop: '15px' }}>
                                    <div className="upload-progress-bar" style={{ background: '#E5E7EB', height: '8px', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div className="upload-progress-fill" style={{ width: `${uploadProgress}%`, background: 'var(--primary)', height: '100%', transition: '0.3s' }}></div>
                                    </div>
                                    <div className="upload-progress-label" style={{ fontSize: '12px', color: 'var(--gray)', marginTop: '4px', textAlign: 'right' }}>Uploading... {uploadProgress}%</div>
                                </div>
                            )}
                        </div>

                        {/* Library Grid Filters */}
                        <div className="file-list" style={{ marginTop: '30px' }}>
                            <div className="file-filters" style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
                                <div className={`filter-tab${currentFilter === 'all' ? ' active' : ''}`} onClick={() => setCurrentFilter('all')} style={{ padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', background: currentFilter === 'all' ? 'var(--primary)' : '#F3F4F6', color: currentFilter === 'all' ? 'white' : 'var(--gray)', fontWeight: '600', fontSize: '13px' }}>All Library <span className="tab-count">{files.length}</span></div>
                                <div className={`filter-tab${currentFilter === 'xray' ? ' active' : ''}`} onClick={() => setCurrentFilter('xray')} style={{ padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', background: currentFilter === 'xray' ? 'var(--primary)' : '#F3F4F6', color: currentFilter === 'xray' ? 'white' : 'var(--gray)', fontWeight: '600', fontSize: '13px' }}>X-Rays <span className="tab-count">{xrayCount}</span></div>
                                <div className={`filter-tab${currentFilter === 'lab' ? ' active' : ''}`} onClick={() => setCurrentFilter('lab')} style={{ padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', background: currentFilter === 'lab' ? 'var(--primary)' : '#F3F4F6', color: currentFilter === 'lab' ? 'white' : 'var(--gray)', fontWeight: '600', fontSize: '13px' }}>Lab Tests <span className="tab-count">{labCount}</span></div>
                                <div className={`filter-tab${currentFilter === 'report' ? ' active' : ''}`} onClick={() => setCurrentFilter('report')} style={{ padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', background: currentFilter === 'report' ? 'var(--primary)' : '#F3F4F6', color: currentFilter === 'report' ? 'white' : 'var(--gray)', fontWeight: '600', fontSize: '13px' }}>Prescriptions <span className="tab-count">{reportCount}</span></div>
                            </div>
                            
                            <div className="file-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
                                {filteredFiles.length === 0 ? (
                                    <div className="files-empty" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 20px', color: 'var(--gray)' }}>
                                        <div className="empty-emoji" style={{ fontSize: '32px', marginBottom: '10px' }}><i className="fas fa-folder-open"></i></div>
                                        <h4>No files in this category</h4>
                                        <p>Upload your first file using the area above</p>
                                    </div>
                                ) : (
                                    filteredFiles.map(f => {
                                        const iconClass = f.fileType === 'xray' ? 'fa-x-ray' : (f.fileType === 'lab' ? 'fa-flask' : 'fa-file-medical');
                                        const typeLabel = f.fileType === 'xray' ? 'X-Ray' : (f.fileType === 'lab' ? 'Lab Test' : 'Prescription');
                                        const tagClass = f.fileType === 'xray' ? 'tag-xray' : (f.fileType === 'lab' ? 'tag-lab' : 'tag-report');
                                        
                                        return (
                                            <div className="file-card" key={f.id} style={{ border: '1px solid #E5E7EB', borderRadius: '16px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'white' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div className={`file-icon-new ${f.fileType}`} style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
                                                        <i className={`fas ${iconClass}`}></i>
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '14px', fontWeight: '700', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.fileName}>{f.fileName}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--gray)' }}>{new Date(f.uploadDate).toLocaleDateString()}</div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span className={`file-card-tag ${tagClass}`} style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '10px' }}>{typeLabel}</span>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button className="fc-btn fc-view" onClick={() => TabibiAPI.openFileWindow(f)} style={{ border: 'none', background: '#F3F4F6', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray)' }}><i className="fas fa-eye"></i></button>
                                                        <button className="fc-btn fc-del" onClick={() => deleteFile(f.id)} style={{ border: 'none', background: '#FEF2F2', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DC2626' }}><i className="fas fa-trash-alt"></i></button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                    </div>

                </div>

            </div>
        </div>
    );
};

export default Profile;
