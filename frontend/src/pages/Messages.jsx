import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TabibiAPI } from '../utils/TabibiAPI';
import axios from 'axios';
import { io } from 'socket.io-client';

const Messages = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const [currentUser, setCurrentUser] = useState(null);
    const [contacts, setContacts] = useState([]);
    const [allChats, setAllChats] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeChat, setActiveChat] = useState(null); // { dId, pEmail, name, img, available }
    const [messages, setMessages] = useState([]);
    const [inputText, setInputText] = useState('');
    const chatContainerRef = useRef(null);

    // Initial auth verification
    useEffect(() => {
        const user = TabibiAPI.getUser();
        if (!user) {
            navigate('/');
        } else {
            setCurrentUser(user);
        }
    }, [navigate]);

    // Load contacts list
    const loadContacts = async (userObj) => {
        if (!userObj) return;
        try {
            const res = await axios.get(`/api/chats-active-contacts?email=${encodeURIComponent(userObj.email)}&role=${userObj.role}`);
            const data = Array.isArray(res.data) ? res.data : [];
            const normalized = data.map(contact => {
                if (userObj.role === 'patient') {
                    return {
                        ...contact,
                        img: TabibiAPI.getDoctorImage(contact.email || '', contact.img)
                    };
                } else {
                    return {
                        ...contact,
                        img: contact.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(contact.name)}`
                    };
                }
            });
            setContacts(normalized);
            setAllChats(normalized);
        } catch (err) {
            console.error("Failed to load contacts from server, falling back to local storage:", err.message);
            // Local fallback
            const chats = JSON.parse(localStorage.getItem('tabibi_chats') || '{}');
            const doctors = TabibiAPI.getDoctors();
            const users = JSON.parse(localStorage.getItem('tabibi_users') || '[]');
            const relevant = [];

            for (let key in chats) {
                const [dId, pEmail] = key.split('_');
                const doc = doctors.find(d => String(d.id) === String(dId) || String(d._id) === String(dId));
                const pat = users.find(u => u.email === pEmail);
                if (!doc || !pat || !Array.isArray(chats[key])) continue;

                if (userObj.role === 'doctor' && doc.email === userObj.email) {
                    const lastMsg = chats[key][chats[key].length - 1];
                    relevant.push({
                        dId: dId,
                        pEmail,
                        name: pat.name,
                        img: pat.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(pat.name)}`,
                        last: lastMsg?.text || 'Click to chat',
                        available: false,
                        unread: chats[key].some(m => m.senderRole !== userObj.role && !m.read)
                    });
                } else if (userObj.role === 'patient' && pEmail === userObj.email) {
                    const lastMsg = chats[key][chats[key].length - 1];
                    relevant.push({
                        dId: dId,
                        pEmail,
                        name: doc.name,
                        img: doc.img,
                        last: lastMsg?.text || 'Click to chat',
                        available: doc.available,
                        unread: chats[key].some(m => m.senderRole !== userObj.role && !m.read)
                    });
                }
            }
            setContacts(relevant);
            setAllChats(relevant);
        }
    };

    // Sync activeChat from search parameters if present on load or url changes
    useEffect(() => {
        if (!currentUser) return;
        const urlDId = searchParams.get('doctorId');
        const urlPEmail = searchParams.get('patient');
        if (urlDId && urlPEmail) {
            const doctors = TabibiAPI.getDoctors();
            const users = JSON.parse(localStorage.getItem('tabibi_users') || '[]');
            const doc = doctors.find(d => String(d.id) === String(urlDId) || String(d._id) === String(urlDId));
            const pat = users.find(u => u.email === urlPEmail);
            const target = currentUser.role === 'doctor' ? pat : doc;
            if (target) {
                if (!activeChat || String(activeChat.dId) !== String(urlDId) || activeChat.pEmail !== urlPEmail) {
                    setActiveChat({
                        dId: urlDId,
                        pEmail: urlPEmail,
                        name: target.name,
                        img: target.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(target.name)}`,
                        available: doc ? doc.available : false
                    });
                }
            }
        }
    }, [searchParams, currentUser, activeChat]);

    useEffect(() => {
        if (currentUser) {
            loadContacts(currentUser);
        }
    }, [currentUser]);

    // Handle incoming chat refresh (from backend with local fallback)
    useEffect(() => {
        if (activeChat) {
            axios.get(`/api/chats/${activeChat.dId}_${activeChat.pEmail}`)
                .then(res => {
                    if (Array.isArray(res.data)) {
                        setMessages(res.data);
                        // Update localStorage to keep in sync
                        const chats = JSON.parse(localStorage.getItem('tabibi_chats') || '{}');
                        chats[`${activeChat.dId}_${activeChat.pEmail}`] = res.data;
                        localStorage.setItem('tabibi_chats', JSON.stringify(chats));
                    } else {
                        setMessages([]);
                    }
                })
                .catch(() => {
                    const msgs = TabibiAPI.getChatMessages(activeChat.dId, activeChat.pEmail);
                    setMessages(Array.isArray(msgs) ? msgs : []);
                });

            axios.post(`/api/chats/${activeChat.dId}_${activeChat.pEmail}/read`, { role: currentUser?.role })
                .then(() => {
                    if (currentUser) {
                        loadContacts(currentUser);
                    }
                })
                .catch(() => {
                    if (currentUser) {
                        loadContacts(currentUser);
                    }
                });
            TabibiAPI.markChatAsRead(activeChat.dId, activeChat.pEmail);
        }
    }, [activeChat]);

    // Scroll chat window to bottom
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages]);

    // Connect to Socket.io to receive real-time updates from other browsers
    useEffect(() => {
        const socket = io(window.location.origin);
        
        socket.on('chat-message', (data) => {
            if (activeChat && data.key === `${activeChat.dId}_${activeChat.pEmail}`) {
                setMessages(prev => {
                    const prevArr = Array.isArray(prev) ? prev : [];
                    const exists = prevArr.some(m => (m._id || m.id) === (data.message._id || data.message.id) || (m.timestamp === data.message.timestamp && m.senderId === data.message.senderId));
                    if (exists) return prevArr;
                    
                    // Sync locally
                    const chats = JSON.parse(localStorage.getItem('tabibi_chats') || '{}');
                    if (!Array.isArray(chats[data.key])) chats[data.key] = [];
                    chats[data.key].push(data.message);
                    localStorage.setItem('tabibi_chats', JSON.stringify(chats));

                    return [...prevArr, data.message];
                });

                // Mark received message as read on backend if it came from the other side
                if (data.message.senderRole !== currentUser?.role) {
                    axios.post(`/api/chats/${activeChat.dId}_${activeChat.pEmail}/read`, { role: currentUser?.role })
                        .then(() => {
                            loadContacts(currentUser);
                        })
                        .catch(() => {
                            loadContacts(currentUser);
                        });
                } else {
                    loadContacts(currentUser);
                }
            } else if (currentUser) {
                // Refresh contacts list to update last message preview and unread badge
                const chats = JSON.parse(localStorage.getItem('tabibi_chats') || '{}');
                if (!Array.isArray(chats[data.key])) chats[data.key] = [];
                if (!chats[data.key].some(m => (m._id || m.id) === (data.message._id || data.message.id))) {
                    chats[data.key].push(data.message);
                    localStorage.setItem('tabibi_chats', JSON.stringify(chats));
                }
                loadContacts(currentUser);
            }
        });

        socket.on('chat-message-deleted', (data) => {
            if (activeChat && data.key === `${activeChat.dId}_${activeChat.pEmail}`) {
                setMessages(prev => {
                    const prevArr = Array.isArray(prev) ? prev : [];
                    return prevArr.filter(m => (m._id || m.id) !== data.messageId);
                });
                
                // Sync local storage fallback
                const chats = JSON.parse(localStorage.getItem('tabibi_chats') || '{}');
                if (Array.isArray(chats[data.key])) {
                    chats[data.key] = chats[data.key].filter(m => (m._id || m.id) !== data.messageId);
                    localStorage.setItem('tabibi_chats', JSON.stringify(chats));
                }
                loadContacts(currentUser);
            } else if (currentUser) {
                const chats = JSON.parse(localStorage.getItem('tabibi_chats') || '{}');
                if (Array.isArray(chats[data.key])) {
                    chats[data.key] = chats[data.key].filter(m => (m._id || m.id) !== data.messageId);
                    localStorage.setItem('tabibi_chats', JSON.stringify(chats));
                }
                loadContacts(currentUser);
            }
        });

        socket.on('chat-deleted', (data) => {
            if (activeChat && data.key === `${activeChat.dId}_${activeChat.pEmail}`) {
                setMessages([]);
                setActiveChat(null);
                setSearchParams({});
            }
            // Sync local storage fallback
            const chats = JSON.parse(localStorage.getItem('tabibi_chats') || '{}');
            delete chats[data.key];
            localStorage.setItem('tabibi_chats', JSON.stringify(chats));
            loadContacts(currentUser);
        });

        const handleStorageChange = (e) => {
            if (e.key === 'tabibi_chats') {
                if (currentUser) {
                    loadContacts(currentUser);
                }
                if (activeChat) {
                    const msgs = TabibiAPI.getChatMessages(activeChat.dId, activeChat.pEmail);
                    setMessages(prev => {
                        const hasChanged = msgs.length !== prev.length || (msgs.length > 0 && msgs[msgs.length - 1].id !== prev[prev.length - 1]?.id);
                        return hasChanged ? msgs : prev;
                    });
                }
            }
        };
        window.addEventListener('storage', handleStorageChange);

        return () => {
            socket.disconnect();
            window.removeEventListener('storage', handleStorageChange);
        };
    }, [currentUser, activeChat]);

    // Filter contacts based on search
    const handleSearchChange = (e) => {
        const val = e.target.value;
        setSearchTerm(val);
        if (!val.trim()) {
            setContacts(allChats);
        } else {
            setContacts(allChats.filter(c => c.name.toLowerCase().includes(val.toLowerCase())));
        }
    };

    // Send Message (sync to backend)
    const handleSendMessage = async (e) => {
        if (e) e.preventDefault();
        if (!inputText.trim() || !activeChat || !currentUser) return;

        const val = inputText.trim();
        setInputText('');

        try {
            // Save on backend, which broadcasts via Socket.IO
            const res = await axios.post(`/api/chats/${activeChat.dId}_${activeChat.pEmail}`, {
                senderId: currentUser.email,
                senderRole: currentUser.role,
                text: val
            });
            
            // Save locally
            TabibiAPI.saveChatMessage(activeChat.dId, activeChat.pEmail, res.data);
            
            setMessages(prev => {
                const prevArr = Array.isArray(prev) ? prev : [];
                if (prevArr.some(m => (m._id || m.id) === (res.data._id || res.data.id))) return prevArr;
                return [...prevArr, res.data];
            });
        } catch (err) {
            console.warn("Failed to send message to server, saving locally:", err.message);
            // Local fallback
            const fallbackMsg = {
                senderId: currentUser.email,
                senderRole: currentUser.role,
                text: val
            };
            TabibiAPI.saveChatMessage(activeChat.dId, activeChat.pEmail, fallbackMsg);
            const msgs = TabibiAPI.getChatMessages(activeChat.dId, activeChat.pEmail);
            setMessages(msgs);
        }
        loadContacts(currentUser);
    };

    // Delete Message
    const handleDeleteMessage = async (messageId) => {
        if (!messageId) return;
        try {
            await axios.delete(`/api/chats/message/${messageId}`);
            setMessages(prev => {
                const prevArr = Array.isArray(prev) ? prev : [];
                return prevArr.filter(m => (m._id || m.id) !== messageId);
            });
            // Update local storage cache
            if (activeChat) {
                const chats = JSON.parse(localStorage.getItem('tabibi_chats') || '{}');
                const key = `${activeChat.dId}_${activeChat.pEmail}`;
                if (Array.isArray(chats[key])) {
                    chats[key] = chats[key].filter(m => (m._id || m.id) !== messageId);
                    localStorage.setItem('tabibi_chats', JSON.stringify(chats));
                }
            }
            loadContacts(currentUser);
        } catch (err) {
            console.error("Failed to delete message:", err.message);
        }
    };

    // Delete entire Chat Conversation
    const handleDeleteChat = async () => {
        if (!activeChat) return;
        const confirmDelete = window.confirm("Are you sure you want to delete this entire conversation? This action cannot be undone.");
        if (!confirmDelete) return;

        const key = `${activeChat.dId}_${activeChat.pEmail}`;
        try {
            await axios.delete(`/api/chats/${key}`);
            setMessages([]);
            setActiveChat(null);
            setSearchParams({});
            
            // Clear local storage cache
            const chats = JSON.parse(localStorage.getItem('tabibi_chats') || '{}');
            delete chats[key];
            localStorage.setItem('tabibi_chats', JSON.stringify(chats));
            
            loadContacts(currentUser);
        } catch (err) {
            console.error("Failed to delete conversation:", err.message);
        }
    };

    return (
        <div style={{
            background: "#f8fafc",
            height: "calc(100vh - 80px)",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column"
        }}>
            <style dangerouslySetInnerHTML={{ __html: `
                :root {
                    --sidebar-w: 320px;
                    --msg-sent: #2563eb;
                    --msg-received: #ffffff;
                    --border: #f1f5f9;
                }
                .app-wrapper { flex: 1; display: flex; overflow: hidden; height: 100%; }
                .chat-sidebar {
                    width: var(--sidebar-w); background: white; border-right: 1px solid var(--border);
                    display: flex; flex-direction: column; flex-shrink: 0;
                }
                .sidebar-header {
                    padding: 24px 20px; border-bottom: 1px solid var(--border);
                    display: flex; flex-direction: column; gap: 15px;
                }
                .sidebar-header .top { display: flex; justify-content: space-between; align-items: center; }
                .sidebar-header h3 { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; }
                .search-container { position: relative; }
                .search-bar { 
                    width: 100%; border: none; background: #f1f5f9; padding: 12px 14px 12px 35px; border-radius: 12px;
                    font-size: 14px; outline: none; transition: 0.2s;
                }
                .search-bar:focus { background: #e2e8f0; }
                .search-container i { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 14px; }
                .contact-list { flex: 1; overflow-y: auto; padding: 10px; }
                .contact-card {
                    padding: 14px; border-radius: 14px; display: flex; gap: 14px; align-items: center;
                    cursor: pointer; transition: 0.2s; margin-bottom: 4px; position: relative;
                }
                .contact-card:hover { background: #f8fafc; }
                .contact-card.active { background: #eff6ff; }
                .c-avatar { 
                    width: 50px; height: 50px; border-radius: 12px; background: #e2e8f0; overflow: hidden;
                    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
                }
                .c-avatar img { width: 100%; height: 100%; object-fit: cover; }
                .c-info { flex: 1; min-width: 0; }
                .c-info .name { display: block; font-weight: 600; color: #1e293b; font-size: 15px; margin-bottom: 2px; }
                .c-info .preview { display: block; font-size: 13px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .chat-main { flex: 1; display: flex; flex-direction: column; background: #fdfdfd; position: relative; height: 100%; }
                .chat-header {
                    height: 75px; background: white; border-bottom: 1px solid var(--border);
                    padding: 0 24px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
                    z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.02);
                }
                .active-user { display: flex; align-items: center; gap: 12px; }
                .active-user .name { font-weight: 700; font-size: 18px; color: #1e293b; }
                .status-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; font-weight: 500; }
                .dot { width: 8px; height: 8px; border-radius: 50%; background: #94a3b8; }
                .dot.online { background: #10b981; box-shadow: 0 0 8px rgba(16, 185, 129, 0.4); }
                .chat-messages {
                    flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 18px;
                    background: #ffffff;
                }
                .msg-row { display: flex; width: 100%; }
                .msg-row.sent { justify-content: flex-end; }
                .msg-row.received { justify-content: flex-start; }
                .bubble {
                    max-width: 70%; min-width: 90px; padding: 12px 16px; border-radius: 20px;
                    display: flex; flex-direction: column; gap: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.03);
                    position: relative;
                }
                .sent .bubble { background: #2563eb; color: white; border-bottom-right-radius: 4px; }
                .received .bubble { background: #f1f5f9; color: #1e293b; border-bottom-left-radius: 4px; }
                .msg-text { font-size: 15px; line-height: 1.5; word-wrap: break-word; }
                .msg-footer { 
                    display: flex; align-items: center; justify-content: flex-end; gap: 4px;
                    font-size: 10px; opacity: 0.8;
                }
                .chat-input-area {
                    padding: 20px 30px 40px; background: white; border-top: 1px solid var(--border);
                }
                .input-box {
                    max-width: 800px; margin: 0 auto; background: #f8fafc; border: 1.5px solid #eef2f6;
                    border-radius: 16px; padding: 8px 16px; display: flex; align-items: center; gap: 12px;
                }
                .input-box input { flex: 1; border: none; background: transparent; padding: 10px; outline: none; font-size: 16px; }
                .send-pill { 
                    width: 44px; height: 44px; background: #2563eb; color: white; border: none; border-radius: 14px;
                    cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 18px; transition: 0.2s;
                }
                .send-pill:hover { background: #1d4ed8; transform: scale(1.05); }
                .empty-view { flex: 1; display:flex; flex-direction: column; align-items: center; justify-content: center; color: #94a3b8; }
                .unread-badge {
                    position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
                    width: 8px; height: 8px; border-radius: 50%; background: #2563eb;
                }
                .btn-delete-chat {
                    background: none; border: none; color: #ef4444; cursor: pointer;
                    font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px;
                    padding: 8px 12px; border-radius: 8px; transition: 0.2s; outline: none;
                }
                .btn-delete-chat:hover { background: #fef2f2; }
                .bubble { position: relative; }
                .delete-msg-btn {
                    position: absolute; top: 50%; transform: translateY(-50%);
                    background: white; border: 1.5px solid #f1f5f9; color: #ef4444;
                    border-radius: 50%; width: 24px; height: 24px; display: none;
                    align-items: center; justify-content: center; font-size: 11px;
                    cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                    z-index: 5; outline: none; transition: 0.15s;
                }
                .delete-msg-btn::after {
                    content: '';
                    position: absolute;
                    top: -10px;
                    bottom: -10px;
                }
                .sent .delete-msg-btn::after {
                    left: 100%;
                    width: 15px;
                }
                .received .delete-msg-btn::after {
                    right: 100%;
                    width: 15px;
                }
                .delete-msg-btn:hover { background: #fef2f2; transform: translateY(-50%) scale(1.1); }
                .bubble:hover .delete-msg-btn { display: flex; }
                .sent .bubble .delete-msg-btn { left: -32px; }
                .received .bubble .delete-msg-btn { right: -32px; }
                @media (max-width: 900px) { .chat-sidebar { display: none; } }
            `}} />

            <div className="app-wrapper">
                <aside className="chat-sidebar">
                    <div className="sidebar-header">
                        <div className="top">
                            <h3>Messages</h3>
                            <i className="fas fa-edit" style={{ color: "#2563eb" }}></i>
                        </div>
                        <div className="search-container">
                            <i className="fas fa-search"></i>
                            <input 
                                type="text" 
                                className="search-bar" 
                                placeholder="Search for people..." 
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                        </div>
                    </div>
                    <div className="contact-list">
                        {!Array.isArray(contacts) || !contacts.length ? (
                            <div style={{ padding: "20px", textAlign: "center", color: "#94a3b8" }}>No records</div>
                        ) : contacts.map((c) => (
                            <div 
                                key={`${c.dId}_${c.pEmail}`} 
                                className={`contact-card ${String(activeChat?.dId) === String(c.dId) && activeChat?.pEmail === c.pEmail ? 'active' : ''}`}
                                onClick={() => {
                                    setActiveChat(c);
                                    setSearchParams({ doctorId: c.dId, patient: c.pEmail });
                                }}
                            >
                                <div 
                                    className="c-avatar"
                                    style={currentUser?.role === 'patient' ? { cursor: "pointer" } : {}}
                                    title={currentUser?.role === 'patient' ? "View doctor's profile" : ""}
                                    onClick={(e) => {
                                        if (currentUser?.role === 'patient') {
                                            e.stopPropagation();
                                            navigate(`/appointment?id=${c.dId}`);
                                        }
                                    }}
                                >
                                    <img src={c.img} alt={c.name} />
                                </div>
                                <div className="c-info">
                                    <span className="name">{c.name}</span>
                                    <span className="preview">{c.last}</span>
                                </div>
                                {c.unread && <span className="unread-badge"></span>}
                            </div>
                        ))}
                    </div>
                </aside>

                <main className="chat-main">
                    {!activeChat ? (
                        <div className="empty-view">
                            <i className="fas fa-comment-medical" style={{ fontSize: "60px", opacity: 0.2, marginBottom: "20px" }}></i>
                            <p>Select a contact to start consulting</p>
                        </div>
                    ) : (
                        <>
                            <div className="chat-header">
                                <div 
                                    className="active-user"
                                    style={currentUser?.role === 'patient' ? { cursor: "pointer" } : {}}
                                    title={currentUser?.role === 'patient' ? "View doctor's profile" : ""}
                                    onClick={() => {
                                        if (currentUser?.role === 'patient') {
                                            navigate(`/appointment?id=${activeChat.dId}`);
                                        }
                                    }}
                                >
                                    <div className="c-avatar" style={{ width: "40px", height: "40px" }}><img src={activeChat.img} alt={activeChat.name} /></div>
                                    <div>
                                        <div className="name">{activeChat.name}</div>
                                        {currentUser?.role === 'patient' && (
                                            <div className="status-badge">
                                                <div className={`dot ${activeChat.available ? 'online' : ''}`}></div> 
                                                {activeChat.available ? 'Active' : 'Offline'}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <button className="btn-delete-chat" onClick={handleDeleteChat} title="Delete Conversation">
                                    <i className="fas fa-trash-alt"></i> Delete Chat
                                </button>
                            </div>

                            <div className="chat-messages" ref={chatContainerRef}>
                                {Array.isArray(messages) && messages.map((m) => {
                                    const isSent = m.senderId === currentUser.email;
                                    const t = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    return (
                                        <div key={m._id || m.id} className={`msg-row ${isSent ? 'sent' : 'received'}`}>
                                            <div className="bubble">
                                                {isSent && (
                                                    <button 
                                                        className="delete-msg-btn" 
                                                        title="Delete message"
                                                        onClick={() => handleDeleteMessage(m._id || m.id)}
                                                    >
                                                        <i className="fas fa-trash"></i>
                                                    </button>
                                                )}
                                                <div className="msg-text">{m.text}</div>
                                                <div className="msg-footer">
                                                    {t} {isSent ? (
                                                        m.read ? <i className="fas fa-check-double" style={{ color: "#dbeafe" }}></i> : <i className="fas fa-check"></i>
                                                    ) : ''}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                            </div>

                            <div className="chat-input-area">
                                <form className="input-box" onSubmit={handleSendMessage}>
                                    <input 
                                        type="text" 
                                        placeholder="Message..." 
                                        value={inputText}
                                        onChange={e => setInputText(e.target.value)}
                                    />
                                    <button type="submit" className="send-pill">
                                        <i className="fas fa-paper-plane"></i>
                                    </button>
                                </form>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
};

export default Messages;
