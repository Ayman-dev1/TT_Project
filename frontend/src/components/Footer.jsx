import React from 'react';
import { useNavigate } from 'react-router-dom';

const Footer = () => {
    const navigate = useNavigate();
    return (
        <footer>
            <div className="footer-grid">
                <div className="footer-brand">
                    <div className="logo" onClick={() => navigate('/')}>
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 25H80V37H56V75H44V37H20V25Z" fill="var(--yellow)" />
                            <path d="M10 50H32L37 35L44 65L54 25L63 55L68 50H90" stroke="var(--primary)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                    <p>Healthcare made simple. Connect with top doctors and manage your health with ease.</p>
                </div>
                <div className="footer-col">
                    <h4>Company</h4>
                    <a onClick={() => navigate('/')}>Home</a>
                    <a onClick={() => navigate('/about')}>About us</a>
                    <a onClick={() => navigate('/contact')}>Contact us</a>
                    <a href="#">Privacy policy</a>
                    <a onClick={() => navigate('/admin/login')} style={{ marginTop: '10px', display: 'inline-block', opacity: 0.8, fontSize: '14px' }}>
                        <i className="fas fa-user-shield"></i> Admin Login
                    </a>
                </div>
                <div className="footer-col">
                    <h4>Get in Touch</h4>
                    <p>+20-123-456-789</p>
                    <p>TabibiEgypt@gmail.com</p>
                </div>
            </div>
            <div className="footer-bottom">Copyright © 2025 Tabibi - All Rights Reserved.</div>
        </footer>
    );
};

export default Footer;
