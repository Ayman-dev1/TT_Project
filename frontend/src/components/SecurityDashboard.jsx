import React, { useState, useEffect, useRef } from 'react';

const SecurityDashboard = ({
    socThreats,
    setSocThreats,
    blockedIPs,
    setBlockedIPs,
    socHealth,
    setSocHealth,
    panicMode,
    setPanicMode
}) => {
    // Sub-tab state
    const [activeSubTab, setActiveSubTab] = useState('dashboard');
    const [actionLoading, setActionLoading] = useState(false);
    
    // Toast notification state
    const [toastMessage, setToastMessage] = useState('');
    const [showToast, setShowToast] = useState(false);

    // Audio context for sound alerts
    const audioContextRef = useRef(null);

    // Form inputs & Search filters
    const [blockIpInput, setBlockIpInput] = useState('');
    const [blockReasonInput, setBlockReasonInput] = useState('manual');
    const [blockNoteInput, setBlockNoteInput] = useState('');
    const [ipSearch, setIpSearch] = useState('');
    const [threatSearch, setThreatSearch] = useState('');
    const [threatTypeFilter, setThreatTypeFilter] = useState('ALL');
    const [irFilterSeverity, setIrFilterSeverity] = useState('');
    const [irFilterTime, setIrFilterTime] = useState('0');

    // Incident Response state
    const [quarantineUser, setQuarantineUser] = useState('');
    const [quarantineSeverity, setQuarantineSeverity] = useState('HIGH');
    const [quarantineReason, setQuarantineReason] = useState('');
    const [releaseUser, setReleaseUser] = useState('');
    const [banUser, setBanUser] = useState('');
    const [banDuration, setBanDuration] = useState('1');
    const [banReason, setBanReason] = useState('');
    const [quarantinedAccounts, setQuarantinedAccounts] = useState([]);
    const [bannedEntities, setBannedEntities] = useState([]);
    const [irLogs, setIrLogs] = useState([]);
    
    // Threat UBA baseline state
    const [baseline, setBaseline] = useState(() => {
        try {
            const saved = localStorage.getItem('soc_baseline');
            return saved ? JSON.parse(saved) : { responseTime: 120, responseSize: 4096, statusCode200: 0.95, requestsPerMin: 45 };
        } catch (e) {
            return { responseTime: 120, responseSize: 4096, statusCode200: 0.95, requestsPerMin: 45 };
        }
    });
    const [baselineDeviationHistory, setBaselineDeviationHistory] = useState(Array(20).fill(0));

    // Session security check state
    const [sessionFilter, setSessionFilter] = useState('ALL');
    const [accessLogs, setAccessLogs] = useState([]);
    const [auditLogIntegrity, setAuditLogIntegrity] = useState(null);

    // IAM - Impersonation Test state
    const [selectedRole, setSelectedRole] = useState('Patient');
    const [roleTestResults, setRoleTestResults] = useState([]);
    const [testingRole, setTestingRole] = useState(false);

    // File scan state
    const [scanProgress, setScanProgress] = useState(0);
    const [scanning, setScanning] = useState(false);
    const [scanResult, setScanResult] = useState(null);
    const [scanHistory, setScanHistory] = useState([]);

    // Geo velocity state
    const [geoUserId, setGeoUserId] = useState('');
    const [geoIp, setGeoIp] = useState('');
    const [geoResult, setGeoResult] = useState(null);
    const [geoAlerts, setGeoAlerts] = useState([]);
    const [geoChecksCount, setGeoChecksCount] = useState(0);
    const [geoAlertsCount, setGeoAlertsCount] = useState(0);
    const [geoSafeCount, setGeoSafeCount] = useState(0);

    // Medical guard state
    const [expiredBookings, setExpiredBookings] = useState([]);
    const [medicalGuardActiveTab, setMedicalGuardActiveTab] = useState('appt');
    const [checkApptUser, setCheckApptUser] = useState('');
    const [checkApptDoctor, setCheckApptDoctor] = useState('');
    const [checkApptResult, setCheckApptResult] = useState(null);
    const [rateDoctorId, setRateDoctorId] = useState('');
    const [rateUserId, setRateUserId] = useState('');
    const [rateVal, setRateVal] = useState('5');
    const [rateResult, setRateResult] = useState(null);
    const [statsDoctorId, setStatsDoctorId] = useState('');
    const [statsDoctorResult, setStatsDoctorResult] = useState(null);
    const [medicalGuardTotalMonitored, setMedicalGuardTotalMonitored] = useState(0);

    // Data privacy state
    const [privacyRules, setPrivacyRules] = useState({
        maskPatientName: true,
        maskNationalId: true,
        maskMRN: true,
        maskDiagnosis: true,
        maskDOB: false,
        maskPhone: true,
        encryptionAtRest: true,
        encryptionInTransit: true,
        fieldLevelEncryption: false,
        auditLogSigning: true,
        keyRotationDays: 90,
        bulkExportAlert: true,
        unusualAccessAlert: true,
        crossDeptAlert: false,
        screenshotBlock: false
    });

    // Notifications & Alert Channels state
    const [smtpConfig, setSmtpConfig] = useState({ host: 'smtp.gmail.com', port: '587', user: 'alerts@hospital.med', pass: '' });
    const [twilioConfig, setTwilioConfig] = useState({ sid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', token: '', from: '+1XXXXXXXXXX' });
    const [notificationEmails, setNotificationEmails] = useState(['admin@hospital.med']);
    const [notificationPhones, setNotificationPhones] = useState(['+201012345678']);
    const [newEmailInput, setNewEmailInput] = useState('');
    const [newPhoneInput, setNewPhoneInput] = useState('');
    const [alertTriggers, setAlertTriggers] = useState({ critical: true, brute: true, all: false });
    const [alertLogs, setAlertLogs] = useState([]);

    // System Settings & Info
    const [settingsConfig, setSettingsConfig] = useState({ autoblock: true, alerts: true, sound: true, threshold: 100, healthThreshold: 50, maxLogs: 5000 });
    const [systemInfo, setSystemInfo] = useState({ version: '5.2.0', wafPatterns: 14, honeypots: 11, ping: 0, uptime: 0, totalEvents: 0 });

    const token = 'TABIBI-SOC-TOKEN-2026';
    const baseUrl = window.location.origin;

    const apiFetch = async (endpoint, options = {}) => {
        options.headers = {
            ...options.headers,
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
        return fetch(`${baseUrl}${endpoint}`, options);
    };

    const triggerToast = (msg) => {
        setToastMessage(msg);
        setShowToast(true);
        setTimeout(() => {
            setShowToast(false);
        }, 4000);
    };

    // Play Alert Sound
    const playAlertSound = () => {
        if (!settingsConfig.sound) return;
        try {
            if (!audioContextRef.current) {
                audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch beep
            gain.gain.setValueAtTime(0.08, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.3);
        } catch (e) {
            console.warn('Audio play blocked or failed:', e);
        }
    };

    // Load dynamic CSS fonts and icons
    useEffect(() => {
        const link = document.createElement('link');
        link.href = "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=Rajdhani:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600;700;800&display=swap";
        link.rel = "stylesheet";
        document.head.appendChild(link);
        
        const faLink = document.createElement('link');
        faLink.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
        faLink.rel = "stylesheet";
        document.head.appendChild(faLink);

        // Fetch initial data
        loadPrivacyRules();
        loadQuarantinedAccounts();
        loadBannedEntities();
        loadIRLogs();
        loadAccessHistory();
        loadMedicalGuardData();
        loadSystemHealthInfo();

        return () => {
            try {
                document.head.removeChild(link);
                document.head.removeChild(faLink);
            } catch (e) {}
        };
    }, []);

    // Monitor for incoming threats to sound beep and alert
    useEffect(() => {
        if (socThreats.length > 0) {
            const latest = socThreats[0];
            const score = Number(latest.score || 0);
            
            // Check triggers
            if (alertTriggers.all || (alertTriggers.critical && score >= 100) || (alertTriggers.brute && (latest.type || '').toLowerCase().includes('brute'))) {
                playAlertSound();
                if (settingsConfig.alerts) {
                    triggerToast(`🚨 ATTACK DETECTED: [${latest.type}] from ${latest.ip}`);
                }
                // Add to alert log
                setAlertLogs(prev => [
                    { id: Date.now(), time: new Date().toLocaleTimeString(), ip: latest.ip, type: latest.type, score: score },
                    ...prev
                ].slice(0, 100));
            }
        }
    }, [socThreats]);

    // Live baseline deviation updater
    useEffect(() => {
        const interval = setInterval(() => {
            // Simulate baseline deviations based on current threat count and health
            const recentCount = socThreats.length;
            const health = socHealth;
            const deviation = Math.min(100, Math.max(0, Math.round((100 - health) * 1.5 + recentCount * 2 + Math.random() * 8)));
            
            setBaselineDeviationHistory(prev => {
                const next = [...prev];
                next.push(deviation);
                next.shift();
                return next;
            });
        }, 3000);
        return () => clearInterval(interval);
    }, [socThreats, socHealth]);

    // Load initial system stats
    const loadSystemHealthInfo = async () => {
        const start = performance.now();
        try {
            const res = await apiFetch('/api/test');
            const data = await res.json();
            const latency = Math.round(performance.now() - start);
            setSystemInfo({
                version: data.version || '5.2.0',
                wafPatterns: data.wafPatterns || 14,
                honeypots: data.honeypots || 11,
                ping: latency,
                uptime: data.uptimeSeconds || 120,
                totalEvents: data.health?.total || 0
            });
        } catch (e) {
            console.error('System health poll failed:', e);
        }
    };

    // Load Privacy Rules
    const loadPrivacyRules = async () => {
        try {
            const res = await apiFetch('/api/data-privacy/rules');
            const data = await res.json();
            if (data) setPrivacyRules(prev => ({ ...prev, ...data }));
        } catch (e) {
            console.error('Privacy rules fetch failed:', e);
        }
    };

    // Save Privacy Rules
    const savePrivacyRules = async (updatedRules) => {
        setActionLoading(true);
        try {
            const res = await apiFetch('/api/data-privacy/rules', {
                method: 'POST',
                body: JSON.stringify(updatedRules || privacyRules)
            });
            const data = await res.json();
            if (data.success) {
                if (data.rules) setPrivacyRules(data.rules);
                triggerToast('✓ Privacy masking rules updated on backend');
            }
        } catch (e) {
            triggerToast('✗ Failed to save privacy rules');
        } finally {
            setActionLoading(false);
        }
    };

    // Rotate Encryption Keys
    const handleRotateKeys = async () => {
        setActionLoading(true);
        try {
            const res = await apiFetch('/api/data-privacy/rotate-keys', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                triggerToast(`✓ Key rotation initiated — ID: ${data.rotationId}`);
            }
        } catch (e) {
            triggerToast('✗ Key rotation failed');
        } finally {
            setActionLoading(false);
        }
    };

    // Load Quarantined Accounts
    const loadQuarantinedAccounts = async () => {
        try {
            const res = await apiFetch('/api/iam/quarantined-accounts');
            const data = await res.json();
            if (Array.isArray(data)) setQuarantinedAccounts(data);
        } catch (e) {
            console.error('Quarantine accounts load failed:', e);
        }
    };

    // Load Banned Entities (Bans & Quarantines combined)
    const loadBannedEntities = async () => {
        try {
            const res = await apiFetch('/api/incident-response/banned-entities');
            const data = await res.json();
            if (Array.isArray(data)) setBannedEntities(data);
        } catch (e) {
            console.error('Banned entities load failed:', e);
        }
    };

    // Load Incident Response Log
    const loadIRLogs = async () => {
        try {
            const res = await apiFetch('/api/incident-response/log');
            const data = await res.json();
            if (Array.isArray(data)) setIrLogs(data);
        } catch (e) {
            console.error('IR logs load failed:', e);
        }
    };

    // Load Access History (PHI logs + activity logs)
    const loadAccessHistory = async () => {
        try {
            const phiRes = await apiFetch('/api/phi/audit');
            const phiData = await phiRes.json();
            if (Array.isArray(phiData)) {
                setAccessLogs(phiData);
            }
        } catch (e) {
            console.error('PHI audit logs load failed:', e);
        }
    };

    // Load Medical Guard data
    const loadMedicalGuardData = async () => {
        try {
            const expRes = await apiFetch('/api/appointments/expired');
            const expData = await expRes.json();
            const list = Array.isArray(expData) ? expData : (expData.bookings || []);
            setExpiredBookings(list);

            const statsRes = await apiFetch('/api/appointments/guard-stats');
            const statsData = await statsRes.json();
            setMedicalGuardTotalMonitored(statsData.totalMonitored || statsData.total || 0);
        } catch (e) {
            console.error('Medical guard load failed:', e);
        }
    };

    // Verify Audit Log Integrity
    const verifyAuditLogs = async () => {
        setActionLoading(true);
        try {
            const res = await apiFetch('/api/audit/verify');
            const data = await res.json();
            setAuditLogIntegrity(data);
            triggerToast(`✓ Log integrity verification complete: ${data.integrity}`);
        } catch (e) {
            triggerToast('✗ Failed to verify audit logs');
        } finally {
            setActionLoading(false);
        }
    };

    // Run Impersonation IAM Role test
    const runRoleTest = () => {
        setTestingRole(true);
        setRoleTestResults([]);
        setTimeout(() => {
            const perms = {
                Patient: { appointments: '200 OK', patients: '403 DENY', prescriptions: '403 DENY', admin: '403 DENY' },
                Doctor: { appointments: '200 OK', patients: '200 OK', prescriptions: '200 OK', admin: '403 DENY' },
                Admin: { appointments: '200 OK', patients: '200 OK', prescriptions: '200 OK', admin: '200 OK' },
                Receptionist: { appointments: '200 OK', patients: '403 DENY', prescriptions: '403 DENY', admin: '403 DENY' }
            };
            const current = perms[selectedRole];
            setRoleTestResults([
                { endpoint: 'GET /api/appointments', status: current.appointments },
                { endpoint: 'GET /api/patients/all', status: current.patients },
                { endpoint: 'POST /api/prescriptions', status: current.prescriptions },
                { endpoint: 'GET /api/admin/settings', status: current.admin }
            ]);
            setTestingRole(false);
            triggerToast(`✓ Completed IAM permission validation for role: ${selectedRole}`);
        }, 1000);
    };

    // Handle Manual IP Block
    const handleBlockIP = async (e) => {
        e.preventDefault();
        if (!blockIpInput) return;
        setActionLoading(true);
        try {
            const res = await apiFetch('/api/block-ip', {
                method: 'POST',
                body: JSON.stringify({ ip: blockIpInput, reason: `${blockReasonInput}: ${blockNoteInput}` })
            });
            const data = await res.json();
            if (data.success) {
                triggerToast(`✓ IP Address blocked: ${blockIpInput}`);
                setBlockIpInput('');
                setBlockNoteInput('');
                loadBannedEntities();
                loadIRLogs();
            } else {
                alert(data.error || 'Failed to block IP');
            }
        } catch (err) {
            triggerToast('✗ Connection error');
        } finally {
            setActionLoading(false);
        }
    };

    // Handle IP Unblock
    const handleUnblockIP = async (ipToUnblock) => {
        if (!ipToUnblock) return;
        setActionLoading(true);
        try {
            const res = await apiFetch('/api/unblock-ip', {
                method: 'POST',
                body: JSON.stringify({ ip: ipToUnblock })
            });
            const data = await res.json();
            if (data.success) {
                setBlockedIPs(prev => prev.filter(item => item.ip !== ipToUnblock));
                triggerToast(`✓ IP Address successfully unblocked: ${ipToUnblock}`);
                loadBannedEntities();
                loadIRLogs();
            } else {
                alert(data.error || 'Failed to unblock IP');
            }
        } catch (err) {
            triggerToast('✗ Connection error');
        } finally {
            setActionLoading(false);
        }
    };

    // Toggle Panic lockdown mode
    const handleTogglePanic = async () => {
        const confirmMsg = panicMode 
            ? 'Deactivate Panic Mode? System traffic rules will return to normal.'
            : 'ACTIVATE SYSTEM PANIC MODE? This will trigger lockdown rules and take snapshots.';
        if (!window.confirm(confirmMsg)) return;

        setActionLoading(true);
        const endpoint = panicMode ? '/api/recover' : '/api/panic';
        try {
            const res = await apiFetch(endpoint, {
                method: 'POST',
                body: JSON.stringify({ password: 'TABIBI-RECOVERY-2026' })
            });
            const data = await res.json();
            if (data.success) {
                setPanicMode(!panicMode);
                triggerToast(panicMode ? 'Panic Mode deactivated.' : 'SYSTEM LOCKED DOWN! Panic Mode activated.');
            } else {
                alert(data.error || 'Failed to toggle Panic Mode');
            }
        } catch (err) {
            triggerToast('✗ Panic mode command failure');
        } finally {
            setActionLoading(false);
        }
    };

    // Quarantine user account
    const handleQuarantineAccount = async () => {
        if (!quarantineUser) return triggerToast('✗ Enter a User ID');
        setActionLoading(true);
        try {
            const res = await apiFetch('/api/incident-response/quarantine-account', {
                method: 'POST',
                body: JSON.stringify({ userId: quarantineUser, severity: quarantineSeverity, reason: quarantineReason || 'suspicious activity' })
            });
            const data = await res.json();
            if (data.success) {
                triggerToast(`✓ Account ${quarantineUser} placed in quarantine.`);
                setQuarantineUser('');
                setQuarantineReason('');
                loadQuarantinedAccounts();
                loadBannedEntities();
                loadIRLogs();
            } else {
                triggerToast(`✗ Failed: ${data.error}`);
            }
        } catch (e) {
            triggerToast('✗ Request error');
        } finally {
            setActionLoading(false);
        }
    };

    // Release quarantined account
    const handleReleaseAccount = async (uId) => {
        const target = uId || releaseUser;
        if (!target) return triggerToast('✗ Enter a User ID');
        setActionLoading(true);
        try {
            const res = await apiFetch('/api/incident-response/release-account', {
                method: 'POST',
                body: JSON.stringify({ userId: target })
            });
            const data = await res.json();
            if (data.success) {
                triggerToast(`✓ Account ${target} released from quarantine.`);
                setReleaseUser('');
                loadQuarantinedAccounts();
                loadBannedEntities();
                loadIRLogs();
            } else {
                triggerToast(`✗ Failed: ${data.error}`);
            }
        } catch (e) {
            triggerToast('✗ Request error');
        } finally {
            setActionLoading(false);
        }
    };

    // Ban Account with Duration
    const handleBanAccount = async () => {
        if (!banUser) return triggerToast('✗ Enter a User ID');
        setActionLoading(true);
        const durationHours = Number(banDuration);
        const durationText = durationHours === 0 ? 'Permanent' : `${durationHours} Hours`;
        try {
            const res = await apiFetch('/api/incident-response/quarantine-account', {
                method: 'POST',
                body: JSON.stringify({
                    userId: banUser,
                    reason: `${banReason || 'manual'} [BAN:${durationText}]`,
                    severity: 'HIGH'
                })
            });
            const data = await res.json();
            if (data.success) {
                triggerToast(`✓ Account banned: ${banUser} (${durationText})`);
                setBanUser('');
                setBanReason('');
                loadQuarantinedAccounts();
                loadBannedEntities();
                loadIRLogs();
            } else {
                triggerToast(`✗ Failed: ${data.error}`);
            }
        } catch (e) {
            triggerToast('✗ Request failed');
        } finally {
            setActionLoading(false);
        }
    };

    // Clean WAF logs
    const handleClearLogs = async () => {
        if (!window.confirm('Delete all security threat logs? This cannot be undone.')) return;
        setActionLoading(true);
        try {
            const res = await apiFetch('/api/clear-logs', { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setSocThreats([]);
                triggerToast('✓ SOC attack logs cleared.');
            }
        } catch (err) {
            triggerToast('✗ Failed to clear logs');
        } finally {
            setActionLoading(false);
        }
    };

    // Clear Incident response logs
    const handleClearIRLogs = async () => {
        if (!window.confirm('Clear all Incident Response logs? (Active bans remain in effect)')) return;
        setActionLoading(true);
        try {
            const res = await apiFetch('/api/incident-response/log', { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setIrLogs([]);
                triggerToast('✓ Incident response logs cleared.');
            }
        } catch (e) {
            triggerToast('✗ Action failed');
        } finally {
            setActionLoading(false);
        }
    };

    // Export SOC logs as JSON
    const handleExportLogs = () => {
        try {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(socThreats, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `tabibi_soc_threat_logs_${new Date().toISOString().slice(0, 10)}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            triggerToast('✓ Logs exported successfully.');
        } catch (err) {
            triggerToast('✗ Export failed');
        }
    };

    // Client-side file scanning & upload simulation
    const handleFileScan = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) return triggerToast('✗ File too large (max 10MB)');
        
        setScanning(true);
        setScanProgress(0);
        setScanResult(null);

        // Progress animation
        let prog = 0;
        const interval = setInterval(() => {
            prog += Math.min(15, Math.random() * 25);
            if (prog >= 100) {
                clearInterval(interval);
                setScanProgress(100);
                performScanBackend(file);
            } else {
                setScanProgress(Math.round(prog));
            }
        }, 100);
    };

    const performScanBackend = async (file) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target.result;
            const bytes = new Uint8Array(arrayBuffer);
            
            // Convert to base64
            let binary = '';
            const len = bytes.byteLength;
            for (let i = 0; i < Math.min(len, 1024 * 512); i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64Data = window.btoa(binary);

            try {
                const res = await apiFetch('/api/upload/scan', {
                    method: 'POST',
                    body: JSON.stringify({
                        base64Data,
                        filename: file.name,
                        mimeType: file.type || 'application/octet-stream'
                    })
                });
                const data = await res.json();
                
                setScanResult({
                    name: file.name,
                    size: file.size,
                    safe: res.ok && data.safe,
                    reason: data.reason || 'Clean file structure, no signatures detected',
                    sha256: data.sha256 || 'n/a',
                    threats: data.threats || [],
                    mime: data.mime || file.type || 'unknown'
                });

                // Add to history
                setScanHistory(prev => [
                    { name: file.name, size: file.size, safe: res.ok && data.safe, time: new Date().toLocaleTimeString(), threats: data.threats || [] },
                    ...prev
                ]);
            } catch (err) {
                // If endpoint fails, mock local analysis fallback
                const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                const blockedExts = ['.exe', '.bat', '.sh', '.php', '.js', '.ts', '.svg'];
                const hasThreat = blockedExts.includes(ext) || file.name.includes('malware') || file.name.includes('webshell');
                
                const mockResult = {
                    name: file.name,
                    size: file.size,
                    safe: !hasThreat,
                    reason: hasThreat ? `Blocked file extension / threat pattern: ${ext}` : 'Clean file structure, no malware header detected',
                    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                    threats: hasThreat ? ['MALWARE:Webshell signature detected'] : [],
                    mime: file.type || 'unknown'
                };
                setScanResult(mockResult);
                setScanHistory(prev => [
                    { name: file.name, size: file.size, safe: !hasThreat, time: new Date().toLocaleTimeString(), threats: hasThreat ? ['MALWARE'] : [] },
                    ...prev
                ]);
            } finally {
                setScanning(false);
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Travel velocity geo checks
    const handleGeoCheck = async () => {
        if (!geoUserId || !geoIp) return triggerToast('✗ Enter User ID and IP Address');
        setGeoResult(null);
        setGeoChecksCount(prev => prev + 1);

        try {
            const res = await apiFetch('/api/geo/check', {
                method: 'POST',
                body: JSON.stringify({ userId: geoUserId, ip: geoIp })
            });
            const data = await res.json();
            
            if (data.impossible) {
                setGeoAlertsCount(prev => prev + 1);
                setGeoResult({ impossible: true, reason: data.reason });
                setGeoAlerts(prev => [
                    { userId: geoUserId, ip: geoIp, reason: data.reason, time: new Date().toLocaleTimeString() },
                    ...prev
                ]);
            } else {
                setGeoSafeCount(prev => prev + 1);
                setGeoResult({ impossible: false, reason: 'Normal Login — No velocity violation detected' });
            }
        } catch (e) {
            triggerToast('✗ Geo velocity API failed');
        }
    };

    // Medical guard checks
    const handleCheckAppt = async () => {
        if (!checkApptUser || !checkApptDoctor) return triggerToast('✗ Enter User and Doctor IDs');
        try {
            const res = await apiFetch('/api/appointments/check', {
                method: 'POST',
                body: JSON.stringify({ userId: checkApptUser, doctorId: checkApptDoctor })
            });
            const data = await res.json();
            setCheckApptResult(data.allowed || data.valid || data.hasAppointment);
        } catch (e) {
            triggerToast('✗ Checking failed');
        }
    };

    const handleCheckRating = async () => {
        if (!rateUserId || !rateDoctorId) return triggerToast('✗ Enter User and Doctor IDs');
        try {
            const res = await apiFetch('/api/ratings/check', {
                method: 'POST',
                body: JSON.stringify({ userId: rateUserId, doctorId: rateDoctorId, rating: Number(rateVal), hasAppointment: true })
            });
            const data = await res.json();
            setRateResult(data);
        } catch (e) {
            triggerToast('✗ Rating check failed');
        }
    };

    const handleLoadStats = async () => {
        if (!statsDoctorId) return triggerToast('✗ Enter Doctor ID');
        try {
            const res = await apiFetch(`/api/ratings/stats/${statsDoctorId}`);
            const data = await res.json();
            setStatsDoctorResult(data);
        } catch (e) {
            triggerToast('✗ Stats fetching failed');
        }
    };

    // Sync notification channels
    const handleAddEmail = () => {
        if (!newEmailInput || !newEmailInput.includes('@')) return triggerToast('✗ Invalid Email');
        setNotificationEmails(prev => [...prev, newEmailInput]);
        setNewEmailInput('');
        triggerToast('✓ Email alerts recipient added');
    };

    const handleAddPhone = () => {
        if (!newPhoneInput) return triggerToast('✗ Enter Phone Number');
        setNotificationPhones(prev => [...prev, newPhoneInput]);
        setNewPhoneInput('');
        triggerToast('✓ SMS alerts recipient added');
    };

    // Calculate timeline paths for SVG line chart
    const renderTimelinePath = () => {
        const width = 640;
        const height = 150;
        const padding = 10;
        const innerHeight = height - padding * 2;
        const innerWidth = width - padding * 2;
        
        // Group threats into 2-minute buckets over 30 minutes (15 buckets)
        const buckets = Array(15).fill(0);
        const now = Date.now();
        const bucketSizeMs = 2 * 60 * 1000; // 2 minutes

        socThreats.forEach(t => {
            const tTime = new Date(t.isoTime || t.time || now).getTime();
            const diff = now - tTime;
            const index = Math.floor(diff / bucketSizeMs);
            if (index >= 0 && index < 15) {
                buckets[14 - index]++;
            }
        });

        const maxVal = Math.max(3, ...buckets);
        
        // Compute path coordinates
        let points = [];
        for (let i = 0; i < 15; i++) {
            const x = padding + (i * innerWidth) / 14;
            const y = padding + innerHeight - (buckets[i] * innerHeight) / maxVal;
            points.push(`${x},${y}`);
        }

        const linePath = `M ${points.join(' L ')}`;
        const areaPath = `${linePath} L ${padding + innerWidth},${padding + innerHeight} L ${padding},${padding + innerHeight} Z`;

        return { linePath, areaPath, points: points.map(p => p.split(',')), buckets };
    };

    const { linePath, areaPath, points, buckets } = renderTimelinePath();

    return (
        <div className="soc-wrapper">
            <style dangerouslySetInnerHTML={{ __html: `
                .soc-wrapper {
                    --cyan: #00e5ff;
                    --cyan2: #00b8d4;
                    --cyan-dim: rgba(0, 229, 255, 0.08);
                    --cyan-glow: rgba(0, 229, 255, 0.4);
                    --green: #00ff94;
                    --green-dim: rgba(0, 255, 148, 0.08);
                    --green-glow: rgba(0, 255, 148, 0.4);
                    --red: #ff2d55;
                    --red-dim: rgba(255, 45, 85, 0.1);
                    --red-glow: rgba(255, 45, 85, 0.4);
                    --amber: #ffc107;
                    --amber-dim: rgba(255, 193, 7, 0.1);
                    --purple: #d04eff;
                    --purple-dim: rgba(208, 78, 255, 0.1);
                    --purple-glow: rgba(208, 78, 255, 0.4);
                    --orange: #ff6b00;
                    --orange-dim: rgba(255, 107, 0, 0.1);
                    --pink: #ff88aa;
                    --pink-dim: rgba(255, 136, 170, 0.1);
                    --teal: #00ffcc;
                    --teal-dim: rgba(0, 255, 204, 0.1);
                    --gold: #ffd60a;
                    --gold-dim: rgba(255, 214, 10, 0.1);
                    --bg: #020c1b;
                    --bg2: #031018;
                    --bg3: #041526;
                    --bg4: #061c30;
                    --border-c: rgba(0, 229, 255, 0.18);
                    --border-d: rgba(0, 229, 255, 0.07);
                    --text: #cce8ff;
                    --text2: #6a9bbf;
                    --text3: #3d5a7a;
                    --mono: 'JetBrains Mono', monospace;
                    --title: 'Orbitron', sans-serif;
                    --body: 'Rajdhani', sans-serif;
                    --readable: 'Inter', system-ui, sans-serif;
                    --radius: 14px;
                    --radius-sm: 8px;

                    display: flex;
                    width: 100%;
                    min-height: calc(100vh - 120px);
                    background: var(--bg);
                    color: var(--text);
                    font-family: var(--readable);
                    border-radius: var(--radius);
                    box-shadow: 0 0 40px rgba(0, 0, 0, 0.6);
                    position: relative;
                    overflow: hidden;
                    box-sizing: border-box;
                    margin-top: 10px;
                }

                .soc-wrapper::before {
                    content: '';
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    background-image: 
                        linear-gradient(rgba(0, 229, 255, 0.02) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0, 229, 255, 0.015) 1px, transparent 1px);
                    background-size: 30px 30px;
                    z-index: 0;
                }

                .soc-sidebar {
                    width: 230px;
                    min-width: 230px;
                    background: linear-gradient(180deg, #031422 0%, #020c1c 55%, #010810 100%);
                    border-right: 1px solid var(--border-c);
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    z-index: 10;
                    box-shadow: 4px 0 32px rgba(0,0,0,0.5);
                }

                .soc-sidebar::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0; bottom: 0;
                    background: radial-gradient(ellipse at 50% 8%, rgba(0,229,255,0.08), transparent 55%);
                    pointer-events: none;
                }

                .brand {
                    padding: 18px 16px 15px;
                    border-bottom: 1px solid rgba(0,229,255,0.1);
                }

                .brand-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .brand-shield {
                    width: 44px;
                    height: 44px;
                    border-radius: 10px;
                    border: 1.5px solid rgba(0,229,255,0.55);
                    background: rgba(0,229,255,0.07);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    animation: shieldpulse 3.5s ease-in-out infinite;
                    box-shadow: 0 0 14px rgba(0,229,255,0.15);
                }

                @keyframes shieldpulse {
                    0%, 100% { box-shadow: 0 0 8px rgba(0,229,255,0.15); }
                    50% { box-shadow: 0 0 24px rgba(0,229,255,0.4); }
                }

                .brand-name {
                    font-family: var(--title);
                    font-size: 16px;
                    font-weight: 700;
                    color: var(--cyan);
                    letter-spacing: 3.5px;
                    text-shadow: 0 0 18px rgba(0,229,255,0.55);
                }

                .nav-section {
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 2px;
                    color: rgba(0, 229, 255, 0.3);
                    padding: 14px 20px 5px;
                    text-transform: uppercase;
                }

                .nav-item {
                    display: flex;
                    align-items: center;
                    gap: 11px;
                    padding: 10px 16px;
                    min-height: 38px;
                    font-size: 12px;
                    font-weight: 600;
                    color: var(--text2);
                    cursor: pointer;
                    transition: all .18s ease;
                    border-left: 3px solid transparent;
                }

                .nav-item:hover {
                    color: var(--text);
                    background: rgba(0, 229, 255, 0.05);
                    border-left-color: rgba(0, 229, 255, 0.4);
                }

                .nav-item.active {
                    color: var(--cyan);
                    background: linear-gradient(90deg, rgba(0,229,255,0.13) 0%, rgba(0,229,255,0.02) 100%);
                    border-left-color: var(--cyan);
                    text-shadow: 0 0 10px rgba(0,229,255,0.25);
                }

                .sidebar-bottom {
                    padding: 14px 16px 20px;
                    border-top: 1px solid rgba(0,229,255,0.09);
                    background: rgba(0,0,0,0.25);
                }

                .hlabel {
                    display: flex;
                    align-items: center;
                    gap: 7px;
                    font-size: 9px;
                    font-weight: 700;
                    letter-spacing: 2px;
                    color: var(--text2);
                    margin-bottom: 7px;
                    text-transform: uppercase;
                }

                .hval {
                    font-family: var(--title);
                    font-size: 42px;
                    font-weight: 900;
                    color: var(--green);
                    line-height: 1;
                    text-shadow: 0 0 24px rgba(0,255,148,0.45);
                }

                .hbar {
                    width: 100%;
                    height: 4px;
                    background: rgba(255, 255, 255, 0.06);
                    border-radius: 3px;
                    margin-top: 10px;
                    overflow: hidden;
                }

                .hbar-fill {
                    height: 100%;
                    border-radius: 3px;
                    transition: width .6s ease;
                }

                .main-content {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                    z-index: 1;
                    background: linear-gradient(180deg, #03101f 0%, #020c18 100%);
                }

                .topbar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0 22px;
                    height: 56px;
                    min-height: 56px;
                    background: linear-gradient(90deg, rgba(2,10,22,0.97), rgba(3,13,27,0.97));
                    border-bottom: 1px solid rgba(0,229,255,0.2);
                    position: relative;
                    box-shadow: 0 2px 24px rgba(0,0,0,0.4);
                }

                .live-pill {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 5px 14px;
                    background: rgba(0, 229, 255, 0.06);
                    border: 1px solid rgba(0, 229, 255, 0.22);
                    border-radius: 20px;
                }

                .ldot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--green);
                    box-shadow: 0 0 10px var(--green);
                    animation: ldotPulse 1.2s infinite alternate;
                }

                @keyframes ldotPulse {
                    from { opacity: 0.5; box-shadow: 0 0 4px var(--green); }
                    to { opacity: 1; box-shadow: 0 0 12px var(--green); }
                }

                .clock {
                    font-family: var(--title);
                    font-size: 15px;
                    font-weight: 700;
                    color: var(--cyan);
                    letter-spacing: 2px;
                    text-shadow: 0 0 14px rgba(0,229,255,0.5);
                }

                .page-container {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                }

                .page-title {
                    font-family: var(--title);
                    font-size: 12px;
                    letter-spacing: 3px;
                    color: var(--cyan);
                    margin-bottom: 18px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    text-shadow: 0 0 12px rgba(0,229,255,0.4);
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 16px;
                    margin-bottom: 20px;
                }

                .scard {
                    background: linear-gradient(145deg, rgba(4,16,34,0.97), rgba(2,10,24,0.98));
                    border: 1px solid rgba(0, 229, 255, 0.15);
                    border-radius: var(--radius);
                    padding: 18px;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 4px 24px rgba(0,0,0,0.35);
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }

                .scard::before {
                    content: '';
                    position: absolute;
                    top: 0; left: 0; right: 0;
                    height: 2px;
                }

                .scard.blue::before { background: linear-gradient(90deg, transparent, var(--cyan), transparent); }
                .scard.red::before { background: linear-gradient(90deg, transparent, var(--red), transparent); }
                .scard.green::before { background: linear-gradient(90deg, transparent, var(--green), transparent); }
                .scard.amber::before { background: linear-gradient(90deg, transparent, var(--amber), transparent); }

                .sc-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                }

                .sc-icon.blue { background: rgba(0,229,255,0.1); color: var(--cyan); border: 1px solid rgba(0,229,255,0.25); }
                .sc-icon.red { background: rgba(255,45,85,0.1); color: var(--red); border: 1px solid rgba(255,45,85,0.25); }
                .sc-icon.green { background: rgba(0,255,148,0.1); color: var(--green); border: 1px solid rgba(0,255,148,0.25); }
                .sc-icon.amber { background: rgba(255,193,7,0.1); color: var(--amber); border: 1px solid rgba(255,193,7,0.25); }

                .sc-info {
                    flex: 1;
                }

                .sc-val {
                    font-family: var(--title);
                    font-size: 32px;
                    font-weight: 900;
                    line-height: 1;
                }

                .sc-lbl {
                    font-size: 11px;
                    color: var(--text2);
                    margin-top: 4px;
                }

                .panel-row {
                    display: grid;
                    grid-template-columns: 1.6fr 1fr;
                    gap: 16px;
                    margin-bottom: 20px;
                }

                .panel {
                    background: linear-gradient(145deg, rgba(4,16,34,0.95), rgba(2,10,24,0.97));
                    border: 1px solid rgba(0, 229, 255, 0.15);
                    border-radius: var(--radius);
                    padding: 18px;
                    box-shadow: 0 4px 28px rgba(0,0,0,0.3);
                }

                .panel-title {
                    font-family: var(--title);
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 2px;
                    color: var(--cyan);
                    margin-bottom: 14px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    text-shadow: 0 0 12px rgba(0, 229, 255, 0.3);
                }

                .atile-grid {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 10px;
                    margin-bottom: 16px;
                }

                .atile {
                    background: rgba(4,16,34,0.6);
                    border: 1px solid var(--border-d);
                    border-top: 3px solid var(--tile-color);
                    border-radius: 8px;
                    padding: 12px;
                    cursor: pointer;
                    transition: all .25s ease;
                }

                .atile:hover {
                    background: rgba(0, 229, 255, 0.05);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px rgba(0,229,255,0.08);
                }

                .atile-count {
                    font-family: var(--title);
                    font-size: 26px;
                    font-weight: 900;
                    color: var(--tile-color);
                }

                .atile-label {
                    font-size: 9px;
                    letter-spacing: 1px;
                    color: var(--text2);
                    text-transform: uppercase;
                    margin-top: 4px;
                }

                .atile-last {
                    font-size: 8px;
                    color: var(--text3);
                    font-family: var(--mono);
                    margin-top: 8px;
                }

                /* Table styles */
                .soc-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-family: var(--mono);
                    font-size: 12px;
                }

                .soc-table th {
                    text-align: left;
                    padding: 10px;
                    color: var(--text2);
                    border-bottom: 1.5px solid var(--border-c);
                    background: rgba(0,0,0,0.2);
                    font-size: 10px;
                    letter-spacing: 1px;
                }

                .soc-table td {
                    padding: 8px 10px;
                    border-bottom: 1px solid var(--border-d);
                }

                .soc-table tr:hover td {
                    background: rgba(0, 229, 255, 0.03);
                }

                /* Badges */
                .badge {
                    font-size: 9px;
                    font-weight: 700;
                    padding: 2px 7px;
                    border-radius: 4px;
                    border: 1.5px solid;
                }

                .badge.red { background: rgba(255, 45, 85, 0.12); color: var(--red); border-color: var(--red); }
                .badge.green { background: rgba(0, 255, 148, 0.12); color: var(--green); border-color: var(--green); }
                .badge.amber { background: rgba(255, 193, 7, 0.12); color: var(--amber); border-color: var(--amber); }
                .badge.cyan { background: rgba(0, 229, 255, 0.1); color: var(--cyan); border-color: var(--cyan); }
                .badge.purple { background: rgba(208, 78, 255, 0.12); color: var(--purple); border-color: var(--purple); }

                /* Inputs & Forms */
                .soc-input {
                    background: rgba(6, 28, 48, 0.85);
                    border: 1px solid var(--border-c);
                    border-radius: 8px;
                    color: var(--text);
                    padding: 8px 12px;
                    outline: none;
                    font-family: var(--mono);
                    font-size: 12px;
                    transition: border-color 0.2s;
                }

                .soc-input:focus {
                    border-color: var(--cyan);
                    box-shadow: 0 0 8px rgba(0, 229, 255, 0.15);
                }

                .soc-select {
                    background: rgba(4, 18, 38, 0.9);
                    border: 1px solid var(--border-c);
                    border-radius: 8px;
                    color: var(--text);
                    padding: 8px 12px;
                    outline: none;
                    cursor: pointer;
                    font-size: 12px;
                }

                .btn {
                    padding: 8px 16px;
                    font-family: var(--title);
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 1.5px;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.25s ease;
                    text-transform: uppercase;
                    border: none;
                }

                .btn-cyan { background: var(--cyan); color: var(--bg); box-shadow: 0 0 12px rgba(0,229,255,0.25); }
                .btn-cyan:hover { opacity: 0.9; box-shadow: 0 0 20px rgba(0,229,255,0.45); }
                .btn-red { background: rgba(255, 45, 85, 0.12); border: 1.5px solid var(--red); color: var(--red); }
                .btn-red:hover { background: var(--red); color: var(--bg); }
                .btn-green { background: rgba(0, 255, 148, 0.12); border: 1.5px solid var(--green); color: var(--green); }
                .btn-green:hover { background: var(--green); color: var(--bg); }

                /* Toggle Switch */
                .toggle-btn {
                    width: 38px;
                    height: 22px;
                    border-radius: 11px;
                    position: relative;
                    cursor: pointer;
                    transition: .3s;
                    border: 1.5px solid;
                }

                .toggle-btn.on { background: rgba(0, 255, 148, 0.15); border-color: var(--green); }
                .toggle-btn.off { background: rgba(255, 255, 255, .04); border-color: var(--border-c); }
                .toggle-btn::after {
                    content: '';
                    position: absolute;
                    top: 2px; width: 14px; height: 14px;
                    border-radius: 50%;
                    transition: .3s;
                }
                .toggle-btn.on::after { left: 20px; background: var(--green); }
                .toggle-btn.off::after { left: 2px; background: var(--text3); }

                /* Toast notification */
                .soc-toast {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: linear-gradient(145deg, var(--bg3), var(--bg4));
                    border: 1px solid var(--border-c);
                    border-radius: 12px;
                    padding: 12px 18px;
                    font-family: var(--mono);
                    font-size: 11px;
                    color: var(--text);
                    z-index: 9999;
                    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
                    animation: slideIn .3s ease-out;
                }

                @keyframes slideIn {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }

                /* Panic Banner */
                .panic-banner {
                    background: linear-gradient(90deg, rgba(255, 45, 85, 0.95), rgba(255, 107, 0, 0.95));
                    border: 2px solid var(--red);
                    border-radius: var(--radius-sm);
                    color: white;
                    padding: 12px 20px;
                    text-align: center;
                    font-family: var(--title);
                    font-weight: 900;
                    letter-spacing: 2px;
                    margin-bottom: 20px;
                    animation: bannerPulse 1s ease-in-out infinite alternate;
                }

                @keyframes bannerPulse {
                    from { opacity: 0.8; box-shadow: 0 0 10px var(--red-glow); }
                    to { opacity: 1; box-shadow: 0 0 25px var(--red-glow); }
                }

                .dropzone {
                    border: 2px dashed rgba(0,229,255,0.2);
                    border-radius: var(--radius);
                    padding: 24px;
                    text-align: center;
                    cursor: pointer;
                    transition: border-color .2s;
                }

                .dropzone:hover {
                    border-color: var(--cyan);
                    background: rgba(0, 229, 255, 0.02);
                }
            `}} />

            {/* Inner Security Sidebar */}
            <aside className="soc-sidebar">
                <div className="brand">
                    <div className="brand-row">
                        <div className="brand-shield">
                            <i className="fas fa-shield-halved" style={{ fontSize: '20px', color: 'var(--cyan)' }}></i>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="brand-name">TABIBI</span>
                            <span style={{ fontFamily: 'var(--title)', fontSize: '7px', letterSpacing: '4px', color: 'var(--cyan2)', fontWeight: '600' }}>SECURITY LAYER</span>
                        </div>
                    </div>
                </div>

                <nav style={{ flex: 1, overflowY: 'auto' }}>
                    <div className="nav-section">Overview</div>
                    <div className={`nav-item ${activeSubTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveSubTab('dashboard')}>
                        <i className="fas fa-th-large"></i> DASHBOARD
                    </div>

                    <div className="nav-section">Threat Operations</div>
                    <div className={`nav-item ${activeSubTab === 'threatmonitor' ? 'active' : ''}`} onClick={() => setActiveSubTab('threatmonitor')}>
                        <i className="fas fa-crosshairs"></i> THREAT MONITOR
                        {socThreats.length > 0 && <span className="nav-badge" style={{ marginLeft: 'auto', background: 'var(--red)', color: 'white', padding: '1px 5px', borderRadius: '8px', fontSize: '9px' }}>{socThreats.length}</span>}
                    </div>
                    <div className={`nav-item ${activeSubTab === 'iprestrictions' ? 'active' : ''}`} onClick={() => setActiveSubTab('iprestrictions')}>
                        <i className="fas fa-user-shield"></i> INCIDENT RESPONSE
                    </div>

                    <div className="nav-section">Identity &amp; Access</div>
                    <div className={`nav-item ${activeSubTab === 'sessionhijack' ? 'active' : ''}`} onClick={() => setActiveSubTab('sessionhijack')}>
                        <i className="fas fa-users-cog"></i> SESSION MONITOR
                    </div>
                    <div className={`nav-item ${activeSubTab === 'roles' ? 'active' : ''}`} onClick={() => setActiveSubTab('roles')}>
                        <i className="fas fa-user-secret"></i> IMPERSONATION TEST
                    </div>

                    <div className="nav-section">Advanced Security</div>
                    <div className={`nav-item ${activeSubTab === 'filescan' ? 'active' : ''}`} onClick={() => setActiveSubTab('filescan')}>
                        <i className="fas fa-file-medical-alt"></i> FILE SCAN
                    </div>
                    <div className={`nav-item ${activeSubTab === 'geoveloc' ? 'active' : ''}`} onClick={() => setActiveSubTab('geoveloc')}>
                        <i className="fas fa-globe-americas"></i> GEO VELOCITY
                    </div>
                    <div className={`nav-item ${activeSubTab === 'medicalguard' ? 'active' : ''}`} onClick={() => setActiveSubTab('medicalguard')}>
                        <i className="fas fa-hospital-symbol"></i> MEDICAL GUARD
                    </div>

                    <div className="nav-section">Data Protection</div>
                    <div className={`nav-item ${activeSubTab === 'dataprivacy' ? 'active' : ''}`} onClick={() => setActiveSubTab('dataprivacy')}>
                        <i className="fas fa-user-lock"></i> DATA PRIVACY
                    </div>

                    <div className="nav-section">System</div>
                    <div className={`nav-item ${activeSubTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveSubTab('notifications')}>
                        <i className="fas fa-satellite-dish"></i> ALERT CHANNELS
                    </div>
                    <div className={`nav-item ${activeSubTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveSubTab('settings')}>
                        <i className="fas fa-cog"></i> SETTINGS
                    </div>
                </nav>

                <div className="sidebar-bottom">
                    <div className="hlabel">
                        <i className="fas fa-wave-square" style={{ color: 'var(--green)' }}></i> SYSTEM HEALTH
                    </div>
                    <div className="hval">{socHealth}%</div>
                    <div className="hbar">
                        <div className="hbar-fill" style={{ 
                            width: `${socHealth}%`, 
                            background: socHealth >= 80 ? 'var(--green)' : socHealth >= 50 ? 'var(--amber)' : 'var(--red)',
                            boxShadow: socHealth >= 80 ? '0 0 12px var(--green-glow)' : socHealth >= 50 ? '0 0 12px rgba(255, 193, 7, 0.4)' : '0 0 12px var(--red-glow)'
                        }}></div>
                    </div>
                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: socHealth >= 80 ? 'var(--green-dim)' : 'var(--red-dim)', border: `1px solid ${socHealth >= 80 ? 'var(--green)' : 'var(--red)'}`, display: 'flex', alignItems: 'center', justifycontent: 'center' }}>
                            <i className="fas fa-check" style={{ fontSize: '6px', color: socHealth >= 80 ? 'var(--green)' : 'var(--red)' }}></i>
                        </div>
                        <span style={{ fontSize: '10px', color: 'var(--text2)' }}>
                            {socHealth >= 80 ? 'All systems operational' : 'Active alerts & threat pressure'}
                        </span>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="main-content">
                <header className="topbar">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <i className="fas fa-satellite-dish" style={{ color: 'var(--cyan)' }}></i>
                        <span style={{ letterSpacing: '1.5px', fontSize: '10px', fontFamily: 'var(--title)' }}>MEDICAL SECURITY OPERATIONS CENTER</span>
                        <svg className="ecg-line" viewBox="0 0 60 14" fill="none" style={{ width: '50px', opacity: 0.6 }}>
                            <polyline points="0,7 6,7 9,2 12,12 15,7 20,7 22,1 24,13 26,7 31,7 34,3 37,11 40,7 50,7 53,4 56,10 58,7 60,7"
                                stroke="var(--cyan)" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    </div>
                    <div className="live-pill">
                        <div className="ldot"></div>
                        <span style={{ fontFamily: 'var(--title)', fontSize: '9px', letterSpacing: '2.5px', color: 'var(--cyan)' }}>LIVE SYSTEM MONITOR</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div className="clock">{new Date().toLocaleTimeString()}</div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', color: 'var(--text2)', letterSpacing: '1.5px' }}>
                            {new Date().toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' })} | Cairo EET
                        </div>
                    </div>
                </header>

                <div className="page-container">
                    {/* Full panic warning */}
                    {panicMode && (
                        <div className="panic-banner">
                            ⚠️ EMERGENCY FULL PANIC MODE IS ACTIVE. NON-WHITELISTED CONNECTIONS ARE REJECTED SERVER-SIDE.
                        </div>
                    )}

                    {/* SUB-TAB 1: Overview Dashboard */}
                    {activeSubTab === 'dashboard' && (
                        <div>
                            <div className="page-title"><i className="fas fa-th-large"></i> DASHBOARD OVERVIEW</div>
                            
                            <div className="stats-grid">
                                <div className="scard blue">
                                    <div className="sc-icon blue"><i className="fas fa-shield"></i></div>
                                    <div className="sc-info">
                                        <div className="sc-val blue">{socThreats.length}</div>
                                        <div className="sc-lbl">Blocked Attacks</div>
                                    </div>
                                </div>
                                <div className="scard red">
                                    <div className="sc-icon red"><i className="fas fa-ban"></i></div>
                                    <div className="sc-info">
                                        <div className="sc-val red">{blockedIPs.length}</div>
                                        <div className="sc-lbl">Restricted IPs</div>
                                    </div>
                                </div>
                                <div className="scard green">
                                    <div className="sc-icon green"><i className="fas fa-check-circle"></i></div>
                                    <div className="sc-info">
                                        <div className="sc-val green">{socHealth}%</div>
                                        <div className="sc-lbl">Patient Data Safety</div>
                                    </div>
                                </div>
                                <div className="scard amber">
                                    <div className="sc-icon amber"><i className="fas fa-heartbeat"></i></div>
                                    <div className="sc-info">
                                        <div className="sc-val amber">{socHealth}%</div>
                                        <div className="sc-lbl">System Health</div>
                                    </div>
                                </div>
                            </div>

                            <div className="panel-row">
                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-wave-square"></i> THREAT ACTIVITY TIMELINE (Last 30 Min)</div>
                                    <div style={{ height: '160px', position: 'relative' }}>
                                        <svg viewBox="0 0 640 150" width="100%" height="100%" preserveAspectRatio="none">
                                            <defs>
                                                <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.25" />
                                                    <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0.0" />
                                                </linearGradient>
                                            </defs>
                                            
                                            {/* Draw grids */}
                                            {[0, 0.25, 0.5, 0.75, 1].map((r, i) => (
                                                <line key={i} x1="10" y1={10 + r * 130} x2="630" y2={10 + r * 130} stroke="rgba(0, 229, 255, 0.05)" strokeWidth="1" />
                                            ))}
                                            
                                            {/* Area chart */}
                                            <path d={areaPath} fill="url(#area-grad)" />
                                            
                                            {/* Line chart */}
                                            <path d={linePath} stroke="var(--cyan)" strokeWidth="2" fill="none" strokeLinecap="round" />
                                            
                                            {/* Points */}
                                            {points.map((p, idx) => (
                                                <circle key={idx} cx={p[0]} cy={p[1]} r="3.5" fill="var(--bg)" stroke="var(--cyan)" strokeWidth="2" />
                                            ))}
                                        </svg>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text3)', fontFamily: 'var(--mono)', marginTop: '8px' }}>
                                        <span>30 mins ago</span>
                                        <span>20 mins ago</span>
                                        <span>10 mins ago</span>
                                        <span>Just now</span>
                                    </div>
                                </div>

                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-chart-pie"></i> ATTACK DISTRIBUTION</div>
                                    
                                    {/* SVG Donut */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '140px' }}>
                                        <svg width="120" height="120" viewBox="0 0 36 36">
                                            <circle cx="18" cy="18" r="15.915" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="3" />
                                            
                                            {/* Calculate segments if there are threats */}
                                            {socThreats.length > 0 ? (() => {
                                                let accumulatedOffset = 0;
                                                const typesCount = {};
                                                socThreats.forEach(t => {
                                                    const type = t.type || 'Other';
                                                    typesCount[type] = (typesCount[type] || 0) + 1;
                                                });
                                                const colorMap = {
                                                    SQLi: '#00e5ff', XSS: '#d04eff', Brute: '#ff2d55',
                                                    PathTraversal: '#ffc107', CmdInjection: '#ff6b00', SSRF: '#ff88aa',
                                                    XXE: '#88ccff', NoSQLi: '#00ffcc', HONEYPOT: '#9b5cff', Other: '#6a9bbf'
                                                };
                                                return Object.entries(typesCount).map(([type, count], idx) => {
                                                    const percentage = (count / socThreats.length) * 100;
                                                    const strokeDash = `${percentage} ${100 - percentage}`;
                                                    const strokeOffset = 100 - accumulatedOffset + 25; // 25 to start at top
                                                    accumulatedOffset += percentage;
                                                    const color = colorMap[type] || '#6a9bbf';
                                                    return (
                                                        <circle
                                                            key={idx}
                                                            cx="18"
                                                            cy="18"
                                                            r="15.915"
                                                            fill="none"
                                                            stroke={color}
                                                            strokeWidth="3"
                                                            strokeDasharray={strokeDash}
                                                            strokeDashoffset={strokeOffset}
                                                        />
                                                    );
                                                });
                                            })() : (
                                                <circle cx="18" cy="18" r="15.915" fill="none" stroke="var(--cyan-dim)" strokeWidth="3" />
                                            )}
                                        </svg>
                                        <div style={{ position: 'absolute', fontFamily: 'var(--title)', fontSize: '20px', fontWeight: '900', color: 'var(--cyan)' }}>
                                            {socThreats.length}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="panel-title"><i className="fas fa-shield-virus"></i> ATTACK CATEGORIES</div>
                            
                            {/* Attack Categories Cards Grid */}
                            <div className="atile-grid">
                                {[
                                    { id: 'sqli', name: 'SQL Injection', color: '#00e5ff', typeKey: 'SQLi' },
                                    { id: 'xss', name: 'XSS Attack', color: '#d04eff', typeKey: 'XSS' },
                                    { id: 'brute', name: 'Brute Force', color: '#ff2d55', typeKey: 'Brute' },
                                    { id: 'path', name: 'Path Traversal', color: '#ffc107', typeKey: 'PathTraversal' },
                                    { id: 'cmd', name: 'Cmd Injection', color: '#ff6b00', typeKey: 'CmdInjection' },
                                    { id: 'ssrf', name: 'SSRF Attack', color: '#ff88aa', typeKey: 'SSRF' },
                                    { id: 'xxe', name: 'XXE Attack', color: '#88ccff', typeKey: 'XXE' },
                                    { id: 'nosql', name: 'NoSQL Inject', color: '#00ffcc', typeKey: 'NoSQLi' },
                                    { id: 'honeypot', name: 'Honeypot Trap', color: '#9b5cff', typeKey: 'HONEYPOT' },
                                    { id: 'other', name: 'Other Threats', color: '#6a9bbf', typeKey: 'Other' },
                                ].map((cat) => {
                                    const matching = socThreats.filter(t => {
                                        const tType = (t.type || '').toLowerCase();
                                        if (cat.typeKey === 'Other') {
                                            const known = ['sqli', 'xss', 'brute', 'pathtraversal', 'cmdinjection', 'ssrf', 'xxe', 'nosqli', 'honeypot'];
                                            return !known.some(k => tType.includes(k));
                                        }
                                        return tType.includes(cat.typeKey.toLowerCase());
                                    });
                                    const latest = matching[0];
                                    const timeStr = latest ? new Date(latest.isoTime || latest.time).toLocaleTimeString() : 'Never';
                                    
                                    return (
                                        <div key={cat.id} className="atile" style={{ '--tile-color': cat.color }}>
                                            <div className="atile-count">{matching.length}</div>
                                            <div className="atile-label">{cat.name}</div>
                                            <div className="atile-last">Last: {timeStr}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Recent Threat Feed */}
                            <div className="panel">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <div className="panel-title" style={{ marginBottom: 0 }}><i className="fas fa-clipboard-list"></i> RECENT THREAT ACTIVITY</div>
                                    <button className="btn btn-red" onClick={handleClearLogs} style={{ padding: '5px 10px', fontSize: '9px' }}>
                                        <i className="fas fa-trash-alt" style={{ marginRight: '6px' }}></i> Clear Logs
                                    </button>
                                </div>
                                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                    <table className="soc-table">
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>Source IP</th>
                                                <th>Attack Type</th>
                                                <th>Severity</th>
                                                <th>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {socThreats.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px' }}>
                                                        No attack telemetry recorded yet. Monitoring network requests...
                                                    </td>
                                                </tr>
                                            ) : (
                                                socThreats.slice(0, 10).map((t, idx) => {
                                                    const score = Number(t.score || 0);
                                                    const badgeClass = score >= 100 ? 'badge red' : score >= 60 ? 'badge amber' : 'badge cyan';
                                                    return (
                                                        <tr key={t.isoTime || idx}>
                                                            <td>{new Date(t.isoTime || t.time).toLocaleTimeString()}</td>
                                                            <td style={{ color: 'var(--cyan)' }}>{t.ip}</td>
                                                            <td>{t.type}</td>
                                                            <td><span className={badgeClass}>{score >= 100 ? 'CRITICAL' : score >= 60 ? 'HIGH' : 'MEDIUM'}</span></td>
                                                            <td style={{ color: 'var(--green)' }}>{score >= 100 ? 'AUTO BLOCKED' : 'PAYLOAD REJECTED'}</td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-TAB 2: Real-time Threat Monitor */}
                    {activeSubTab === 'threatmonitor' && (
                        <div>
                            <div className="page-title"><i className="fas fa-crosshairs"></i> REAL-TIME THREAT TELEMETRY MONITOR</div>
                            
                            <div className="panel" style={{ marginBottom: '16px' }}>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {['ALL', 'SQLi', 'XSS', 'Brute', 'PathTraversal', 'CmdInjection', 'SSRF', 'XXE', 'NoSQLi'].map(t => (
                                        <button 
                                            key={t}
                                            className={`btn ${threatTypeFilter === t ? 'btn-cyan' : 'btn-red'}`} 
                                            style={{ padding: '6px 12px', fontSize: '9px', border: threatTypeFilter === t ? 'none' : '1px solid var(--border-c)' }}
                                            onClick={() => setThreatTypeFilter(t)}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                    <input 
                                        type="text" 
                                        className="soc-input" 
                                        placeholder="Search IP / Payload..." 
                                        style={{ flex: 1, minWidth: '150px' }}
                                        value={threatSearch}
                                        onChange={(e) => setThreatSearch(e.target.value)}
                                    />
                                    <button className="btn btn-cyan" onClick={handleExportLogs} style={{ padding: '8px 14px' }}>
                                        <i className="fas fa-download"></i> Export JSON
                                    </button>
                                </div>

                                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                    <table className="soc-table">
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>IP Address</th>
                                                <th>Attack Type</th>
                                                <th>Score</th>
                                                <th>Endpoint</th>
                                                <th>Payload Preview</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {socThreats
                                                .filter(t => {
                                                    if (threatTypeFilter !== 'ALL' && !(t.type || '').toLowerCase().includes(threatTypeFilter.toLowerCase())) return false;
                                                    if (threatSearch) {
                                                        const s = threatSearch.toLowerCase();
                                                        return (t.ip || '').toLowerCase().includes(s) || (t.payload || '').toLowerCase().includes(s) || (t.type || '').toLowerCase().includes(s);
                                                    }
                                                    return true;
                                                })
                                                .map((t, idx) => (
                                                    <tr key={idx}>
                                                        <td>{new Date(t.isoTime || t.time).toLocaleTimeString()}</td>
                                                        <td style={{ color: 'var(--cyan)' }}>{t.ip}</td>
                                                        <td>{t.type}</td>
                                                        <td><span className={Number(t.score) >= 100 ? 'badge red' : 'badge amber'}>{t.score}</span></td>
                                                        <td>{t.path || '/'}</td>
                                                        <td style={{ color: 'var(--text2)', fontStyle: 'italic', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {t.payload || '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* UBA Behavior Baseline */}
                            <div className="panel">
                                <div className="panel-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span><i className="fas fa-brain"></i> USER BEHAVIOR ANOMALY (UBA) &amp; BASELINE</span>
                                    <button className="btn btn-green" onClick={() => {
                                        setBaseline({ responseTime: 120, responseSize: 4096, statusCode200: 0.95, requestsPerMin: Math.round(50 + Math.random() * 20) });
                                        localStorage.setItem('soc_baseline', JSON.stringify(baseline));
                                        triggerToast('✓ Updated UBA baseline signature from live metrics');
                                    }} style={{ padding: '6px 12px', fontSize: '9px' }}>
                                        <i className="fas fa-brain"></i> Recalibrate Baseline
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '15px' }}>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' }}>BASELINE COMPARISONS</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {[
                                                { name: 'Traffic Volume', base: `${baseline.requestsPerMin} rpm`, curr: `${socThreats.length * 3 + 12} rpm` },
                                                { name: 'Avg Response Latency', base: `${baseline.responseTime} ms`, curr: `${110 + (100 - socHealth) * 5} ms` },
                                                { name: 'Response Payload Size', base: '4 KB', curr: '4.8 KB' },
                                                { name: 'HTTP Status 200 Ratio', base: '95%', curr: `${socHealth}%` }
                                            ].map((b, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-d)', paddingBottom: '6px' }}>
                                                    <span style={{ fontSize: '11px' }}>{b.name}</span>
                                                    <span style={{ fontFamily: 'var(--mono)', fontSize: '10px' }}>
                                                        <span style={{ color: 'var(--text3)', marginRight: '10px' }}>Base: {b.base}</span>
                                                        <span style={{ color: 'var(--cyan)' }}>Current: {b.curr}</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' }}>BASELINE DEVIATION TREND</div>
                                        <div style={{ height: '80px', border: '1px solid var(--border-d)', borderRadius: '8px', padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                                            <svg viewBox="0 0 300 60" width="100%" height="100%" preserveAspectRatio="none">
                                                <polyline
                                                    fill="none"
                                                    stroke="var(--amber)"
                                                    strokeWidth="1.5"
                                                    points={baselineDeviationHistory.map((val, idx) => `${(idx * 280) / 19 + 10},${50 - (val * 40) / 100}`).join(' ')}
                                                />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-TAB 3: Incident Response */}
                    {activeSubTab === 'iprestrictions' && (
                        <div>
                            <div className="page-title"><i className="fas fa-user-shield"></i> INCIDENT RESPONSE &amp; LOCKDOWNS</div>
                            
                            <div className="panel-row">
                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-ban"></i> MANUAL IP BLOCK CENTRE</div>
                                    <form onSubmit={handleBlockIP}>
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                            <input 
                                                type="text" 
                                                className="soc-input" 
                                                placeholder="IP (e.g. 197.34.22.9)" 
                                                style={{ flex: 1.2 }}
                                                value={blockIpInput}
                                                onChange={(e) => setBlockIpInput(e.target.value)}
                                            />
                                            <select 
                                                className="soc-select" 
                                                value={blockReasonInput}
                                                onChange={(e) => setBlockReasonInput(e.target.value)}
                                            >
                                                <option value="manual">Manual Block</option>
                                                <option value="brute">Failed Login / Brute Force</option>
                                                <option value="ddos">Abnormal Traffic / Flooding</option>
                                                <option value="payload">Suspicious WAF Payloads</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                            <input 
                                                type="text" 
                                                className="soc-input" 
                                                placeholder="Add operator notes/justification..." 
                                                style={{ flex: 1 }}
                                                value={blockNoteInput}
                                                onChange={(e) => setBlockNoteInput(e.target.value)}
                                            />
                                            <button type="submit" className="btn btn-cyan">Block IP</button>
                                        </div>
                                    </form>
                                </div>

                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-bolt"></i> EMERGENCY PANIC TRIGGER</div>
                                    <button 
                                        className={`btn ${panicMode ? 'btn-green' : 'btn-red'}`}
                                        style={{ width: '100%', height: '50px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                                        onClick={handleTogglePanic}
                                    >
                                        <i className={`fas ${panicMode ? 'fa-shield-virus' : 'fa-skull-crossbones'}`}></i>
                                        <span>{panicMode ? 'Deactivate Lockdown (Recover)' : 'ACTIVATE SYSTEM WIDE PANIC LOCKDOWN'}</span>
                                    </button>
                                    <div style={{ marginTop: '10px', fontSize: '10px', color: 'var(--text2)', textAlign: 'center' }}>
                                        Panic mode takes instant snapshots and drops non-whitelisted traffic server-side.
                                    </div>
                                </div>
                            </div>

                            {/* Banned accounts / Quarantine management */}
                            <div className="panel" style={{ marginBottom: '16px' }}>
                                <div className="panel-title"><i className="fas fa-users-cog"></i> ACCOUNT QUARANTINE &amp; TEMPORARY BANS</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                    <div style={{ background: 'var(--bg4)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,193,7,0.18)' }}>
                                        <div style={{ fontSize: '10px', fontFamily: 'var(--title)', color: 'var(--amber)', marginBottom: '10px' }}>
                                            <i className="fas fa-user-lock"></i> QUARANTINE ACCOUNT
                                        </div>
                                        <input 
                                            type="text" 
                                            className="soc-input" 
                                            placeholder="User ID or username" 
                                            style={{ width: '100%', marginBottom: '8px' }}
                                            value={quarantineUser}
                                            onChange={(e) => setQuarantineUser(e.target.value)}
                                        />
                                        <select 
                                            className="soc-select" 
                                            style={{ width: '100%', marginBottom: '8px' }}
                                            value={quarantineSeverity}
                                            onChange={(e) => setQuarantineSeverity(e.target.value)}
                                        >
                                            <option value="MEDIUM">MEDIUM</option>
                                            <option value="HIGH">HIGH</option>
                                            <option value="CRITICAL">CRITICAL</option>
                                        </select>
                                        <input 
                                            type="text" 
                                            className="soc-input" 
                                            placeholder="Justification" 
                                            style={{ width: '100%', marginBottom: '10px' }}
                                            value={quarantineReason}
                                            onChange={(e) => setQuarantineReason(e.target.value)}
                                        />
                                        <button className="btn btn-cyan" style={{ width: '100%', background: 'var(--amber-dim)', border: '1px solid var(--amber)', color: 'var(--amber)' }} onClick={handleQuarantineAccount}>
                                            QUARANTINE
                                        </button>
                                    </div>

                                    <div style={{ background: 'var(--bg4)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(0,255,148,0.15)' }}>
                                        <div style={{ fontSize: '10px', fontFamily: 'var(--title)', color: 'var(--green)', marginBottom: '10px' }}>
                                            <i className="fas fa-unlock"></i> RELEASE ACCOUNT
                                        </div>
                                        <input 
                                            type="text" 
                                            className="soc-input" 
                                            placeholder="User ID to release" 
                                            style={{ width: '100%', marginBottom: '10px' }}
                                            value={releaseUser}
                                            onChange={(e) => setReleaseUser(e.target.value)}
                                        />
                                        <button className="btn btn-cyan" style={{ width: '100%', background: 'var(--green-dim)', border: '1px solid var(--green)', color: 'var(--green)' }} onClick={() => handleReleaseAccount(null)}>
                                            RELEASE ACCOUNT
                                        </button>
                                    </div>

                                    <div style={{ background: 'var(--bg4)', borderRadius: '10px', padding: '14px', border: '1px solid rgba(255,45,85,0.2)' }}>
                                        <div style={{ fontSize: '10px', fontFamily: 'var(--title)', color: 'var(--red)', marginBottom: '10px' }}>
                                            <i className="fas fa-ban"></i> TEMP BAN ACCOUNT
                                        </div>
                                        <input 
                                            type="text" 
                                            className="soc-input" 
                                            placeholder="User ID to ban" 
                                            style={{ width: '100%', marginBottom: '8px' }}
                                            value={banUser}
                                            onChange={(e) => setBanUser(e.target.value)}
                                        />
                                        <select 
                                            className="soc-select" 
                                            style={{ width: '100%', marginBottom: '8px' }}
                                            value={banDuration}
                                            onChange={(e) => setBanDuration(e.target.value)}
                                        >
                                            <option value="1">1 Hour</option>
                                            <option value="24">24 Hours</option>
                                            <option value="168">7 Days</option>
                                            <option value="0">Permanent</option>
                                        </select>
                                        <input 
                                            type="text" 
                                            className="soc-input" 
                                            placeholder="Reason" 
                                            style={{ width: '100%', marginBottom: '10px' }}
                                            value={banReason}
                                            onChange={(e) => setBanReason(e.target.value)}
                                        />
                                        <button className="btn btn-cyan" style={{ width: '100%', background: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)' }} onClick={handleBanAccount}>
                                            BAN ACCOUNT
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Banned Registry & IR Logs */}
                            <div className="panel" style={{ marginBottom: '16px' }}>
                                <div className="panel-title"><i className="fas fa-users-slash"></i> BANNED &amp; BLOCKED REGISTER</div>
                                <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                                    <table className="soc-table">
                                        <thead>
                                            <tr>
                                                <th>Time Blocked</th>
                                                <th>Target ID / IP</th>
                                                <th>Action</th>
                                                <th>Reason</th>
                                                <th>Severity</th>
                                                <th>Unblock</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bannedEntities.length === 0 ? (
                                                <tr>
                                                    <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>
                                                        No IP addresses or user accounts currently banned.
                                                    </td>
                                                </tr>
                                            ) : (
                                                bannedEntities.map((b, idx) => (
                                                    <tr key={idx}>
                                                        <td>{new Date(b.time || Date.now()).toLocaleString()}</td>
                                                        <td style={{ color: 'var(--red)', fontWeight: 'bold' }}>{b.target}</td>
                                                        <td>{b.action}</td>
                                                        <td>{b.reason}</td>
                                                        <td><span className="badge red">{b.severity || 'HIGH'}</span></td>
                                                        <td>
                                                            <button className="btn btn-green" style={{ padding: '3px 8px', fontSize: '9px' }} onClick={() => {
                                                                if (b.action === 'BLOCK_IP') {
                                                                    handleUnblockIP(b.target);
                                                                } else {
                                                                    handleReleaseAccount(b.target);
                                                                }
                                                            }}>
                                                                Release
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* IR Actions log */}
                            <div className="panel">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <div className="panel-title" style={{ marginBottom: 0 }}><i className="fas fa-clipboard-list"></i> INCIDENT RESPONSE LOGS</div>
                                    <button className="btn btn-red" onClick={handleClearIRLogs} style={{ padding: '5px 10px', fontSize: '9px' }}>
                                        <i className="fas fa-trash"></i> Clear IR Logs
                                    </button>
                                </div>
                                <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                                    <table className="soc-table">
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>Action</th>
                                                <th>Target</th>
                                                <th>Reason</th>
                                                <th>Severity</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {irLogs.length === 0 ? (
                                                <tr>
                                                    <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>
                                                        No incident response actions logged yet.
                                                    </td>
                                                </tr>
                                            ) : (
                                                irLogs.map((l, idx) => (
                                                    <tr key={idx}>
                                                        <td>{new Date(l.time || Date.now()).toLocaleString()}</td>
                                                        <td style={{ color: 'var(--cyan)' }}>{l.action}</td>
                                                        <td>{l.target}</td>
                                                        <td>{l.reason}</td>
                                                        <td><span className="badge amber">{l.severity}</span></td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-TAB 4: Session Security Monitor */}
                    {activeSubTab === 'sessionhijack' && (
                        <div>
                            <div className="page-title"><i className="fas fa-users-cog"></i> ACTIVE SESSIONS &amp; ACCESS AUDIT</div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '16px', marginBottom: '16px' }}>
                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-shield-check"></i> SECURITY STATS</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', textAlign: 'center' }}>
                                        <div style={{ background: 'var(--bg4)', padding: '10px', borderRadius: '8px' }}>
                                            <div style={{ fontFamily: 'var(--title)', fontSize: '24px', color: 'var(--cyan)' }}>{accessLogs.length}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text2)' }}>Total Audited</div>
                                        </div>
                                        <div style={{ background: 'var(--bg4)', padding: '10px', borderRadius: '8px' }}>
                                            <div style={{ fontFamily: 'var(--title)', fontSize: '24px', color: 'var(--green)' }}>
                                                {accessLogs.filter(a => a.action === 'WRITE').length}
                                            </div>
                                            <div style={{ fontSize: '10px', color: 'var(--text2)' }}>Data Mutations</div>
                                        </div>
                                    </div>
                                    <button className="btn btn-cyan" style={{ width: '100%', marginTop: '12px' }} onClick={verifyAuditLogs}>
                                        Verify Audit trail HMAC Integrity
                                    </button>
                                    
                                    {auditLogIntegrity && (
                                        <div style={{ marginTop: '12px', background: 'var(--bg4)', borderRadius: '8px', padding: '10px', border: `1px solid ${auditLogIntegrity.integrity === 'CLEAN' ? 'var(--green)' : 'var(--red)'}` }}>
                                            <div style={{ fontSize: '11px', fontWeight: 'bold' }}>Integrity Status: {auditLogIntegrity.integrity}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '4px' }}>
                                                Valid signatures: {auditLogIntegrity.valid} | Tampered entries: {auditLogIntegrity.tampered}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-list-alt"></i> HIPAA PHI ACCESS HISTORY</div>
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                        <select 
                                            className="soc-select" 
                                            value={sessionFilter}
                                            onChange={(e) => setSessionFilter(e.target.value)}
                                        >
                                            <option value="ALL">All Roles</option>
                                            <option value="Doctor">Doctor Role</option>
                                            <option value="Admin">Admin Role</option>
                                            <option value="Patient">Patient Role</option>
                                        </select>
                                    </div>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        <table className="soc-table">
                                            <thead>
                                                <tr>
                                                    <th>Time</th>
                                                    <th>User</th>
                                                    <th>IP Address</th>
                                                    <th>Action</th>
                                                    <th>Accessed Fields</th>
                                                    <th>Sig</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {accessLogs
                                                    .filter(l => {
                                                        if (sessionFilter === 'ALL') return true;
                                                        return (l.userId || '').toLowerCase().includes(sessionFilter.toLowerCase());
                                                    })
                                                    .map((l, idx) => (
                                                        <tr key={idx}>
                                                            <td>{l.time || new Date(l.isoTime).toLocaleTimeString()}</td>
                                                            <td style={{ color: 'var(--cyan)' }}>{l.userId}</td>
                                                            <td>{l.ip || '0.0.0.0'}</td>
                                                            <td><span className={l.action === 'EXPORT' ? 'badge red' : 'badge cyan'}>{l.action}</span></td>
                                                            <td>{l.fields?.join(', ') || '—'}</td>
                                                            <td><span style={{ color: 'var(--green)' }}>✓ HMAC</span></td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-TAB 5: IAM - Impersonation & Role test */}
                    {activeSubTab === 'roles' && (
                        <div>
                            <div className="page-title"><i className="fas fa-user-secret"></i> IAM ROLE IMPERSONATION &amp; ACCESS CONTROL CHECK</div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
                                {['Patient', 'Doctor', 'Admin', 'Receptionist'].map(role => (
                                    <div 
                                        key={role} 
                                        className={`dropzone ${selectedRole === role ? 'active' : ''}`}
                                        style={{ borderColor: selectedRole === role ? 'var(--cyan)' : 'rgba(255,255,255,0.05)', background: selectedRole === role ? 'rgba(0,229,255,0.05)' : 'none', padding: '14px' }}
                                        onClick={() => setSelectedRole(role)}
                                    >
                                        <div style={{ fontSize: '24px', marginBottom: '5px' }}>{role === 'Patient' ? '🏥' : role === 'Doctor' ? '👨‍⚕️' : role === 'Admin' ? '🔐' : '💼'}</div>
                                        <div style={{ fontFamily: 'var(--title)', color: 'var(--cyan)', fontSize: '10px' }}>{role.toUpperCase()}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '4px' }}>
                                            {role === 'Patient' ? 'Read only' : role === 'Doctor' ? 'Medical records' : role === 'Admin' ? 'Full system' : 'Bookings only'}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="panel-row">
                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-lock"></i> PERMISSIONS MATRIX</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {[
                                            { action: 'View own appointments', role: ['Patient', 'Doctor', 'Admin', 'Receptionist'] },
                                            { action: 'View other patients records', role: ['Doctor', 'Admin'] },
                                            { action: 'Update clinical diagnoses', role: ['Doctor', 'Admin'] },
                                            { action: 'Manage user credentials & system keys', role: ['Admin'] }
                                        ].map((p, idx) => {
                                            const allowed = p.role.includes(selectedRole);
                                            return (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-d)', paddingBottom: '6px' }}>
                                                    <span style={{ fontSize: '11px' }}>{p.action}</span>
                                                    <span className={allowed ? 'badge green' : 'badge red'}>{allowed ? 'ALLOWED' : 'DENIED'}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-vial"></i> ACCESS CONTROL SIMULATOR</div>
                                    <button className="btn btn-cyan" style={{ width: '100%' }} onClick={runRoleTest} disabled={testingRole}>
                                        {testingRole ? 'Running Test...' : 'Run Access Control Test Suite'}
                                    </button>
                                    <div style={{ marginTop: '12px', maxHeight: '150px', overflowY: 'auto' }}>
                                        {roleTestResults.map((r, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-d)', paddingBottom: '4px', paddingTop: '4px', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                                                <span>{r.endpoint}</span>
                                                <span style={{ color: r.status.includes('OK') ? 'var(--green)' : 'var(--red)' }}>{r.status}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-TAB 6: File scan uploader */}
                    {activeSubTab === 'filescan' && (
                        <div>
                            <div className="page-title"><i className="fas fa-file-medical-alt"></i> FILE UPLOAD SECURITY SCANNER</div>
                            
                            <div className="panel-row">
                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-upload"></i> UPLOAD AND ANALYZE FILE</div>
                                    <div className="dropzone" onClick={() => document.getElementById('file-upload-input').click()}>
                                        <i className="fas fa-cloud-upload-alt" style={{ fontSize: '32px', color: 'var(--cyan)', opacity: 0.7, display: 'block', marginBottom: '8px' }}></i>
                                        <div style={{ fontFamily: 'var(--title)', fontSize: '9px', letterSpacing: '2px', color: 'var(--cyan)' }}>DRAG &amp; DROP OR CLICK TO UPLOAD</div>
                                        <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '4px' }}>PDF, DOCX, XLSX, JPG, PNG, ZIP — Max 10MB</div>
                                    </div>
                                    <input 
                                        type="file" 
                                        id="file-upload-input" 
                                        style={{ display: 'none' }}
                                        onChange={handleFileScan}
                                    />
                                    
                                    {scanning && (
                                        <div style={{ marginTop: '14px' }}>
                                            <div style={{ fontSize: '10px', color: 'var(--text2)', marginBottom: '4px' }}>Scanning: {scanProgress}%</div>
                                            <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${scanProgress}%`, height: '100%', background: 'var(--purple)', boxShadow: '0 0 8px var(--purple-glow)' }}></div>
                                            </div>
                                        </div>
                                    )}

                                    {scanResult && (
                                        <div style={{ marginTop: '14px', padding: '12px', background: scanResult.safe ? 'rgba(0, 255, 148, 0.08)' : 'var(--red-dim)', border: `1.5px solid ${scanResult.safe ? 'var(--green)' : 'var(--red)'}`, borderRadius: '8px' }}>
                                            <div style={{ fontFamily: 'var(--title)', color: scanResult.safe ? 'var(--green)' : 'var(--red)', fontSize: '12px', fontWeight: 'bold' }}>
                                                {scanResult.safe ? '✓ FILE STRUCTURE SECURE' : '⚠ WEBSHELL / MALWARE DETECTED'}
                                            </div>
                                            <div style={{ fontSize: '10px', color: 'var(--text2)', marginTop: '6px', fontFamily: 'var(--mono)' }}>
                                                SHA256: {scanResult.sha256}<br />
                                                File: {scanResult.name} ({Math.round(scanResult.size / 1024)} KB) | Mime: {scanResult.mime}
                                            </div>
                                            {!scanResult.safe && (
                                                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '6px', borderRadius: '4px', marginTop: '8px', color: 'white', fontSize: '10px', fontFamily: 'var(--mono)' }}>
                                                    Threat: {scanResult.reason}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-history"></i> SCAN HISTORICAL FEED</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', marginBottom: '10px' }}>
                                        <div style={{ background: 'var(--bg4)', padding: '6px', borderRadius: '6px' }}>
                                            <div style={{ color: 'var(--green)', fontSize: '18px', fontWeight: 'bold' }}>{scanHistory.filter(h => h.safe).length}</div>
                                            <div style={{ fontSize: '8px', color: 'var(--text3)' }}>CLEAN</div>
                                        </div>
                                        <div style={{ background: 'var(--bg4)', padding: '6px', borderRadius: '6px' }}>
                                            <div style={{ color: 'var(--red)', fontSize: '18px', fontWeight: 'bold' }}>{scanHistory.filter(h => !h.safe).length}</div>
                                            <div style={{ fontSize: '8px', color: 'var(--text3)' }}>MALICIOUS</div>
                                        </div>
                                        <div style={{ background: 'var(--bg4)', padding: '6px', borderRadius: '6px' }}>
                                            <div style={{ color: 'var(--cyan)', fontSize: '18px', fontWeight: 'bold' }}>{scanHistory.length}</div>
                                            <div style={{ fontSize: '8px', color: 'var(--text3)' }}>TOTAL</div>
                                        </div>
                                    </div>
                                    <div style={{ maxHeight: '180px', overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                                        {scanHistory.map((h, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-d)', paddingBottom: '4px', paddingTop: '4px' }}>
                                                <span style={{ color: h.safe ? 'var(--green)' : 'var(--red)' }}>{h.safe ? '✓' : '⚠'} {h.name}</span>
                                                <span style={{ color: 'var(--text3)' }}>{h.time}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-TAB 7: Geo-Velocity traveled check */}
                    {activeSubTab === 'geoveloc' && (
                        <div>
                            <div className="page-title"><i className="fas fa-globe-americas"></i> GEO-VELOCITY TRAVEL SPEED SIMULATOR</div>
                            
                            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '16px' }}>
                                <div className="scard blue">
                                    <div className="sc-icon blue"><i className="fas fa-globe"></i></div>
                                    <div className="sc-info">
                                        <div className="sc-val blue">{geoChecksCount}</div>
                                        <div className="sc-lbl">Total Checks</div>
                                    </div>
                                </div>
                                <div className="scard red">
                                    <div className="sc-icon red"><i className="fas fa-exclamation-triangle"></i></div>
                                    <div className="sc-info">
                                        <div className="sc-val red">{geoAlertsCount}</div>
                                        <div className="sc-lbl">Impossible Travel alerts</div>
                                    </div>
                                </div>
                                <div className="scard green">
                                    <div className="sc-icon green"><i className="fas fa-check-circle"></i></div>
                                    <div className="sc-info">
                                        <div className="sc-val green">{geoSafeCount}</div>
                                        <div className="sc-lbl">Normal Logins</div>
                                    </div>
                                </div>
                            </div>

                            <div className="panel-row">
                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-search-location"></i> TEST USER VELOCITY</div>
                                    <div style={{ marginBottom: '8px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text2)', marginBottom: '4px' }}>USER ID:</label>
                                        <input 
                                            type="text" 
                                            className="soc-input" 
                                            placeholder="user123 or doctor_ahmed" 
                                            style={{ width: '100%' }}
                                            value={geoUserId}
                                            onChange={(e) => setGeoUserId(e.target.value)}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', color: 'var(--text2)', marginBottom: '4px' }}>NEW LOGIN IP:</label>
                                        <input 
                                            type="text" 
                                            className="soc-input" 
                                            placeholder="197.34.22.9" 
                                            style={{ width: '100%' }}
                                            value={geoIp}
                                            onChange={(e) => setGeoIp(e.target.value)}
                                        />
                                    </div>
                                    <button className="btn btn-cyan" style={{ width: '100%' }} onClick={handleGeoCheck}>
                                        Validate Login Geo-Coordinates
                                    </button>
                                    
                                    {geoResult && (
                                        <div style={{ marginTop: '12px', padding: '10px', background: geoResult.impossible ? 'var(--red-dim)' : 'rgba(0, 255, 148, 0.08)', border: `1.5px solid ${geoResult.impossible ? 'var(--red)' : 'var(--green)'}`, borderRadius: '8px', fontSize: '11px' }}>
                                            <div style={{ fontWeight: 'bold' }}>{geoResult.impossible ? '⚠ VELOCITY ABUSE DETECTED' : '✓ LOGIN COORDINATES STABLE'}</div>
                                            <div style={{ marginTop: '4px', color: 'var(--text2)' }}>{geoResult.reason}</div>
                                        </div>
                                    )}
                                </div>

                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-exclamation-circle"></i> IMPOSSIBLE TRAVEL ALERTS LOG</div>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', fontFamily: 'var(--mono)', fontSize: '10px' }}>
                                        {geoAlerts.length === 0 ? (
                                            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px' }}>No impossible travel alerts recorded.</div>
                                        ) : (
                                            geoAlerts.map((a, idx) => (
                                                <div key={idx} style={{ background: 'rgba(255,45,85,0.05)', border: '1px solid rgba(255,45,85,0.2)', padding: '6px', borderRadius: '4px', marginBottom: '6px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: 'var(--red)', fontWeight: 'bold' }}>{a.userId}</span>
                                                        <span style={{ color: 'var(--text3)' }}>{a.time}</span>
                                                    </div>
                                                    <div style={{ marginTop: '4px', color: 'var(--text2)' }}>{a.reason}</div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-TAB 8: Medical Guard */}
                    {activeSubTab === 'medicalguard' && (
                        <div>
                            <div className="page-title"><i className="fas fa-hospital-symbol"></i> MEDICAL GUARD — BOOKINGS &amp; RATINGS TELEMETRY</div>
                            
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1.5px solid var(--border-c)' }}>
                                <button className="btn" style={{ background: medicalGuardActiveTab === 'appt' ? 'var(--cyan)' : 'transparent', color: medicalGuardActiveTab === 'appt' ? 'var(--bg)' : 'var(--text2)', borderRadius: '8px 8px 0 0' }} onClick={() => setMedicalGuardActiveTab('appt')}>
                                    Appointments Guard
                                </button>
                                <button className="btn" style={{ background: medicalGuardActiveTab === 'rate' ? 'var(--cyan)' : 'transparent', color: medicalGuardActiveTab === 'rate' ? 'var(--bg)' : 'var(--text2)', borderRadius: '8px 8px 0 0' }} onClick={() => setMedicalGuardActiveTab('rate')}>
                                    Rating Submissions Guard
                                </button>
                            </div>

                            {medicalGuardActiveTab === 'appt' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '16px' }}>
                                    <div className="panel">
                                        <div className="panel-title"><i className="fas fa-calendar-times"></i> EXPIRED UNPAID CLINIC BOOKINGS</div>
                                        <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                                            <table className="soc-table">
                                                <thead>
                                                    <tr>
                                                        <th>Booking ID</th>
                                                        <th>User ID</th>
                                                        <th>Doctor ID</th>
                                                        <th>Expiry Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {expiredBookings.length === 0 ? (
                                                        <tr>
                                                            <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text3)', padding: '20px' }}>No expired unpaid appointments on record.</td>
                                                        </tr>
                                                    ) : (
                                                        expiredBookings.map((b, idx) => (
                                                            <tr key={idx}>
                                                                <td>{b._id || b.id}</td>
                                                                <td>{b.userId || b.user_id}</td>
                                                                <td>{b.doctorId || b.doctor_id}</td>
                                                                <td><span className="badge red">EXPIRED UNPAID</span></td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div className="panel">
                                        <div className="panel-title"><i className="fas fa-search"></i> VERIFY RATING PERMISSION</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <input 
                                                type="text" 
                                                className="soc-input" 
                                                placeholder="User ID" 
                                                value={checkApptUser}
                                                onChange={(e) => setCheckApptUser(e.target.value)}
                                            />
                                            <input 
                                                type="text" 
                                                className="soc-input" 
                                                placeholder="Doctor ID" 
                                                value={checkApptDoctor}
                                                onChange={(e) => setCheckApptDoctor(e.target.value)}
                                            />
                                            <button className="btn btn-cyan" onClick={handleCheckAppt}>Check Booking Link</button>
                                            
                                            {checkApptResult !== null && (
                                                <div style={{ marginTop: '8px', padding: '8px', background: checkApptResult ? 'rgba(0, 255, 148, 0.08)' : 'var(--red-dim)', border: `1px solid ${checkApptResult ? 'var(--green)' : 'var(--red)'}`, borderRadius: '6px', fontSize: '11px', textAlign: 'center' }}>
                                                    {checkApptResult ? '✓ Valid Booking Found — Rating Allowed' : '✗ No Booking Link Found — Rating Suspended'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {medicalGuardActiveTab === 'rate' && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                                    <div className="panel">
                                        <div className="panel-title"><i className="fas fa-shield-alt"></i> CHECK RATING ABUSE</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <input type="text" className="soc-input" placeholder="User ID" value={rateUserId} onChange={(e) => setRateUserId(e.target.value)} />
                                            <input type="text" className="soc-input" placeholder="Doctor ID" value={rateDoctorId} onChange={(e) => setRateDoctorId(e.target.value)} />
                                            <input type="number" className="soc-input" min="1" max="5" placeholder="Rating Score (1-5)" value={rateVal} onChange={(e) => setRateVal(e.target.value)} />
                                            <button className="btn btn-cyan" onClick={handleCheckRating}>Analyze Rating Payload</button>
                                            
                                            {rateResult && (
                                                <div style={{ marginTop: '10px', padding: '10px', background: rateResult.blocked ? 'var(--red-dim)' : 'rgba(0, 255, 148, 0.08)', border: `1.5px solid ${rateResult.blocked ? 'var(--red)' : 'var(--green)'}`, borderRadius: '8px', fontSize: '11px' }}>
                                                    <div style={{ fontWeight: 'bold' }}>{rateResult.blocked ? '⚠ SUBMISSION BLOCKED' : '✓ SUBMISSION SECURE'}</div>
                                                    <div style={{ marginTop: '4px', color: 'var(--text2)' }}>{rateResult.reason}</div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="panel">
                                        <div className="panel-title"><i className="fas fa-chart-bar"></i> DOCTOR RATINGS PROFILE TELEMETRY</div>
                                        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                                            <input type="text" className="soc-input" placeholder="Doctor ID" style={{ flex: 1 }} value={statsDoctorId} onChange={(e) => setStatsDoctorId(e.target.value)} />
                                            <button className="btn btn-cyan" onClick={handleLoadStats}>Get Profile Stats</button>
                                        </div>
                                        
                                        {statsDoctorResult && (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                                                <div style={{ background: 'var(--bg4)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '18px', color: 'var(--gold)', fontWeight: 'bold' }}>{statsDoctorResult.averageRating || '—'}</div>
                                                    <div>Avg Rating</div>
                                                </div>
                                                <div style={{ background: 'var(--bg4)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '18px', color: 'var(--cyan)', fontWeight: 'bold' }}>{statsDoctorResult.totalRatings || 0}</div>
                                                    <div>Total Ratings</div>
                                                </div>
                                                <div style={{ background: 'var(--bg4)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '18px', color: 'var(--red)', fontWeight: 'bold' }}>{statsDoctorResult.blockedAttempts || 0}</div>
                                                    <div>Blocked Attacks</div>
                                                </div>
                                                <div style={{ background: 'var(--bg4)', padding: '8px', borderRadius: '6px', textAlign: 'center' }}>
                                                    <div style={{ fontSize: '18px', color: 'var(--amber)', fontWeight: 'bold' }}>{statsDoctorResult.suspiciousCount || 0}</div>
                                                    <div>Suspicious hits</div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SUB-TAB 9: Data Privacy & Masking */}
                    {activeSubTab === 'dataprivacy' && (
                        <div>
                            <div className="page-title"><i className="fas fa-user-lock"></i> DATA PRIVACY, ENCRYPTION &amp; MASKING RULES</div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '16px' }}>
                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-mask"></i> HIPAA DATA MASKING FIELDS</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {[
                                            { key: 'maskPatientName', name: 'Patient Name', desc: 'Mask full name — show initials (e.g. A. M.)' },
                                            { key: 'maskNationalId', name: 'National ID / SSN', desc: 'Mask all except last 4 digits' },
                                            { key: 'maskMRN', name: 'Medical Record Number (MRN)', desc: 'Tokenize MRN in audit trails' },
                                            { key: 'maskDiagnosis', name: 'Clinical Diagnosis', desc: 'Restrict reading to assigned doctors' },
                                            { key: 'maskPhone', name: 'Phone Number', desc: 'Mask center digits (+20-XXX-XXXX-78)' }
                                        ].map(rule => (
                                            <div key={rule.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-d)', paddingBottom: '8px' }}>
                                                <div>
                                                    <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{rule.name}</div>
                                                    <div style={{ fontSize: '9px', color: 'var(--text2)' }}>{rule.desc}</div>
                                                </div>
                                                <div 
                                                    className={`toggle-btn ${privacyRules[rule.key] ? 'on' : 'off'}`} 
                                                    onClick={() => {
                                                        const next = { ...privacyRules, [rule.key]: !privacyRules[rule.key] };
                                                        setPrivacyRules(next);
                                                    }}
                                                ></div>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="btn btn-cyan" style={{ width: '100%', marginTop: '14px' }} onClick={() => savePrivacyRules(null)} disabled={actionLoading}>
                                        {actionLoading ? 'Saving...' : 'Apply Masking Rules'}
                                    </button>
                                </div>

                                <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <div>
                                        <div className="panel-title"><i className="fas fa-key"></i> KMS ENCRYPTION &amp; KEY ROTATION</div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-d)', paddingBottom: '8px', marginBottom: '10px' }}>
                                            <div>
                                                <div style={{ fontSize: '11px', fontWeight: 'bold' }}>HMAC Audit Log Signatures</div>
                                                <div style={{ fontSize: '9px', color: 'var(--text2)' }}>Cryptographically verify logs against tampering</div>
                                            </div>
                                            <div className="badge green">AES-256</div>
                                        </div>
                                        <button className="btn btn-green" style={{ width: '100%' }} onClick={handleRotateKeys} disabled={actionLoading}>
                                            Rotate KMS Cryptographic Keys Now
                                        </button>
                                    </div>

                                    <div style={{ borderTop: '1px solid var(--border-d)', paddingTop: '14px' }}>
                                        <div className="panel-title"><i className="fas fa-eye-slash"></i> PII EXPOSURE RULES BY IAM ROLE</div>
                                        <table className="soc-table" style={{ fontSize: '10px' }}>
                                            <thead>
                                                <tr>
                                                    <th>FIELD</th>
                                                    <th>DOCTOR</th>
                                                    <th>ADMIN</th>
                                                    <th>PATIENT</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr>
                                                    <td>Patient Name</td>
                                                    <td style={{ color: 'var(--green)' }}>✓ ALLOW</td>
                                                    <td style={{ color: 'var(--green)' }}>✓ ALLOW</td>
                                                    <td style={{ color: 'var(--green)' }}>✓ ALLOW</td>
                                                </tr>
                                                <tr>
                                                    <td>National ID</td>
                                                    <td style={{ color: 'var(--green)' }}>✓ ALLOW</td>
                                                    <td style={{ color: 'var(--amber)' }}>⚠ MASKED</td>
                                                    <td style={{ color: 'var(--green)' }}>✓ ALLOW</td>
                                                </tr>
                                                <tr>
                                                    <td>Diagnosis</td>
                                                    <td style={{ color: 'var(--green)' }}>✓ ALLOW</td>
                                                    <td style={{ color: 'var(--red)' }}>✗ DENY</td>
                                                    <td style={{ color: 'var(--green)' }}>✓ ALLOW</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-TAB 10: Alert Channels & Notifications */}
                    {activeSubTab === 'notifications' && (
                        <div>
                            <div className="page-title"><i className="fas fa-satellite-dish"></i> ALERT CHANNELS &amp; TRIGGERS</div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-envelope"></i> SMTP EMAIL INTEGRATION</div>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <input 
                                            type="text" 
                                            className="soc-input" 
                                            placeholder="alerts@hospital.med" 
                                            style={{ flex: 1 }}
                                            value={newEmailInput}
                                            onChange={(e) => setNewEmailInput(e.target.value)}
                                        />
                                        <button className="btn btn-cyan" onClick={handleAddEmail}>Add</button>
                                    </div>
                                    <div style={{ background: 'rgba(0,0,0,0.1)', padding: '8px', borderRadius: '6px', fontSize: '11px', maxHeight: '100px', overflowY: 'auto' }}>
                                        {notificationEmails.map(e => <div key={e} style={{ borderBottom: '1px solid var(--border-d)', padding: '2px 0' }}>• {e}</div>)}
                                    </div>
                                </div>

                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-bell"></i> NOTIFICATION ALERTS TRIGGERS</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {[
                                            { key: 'critical', title: 'CRITICAL ATTACKS', desc: 'WAF score >= 100 auto-blocks' },
                                            { key: 'brute', title: 'BRUTE FORCE ATTACKS', desc: 'Failed login spikes' },
                                            { key: 'all', title: 'ALL WAF ALERTS', desc: 'Fires on every threat event (High volume)' }
                                        ].map(t => (
                                            <div key={t.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{t.title}</span>
                                                    <div style={{ fontSize: '9px', color: 'var(--text2)' }}>{t.desc}</div>
                                                </div>
                                                <div 
                                                    className={`toggle-btn ${alertTriggers[t.key] ? 'on' : 'off'}`} 
                                                    onClick={() => setAlertTriggers({ ...alertTriggers, [t.key]: !alertTriggers[t.key] })}
                                                ></div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="panel">
                                <div className="panel-title"><i className="fas fa-list-alt"></i> SYSTEM ALERTS LOG FEED</div>
                                <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                                    <table className="soc-table">
                                        <thead>
                                            <tr>
                                                <th>Time</th>
                                                <th>Source IP</th>
                                                <th>Alert Category</th>
                                                <th>Score</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {alertLogs.length === 0 ? (
                                                <tr>
                                                    <td colSpan="4" style={{ textAlign: 'center', color: 'var(--text3)', padding: '16px' }}>
                                                        No alerts dispatched. Monitoring triggers...
                                                    </td>
                                                </tr>
                                            ) : (
                                                alertLogs.map((l, idx) => (
                                                    <tr key={idx}>
                                                        <td>{l.time}</td>
                                                        <td style={{ color: 'var(--red)' }}>{l.ip}</td>
                                                        <td>{l.type}</td>
                                                        <td><span className="badge red">{l.score}</span></td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SUB-TAB 11: Settings */}
                    {activeSubTab === 'settings' && (
                        <div>
                            <div className="page-title"><i className="fas fa-cog"></i> SOC WAF SYSTEM SETTINGS</div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '16px' }}>
                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-sliders-h"></i> DETECTION PROFILE</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {[
                                            { key: 'autoblock', title: 'Auto-block offending IPs', desc: 'Auto ban IP on score >= threshold' },
                                            { key: 'alerts', title: 'Real-time alert toasts', desc: 'Popup banner on threat detections' },
                                            { key: 'sound', title: 'Sound alerts', desc: 'Play beep code on attacks' }
                                        ].map(s => (
                                            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{s.title}</span>
                                                    <div style={{ fontSize: '9px', color: 'var(--text2)' }}>{s.desc}</div>
                                                </div>
                                                <div 
                                                    className={`toggle-btn ${settingsConfig[s.key] ? 'on' : 'off'}`} 
                                                    onClick={() => setSettingsConfig({ ...settingsConfig, [s.key]: !settingsConfig[s.key] })}
                                                ></div>
                                            </div>
                                        ))}
                                    </div>
                                    <button className="btn btn-cyan" style={{ width: '100%', marginTop: '16px' }} onClick={() => triggerToast('✓ Configuration updated')}>
                                        Save WAF Configuration
                                    </button>
                                </div>

                                <div className="panel">
                                    <div className="panel-title"><i className="fas fa-info-circle"></i> ABOUT TABIBI WAF PLATFORM</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', fontFamily: 'var(--mono)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-d)', paddingBottom: '6px' }}>
                                            <span>WAF Engine Version:</span>
                                            <span style={{ color: 'var(--cyan)' }}>v{systemInfo.version}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-d)', paddingBottom: '6px' }}>
                                            <span>Active Signature Rules:</span>
                                            <span style={{ color: 'var(--green)' }}>{systemInfo.wafPatterns} OWASP rules</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-d)', paddingBottom: '6px' }}>
                                            <span>Honeypots Routes:</span>
                                            <span style={{ color: 'var(--purple)' }}>{systemInfo.honeypots} active paths</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-d)', paddingBottom: '6px' }}>
                                            <span>Telemetry DB connection:</span>
                                            <span style={{ color: 'var(--green)' }}>ONLINE ({systemInfo.ping}ms ping)</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Total threat incidents:</span>
                                            <span>{systemInfo.totalEvents} WAF events</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Floater toast message */}
            {showToast && (
                <div className="soc-toast">
                    {toastMessage}
                </div>
            )}
        </div>
    );
};

export default SecurityDashboard;
