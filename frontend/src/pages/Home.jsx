import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { TabibiAPI } from '../utils/TabibiAPI';

const Home = ({ onShowModal }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [doctors, setDoctors] = useState([]);
    const [user, setUser] = useState(null);

    useEffect(() => {
        const auth = searchParams.get('auth');
        if (auth === 'login') onShowModal && onShowModal('login');
        if (auth === 'register') onShowModal && onShowModal('register');
        
        setUser(TabibiAPI.getUser());

        // Fetch doctors dynamically from database when online
        axios.get('/api/doctors')
            .then(res => {
                const normalized = res.data.map(d => ({
                    id: d._id || d.id,
                    _id: d._id || d.id,
                    name: d.name || (d.userId && d.userId.name) || 'Unknown',
                    specialty: d.specialty,
                    available: d.available !== false,
                    fee: d.fee,
                    experience: d.experience,
                    img: TabibiAPI.getDoctorImage(d.email || d.userId?.email, d.userId?.image || d.image || d.img),
                    rating: d.rating,
                    reviewsCount: d.reviewsCount,
                    patientsTreated: d.patientsTreated,
                    confidenceScore: d.confidenceScore
                }));
                setDoctors(normalized.slice(0, 8));
            })
            .catch(() => {
                setDoctors(TabibiAPI.getDoctors().slice(0, 8));
            });
    }, []);

    return (
        <div>
            {/* HERO */}
            <section className="hero">
                <div className="hero-content animate-hero-text">
                    <h1>Book Appointment<br />With Trusted Doctors</h1>
                    <div className="hero-avatars animate-float">
                        <img src="/assets/images/HOME/HERO SECTION/Ellipse 581.png" alt="" loading="lazy" />
                        <img src="/assets/images/HOME/HERO SECTION/Ellipse 582.png" alt="" loading="lazy" />
                        <img src="/assets/images/HOME/HERO SECTION/Mask group.png" alt="" loading="lazy" />
                    </div>
                    <p>Simply browse through our extensive list of trusted doctors,<br />schedule your appointment hassle-free.</p>
                    <button className="btn-white" onClick={() => navigate(user?.role === 'doctor' ? '/my-appointments' : '/doctors')}>
                        {user?.role === 'doctor' ? 'Go to Dashboard →' : 'Book appointment →'}
                    </button>
                </div>
                <img className="hero-img animate-hero-img" src="/assets/images/HOME/HERO SECTION/doc-header-img.png" alt="Doctors" loading="lazy" />
            </section>

            {/* SPECIALITIES */}
            <section className="section">
                <h2 className="section-title">Find by Speciality</h2>
                <p className="section-subtitle">Simply browse through our extensive list of trusted doctors, schedule your appointment hassle-free.</p>
                <div className="specialties-grid">
                    {[
                        { name: 'General physician', icon: 'fa-user-md' },
                        { name: 'Gynecologist', icon: 'fa-hospital' },
                        { name: 'Dermatologist', icon: 'fa-stethoscope' },
                        { name: 'Pediatricians', icon: 'fa-baby' },
                        { name: 'Neurologist', icon: 'fa-brain' },
                        { name: 'Gastroenterologist', icon: 'fa-pills' },
                        { name: 'Dentist', icon: 'fa-tooth' },
                    ].map(s => (
                        <div key={s.name} className="specialty-card" onClick={() => navigate(`/doctors?specialty=${encodeURIComponent(s.name)}`)}>
                            <div className="specialty-icon"><i className={`fas ${s.icon}`}></i></div>
                            <span className="specialty-name">{s.name}</span>
                        </div>
                    ))}
                </div>
            </section>

            {/* TOP DOCTORS */}
            <section className="section" style={{ paddingTop: 0 }}>
                <h2 className="section-title">Top Doctors to Book</h2>
                <p className="section-subtitle">Simply browse through our extensive list of trusted doctors.</p>
                <div className="doctors-grid">
                    {doctors.map(d => (
                        <div key={d.id} className="doctor-card" onClick={() => navigate(`/appointment?id=${d.id}`)}>
                            <div className="doctor-card-img">
                                <img src={d.img} alt={d.name} loading="lazy" />
                            </div>
                            <div className="doctor-card-info">
                                <div className={`availability ${d.available ? 'green' : 'red'}`}>
                                    <div className={`dot ${d.available ? 'green' : 'red'}`}></div>
                                    {d.available ? 'Available' : 'Unavailable'}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0 4px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#FFC700', fontSize: '12px' }}>
                                        {d.rating && Array.from({ length: Math.round(d.rating) }).map((_, i) => <i key={i} className="fas fa-star"></i>)}
                                    </div>
                                    <span style={{ color: 'var(--gray)', fontSize: '11px' }}>({d.reviewsCount || 0})</span>
                                    {d.confidenceScore !== undefined && (
                                        <span className="trust-badge">
                                            <i className="fas fa-shield-alt"></i> {d.confidenceScore}% Trust
                                        </span>
                                    )}
                                </div>
                                <div className="doctor-card-name">{d.name}</div>
                                <div className="doctor-card-spec">{d.specialty}</div>
                                <div className="doctor-card-patients">
                                    <i className="fas fa-user-injured"></i> {d.patientsTreated || 0} Patients treated
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <button className="more-btn" onClick={() => navigate('/doctors')}>more</button>
            </section>

            {/* CTA BANNER */}
            {!user && (
                <section className="cta-banner">
                    <div className="cta-content">
                        <h2>Book Appointment<br />With 100+ Trusted Doctors</h2>
                        <button className="btn-white" onClick={() => onShowModal && onShowModal('register')}>Create account</button>
                    </div>
                    <img className="cta-img" src="/assets/images/HOME/CTA.png" alt="Doctor" loading="lazy" />
                </section>
            )}

            {/* Floating Chat Button */}
            <div className="floating-chat" onClick={() => navigate('/chatbot')}>
                <div className="chat-btn">
                    <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" /></svg>
                </div>
            </div>
            <div className="toast" id="toast"></div>
        </div>
    );
};

export default Home;
