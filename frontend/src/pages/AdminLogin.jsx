import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabibiAPI } from '../utils/TabibiAPI';
import axios from 'axios';

const ADMIN_ACCOUNTS = [
    { email: 'admin1@tabibi.com', password: 'tabibiAdmin2026_1', name: 'Admin One' },
    { email: 'admin2@tabibi.com', password: 'tabibiAdmin2026_2', name: 'Admin Two' },
    { email: 'admin3@tabibi.com', password: 'tabibiAdmin2026_3', name: 'Admin Three' },
    { email: 'admin4@tabibi.com', password: 'tabibiAdmin2026_4', name: 'Admin Four' }
];

const AdminLogin = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('admin1@tabibi.com');
    const [password, setPassword] = useState('tabibiAdmin2026_1');
    const [errorMsg, setErrorMsg] = useState('');

    const handleLogin = async (e) => {
        if (e) e.preventDefault();
        try {
            const res = await axios.post('/api/admin/login', { email, password });
            if (res.data && res.data.token) {
                const adminUser = {
                    _id: res.data._id,
                    name: res.data.name,
                    email: res.data.email,
                    isAdmin: true,
                    role: 'admin',
                    token: res.data.token
                };
                TabibiAPI.saveUser(adminUser);
                TabibiAPI.logActivity('Admin Login', `Admin authenticated: ${email} (Server synced)`);
                navigate('/admin');
                return;
            }
        } catch (err) {
            console.warn("Backend admin login failed, attempting local fallback...", err);
        }

        // Local fallback
        const account = ADMIN_ACCOUNTS.find(a => a.email === email && a.password === password);
        if (account) {
            const adminUser = {
                name: account.name,
                email: account.email,
                isAdmin: true,
                role: 'admin',
                token: 'TABIBI-LOCAL-ADMIN-TOKEN-2026'
            };
            TabibiAPI.saveUser(adminUser);
            TabibiAPI.logActivity('Admin Login', `Admin authenticated: ${account.email} (Local fallback)`);
            navigate('/admin');
        } else {
            setErrorMsg('Invalid admin credentials');
        }
    };

    return (
        <div style={{
            fontFamily: "'Outfit', sans-serif",
            background: "linear-gradient(135deg, var(--navy, #0f172a) 0%, var(--primary, #5f6fff) 100%)",
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
        }}>
            <div className="admin-card" style={{
                background: "white",
                borderRadius: "32px",
                padding: "60px 48px",
                width: "460px",
                maxWidth: "100%",
                boxShadow: "0 40px 100px rgba(0,0,0,0.3)",
                textAlign: "center",
                position: "relative",
                overflow: "hidden"
            }}>
                <style dangerouslySetInnerHTML={{__html: `
                    .admin-card::before {
                        content: '';
                        position: absolute;
                        top: 0; left: 0; right: 0;
                        height: 6px;
                        background: linear-gradient(90deg, var(--yellow, #ffc700), var(--primary, #5f6fff));
                    }
                    .logo-wrap {
                        width: 80px;
                        height: 80px;
                        background: var(--primary-light, #eff6ff);
                        border-radius: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 24px;
                    }
                    .logo-wrap svg { width: 50px; height: 50px; }
                    .badge {
                        background: #FEF3C7;
                        color: #92400E;
                        padding: 6px 16px;
                        border-radius: 30px;
                        font-size: 11px;
                        font-weight: 800;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        margin-bottom: 20px;
                    }
                    .admin-card h2 { font-size: 28px; font-weight: 700; color: var(--dark, #1e293b); margin-bottom: 8px; }
                    .subtitle { font-size: 15px; color: var(--gray, #64748b); margin-bottom: 32px; }
                    .input-group { position: relative; margin-bottom: 20px; text-align: left; }
                    .input-group label { display: block; font-size: 13px; font-weight: 700; color: var(--light-gray, #94a3b8); margin-bottom: 8px; text-transform: uppercase; }
                    .input-group i { position: absolute; left: 16px; bottom: 15px; color: var(--primary, #5f6fff); font-size: 16px; }
                    .input-group input {
                        width: 100%;
                        padding: 14px 16px 14px 44px;
                        border-radius: 12px;
                        border: 2px solid #F3F4F6;
                        font-family: inherit;
                        font-size: 15px;
                        outline: none;
                        transition: .3s;
                        background: #F9FAFB;
                    }
                    .input-group input:focus { border-color: var(--primary, #5f6fff); background: white; box-shadow: 0 0 0 4px var(--primary-light, #eff6ff); }
                    .btn-admin {
                        width: 100%;
                        padding: 16px;
                        background: linear-gradient(135deg, var(--navy, #0f172a), var(--primary, #5f6fff));
                        color: white;
                        border: none;
                        border-radius: 14px;
                        font-size: 16px;
                        font-weight: 700;
                        cursor: pointer;
                        transition: .3s;
                        box-shadow: 0 10px 20px rgba(95,111,255,0.25);
                        margin-top: 10px;
                    }
                    .btn-admin:hover { transform: translateY(-3px); box-shadow: 0 15px 30px rgba(95,111,255,0.35); filter: brightness(1.1); }
                    .error { color: #EF4444; font-size: 14px; margin-top: 16px; font-weight: 600; min-height: 20px; }
                    .back-link { display: inline-block; margin-top: 32px; color: var(--gray, #64748b); text-decoration: none; font-size: 14px; font-weight: 500; transition: .2s; }
                    .back-link:hover { color: var(--primary, #5f6fff); transform: translateX(-4px); }
                `}} />

                <div className="logo-wrap">
                    <svg viewBox="0 0 100 100" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                        <path d="M10 25 H90 L82 40 H58 V70 L42 85 V40 H18 L10 25 Z" fill="#FFC700"/>
                        <path d="M5 52 H32 L37 38 L43 65 L50 18 L58 82 L65 45 L70 52 H95" stroke="#5F6FFF" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </div>
                <span className="badge"><i className="fas fa-shield-alt"></i> Secure Admin Access</span>
                <h2>Tabibi Admin</h2>
                <p className="subtitle">Protected management dashboard</p>

                <form onSubmit={handleLogin}>
                    <div className="input-group">
                        <label>Admin ID / Email</label>
                        <i className="fas fa-envelope"></i>
                        <input
                            type="email"
                            placeholder="admin@tabibi.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="input-group">
                        <label>Security Password</label>
                        <i className="fas fa-lock"></i>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button type="submit" className="btn-admin">
                        Authenticate & Login <i className="fas fa-arrow-right" style={{ marginLeft: "8px" }}></i>
                    </button>
                </form>

                {errorMsg && <div className="error">{errorMsg}</div>}

                <span onClick={() => navigate('/')} className="back-link" style={{ cursor: 'pointer' }}>
                    <i className="fas fa-chevron-left" style={{ marginRight: "8px" }}></i> Return to Main Website
                </span>
            </div>
        </div>
    );
};

export default AdminLogin;
