import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { TabibiAPI } from '../utils/TabibiAPI';

const Doctors = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [liveDocts, setLiveDocs] = useState([]);
    const [currentFilter, setCurrentFilter] = useState(searchParams.get('specialty') || '');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    // Try to fetch from Node backend; fall back to local data
    useEffect(() => {
        axios.get('/api/doctors')
            .then(res => { setLiveDocs(res.data); setLoading(false); })
            .catch(() => { setLiveDocs(TabibiAPI.getDoctors()); setLoading(false); });
    }, []);

    // Apply filters
    const filtered = liveDocts.filter(d => {
        const matchSpec   = !currentFilter || d.specialty === currentFilter;
        const matchSearch = !searchTerm || d.name.toLowerCase().includes(searchTerm.toLowerCase()) || d.specialty.toLowerCase().includes(searchTerm.toLowerCase());
        return matchSpec && matchSearch;
    });

    const specialties = ['General physician', 'Gynecologist', 'Dermatologist', 'Pediatricians', 'Neurologist', 'Gastroenterologist', 'Dentist'];

    return (
        <div className="page-layout">
            {/* Sidebar */}
            <aside className="docs-sidebar">
                <p style={{ fontWeight: 500, margin: '0 0 12px', color: 'var(--dark)' }}>Find your Doctor</p>
                <div className="sidebar-search">
                    <i className="fas fa-search"></i>
                    <input
                        type="text"
                        placeholder="Search by name..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="filter-list">
                    <div className={`filter-item${currentFilter === '' ? ' active' : ''}`} onClick={() => setCurrentFilter('')}>All Specialists</div>
                    {specialties.map(s => (
                        <div key={s} className={`filter-item${currentFilter === s ? ' active' : ''}`} onClick={() => setCurrentFilter(s)}>{s}</div>
                    ))}
                </div>
            </aside>

            {/* Doctor Grid */}
            <div className="docs-grid">
                {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="doctor-card skeleton-card">
                            <div className="doctor-card-img skeleton" style={{ height: 220 }}></div>
                            <div className="doctor-card-info">
                                <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 8, borderRadius: 6 }}></div>
                                <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 6, borderRadius: 6 }}></div>
                                <div className="skeleton" style={{ height: 12, width: '50%', borderRadius: 6 }}></div>
                            </div>
                        </div>
                    ))
                ) : filtered.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px 20px', color: 'var(--gray)' }}>
                        <i className="fas fa-search" style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.2, display: 'block' }}></i>
                        <p style={{ fontSize: '18px' }}>No doctors found matching your criteria.</p>
                    </div>
                ) : (
                    filtered.map(d => {
                        const id    = d.id || d._id;
                        const img   = TabibiAPI.getDoctorImage(d.email || d.userId?.email, d.userId?.image || d.image || d.img);
                        const name  = d.name || (d.userId && d.userId.name) || 'Unknown';
                        const stars = d.rating ? Math.round(d.rating) : 0;
                        return (
                            <div key={id} className="doctor-card" onClick={() => navigate(`/appointment?id=${id}`)}>
                                <div className="doctor-card-img">
                                    <img src={img} alt={name} loading="lazy" />
                                </div>
                                <div className="doctor-card-info">
                                    <div className={`availability ${d.available ? 'green' : 'red'}`}>
                                        <div className={`dot ${d.available ? 'green' : 'red'}`}></div>
                                        {d.available ? 'Available' : 'Unavailable'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0 4px', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#FFC700', fontSize: '12px' }}>
                                            {Array.from({ length: stars }).map((_, i) => <i key={i} className="fas fa-star"></i>)}
                                        </div>
                                        <span style={{ color: 'var(--gray)', fontSize: '11px' }}>({d.reviewsCount || 0})</span>
                                        {d.confidenceScore !== undefined && (
                                            <span className="trust-badge">
                                                <i className="fas fa-shield-alt"></i> {d.confidenceScore}% Trust
                                            </span>
                                        )}
                                    </div>
                                    <div className="doctor-card-name">{name}</div>
                                    <div className="doctor-card-spec">{d.specialty}</div>
                                    <div className="doctor-card-patients">
                                        <i className="fas fa-user-injured"></i> {d.patientsTreated || 0} Patients treated
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Doctors;
