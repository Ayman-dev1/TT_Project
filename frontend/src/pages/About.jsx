import React from 'react';

const About = () => {
    return (
        <div className="main" style={{ padding: '30px 80px' }}>
            <div className="section-label" style={{ fontSize: '30px', fontWeight: '600', textTransform: 'uppercase', textAlign: 'center', marginBottom: '50px' }}>
                <span style={{ color: 'var(--gray)', fontWeight: '400' }}>ABOUT </span>
                <span style={{ color: 'var(--dark)' }}>Us</span>
            </div>
            <div className="about-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'start', marginBottom: '80px' }}>
                <img className="about-img" src="https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=600&q=80" alt="About Tabibi" style={{ width: '100%', height: '440px', objectFit: 'cover', borderRadius: '15px' }} />
                <div className="about-text" style={{ fontSize: '18px', color: 'var(--gray)', lineHeight: '1.8' }}>
                    <p>Welcome to <strong>Tabibi</strong>, your trusted partner in managing your healthcare needs conveniently and efficiently. At Tabibi, we understand the challenges individuals face when it comes to scheduling doctor appointments and managing their health records.</p>
                    <br />
                    <p>Tabibi is committed to excellence in healthcare technology. We continuously strive to enhance our platform, integrating the latest advancements to improve user experience and deliver superior service. Whether you're booking your first appointment or managing ongoing care, Tabibi is here to support you every step of the way.</p>
                    <br />
                    <p><strong>Our Vision</strong></p>
                    <br />
                    <p>Our vision at Tabibi is to create a seamless healthcare experience for every user. We aim to bridge the gap between patients and healthcare providers, making it easier for you to access the care you need, when you need it.</p>
                </div>
            </div>

            <div className="why-section" style={{ marginBottom: '60px' }}>
                <div className="why-title" style={{ fontSize: '24px', fontWeight: '600', textTransform: 'uppercase', marginBottom: '32px' }}>
                    <span style={{ color: 'var(--gray)', fontWeight: '400' }}>Why </span>
                    <span style={{ color: 'var(--dark)' }}>Choose Us</span>
                </div>
                <div className="why-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', border: '1px solid #ABABAB' }}>
                    <div className="why-col" style={{ padding: '32px 40px', borderRight: '1px solid #ABABAB' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--dark)', marginBottom: '16px' }}>Efficiency:</h3>
                        <p style={{ fontSize: '18px', color: 'var(--gray)', lineHeight: '1.8', textTransform: 'capitalize' }}>Streamlined appointment scheduling that fits into your busy lifestyle.</p>
                    </div>
                    <div className="why-col" style={{ padding: '32px 40px', borderRight: '1px solid #ABABAB' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--dark)', marginBottom: '16px' }}>Convenience:</h3>
                        <p style={{ fontSize: '18px', color: 'var(--gray)', lineHeight: '1.8', textTransform: 'capitalize' }}>Access to a network of trusted healthcare professionals in your area.</p>
                    </div>
                    <div className="why-col" style={{ padding: '32px 40px', borderRight: 'none' }}>
                        <h3 style={{ fontSize: '18px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--dark)', marginBottom: '16px' }}>Personalization:</h3>
                        <p style={{ fontSize: '18px', color: 'var(--gray)', lineHeight: '1.8', textTransform: 'capitalize' }}>Tailored recommendations and reminders to help you stay on top of your health.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default About;
