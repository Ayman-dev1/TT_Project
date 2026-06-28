'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const ChatMessage = require('../models/ChatMessage');
const ChatbotMessage = require('../models/ChatbotMessage');
const { protect, authorize } = require('../middleware/authMiddleware');
const { recordAdminAction } = require('../security/auditLog');

const optionalProtect = async (req, res, next) => {
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        return protect(req, res, next);
    }
    next();
};

const parseChatKey = (key) => {
    const parts = String(key || '').split('_');
    if (parts.length < 2) return null;
    return { doctorId: parts[0], patientEmail: parts.slice(1).join('_') };
};

const isChatParticipant = async (req, key) => {
    if (!req.user) return false;
    const parsed = parseChatKey(key);
    if (!parsed) return false;

    if (req.user.role === 'admin') return true;
    if (req.user.role === 'patient') {
        return parsed.patientEmail.toLowerCase() === String(req.user.email || '').toLowerCase();
    }
    if (req.user.role === 'doctor') {
        const doctor = await Doctor.findOne({ userId: req.user._id });
        return doctor && String(doctor._id) === String(parsed.doctorId);
    }
    return false;
};

const requireChatParticipant = async (req, res, next) => {
    try {
        if (await isChatParticipant(req, req.params.key)) return next();
        return res.status(403).json({ error: 'Not authorized to access this chat' });
    } catch (err) {
        return next(err);
    }
};

// ── Doctor Recommendation Proxy ──────────────────────────────────────────────
router.post('/recommend-doc', protect, async (req, res) => {
    const { symptoms } = req.body;
    if (!symptoms) {
        return res.status(400).json({ error: 'Symptoms field is required' });
    }
    try {
        const response = await fetch('http://127.0.0.1:8000/api/recommend-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symptoms })
        });
        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(503).json({ error: 'Django AI service is offline' });
    }
});

// ── Chatbot message persistence endpoints ────────────────────────────────────
router.get('/chatbot/messages', protect, async (req, res) => {
    const email = req.user.email;
    try {
        const messages = await ChatbotMessage.find({ userEmail: email }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/chatbot/messages', protect, async (req, res) => {
    const { role, text, isEmergency, isOfflineFallback, isAr, doctors, specialty } = req.body;
    if (!role || !text || !['user', 'ai'].includes(role)) {
        return res.status(400).json({ error: 'role must be user or ai, and text is required' });
    }
    try {
        const newMsg = new ChatbotMessage({
            userEmail: req.user.email,
            role,
            text,
            isEmergency: !!isEmergency,
            isOfflineFallback: !!isOfflineFallback,
            isAr: !!isAr,
            doctors: Array.isArray(doctors) ? doctors : [],
            specialty: specialty || ''
        });
        await newMsg.save();
        res.status(201).json(newMsg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/chatbot/messages', protect, async (req, res) => {
    const email = req.user.email;
    try {
        await ChatbotMessage.deleteMany({ userEmail: email });
        res.json({ success: true, message: 'Chatbot history cleared successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Activity Logs ────────────────────────────────────────────────────────────
const ACTIVITY_LOGS_FILE = path.join(__dirname, '..', 'activity_logs.json');

router.get('/activity-logs', protect, authorize('admin'), (req, res) => {
    try {
        if (!fs.existsSync(ACTIVITY_LOGS_FILE)) {
            fs.writeFileSync(ACTIVITY_LOGS_FILE, '[]', 'utf8');
        }
        const data = fs.readFileSync(ACTIVITY_LOGS_FILE, 'utf8');
        res.json(JSON.parse(data || '[]'));
    } catch (err) {
        res.json([]);
    }
});

router.post('/activity-logs', protect, authorize('admin'), (req, res) => {
    try {
        const { type, message } = req.body;
        if (!type || !message) {
            return res.status(400).json({ error: 'type and message required' });
        }
        if (!fs.existsSync(ACTIVITY_LOGS_FILE)) {
            fs.writeFileSync(ACTIVITY_LOGS_FILE, '[]', 'utf8');
        }
        const data = fs.readFileSync(ACTIVITY_LOGS_FILE, 'utf8');
        const logs = JSON.parse(data || '[]');
        const newLog = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            type,
            message,
            adminId: String(req.user._id),
            adminEmail: req.user.email
        };
        logs.unshift(newLog);
        fs.writeFileSync(ACTIVITY_LOGS_FILE, JSON.stringify(logs.slice(0, 100), null, 2), 'utf8');
        recordAdminAction(req, 'ACTIVITY_LOG_CREATE', { type }, { message });
        res.json({ success: true, log: newLog });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/activity-logs', protect, authorize('admin'), (req, res) => {
    try {
        fs.writeFileSync(ACTIVITY_LOGS_FILE, '[]', 'utf8');
        recordAdminAction(req, 'ACTIVITY_LOG_CLEAR');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Chat Migration ───────────────────────────────────────────────────────────
const CHAT_FILE = path.join(__dirname, '..', 'chats.json');

async function migrateChatsToDB() {
    try {
        if (fs.existsSync(CHAT_FILE)) {
            const data = fs.readFileSync(CHAT_FILE, 'utf8');
            const chats = JSON.parse(data || '{}');
            let count = 0;
            for (const key in chats) {
                const messages = chats[key] || [];
                for (const msg of messages) {
                    const exists = await ChatMessage.findOne({
                        chatKey: key,
                        senderId: msg.senderId,
                        text: msg.text,
                        timestamp: msg.timestamp
                    });
                    if (!exists) {
                        await ChatMessage.create({
                            chatKey: key,
                            senderId: msg.senderId,
                            senderRole: msg.senderRole,
                            text: msg.text,
                            read: msg.read === true,
                            timestamp: msg.timestamp || new Date()
                        });
                        count++;
                    }
                }
            }
            if (count > 0) {
                console.log(`[Migration] Migrated ${count} messages from chats.json to MongoDB successfully.`);
            }
            try {
                fs.renameSync(CHAT_FILE, CHAT_FILE + '.bak');
                console.log(`[Migration] Renamed chats.json to chats.json.bak`);
            } catch (e) {
                console.error(`[Migration] Failed to rename chats.json:`, e.message);
            }
        }
    } catch (err) {
        console.error('[Migration] Chat migration failed:', err.message);
    }
}

// Trigger migration on startup
migrateChatsToDB();

// ── Default Doctors ──────────────────────────────────────────────────────────
const BACKEND_DEFAULT_DOCTORS = [
    { id: "6a3aaae8584cd708d428b0c3", name: "Dr. Ahmed Mansour", specialty: "General physician", available: true, img: "/assets/images/M1.png", email: "ahmed@tabibi.com" },
    { id: "6a3aaae9584cd708d428b0c5", name: "Dr. Maryam El-Gohary", specialty: "Gynecologist", available: true, img: "/assets/images/F1.png", email: "maryam@tabibi.com" },
    { id: "6a3aaae9584cd708d428b0c7", name: "Dr. Aya Sami", specialty: "Dermatologist", available: false, img: "/assets/images/F2.png", email: "aya@tabibi.com" },
    { id: "6a3aaae9584cd708d428b0c9", name: "Dr. Khaled Shouky", specialty: "Neurologist", available: true, img: "/assets/images/M2.png", email: "khaled@tabibi.com" },
    { id: "6a3aaaea584cd708d428b0cb", name: "Dr. Youssef Nabil", specialty: "Pediatricians", available: true, img: "/assets/images/image 419.png", email: "youssef@tabibi.com" }
];

// ── Active Chat Contacts ─────────────────────────────────────────────────────
router.get('/chats-active-contacts', protect, async (req, res) => {
    try {
        const email = req.user.email;
        const role = req.user.role;

        const chatKeys = await ChatMessage.distinct('chatKey');
        const relevant = [];

        // Find doctorId if role is doctor
        let dIdStr = '';
        if (role === 'doctor') {
            const user = await User.findOne({ email });
            if (user) {
                const doctor = await Doctor.findOne({ userId: user._id });
                if (doctor) {
                    dIdStr = doctor._id.toString();
                }
            }
        }

        for (let key of chatKeys) {
            const parts = key.split('_');
            if (parts.length < 2) continue;
            const dId = parts[0];
            const pEmail = parts.slice(1).join('_');

            if (!dId || !pEmail) continue;

            const lastMsg = await ChatMessage.findOne({ chatKey: key }).sort({ timestamp: -1 });
            if (!lastMsg) continue;

            const unreadCount = await ChatMessage.countDocuments({
                chatKey: key,
                senderRole: { $ne: role },
                read: false
            });
            const unread = unreadCount > 0;

            if (role === 'doctor') {
                if (String(dId) === String(dIdStr)) {
                    const pat = await User.findOne({ email: pEmail });
                    const patName = pat ? pat.name : pEmail;
                    const patImg = pat && pat.image ? pat.image : '';

                    relevant.push({
                        dId: dId,
                        pEmail: pEmail,
                        name: patName,
                        img: patImg,
                        last: lastMsg?.text || 'Click to chat',
                        available: false,
                        unread: unread
                    });
                }
            } else if (role === 'patient') {
                if (pEmail.toLowerCase() === email.toLowerCase()) {
                    let docName = 'Doctor';
                    let docImg = '';
                    let docEmail = '';
                    let docAvail = true;

                    const defaultDoc = BACKEND_DEFAULT_DOCTORS.find(d => String(d.id) === String(dId));
                    if (defaultDoc) {
                        docName = defaultDoc.name;
                        docImg = defaultDoc.img;
                        docEmail = defaultDoc.email;
                        docAvail = defaultDoc.available;
                    }

                    if (mongoose.Types.ObjectId.isValid(dId)) {
                        const doctorObj = await Doctor.findById(dId).populate('userId', 'name email image');
                        if (doctorObj) {
                            docName = doctorObj.userId?.name || doctorObj.name || docName;
                            docImg = doctorObj.userId?.image || doctorObj.image || doctorObj.img || docImg;
                            docEmail = doctorObj.userId?.email || doctorObj.email || docEmail;
                            docAvail = doctorObj.available !== false;
                        }
                    }

                    relevant.push({
                        dId: dId,
                        pEmail: pEmail,
                        email: docEmail,
                        name: docName,
                        img: docImg,
                        last: lastMsg?.text || 'Click to chat',
                        available: docAvail,
                        unread: unread
                    });
                }
            }
        }
        res.json(relevant);
    } catch (err) {
        console.error('Error fetching active contacts:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── Client Error Logging ─────────────────────────────────────────────────────
router.post('/log-client-error', (req, res) => {
    const { message, stack, url } = req.body || {};
    const safeMessage = String(message || '').replace(/(Bearer\s+)[\w.-]+/gi, '$1[REDACTED]').slice(0, 500);
    const safeUrl = String(url || '').slice(0, 300);
    const safeStack = String(stack || '').replace(/(Bearer\s+)[\w.-]+/gi, '$1[REDACTED]').slice(0, 1000);
    const logEntry = `[${new Date().toISOString()}] URL: ${safeUrl}\nError: ${safeMessage}\nStack: ${safeStack}\n-----------------------------------\n`;
    try {
        fs.appendFileSync(path.join(__dirname, '..', 'client_errors.log'), logEntry, 'utf8');
    } catch (_) {}
    console.error('!!! CLIENT ERROR LOGGED !!!', message);
    res.json({ success: true });
});

// ── Chat Message CRUD ────────────────────────────────────────────────────────
router.get('/chats/:key', protect, requireChatParticipant, async (req, res) => {
    try {
        const { key } = req.params;
        const messages = await ChatMessage.find({ chatKey: key }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/chats/:key', protect, requireChatParticipant, async (req, res) => {
    try {
        const { key } = req.params;
        const { text } = req.body;
        if (!text) {
            return res.status(400).json({ error: 'text is required' });
        }
        
        const newMsg = await ChatMessage.create({
            chatKey: key,
            senderId: req.user.email,
            senderRole: req.user.role,
            text,
            read: false,
            timestamp: new Date()
        });
        
        // Broadcast via socket.io if online
        if (req.io) {
            req.io.emit('chat-message', { key, message: newMsg });
        }
        
        res.json(newMsg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/chats/:key/read', protect, requireChatParticipant, async (req, res) => {
    try {
        const { key } = req.params;
        await ChatMessage.updateMany(
            { chatKey: key, senderRole: { $ne: req.user.role } },
            { $set: { read: true } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a single message
router.delete('/chats/message/:messageId', protect, async (req, res) => {
    try {
        const { messageId } = req.params;
        const msg = await ChatMessage.findById(messageId);
        if (!msg) {
            return res.status(404).json({ error: 'Message not found' });
        }
        const key = msg.chatKey;
        if (!(await isChatParticipant(req, key))) {
            return res.status(403).json({ error: 'Not authorized to delete this message' });
        }
        await ChatMessage.findByIdAndDelete(messageId);

        // Broadcast deletion
        if (req.io) {
            req.io.emit('chat-message-deleted', { key, messageId });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete an entire chat conversation
router.delete('/chats/:key', protect, requireChatParticipant, async (req, res) => {
    try {
        const { key } = req.params;
        await ChatMessage.deleteMany({ chatKey: key });

        // Broadcast deletion
        if (req.io) {
            req.io.emit('chat-deleted', { key });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
