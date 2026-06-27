import React, { useState } from 'react';
import { TabibiAPI } from '../utils/TabibiAPI';

const Contact = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');

    const handleSendMessage = (e) => {
        e.preventDefault();
        if (!name || !email || !subject || !message) {
            TabibiAPI.showToast('Please fill all fields.');
            return;
        }
        if (!TabibiAPI.isValidEmail(email)) {
            TabibiAPI.showToast('Please enter a valid email address.');
            return;
        }
        
        TabibiAPI.showToast('Message sent! We will get back to you soon.');
        setName('');
        setEmail('');
        setSubject('');
        setMessage('');
    };

    return (
        <div className="main" style={{ padding: '30px 80px' }}>
            <div className="section-label" style={{ fontSize: '30px', fontWeight: '600', textTransform: 'uppercase', textAlign: 'center', marginBottom: '60px' }}>
                <span style={{ color: 'var(--gray)', fontWeight: '400' }}>CONTACT </span>
                <span style={{ color: 'var(--dark)' }}>Us</span>
            </div>
            <div className="contact-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'start' }}>
                <img className="contact-img" src="/assets/images/contact_image.png" alt="Contact Tabibi" style={{ width: '100%', height: '500px', objectFit: 'cover', borderRadius: '15px' }} />
                <div>
                    <div className="contact-info" style={{ color: 'var(--gray)' }}>
                        <h3 style={{ fontSize: '24px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: '20px' }}>Our Office</h3>
                        <p style={{ fontSize: '18px', lineHeight: '1.8', marginBottom: '8px' }}>54709 Willms Station<br />Suite 350, Cairo, Egypt</p>
                        <p style={{ marginTop: '16px', fontSize: '18px', lineHeight: '1.8', marginBottom: '8px' }}>Tel: +20-123-456-789</p>
                        <p style={{ fontSize: '18px', lineHeight: '1.8', marginBottom: '8px' }}>Email: TabibiEgypt@gmail.com</p>
                        <div className="contact-divider" style={{ height: '1px', background: '#e5e7eb', margin: '32px 0' }}></div>
                        <h3 style={{ fontSize: '24px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: '20px' }}>Careers at Tabibi</h3>
                        <p style={{ fontSize: '18px', lineHeight: '1.8', marginBottom: '8px' }}>Learn more about our teams and job openings.</p>
                        <a className="explore-btn" href="#" style={{ display: 'inline-block', border: '1px solid var(--dark)', padding: '16px 32px', fontSize: '16px', color: 'var(--dark)', cursor: 'pointer', transition: '.2s' }}>Explore Jobs</a>
                    </div>
                    <form className="contact-form" style={{ marginTop: '40px' }} onSubmit={handleSendMessage}>
                        <h3 style={{ fontSize: '22px', fontWeight: '600', marginBottom: '20px', color: 'var(--dark)' }}>Send us a message</h3>
                        <input type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)} style={{ width: '100%', padding: '14px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: "'Outfit',sans-serif", fontSize: '16px', marginBottom: '16px', outline: 'none' }} />
                        <input type="email" placeholder="Your email" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '14px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: "'Outfit',sans-serif", fontSize: '16px', marginBottom: '16px', outline: 'none' }} />
                        <input type="text" placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', padding: '14px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: "'Outfit',sans-serif", fontSize: '16px', marginBottom: '16px', outline: 'none' }} />
                        <textarea placeholder="Your message..." value={message} onChange={e => setMessage(e.target.value)} style={{ width: '100%', padding: '14px', border: '1px solid #ddd', borderRadius: '6px', fontFamily: "'Outfit',sans-serif", fontSize: '16px', marginBottom: '16px', outline: 'none', height: '120px', resize: 'none' }}></textarea>
                        <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', borderRadius: '6px', fontSize: '18px', fontWeight: '500' }}>Send Message</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Contact;
