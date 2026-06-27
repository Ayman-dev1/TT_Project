import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import AuthModal from './components/AuthModal';
import Home from './pages/Home';
import Chatbot from './pages/Chatbot';
import Doctors from './pages/Doctors';
import Appointment from './pages/Appointment';
import About from './pages/About';
import Contact from './pages/Contact';
import MyAppointments from './pages/MyAppointments';
import Profile from './pages/Profile';
import Messages from './pages/Messages';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import { TabibiAPI } from './utils/TabibiAPI';
import './index.css';

const BroadcastBanner = () => {
    const location = useLocation();
    const [broadcast, setBroadcast] = useState(null);
    const [dismissedMsg, setDismissedMsg] = useState('');

    useEffect(() => {
        const checkBroadcast = () => {
            const bc = TabibiAPI.getBroadcast();
            setBroadcast(bc && bc.active ? bc : null);
        };
        checkBroadcast();
        window.addEventListener('tabibi_broadcast_updated', checkBroadcast);
        window.addEventListener('storage', checkBroadcast);
        return () => {
            window.removeEventListener('tabibi_broadcast_updated', checkBroadcast);
            window.removeEventListener('storage', checkBroadcast);
        };
    }, []);

    const isAdminPage = location.pathname.startsWith('/admin') && !location.pathname.includes('/login');
    const showBanner = broadcast && broadcast.msg !== dismissedMsg && !isAdminPage;

    useEffect(() => {
        if (showBanner) {
            document.body.classList.add('has-broadcast');
        } else {
            document.body.classList.remove('has-broadcast');
        }
        return () => {
            document.body.classList.remove('has-broadcast');
        };
    }, [showBanner]);

    if (!showBanner) return null;

    const getIcon = () => {
        switch (broadcast.type) {
            case 'success': return 'fa-check-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'error': return 'fa-exclamation-circle';
            default: return 'fa-bullhorn';
        }
    };

    return (
        <div className={`broadcast-banner ${broadcast.type || 'info'}`}>
            <i className={`fas ${getIcon()}`}></i>
            <span>{broadcast.msg}</span>
            <button className="broadcast-banner-close" onClick={() => setDismissedMsg(broadcast.msg)}>×</button>
        </div>
    );
};

function App() {
    const [modalVisible, setModalVisible] = useState(false);
    const [modalMode, setModalMode] = useState('login');

    const showModal = (mode) => { setModalMode(mode); setModalVisible(true); };
    const hideModal = () => setModalVisible(false);

    return (
        <Router>
            <BroadcastBanner />
            <Navbar onShowModal={showModal} />

            <Routes>
                <Route path="/" element={
                    <>
                        <Home onShowModal={showModal} />
                        <Footer />
                    </>
                } />
                <Route path="/doctors" element={
                    <>
                        <Doctors />
                        <Footer />
                    </>
                } />
                <Route path="/appointment" element={
                    <>
                        <Appointment onShowModal={showModal} />
                        <Footer />
                    </>
                } />
                <Route path="/about" element={
                    <>
                        <About />
                        <Footer />
                    </>
                } />
                <Route path="/contact" element={
                    <>
                        <Contact />
                        <Footer />
                    </>
                } />
                <Route path="/my-appointments" element={
                    <>
                        <MyAppointments />
                        <Footer />
                    </>
                } />
                <Route path="/profile" element={
                    <>
                        <Profile />
                        <Footer />
                    </>
                } />
                <Route path="/messages" element={
                    <>
                        <Messages />
                        <Footer />
                    </>
                } />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/chatbot" element={<Chatbot />} />
                <Route path="*" element={
                    <>
                        <Home onShowModal={showModal} />
                        <Footer />
                    </>
                } />
            </Routes>

            <AuthModal
                visible={modalVisible}
                mode={modalMode}
                onClose={hideModal}
                onSwitch={(m) => setModalMode(m)}
            />

            <div className="toast" id="toast"></div>
        </Router>
    );
}

export default App;
