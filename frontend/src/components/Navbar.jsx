import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { TabibiAPI } from '../utils/TabibiAPI';

const Navbar = ({ onShowModal }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [user, setUser] = useState(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [available, setAvailable] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const loadUser = () => {
        const u = TabibiAPI.getUser();
        setUser(u);
        if (u) {
            TabibiAPI.trackSession(u);
            if (u.role === 'doctor') {
                setAvailable(u.available !== false);
            }
            setUnreadCount(TabibiAPI.getUnreadMessagesCount(u));
        } else {
            setUnreadCount(0);
        }
    };

    useEffect(() => {
        loadUser();
        window.onUserLogin = () => {
            loadUser();
        };
        return () => {
            window.onUserLogin = null;
        };
    }, []);

    // Also reload when location changes (in case logouts happen elsewhere)
    useEffect(() => {
        loadUser();
    }, [location]);

    // Listen to real-time chat updates (same-tab and multi-tab)
    useEffect(() => {
        const handleUpdates = () => {
            loadUser();
        };

        window.addEventListener('storage', handleUpdates);
        window.addEventListener('tabibi_chats_updated', handleUpdates);
        window.addEventListener('tabibi_user_updated', handleUpdates);
        
        return () => {
            window.removeEventListener('storage', handleUpdates);
            window.removeEventListener('tabibi_chats_updated', handleUpdates);
            window.removeEventListener('tabibi_user_updated', handleUpdates);
        };
    }, []);

    const toggleMenu = () => setMenuOpen(o => !o);
    const closeMenu = () => setMenuOpen(false);

    const handleLogout = () => {
        TabibiAPI.logActivity('Logout', `User logged out: ${user?.email}`);
        TabibiAPI.logout();
    };

    const toggleAvailability = async () => {
        const nextAvail = !available;
        setAvailable(nextAvail);
        
        await TabibiAPI.toggleAvailability(user, nextAvail);

        TabibiAPI.showToast(nextAvail ? 'You are now Online / Available' : 'You are now Offline');
    };

    // If we are in the admin dashboard, we hide the main Navbar or render differently,
    // but App.jsx handles route wrapper logic. Let's make sure Navbar behaves correctly.
    if (location.pathname.startsWith('/admin') && !location.pathname.includes('/login')) {
        return null; // Admin dashboard has its own sidebar
    }

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: `
                .profile-trigger {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    cursor: pointer;
                    padding: 6px 14px;
                    border-radius: 99px;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                }
                .profile-trigger:hover {
                    background: #f1f5f9;
                    border-color: var(--primary-light);
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(95, 111, 255, 0.08);
                }
                .profile-avatar-container {
                    position: relative;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    padding: 1.5px;
                    background: linear-gradient(135deg, var(--primary) 0%, #818cf8 100%);
                    box-shadow: 0 2px 8px rgba(95, 111, 255, 0.2);
                    transition: all 0.3s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .profile-trigger:hover .profile-avatar-container {
                    transform: rotate(15deg) scale(1.05);
                    box-shadow: 0 4px 12px rgba(95, 111, 255, 0.3);
                }
                .profile-avatar-img {
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 1.5px solid white;
                }
                .profile-username {
                    font-weight: 600;
                    color: var(--navy);
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .profile-chevron {
                    font-size: 10px;
                    color: #64748b;
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s ease;
                }
                .profile-trigger:hover .profile-chevron {
                    color: var(--primary);
                }

                .profile-dropdown-menu {
                    position: absolute;
                    top: 55px;
                    right: 0;
                    background: rgba(255, 255, 255, 0.96);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid rgba(226, 232, 240, 0.8);
                    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
                    border-radius: 20px;
                    width: 250px;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    z-index: 10000;
                    transform-origin: top right;
                    animation: fadeInDropdown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                }
                .profile-dropdown-menu::before {
                    content: '';
                    position: absolute;
                    top: -6px;
                    right: 32px;
                    width: 12px;
                    height: 12px;
                    background: white;
                    transform: rotate(45deg);
                    border-left: 1px solid rgba(226, 232, 240, 0.8);
                    border-top: 1px solid rgba(226, 232, 240, 0.8);
                }
                @keyframes fadeInDropdown {
                    from { opacity: 0; transform: scale(0.95) translateY(10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                .dropdown-header {
                    padding: 4px 4px 14px 4px;
                    border-bottom: 1.5px solid #f1f5f9;
                    margin-bottom: 6px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .dropdown-header .user-name {
                    font-weight: 800;
                    color: #0f172a;
                    font-size: 15px;
                    line-height: 1.2;
                    text-align: left;
                    letter-spacing: -0.2px;
                }
                .dropdown-header .user-email {
                    font-size: 12px;
                    color: #64748b;
                    word-break: break-all;
                    text-align: left;
                }
                .dropdown-header .user-role {
                    align-self: flex-start;
                    font-size: 9px;
                    font-weight: 800;
                    text-transform: uppercase;
                    padding: 3px 8px;
                    border-radius: 20px;
                    margin-top: 6px;
                    letter-spacing: 0.5px;
                }
                .dropdown-header .role-admin { background: #fee2e2; color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.2); }
                .dropdown-header .role-doctor { background: #dcfce7; color: #15803d; border: 1px solid rgba(21, 128, 61, 0.2); }
                .dropdown-header .role-patient { background: #e0f2fe; color: #0369a1; border: 1px solid rgba(3, 105, 161, 0.2); }
                
                .dropdown-item-btn {
                    background: transparent;
                    border: none;
                    text-align: left;
                    padding: 11px 12px;
                    border-radius: 12px;
                    cursor: pointer;
                    color: #475569;
                    display: flex;
                    gap: 12px;
                    align-items: center;
                    width: 100%;
                    font-size: 14px;
                    font-weight: 600;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .dropdown-item-btn:hover {
                    background: #f8fafc;
                    color: var(--primary);
                    transform: translateX(4px);
                }
                .dropdown-item-btn i {
                    font-size: 18px;
                    color: #94a3b8;
                    transition: all 0.25s ease;
                }
                .dropdown-item-btn:hover i {
                    color: var(--primary);
                    transform: scale(1.1);
                }
                .dropdown-item-btn.logout-btn {
                    color: #ef4444;
                    background: rgba(254, 242, 242, 0.6);
                    border: 1px solid rgba(254, 226, 226, 0.8);
                    margin-top: 6px;
                }
                .dropdown-item-btn.logout-btn:hover {
                    background: #fef2f2;
                    color: #dc2626;
                    border-color: rgba(220, 38, 38, 0.2);
                    transform: none;
                }
                .dropdown-item-btn.logout-btn i {
                    color: #f87171;
                }
                .dropdown-item-btn.logout-btn:hover i {
                    color: #dc2626;
                }
                .nav-unread-badge {
                    background: #ef4444;
                    color: white;
                    font-size: 10px;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 99px;
                    margin-left: 6px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    min-width: 16px;
                    height: 16px;
                    line-height: 1;
                    animation: pulseBadge 2s infinite;
                }
                @keyframes pulseBadge {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                    70% { transform: scale(1.05); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
            `}} />

            <nav>
                <div className="logo" onClick={() => { navigate('/'); closeMenu(); }} style={{ cursor: 'pointer' }}>
                    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 25 H90 L82 40 H58 V70 L42 85 V40 H18 L10 25 Z" fill="var(--yellow)" />
                        <path d="M5 52 H32 L37 38 L43 65 L50 18 L58 82 L65 45 L70 52 H95" stroke="var(--primary)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </div>

                <div className={`nav-links${menuOpen ? ' open' : ''}`}>
                    <NavLink to="/"        className={({isActive}) => isActive ? 'active' : ''} onClick={closeMenu}>Home</NavLink>
                    <NavLink to="/doctors" className={({isActive}) => isActive ? 'active' : ''} onClick={closeMenu}>All Doctors</NavLink>
                    {user && (
                        <>
                            <NavLink to="/my-appointments" className={({isActive}) => isActive ? 'active' : ''} onClick={closeMenu}>
                                {user.role === 'doctor' ? 'My Dashboard' : 'My Appointments'}
                            </NavLink>
                            <NavLink to="/messages"        className={({isActive}) => isActive ? 'active' : ''} onClick={closeMenu}>
                                Messages
                                {unreadCount > 0 && <span className="nav-unread-badge">{unreadCount}</span>}
                            </NavLink>
                        </>
                    )}
                    <NavLink to="/chatbot" className={({isActive}) => isActive ? 'active' : ''} onClick={closeMenu}>
                        <i className="fas fa-robot"></i> Shifaa AI
                    </NavLink>
                </div>

                <div className="nav-right" id="navRight">
                    {user ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', position: 'relative' }}>
                            {user.role === 'doctor' && (
                                <button 
                                    className={`btn-primary ${available ? '' : 'btn-outline'}`}
                                    style={{
                                        padding: '8px 16px',
                                        fontSize: '13px',
                                        background: available ? '#10B981' : 'white',
                                        borderColor: '#10B981',
                                        color: available ? 'white' : '#10B981'
                                    }}
                                    onClick={toggleAvailability}
                                >
                                    {available ? '● Online' : '○ Offline'}
                                </button>
                            )}

                            <div 
                                onClick={() => setDropdownOpen(!dropdownOpen)} 
                                className="profile-trigger"
                            >
                                <div className="profile-avatar-container">
                                    <img 
                                        src={user.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`} 
                                        alt={user.name} 
                                        className="profile-avatar-img"
                                    />
                                </div>
                                <span className="profile-username">
                                    {user.name.split(' ')[0]} 
                                    <i 
                                        className="fas fa-chevron-down profile-chevron" 
                                        style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }}
                                    ></i>
                                </span>
                            </div>

                            {dropdownOpen && (
                                <div className="profile-dropdown-menu">
                                    <div className="dropdown-header">
                                        <span className="user-name">{user.name}</span>
                                        <span className="user-email">{user.email}</span>
                                        <span className={`user-role role-${user.isAdmin ? 'admin' : user.role || 'patient'}`}>
                                            {user.isAdmin ? 'Admin' : (user.role || 'patient')}
                                        </span>
                                    </div>
                                    
                                    <button 
                                        onClick={() => { setDropdownOpen(false); navigate('/profile'); }}
                                        className="dropdown-item-btn"
                                    >
                                        <i className="fas fa-user-circle"></i> Profile
                                    </button>
                                    
                                    {user.isAdmin && (
                                        <button 
                                            onClick={() => { setDropdownOpen(false); navigate('/admin'); }}
                                            className="dropdown-item-btn"
                                        >
                                            <i className="fas fa-user-shield"></i> Admin Panel
                                        </button>
                                    )}
                                    
                                    <hr style={{ border: 0, borderTop: '1px solid #f1f5f9', margin: '4px 0' }} />
                                    
                                    <button 
                                        onClick={() => { setDropdownOpen(false); handleLogout(); }}
                                        className="dropdown-item-btn logout-btn"
                                    >
                                        <i className="fas fa-sign-out-alt"></i> Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <button className="btn-primary" onClick={() => onShowModal && onShowModal('login')}>Login</button>
                            <button className="btn-primary" style={{ background: 'white', color: 'var(--primary)', border: '1px solid var(--primary)' }} onClick={() => onShowModal && onShowModal('register')}>
                                Create account
                            </button>
                        </>
                    )}
                </div>

                <button className={`hamburger${menuOpen ? ' open' : ''}`} aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={toggleMenu}>
                    <span></span><span></span><span></span>
                </button>
            </nav>

            {menuOpen && <div className="mobile-nav-overlay show" onClick={closeMenu}></div>}
        </>
    );
};

export default Navbar;
