import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { TabibiAPI } from '../utils/TabibiAPI';

const TIMES = ['8:00 am', '8:30 am', '9:00 am', '9:30 am', '10:00 am', '10:30 am', '11:00 am', '11:30 am'];

const makeDays = () => {
    const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
    return Array.from({ length: 7 }).map((_, index) => {
        const date = new Date();
        date.setDate(date.getDate() + index + 1);
        return {
            label: formatter.format(date).toUpperCase(),
            day: date.getDate(),
            date,
            iso: date.toISOString().slice(0, 10),
        };
    });
};

const normalizeDoctor = (doctor) => {
    if (!doctor) return null;
    const user = doctor.userId || {};
    const name = doctor.name || user.name || 'Unknown Doctor';
    return {
        ...doctor,
        id: doctor._id || doctor.id,
        name,
        email: doctor.email || user.email,
        img: TabibiAPI.normalizeImg(doctor.image || doctor.img || user.image || '/assets/images/M1.png'),
        specialty: doctor.specialty || 'General physician',
        degree: doctor.degree || 'MBBS',
        experience: doctor.experience ? `${doctor.experience}`.replace(/\s*Years?$/i, '') : '2',
        about: doctor.about || `${name} is a trusted ${doctor.specialty || 'doctor'} on Tabibi, focused on clear diagnosis, patient comfort, and practical follow-up care.`,
        fee: Number(doctor.fee) || 50,
        rating: Number(doctor.rating) || 4.8,
        reviewsCount: Number(doctor.reviewsCount) || 0,
        patientsTreated: Number(doctor.patientsTreated || doctor.patients_treated) || 0,
        confidenceScore: Number(doctor.confidenceScore || doctor.confidence_score) || 0,
        available: doctor.available !== false,
        certificates: doctor.certificates || [],
        clinicAddress: doctor.clinicAddress || doctor.clinic_address || '',
    };
};

const DetailRow = ({ label, value }) => (
    <div className="detail-row">
        <span>{label}</span>
        <span>{value}</span>
    </div>
);

const PatientItem = ({ email, patientUser, lastAppt, navigate, doctor }) => {
    const [recordCount, setRecordCount] = useState(0);
    const age = TabibiAPI.calculateAge(patientUser?.dob);

    useEffect(() => {
        let active = true;
        TabibiAPI.getPatientFiles(email)
            .then(files => {
                if (active) setRecordCount(files.length);
            })
            .catch(err => console.error(err));
        return () => { active = false; };
    }, [email]);

    return (
        <div className="patient-item" onClick={() => navigate(`/messages?patient=${encodeURIComponent(email)}&doctorId=${doctor.id}`)}>
            <div className="patient-avatar">{(patientUser?.name || 'P').charAt(0).toUpperCase()}</div>
            <div className="patient-info">
                <div className="patient-name">{patientUser?.name || email} <span style={{ fontWeight: 400, color: 'var(--gray)', fontSize: '12px' }}>({age} yrs)</span></div>
                <div className="patient-meta">
                    Last: {lastAppt.day} | {lastAppt.time}
                    {recordCount > 0 && ` | ${recordCount} Records`}
                </div>
            </div>
            <button className="chat-btn-sm">
                <i className="fas fa-comment"></i> Chat
            </button>
        </div>
    );
};

const DoctorPanel = ({ doctor, currentUser, navigate }) => {
    if (!TabibiAPI.isDoctor() || currentUser?.email !== doctor?.email) return null;

    const allAppts = TabibiAPI.getAppointments();
    const myAppts = allAppts.filter(a => String(a.doctorId?._id || a.doctorId) === String(doctor.id));
    const patientEmails = [...new Set(myAppts.map(a => a.userEmail))];
    const allUsers = TabibiAPI.getAllUsers();

    return (
        <section className="doctor-panel">
            <h3><i className="fas fa-clipboard-list"></i> My Patients & Consultations ({patientEmails.length})</h3>
            <div className="patient-list">
                {patientEmails.length ? patientEmails.map(email => {
                    const patientUser = allUsers.find(u => u.email === email);
                    const pAppts = myAppts.filter(a => a.userEmail === email);
                    const lastAppt = pAppts[pAppts.length - 1];

                    return (
                        <PatientItem
                            key={email}
                            email={email}
                            patientUser={patientUser}
                            lastAppt={lastAppt}
                            navigate={navigate}
                            doctor={doctor}
                        />
                    );
                }) : <p className="review-empty">No patients have booked yet.</p>}
            </div>
        </section>
    );
};

const ReviewModal = ({ visible, onClose, onSubmit }) => {
    const [rating, setRating] = useState(5);
    const [text, setText] = useState('');

    if (!visible) return null;

    return (
        <div className="modal-overlay show" onClick={(e) => e.target.classList.contains('modal-overlay') && onClose()}>
            <div className="modal">
                <button className="modal-close" onClick={onClose}>×</button>
                <h2>Write a Review</h2>
                <p>Rate your experience with this doctor</p>

                <div className="star-selector">
                    {[1, 2, 3, 4, 5].map(val => (
                        <i
                            key={val}
                            className={`${val <= rating ? 'fas' : 'far'} fa-star`}
                            onClick={() => setRating(val)}
                        ></i>
                    ))}
                </div>

                <label>Your Review</label>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    style={{ width: '100%', padding: '12px', border: '1px solid #DADADA', borderRadius: '6px', minHeight: '100px', marginBottom: '20px', fontFamily: 'inherit' }}
                    placeholder="Share details of your experience..."
                ></textarea>

                <button className="btn-primary" onClick={() => onSubmit(rating, text)}>Submit Review</button>
            </div>
        </div>
    );
};

const Appointment = ({ onShowModal }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const doctorId = searchParams.get('id');
    const editId = searchParams.get('edit');
    const days = useMemo(makeDays, []);

    const [doctor, setDoctor] = useState(null);
    const [allDoctors, setAllDoctors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState(0);
    const [selectedTime, setSelectedTime] = useState('');
    const [successAppointment, setSuccessAppointment] = useState(null);
    const [saving, setSaving] = useState(false);
    const [reviewModalVisible, setReviewModalVisible] = useState(false);
    const [useCustomDateTime, setUseCustomDateTime] = useState(false);
    const [customDate, setCustomDate] = useState('');
    const [customTime, setCustomTime] = useState('');
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentStep, setPaymentStep] = useState('selection'); // 'selection', 'cash', 'vodafone', 'instapay'
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [transactionRef, setTransactionRef] = useState('');
    const [validationError, setValidationError] = useState('');

    const formatTime12Hour = (time24) => {
        if (!time24) return '';
        const [hoursStr, minutesStr] = time24.split(':');
        let hours = parseInt(hoursStr, 10);
        const minutes = minutesStr;
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${hours}:${minutes} ${ampm}`;
    };

    const formatDateLabel = (dateStr) => {
        if (!dateStr) return '';
        const dateObj = new Date(dateStr);
        const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
        const label = formatter.format(dateObj).toUpperCase();
        const day = dateObj.getDate();
        return `${label} ${day}`;
    };

    useEffect(() => {
        let mounted = true;

        const loadDoctor = async () => {
            setLoading(true);
            const localDoctors = TabibiAPI.getDoctors().map(normalizeDoctor);
            const localDoctor = localDoctors.find((item) => String(item.id) === String(doctorId)) || localDoctors[0];

            try {
                const [doctorRes, doctorsRes] = await Promise.all([
                    doctorId && /^[a-f\d]{24}$/i.test(doctorId) ? axios.get(`/api/doctors/${doctorId}`) : Promise.resolve({ data: localDoctor }),
                    axios.get('/api/doctors'),
                ]);

                if (!mounted) return;
                const normalizedList = doctorsRes.data.map(normalizeDoctor);
                setDoctor(normalizeDoctor(doctorRes.data) || localDoctor);
                setAllDoctors(normalizedList.length ? normalizedList : localDoctors);
            } catch {
                if (!mounted) return;
                setDoctor(localDoctor);
                setAllDoctors(localDoctors);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        loadDoctor();
        return () => { mounted = false; };
    }, [doctorId]);

    useEffect(() => {
        if (!editId) return;
        const appointment = TabibiAPI.getAppointments().find((item) => String(item.id) === String(editId) || String(item._id) === String(editId));
        if (!appointment) return;

        const dayIndex = days.findIndex((day) => appointment.date?.slice?.(0, 10) === day.iso || appointment.day?.includes(String(day.day)));
        if (dayIndex >= 0) setSelectedDay(dayIndex);
        if (appointment.time) setSelectedTime(appointment.time);
    }, [days, editId]);

    const relatedDoctors = allDoctors
        .filter((item) => String(item.id) !== String(doctor?.id) && item.specialty === doctor?.specialty)
        .slice(0, 4);

    const selectedDate = days[selectedDay];
    const reviews = doctor ? TabibiAPI.getDoctorReviews(doctor.id) : [];
    const currentUser = TabibiAPI.getUser();

    const handleCopy = (text, label) => {
        navigator.clipboard.writeText(text);
        TabibiAPI.showToast(`${label} copied to clipboard!`);
    };

    const bookAppointment = () => {
        if (!doctor) return;
        if (!currentUser) {
            onShowModal?.('login');
            return;
        }
        if (currentUser.role === 'doctor' && currentUser.email !== doctor.email) {
            TabibiAPI.showToast('Doctors cannot book patient appointments from this page');
            return;
        }
        if (!doctor.available) {
            TabibiAPI.showToast('This doctor is currently unavailable');
            return;
        }
        if (useCustomDateTime) {
            if (!customDate) {
                TabibiAPI.showToast('Please select a date');
                return;
            }
            if (!customTime) {
                TabibiAPI.showToast('Please select a time');
                return;
            }
        } else {
            if (!selectedTime) {
                TabibiAPI.showToast('Please select a time slot');
                return;
            }
        }

        // Open the payment flow modal!
        setPaymentMethod('cash');
        setTransactionRef('');
        setPaymentStep('selection');
        setValidationError('');
        setShowPaymentModal(true);
    };

    const persistBooking = async (method, ref) => {
        if (!doctor) return;

        const localAppointment = {
            id: editId || Date.now(),
            doctorId: doctor.id,
            doctorName: doctor.name,
            doctorImg: doctor.img,
            specialty: doctor.specialty,
            day: useCustomDateTime ? formatDateLabel(customDate) : `${selectedDate.label} ${selectedDate.day}`,
            date: useCustomDateTime ? customDate : selectedDate.iso,
            time: useCustomDateTime ? formatTime12Hour(customTime) : selectedTime,
            fee: doctor.fee,
            amount: doctor.fee,
            paid: false,
            payment: method, // Keep for backward compatibility
            paymentMethod: method,
            paymentStatus: method === 'cash' ? 'Pending' : 'Pending Verification',
            transactionRef: ref || '',
            status: 'pending',
            userEmail: currentUser.email,
            userName: currentUser.name,
        };

        setSaving(true);
        setValidationError('');
        try {
            const token = TabibiAPI.getToken();
            if (token && /^[a-f\d]{24}$/i.test(String(doctor.id))) {
                const response = await axios.post('/api/appointments', {
                    doctorId: doctor.id,
                    date: useCustomDateTime ? customDate : selectedDate.iso,
                    time: useCustomDateTime ? formatTime12Hour(customTime) : selectedTime,
                    amount: doctor.fee,
                    payment: method,
                    paymentMethod: method,
                    transactionRef: ref || '',
                    appointmentId: editId || undefined
                }, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const backendAppointment = { ...localAppointment, ...response.data, id: response.data._id || localAppointment.id };
                TabibiAPI.saveAppointment(backendAppointment);
                setSuccessAppointment(backendAppointment);
                setShowPaymentModal(false);
            } else {
                // Check offline duplicate references
                if (ref && ref.trim() !== '') {
                    const localAppts = TabibiAPI.getAppointments() || [];
                    const dup = localAppts.find(a => a.transactionRef === ref && a.paymentMethod === method && String(a.id) !== String(editId));
                    if (dup) {
                        setValidationError('Transaction reference already used');
                        setSaving(false);
                        return;
                    }
                }
                
                if (editId) {
                    const updated = TabibiAPI.updateAppointment(editId, localAppointment) || localAppointment;
                    setSuccessAppointment(updated);
                } else {
                    TabibiAPI.saveAppointment(localAppointment);
                    setSuccessAppointment(localAppointment);
                }
                setShowPaymentModal(false);
            }
            TabibiAPI.logActivity('Appointment Booked', `Patient: ${currentUser.name} booked with ${doctor.name} using ${method}`);
        } catch (err) {
            if (err.response) {
                const errMsg = err.response.data?.message || 'Failed to book appointment';
                setValidationError(errMsg);
            } else {
                // Offline fallback
                if (ref && ref.trim() !== '') {
                    const localAppts = TabibiAPI.getAppointments() || [];
                    const dup = localAppts.find(a => a.transactionRef === ref && a.paymentMethod === method && String(a.id) !== String(editId));
                    if (dup) {
                        setValidationError('Transaction reference already used');
                        setSaving(false);
                        return;
                    }
                }
                
                if (editId) {
                    const updated = TabibiAPI.updateAppointment(editId, localAppointment) || localAppointment;
                    setSuccessAppointment(updated);
                } else {
                    TabibiAPI.saveAppointment(localAppointment);
                    setSuccessAppointment(localAppointment);
                }
                setShowPaymentModal(false);
                TabibiAPI.showToast('Booked appointment offline (saved locally)');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleReviewSubmit = (rating, text) => {
        if (!text) {
            TabibiAPI.showToast('Please write a review text');
            return;
        }
        TabibiAPI.saveReview(doctor.id, {
            userEmail: currentUser.email,
            userName: currentUser.name,
            rating,
            review: text
        });
        setReviewModalVisible(false);
        TabibiAPI.showToast('Review submitted successfully!');
    };

    const openChat = () => {
        if (!currentUser) {
            onShowModal?.('login');
            return;
        }
        navigate(`/messages?doctorId=${doctor.id}&patient=${encodeURIComponent(currentUser.email)}`);
    };

    if (loading) {
        return (
            <main className="main appointment-main">
                <div className="appointment-loading">
                    <div className="skeleton appointment-photo-skeleton"></div>
                    <div className="appointment-copy-skeleton">
                        <div className="skeleton"></div>
                        <div className="skeleton"></div>
                        <div className="skeleton"></div>
                    </div>
                </div>
            </main>
        );
    }

    if (!doctor) {
        return (
            <main className="main appointment-main">
                <div className="empty-state">
                    <i className="fas fa-user-doctor"></i>
                    <h2>Doctor not found</h2>
                    <button className="btn-primary" onClick={() => navigate('/doctors')}>Browse doctors</button>
                </div>
            </main>
        );
    }

    return (
        <main className="main appointment-main">
            <section className="doctor-profile">
                <div className="doctor-profile-img">
                    <img src={doctor.img} alt={doctor.name} loading="lazy" />
                </div>

                <div className="doctor-info">
                    <h1>{doctor.name}</h1>
                    <div className="degree">{doctor.degree} - {doctor.specialty}</div>
                    <div className="exp">{doctor.experience} Years Experience</div>
                    <div className={`availability ${doctor.available ? 'green' : 'red'}`}>
                        <div className={`dot ${doctor.available ? 'green' : 'red'}`}></div>
                        {doctor.available ? 'Available Now' : 'Unavailable'}
                    </div>

                    <div className="about-label">About</div>
                    <p>{doctor.about}</p>

                    <div className="about-label"><i className="fas fa-map-marker-alt" style={{ marginRight: '6px', color: 'var(--primary)' }}></i> Clinic Location</div>
                    <p>
                        <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(doctor.clinicAddress || 'Main Clinic')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: 'var(--primary)', textDecoration: 'underline', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                            {doctor.clinicAddress || 'Main Clinic'}
                        </a>
                    </p>

                    <div className="doctor-stats-row">
                        <div>
                            <span>{doctor.rating.toFixed(1)}</span>
                            <small><i className="fas fa-star"></i> Rating</small>
                        </div>
                        <div>
                            <span>{doctor.reviewsCount || reviews.length || 'New'}</span>
                            <small>Reviews</small>
                        </div>
                        <div>
                            <span>{doctor.patientsTreated || 0}</span>
                            <small><i className="fas fa-user-injured"></i> Patients</small>
                        </div>
                        <div>
                            <span>{doctor.confidenceScore || 0}%</span>
                            <small><i className="fas fa-shield-alt"></i> Trust Score</small>
                        </div>
                    </div>

                    <div className="fee">Appointment fee: <span>${doctor.fee}</span></div>

                    {(!currentUser || currentUser.email !== doctor.email) && (
                        <button className="chat-main-btn" onClick={openChat}>
                            <i className="fas fa-comment"></i> Chat with Dr. {doctor.name.split(' ').pop()}
                        </button>
                    )}
                </div>
            </section>

            <DoctorPanel doctor={doctor} currentUser={currentUser} navigate={navigate} />

            {doctor.certificates.length > 0 && (
                <section className="doctor-panel">
                    <h3><i className="fas fa-award"></i> Experience Certificates</h3>
                    <div className="certificate-list">
                        {doctor.certificates.map((certificate, index) => (
                            <a key={`${certificate}-${index}`} className="certificate-item" href={certificate} target="_blank" rel="noreferrer">
                                <i className="fas fa-file-medical"></i>
                                <span>Certificate {index + 1}</span>
                            </a>
                        ))}
                    </div>
                </section>
            )}

            {!TabibiAPI.isDoctor() && (
                <section className="booking-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', flexWrap: 'wrap', gap: '12px' }}>
                        <h2 style={{ margin: 0 }}>Booking slots</h2>
                        <button 
                            type="button"
                            className="btn-outline" 
                            style={{ padding: '6px 16px', fontSize: '13px', borderRadius: '8px', border: '1.5px solid var(--primary)' }}
                            onClick={() => setUseCustomDateTime(!useCustomDateTime)}
                        >
                            {useCustomDateTime ? 'Choose preset slots' : 'Choose custom date & time'}
                        </button>
                    </div>

                    {useCustomDateTime ? (
                        <div className="custom-datetime-picker" style={{ display: 'flex', gap: '20px', marginBottom: '28px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Select Date</label>
                                <input 
                                    type="date" 
                                    value={customDate} 
                                    onChange={(e) => setCustomDate(e.target.value)} 
                                    min={new Date().toISOString().slice(0, 10)}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1.5px solid #9CA3AF', outline: 'none', fontFamily: 'inherit', fontSize: '15px' }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <label style={{ display: 'block', fontSize: '13px', color: 'var(--gray)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '8px' }}>Select Time</label>
                                <input 
                                    type="time" 
                                    value={customTime} 
                                    onChange={(e) => setCustomTime(e.target.value)} 
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1.5px solid #9CA3AF', outline: 'none', fontFamily: 'inherit', fontSize: '15px' }}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="days-row">
                                {days.map((day, index) => (
                                    <button
                                        type="button"
                                        key={day.iso}
                                        className={`day-btn${selectedDay === index ? ' active' : ''}`}
                                        onClick={() => setSelectedDay(index)}
                                        aria-pressed={selectedDay === index}
                                    >
                                        <span className="day-name">{day.label}</span>
                                        <span className="day-num">{day.day}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="times-row">
                                {TIMES.map((time) => (
                                    <button
                                        type="button"
                                        key={time}
                                        className={`time-btn${selectedTime === time ? ' active' : ''}`}
                                        onClick={() => setSelectedTime(time)}
                                        aria-pressed={selectedTime === time}
                                    >
                                        {time}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    <button 
                        className="book-btn" 
                        onClick={bookAppointment} 
                        disabled={saving || !doctor.available}
                        style={!doctor.available ? { background: '#9CA3AF', cursor: 'not-allowed' } : {}}
                    >
                        {saving ? 'Saving...' : !doctor.available ? 'Doctor Unavailable' : editId ? 'Update appointment' : 'Book an appointment'}
                    </button>
                </section>
            )}

            <section className="reviews-section">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div className="about-label"><i className="fas fa-star"></i> Patient Reviews</div>
                    {TabibiAPI.isPatient() && (
                        <button className="review-write-btn" onClick={() => setReviewModalVisible(true)}>
                            <i className="fas fa-pen"></i> Write Review
                        </button>
                    )}
                </div>
                {reviews.length === 0 ? (
                    <div className="review-empty">No reviews yet.</div>
                ) : (
                    <div className="reviews-list">
                        {reviews.slice(0, 5).map((review) => (
                            <div className="review-item" key={review.id}>
                                <div className="review-head">
                                    <strong>{review.userName || 'Patient'}</strong>
                                    <span>{new Date(review.date).toLocaleDateString()}</span>
                                </div>
                                <div className="review-stars">
                                    {Array.from({ length: Math.max(1, Math.min(5, review.rating || 5)) }).map((_, index) => (
                                        <i className="fas fa-star" key={index}></i>
                                    ))}
                                </div>
                                <p>{review.review}</p>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {relatedDoctors.length > 0 && (
                <section className="related-section">
                    <h2>Related Doctors</h2>
                    <p>Simply browse through our extensive list of trusted doctors.</p>
                    <div className="doctors-grid">
                        {relatedDoctors.map((item) => (
                            <div key={item.id} className="doctor-card" onClick={() => navigate(`/appointment?id=${item.id}`)}>
                                <div className="doctor-card-img">
                                    <img src={item.img} alt={item.name} loading="lazy" />
                                </div>
                                <div className="doctor-card-info">
                                    <div className={`availability ${item.available ? 'green' : 'red'}`}>
                                        <div className={`dot ${item.available ? 'green' : 'red'}`}></div>
                                        {item.available ? 'Available' : 'Unavailable'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '6px 0 4px', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#FFC700', fontSize: '11px' }}>
                                            {Array.from({ length: Math.round(item.rating || 4.8) }).map((_, i) => <i key={i} className="fas fa-star"></i>)}
                                        </div>
                                        <span style={{ color: 'var(--gray)', fontSize: '10px' }}>({item.reviewsCount || 0})</span>
                                        {item.confidenceScore !== undefined && (
                                            <span className="trust-badge" style={{ fontSize: '10px', padding: '2px 6px' }}>
                                                <i className="fas fa-shield-alt"></i> {item.confidenceScore}% Trust
                                            </span>
                                        )}
                                    </div>
                                    <div className="doctor-card-name">{item.name}</div>
                                    <div className="doctor-card-spec">{item.specialty}</div>
                                    <div className="doctor-card-patients">
                                        <i className="fas fa-user-injured"></i> {item.patientsTreated || 0} Patients treated
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {successAppointment && (
                <div className="modal-overlay show" onClick={(event) => event.target.classList.contains('modal-overlay') && setSuccessAppointment(null)}>
                    <div className="success-modal">
                        <div className="success-icon"><i className="fas fa-check"></i></div>
                        <h2>Booking Confirmed!</h2>
                        <p>Your appointment has been successfully scheduled.</p>
                        <div className="success-details">
                            <DetailRow label="Doctor" value={doctor.name} />
                            <DetailRow label="Specialty" value={doctor.specialty} />
                            <DetailRow label="Date" value={`${selectedDate.label} ${selectedDate.day}`} />
                            <DetailRow label="Time" value={successAppointment.time} />
                            <DetailRow label="Payment Method" value={successAppointment.paymentMethod === 'cash' ? 'Cash at Clinic' : successAppointment.paymentMethod === 'vodafone' ? 'Vodafone Cash' : 'Instapay'} />
                            <DetailRow label="Payment Status" value={successAppointment.paymentStatus || 'Pending'} />
                            <div className="detail-row">
                                <span>Clinic Address</span>
                                <span>
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(doctor.clinicAddress || 'Main Clinic')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ color: 'var(--primary)', textDecoration: 'underline', fontWeight: '600' }}
                                    >
                                        {doctor.clinicAddress || 'Main Clinic'} <i className="fas fa-map-marker-alt" style={{ marginLeft: '4px' }}></i>
                                    </a>
                                </span>
                            </div>
                        </div>
                        <div className="success-btns">
                            <button className="btn-full btn-primary-full" onClick={() => navigate('/my-appointments')}>View My Appointments</button>
                            <button className="btn-full btn-secondary-full" onClick={() => setSuccessAppointment(null)}>Back to Doctor</button>
                        </div>
                    </div>
                </div>
            )}

            {showPaymentModal && (
                <div className="modal-overlay show" onClick={(event) => event.target.classList.contains('modal-overlay') && setShowPaymentModal(false)}>
                    <div className="success-modal" style={{ textAlign: 'left', width: '500px', padding: '30px' }}>
                        <button className="modal-close" onClick={() => setShowPaymentModal(false)}>&times;</button>
                        
                        <style dangerouslySetInnerHTML={{ __html: `
                            .payment-title { font-size: 22px; font-weight: 700; color: var(--navy); margin-bottom: 15px; text-align: center; }
                            .payment-doc-card { display: flex; gap: 14px; padding: 14px; background: var(--primary-light); border-radius: 14px; margin-bottom: 20px; align-items: center; border: 1.5px solid rgba(95, 111, 255, 0.15); }
                            .payment-doc-img { width: 50px; height: 50px; border-radius: 50%; object-fit: cover; background: white; border: 1.5px solid white; }
                            .payment-doc-name { font-weight: 700; color: var(--dark); font-size: 15px; }
                            .payment-doc-spec { font-size: 12px; color: var(--gray); }
                            .payment-detail-box { border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px; margin-bottom: 20px; font-size: 14px; background: #F9FAFB; }
                            .payment-detail-box div { display: flex; justify-content: space-between; margin-bottom: 6px; }
                            .payment-detail-box div:last-child { margin-bottom: 0; }
                            .payment-methods-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px; }
                            .payment-method-option { display: flex; align-items: center; gap: 12px; padding: 14px; border: 2px solid #F3F4F6; border-radius: 14px; cursor: pointer; transition: all 0.25s ease; background: #F9FAFB; }
                            .payment-method-option:hover { border-color: #E5E7EB; background: white; }
                            .payment-method-option.selected { border-color: var(--primary); background: #f5f7ff; box-shadow: 0 4px 12px rgba(95, 111, 255, 0.08); }
                            .payment-method-option i { font-size: 20px; color: var(--primary); width: 24px; text-align: center; }
                            .payment-method-option .radio-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #D1D5DB; display: flex; align-items: center; justify-content: center; margin-left: auto; transition: all 0.2s; }
                            .payment-method-option.selected .radio-dot { border-color: var(--primary); }
                            .payment-method-option.selected .radio-dot::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--primary); display: block; }
                            .payment-credentials-container { display: flex; justify-content: space-between; align-items: center; background: white; padding: 12px 16px; border-radius: 10px; border: 1.5px solid #E5E7EB; font-weight: 700; color: var(--navy); font-size: 16px; font-family: monospace; letter-spacing: 0.5px; margin-bottom: 16px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); }
                            .copy-action-btn { background: var(--primary-light); color: var(--primary); border: none; padding: 6px 12px; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer; transition: all 0.2s; font-family: inherit; }
                            .copy-action-btn:hover { background: var(--primary); color: white; }
                            .status-badge-inline { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
                            .status-badge-inline.pending-verification { background: #E0F2FE; color: #0369A1; border: 1px solid #BAE6FD; }
                            .status-badge-inline.pending-payment { background: #FFFBEB; color: #D97706; border: 1px solid #FDE68A; }
                            .payment-instructions-text { font-size: 13px; color: var(--gray); line-height: 1.6; margin-bottom: 18px; }
                            .payment-error-msg { color: #DC2626; background: #FEF2F2; border: 1px solid #FCA5A5; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: 500; margin-bottom: 16px; text-align: center; }
                        `}} />

                        {paymentStep === 'selection' && (
                            <div>
                                <h3 className="payment-title">Select Payment Method</h3>
                                
                                <div className="payment-doc-card">
                                    <img src={doctor.img} className="payment-doc-img" alt={doctor.name} />
                                    <div>
                                        <div className="payment-doc-name">{doctor.name}</div>
                                        <div className="payment-doc-spec">{doctor.specialty} &bull; {doctor.degree}</div>
                                    </div>
                                </div>

                                <div className="payment-detail-box">
                                    <div>
                                        <span>Appointment Date:</span>
                                        <strong>{useCustomDateTime ? customDate : selectedDate.iso}</strong>
                                    </div>
                                    <div>
                                        <span>Consultation Time:</span>
                                        <strong>{useCustomDateTime ? formatTime12Hour(customTime) : selectedTime}</strong>
                                    </div>
                                    <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '8px', marginTop: '8px' }}>
                                        <span style={{ fontWeight: '600' }}>Consultation Fee:</span>
                                        <strong style={{ color: 'var(--primary)', fontSize: '16px' }}>${doctor.fee}</strong>
                                    </div>
                                </div>

                                <div className="payment-methods-list">
                                    <div className={`payment-method-option ${paymentMethod === 'cash' ? 'selected' : ''}`} onClick={() => setPaymentMethod('cash')}>
                                        <i className="fas fa-clinic-medical"></i>
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '14px' }}>Cash at Clinic</strong>
                                            <span style={{ font_size: '11px', color: 'var(--gray)' }}>Pay at clinic reception counter on arrival</span>
                                        </div>
                                        <div className="radio-dot"></div>
                                    </div>

                                    <div className={`payment-method-option ${paymentMethod === 'vodafone' ? 'selected' : ''}`} onClick={() => setPaymentMethod('vodafone')}>
                                        <i className="fas fa-mobile-alt"></i>
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '14px' }}>Vodafone Cash</strong>
                                            <span style={{ font_size: '11px', color: 'var(--gray)' }}>Transfer to mobile wallet (01012345678)</span>
                                        </div>
                                        <div className="radio-dot"></div>
                                    </div>

                                    <div className={`payment-method-option ${paymentMethod === 'instapay' ? 'selected' : ''}`} onClick={() => setPaymentMethod('instapay')}>
                                        <i className="fas fa-university"></i>
                                        <div>
                                            <strong style={{ display: 'block', fontSize: '14px' }}>Instapay</strong>
                                            <span style={{ font_size: '11px', color: 'var(--gray)' }}>Direct instant transfer to ID (tabibi@instapay)</span>
                                        </div>
                                        <div className="radio-dot"></div>
                                    </div>
                                </div>

                                <button 
                                    className="btn-full btn-primary-full" 
                                    onClick={() => setPaymentStep(paymentMethod)}
                                >
                                    Proceed to Confirm
                                </button>
                            </div>
                        )}

                        {paymentStep === 'cash' && (
                            <div>
                                <h3 className="payment-title">Cash Booking Summary</h3>
                                
                                <div className="status-badge-inline pending-payment">
                                    <i className="fas fa-clock"></i> Pending Payment
                                </div>

                                <div className="payment-detail-box">
                                    <div><span>Doctor:</span><strong>{doctor.name}</strong></div>
                                    <div><span>Date & Time:</span><strong>{useCustomDateTime ? customDate : selectedDate.iso} at {useCustomDateTime ? formatTime12Hour(customTime) : selectedTime}</strong></div>
                                    <div><span>Amount Due:</span><strong style={{ color: 'var(--primary)' }}>${doctor.fee}</strong></div>
                                </div>

                                <p className="payment-instructions-text">
                                    Your booking slot will be reserved. Please pay the consultation fee of <strong>${doctor.fee}</strong> in cash at the clinic counter upon arrival.
                                </p>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button className="btn-full btn-secondary-full" style={{ flex: 1 }} onClick={() => setPaymentStep('selection')}>Back</button>
                                    <button className="btn-full btn-primary-full" style={{ flex: 2 }} onClick={() => persistBooking('cash', '')} disabled={saving}>
                                        {saving ? 'Saving...' : 'Confirm Appointment'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {paymentStep === 'vodafone' && (
                            <div>
                                <h3 className="payment-title">Vodafone Cash Transfer</h3>
                                
                                <div className="status-badge-inline pending-verification">
                                    <i className="fas fa-spinner fa-spin"></i> Pending Verification
                                </div>

                                <label>Vodafone Cash Number</label>
                                <div className="payment-credentials-container">
                                    <span>01012345678</span>
                                    <button 
                                        type="button"
                                        className="copy-action-btn"
                                        onClick={() => handleCopy('01012345678', 'Vodafone Cash number')}
                                    >
                                        <i className="far fa-copy"></i> Copy
                                    </button>
                                </div>

                                <p className="payment-instructions-text">
                                    1. Transfer <strong>${doctor.fee}</strong> to the Vodafone Cash number above.<br />
                                    2. Enter the transaction reference ID received in your transfer receipt below.
                                </p>

                                {validationError && <div className="payment-error-msg">{validationError}</div>}

                                <label>Transaction Reference ID</label>
                                <input 
                                    type="text" 
                                    placeholder="Enter 12-digit transaction ID"
                                    value={transactionRef}
                                    onChange={(e) => setTransactionRef(e.target.value)}
                                    style={{ width: '100%', padding: '12px', border: '1.5px solid #E5E7EB', borderRadius: '10px', marginBottom: '20px', fontSize: '15px' }}
                                />

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button className="btn-full btn-secondary-full" style={{ flex: 1 }} onClick={() => setPaymentStep('selection')}>Back</button>
                                    <button className="btn-full btn-primary-full" style={{ flex: 2 }} onClick={() => {
                                        if (!transactionRef.trim()) {
                                            setValidationError('Transaction reference is required');
                                            return;
                                        }
                                        persistBooking('vodafone', transactionRef);
                                    }} disabled={saving}>
                                        {saving ? 'Verifying...' : 'Submit Payment'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {paymentStep === 'instapay' && (
                            <div>
                                <h3 className="payment-title">Instapay Transfer</h3>
                                
                                <div className="status-badge-inline pending-verification">
                                    <i className="fas fa-spinner fa-spin"></i> Pending Verification
                                </div>

                                <label>Instapay ID</label>
                                <div className="payment-credentials-container">
                                    <span>tabibi@instapay</span>
                                    <button 
                                        type="button"
                                        className="copy-action-btn"
                                        onClick={() => handleCopy('tabibi@instapay', 'Instapay ID')}
                                    >
                                        <i className="far fa-copy"></i> Copy
                                    </button>
                                </div>

                                <p className="payment-instructions-text">
                                    1. Send the fee amount of <strong>${doctor.fee}</strong> via Instapay app to the ID above.<br />
                                    2. Enter the reference number/transaction code below to submit for verification.
                                </p>

                                {validationError && <div className="payment-error-msg">{validationError}</div>}

                                <label>Transaction Reference ID</label>
                                <input 
                                    type="text" 
                                    placeholder="Enter Instapay reference code"
                                    value={transactionRef}
                                    onChange={(e) => setTransactionRef(e.target.value)}
                                    style={{ width: '100%', padding: '12px', border: '1.5px solid #E5E7EB', borderRadius: '10px', marginBottom: '20px', fontSize: '15px' }}
                                />

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button className="btn-full btn-secondary-full" style={{ flex: 1 }} onClick={() => setPaymentStep('selection')}>Back</button>
                                    <button className="btn-full btn-primary-full" style={{ flex: 2 }} onClick={() => {
                                        if (!transactionRef.trim()) {
                                            setValidationError('Transaction reference is required');
                                            return;
                                        }
                                        persistBooking('instapay', transactionRef);
                                    }} disabled={saving}>
                                        {saving ? 'Verifying...' : 'Submit Payment'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ReviewModal
                visible={reviewModalVisible}
                onClose={() => setReviewModalVisible(false)}
                onSubmit={handleReviewSubmit}
            />
        </main>
    );
};

export default Appointment;
