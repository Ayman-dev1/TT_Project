import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { TabibiAPI } from '../utils/TabibiAPI';

const SPECIALTY_MAP = {
    'dermatology': 'Dermatologist',
    'dermatologist': 'Dermatologist',
    'neurology': 'Neurologist',
    'neurologist': 'Neurologist',
    'gynecology': 'Gynecologist',
    'gynecologist': 'Gynecologist',
    'pediatricians': 'Pediatricians',
    'pediatrics': 'Pediatricians',
    'pediatrician': 'Pediatricians',
    'general physician': 'General physician',
    'general': 'General physician',
    'internal medicine': 'General physician',
    'gastroenterology': 'Gastroenterologist',
    'gastroenterologist': 'Gastroenterologist',
    'dentist': 'Dentist',
    'dentistry': 'Dentist',
    'dental': 'Dentist',
    'cardiology': 'General physician',
    'pulmonology': 'General physician',
    'orthopedics': 'General physician',
    'ent': 'General physician',
    'psychiatry': 'General physician',
    'rheumatology': 'General physician',
    'urology': 'General physician',
    'oncology': 'General physician',
    'endocrinology': 'General physician'
};

const SPECIALTY_KEYWORDS = [
    {
        specialty: 'Neurologist',
        specialtyAr: 'المخ والأعصاب',
        keywordsEn: ['headache', 'migraine', 'dizzy', 'dizziness', 'numb', 'numbness', 'seizure', 'convulsion', 'tremor', 'paralysis', 'spine', 'spinal', 'nerve', 'memory loss', 'insomnia', 'fainting', 'syncope', 'vertigo', 'neurology', 'neurologist'],
        keywordsAr: ['صداع', 'شقيقة', 'شقيقه', 'دوخة', 'دوخه', 'دوار', 'تنميل', 'تخدر', 'تشنج', 'تشنجات', 'أعصاب', 'اعصاب', 'رعشة', 'رعشه', 'شلل', 'فقدان الوعي', 'إغماء', 'اغماء', 'نسيان', 'ذاكرة', 'عمود فقري', 'فقرات', 'اعصاب'],
        symptomsEn: ['Headache / Migraine', 'Dizziness or Numbness'],
        symptomsAr: ['صداع / شقيقة', 'دوار وتنميل الأعصاب'],
        diagnosesEn: [
            { disease: 'Migraine Headache', confidence: 85 },
            { disease: 'Nerve Tension / Sinus Pressure', confidence: 70 }
        ],
        diagnosesAr: [
            { disease: 'الصداع النصفي (الشقيقة)', confidence: 85 },
            { disease: 'إرهاق عصبي أو توتر جيوب أنفية', confidence: 70 }
        ]
    },
    {
        specialty: 'Dermatologist',
        specialtyAr: 'الأمراض الجلدية والتجميل',
        keywordsEn: ['skin', 'acne', 'pimple', 'rash', 'itch', 'itchy', 'eczema', 'hives', 'psoriasis', 'hair loss', 'alopecia', 'fungal', 'fungus', 'nail', 'blister', 'burn', 'dermatitis', 'wart', 'mole', 'dermatology', 'dermatologist'],
        keywordsAr: ['جلد', 'جلدية', 'بشرة', 'بشره', 'حب الشباب', 'بثور', 'طفح', 'حكة', 'حكه', 'إكزيما', 'اكزيما', 'صدفية', 'صدفيه', 'تساقط الشعر', 'فروة الرأس', 'صلع', 'فطريات', 'أظافر', 'اظافر', 'ثآليل', 'حساسية جلدية', 'شامة', 'جلديه'],
        symptomsEn: ['Skin Rash', 'Itchiness or Acne'],
        symptomsAr: ['طفح جلدي / بثور', 'حكة جلدية أو حب الشباب'],
        diagnosesEn: [
            { disease: 'Eczema / Skin Allergy', confidence: 90 },
            { disease: 'Contact Dermatitis', confidence: 75 }
        ],
        diagnosesAr: [
            { disease: 'الإكزيما أو حساسية الجلد', confidence: 90 },
            { disease: 'التهاب جلدي تماسي', confidence: 75 }
        ]
    },
    {
        specialty: 'Pediatricians',
        specialtyAr: 'طب الأطفال حديثي الولادة',
        keywordsEn: ['child', 'baby', 'pediatric', 'kid', 'infant', 'toddler', 'newborn', 'pediatrician', 'vaccination', 'bedwetting', 'teething', 'measles', 'mumps', 'pediatrics', 'pediatricians'],
        keywordsAr: ['طفل', 'أطفال', 'اطفال', 'رضيع', 'بيبي', 'طفله', 'أولاد', 'حديثي الولادة', 'تطعيمات', 'تبول لا إرادي', 'تسنين', 'حصبه', 'حصبتين', 'حرارة طفل', 'حديثي الولاده'],
        symptomsEn: ['Childhood Fever / Growth Check'],
        symptomsAr: ['حرارة لدى طفل / متابعة نمو'],
        diagnosesEn: [
            { disease: 'Pediatric Development & Immunization Check', confidence: 95 }
        ],
        diagnosesAr: [
            { disease: 'متابعة نمو الأطفال والتحصينات', confidence: 95 }
        ]
    },
    {
        specialty: 'Gynecologist',
        specialtyAr: 'أمراض النساء والتوليد',
        keywordsEn: ['pregnant', 'pregnancy', 'period', 'menstruation', 'uterus', 'ovary', 'ovarian', 'vagina', 'contraception', 'menopause', 'maternity', 'obstetrics', 'fertility', 'miscarriage', 'breastfeeding', 'gynecologist', 'gynecology'],
        keywordsAr: ['حمل', 'حامل', 'ولادة', 'ولاده', 'نساء', 'توليد', 'رحم', 'مبيض', 'تكيس', 'عقم', 'دورة شهرية', 'دوره شهريه', 'حيض', 'إجهاض', 'اجهاض', 'رضاعة طبيعية', 'سائل مهبلي', 'نسائي', 'نسائيه'],
        symptomsEn: ['Pregnancy or Women Health Check'],
        symptomsAr: ['متابعة حمل / صحة المرأة والولادة'],
        diagnosesEn: [
            { disease: 'Maternity and Women Wellness Care', confidence: 95 }
        ],
        diagnosesAr: [
            { disease: 'متابعة صحة المرأة والولادة', confidence: 95 }
        ]
    },
    {
        specialty: 'Gastroenterologist',
        specialtyAr: 'أمراض الجهاز الهضمي والكبد',
        keywordsEn: ['stomach', 'stomachache', 'belly', 'abdomen', 'digestive', 'digest', 'colon', 'ibs', 'nausea', 'vomit', 'vomiting', 'diarrhea', 'constipation', 'acid reflux', 'heartburn', 'bloating', 'gas', 'gastro', 'liver', 'hepatitis', 'gallbladder', 'ulcer', 'gastroenterology', 'gastroenterologist'],
        keywordsAr: ['بطن', 'معدة', 'معده', 'قولون', 'هضمي', 'امساك', 'إمساك', 'اسهال', 'إسهال', 'غثيان', 'تقيؤ', 'ترجيع', 'حموضة', 'حموضه', 'ارتجاع', 'غازات', 'انتفاخ', 'كبد', 'مرارة', 'قرحة', 'جهاز هضمي', 'هضمى'],
        symptomsEn: ['Stomach Ache / Acid Reflux', 'Nausea / IBS Symptoms'],
        symptomsAr: ['ألم بالبطن والمعدة', 'ارتجاع مريء أو أعراض قولون'],
        diagnosesEn: [
            { disease: 'Gastroenteritis / Acid Reflux', confidence: 85 },
            { disease: 'Irritable Bowel Syndrome (IBS)', confidence: 75 }
        ],
        diagnosesAr: [
            { disease: 'التهاب المعدة والأمعاء / ارتجاع مريء', confidence: 85 },
            { disease: 'متلازمة القولون العصبي', confidence: 75 }
        ]
    },
    {
        specialty: 'Dentist',
        specialtyAr: 'طب الأسنان',
        keywordsEn: ['tooth', 'teeth', 'toothache', 'dentist', 'dental', 'gum', 'gums', 'cavity', 'cavities', 'filling', 'crown', 'braces', 'orthodontist', 'extraction', 'molar', 'dentistry'],
        keywordsAr: ['أسنان', 'اسنان', 'ضرس', 'أضراس', 'اضراس', 'لثة', 'لثه', 'طبيب أسنان', 'طبيب اسنان', 'تسوس', 'حشو', 'تقويم', 'خلع', 'خلع ضرس', 'اسنان'],
        symptomsEn: ['Toothache / Dental Cavity', 'Gum Bleeding / Braces'],
        symptomsAr: ['ألم بالأسنان / تسوس', 'نزيف لثة أو تقويم أسنان'],
        diagnosesEn: [
            { disease: 'Dental Cavity / Tooth Decay', confidence: 90 },
            { disease: 'Gingivitis / Gum Inflammation', confidence: 75 }
        ],
        diagnosesAr: [
            { disease: 'تسوس الأسنان / نخر الأسنان', confidence: 90 },
            { disease: 'التهاب اللثة', confidence: 75 }
        ]
    },
    {
        specialty: 'General physician',
        specialtyAr: 'الأمراض الباطنة العامة / طبيب عام',
        keywordsEn: ['fever', 'cold', 'flu', 'cough', 'sore throat', 'fatigue', 'weakness', 'tired', 'pressure', 'hypertension', 'diabetes', 'sugar', 'blood sugar', 'cholesterol', 'head cold', 'sneezing', 'general pain', 'muscle ache', 'general physician'],
        keywordsAr: ['سخونة', 'سخونه', 'حرارة', 'برد', 'إنفلونزا', 'انفلونزا', 'رشح', 'زكام', 'سعال', 'كحة', 'كحه', 'احتقان', 'حلق', 'تعب', 'إرهاق', 'ارهاق', 'ضعف', 'ضغط', 'سكر', 'سكري', 'كوليسترول', 'وجع عام', 'طبيب عام', 'باطنة', 'باطنه'],
        symptomsEn: ['General Symptoms (Fever/Fatigue)', 'Cough / Common Cold'],
        symptomsAr: ['أعراض عامة (سخونة / إعياء)', 'سعال أو نزلات البرد'],
        diagnosesEn: [
            { disease: 'General Fatigue or Common Flu/Cold', confidence: 80 }
        ],
        diagnosesAr: [
            { disease: 'إعياء عام أو نزلات البرد والإنفلونزا', confidence: 80 }
        ]
    }
];

const Chatbot = () => {
    const navigate = useNavigate();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [showWelcome, setShowWelcome] = useState(true);
    const scrollBoxRef = useRef(null);
    const textareaRef  = useRef(null);
    const [liveDocs, setLiveDocs] = useState([]);
    const [currentUser, setCurrentUser] = useState(null);

    // Load user and chatbot message history
    useEffect(() => {
        const user = TabibiAPI.getUser();
        setCurrentUser(user);

        if (user) {
            axios.get(`/api/chatbot/messages?email=${encodeURIComponent(user.email)}`)
                .then(res => {
                    if (Array.isArray(res.data) && res.data.length > 0) {
                        setMessages(res.data);
                        setShowWelcome(false);
                    }
                })
                .catch(err => {
                    console.error("Failed to load chatbot history from DB:", err);
                    const localHistory = JSON.parse(localStorage.getItem(`tabibi_chatbot_${user.email}`) || '[]');
                    if (localHistory.length > 0) {
                        setMessages(localHistory);
                        setShowWelcome(false);
                    }
                });
        } else {
            const localHistory = JSON.parse(localStorage.getItem('tabibi_chatbot_guest') || '[]');
            if (localHistory.length > 0) {
                setMessages(localHistory);
                setShowWelcome(false);
            }
        }
    }, []);

    useEffect(() => {
        const initialDocs = TabibiAPI.getDoctors();
        setLiveDocs(initialDocs);

        axios.get('/api/doctors')
            .then(res => {
                if (Array.isArray(res.data)) {
                    setLiveDocs(prevDocs => {
                        const baseDocs = prevDocs.length > 0 ? prevDocs : initialDocs;
                        const merged = [...baseDocs];
                        res.data.forEach(bd => {
                            const bdId = bd._id || bd.id;
                            const bdEmail = bd.email || (bd.userId && bd.userId.email);
                            
                            const existingIdx = merged.findIndex(d => 
                                (bdEmail && d.email === bdEmail) || 
                                (bdId && (d.id === bdId || d._id === bdId))
                            );
                            
                            const docObj = {
                                id: bdId,
                                _id: bdId,
                                name: bd.name || (bd.userId && bd.userId.name) || 'Doctor',
                                email: bdEmail || '',
                                specialty: bd.specialty || 'General physician',
                                available: bd.available !== false,
                                fee: bd.fee || 50,
                                experience: bd.experience || '1 Year',
                                img: TabibiAPI.getDoctorImage(bdEmail || bd.email || (bd.userId && bd.userId.email), bd.image || bd.img || (bd.userId && bd.userId.image)),
                                rating: bd.rating || 4.8,
                                reviewsCount: bd.reviewsCount || 0,
                                patientsTreated: bd.patientsTreated || bd.patients_treated || 0,
                                clinicAddress: bd.clinicAddress || bd.address || (bd.userId && bd.userId.address) || 'Main Clinic'
                            };
                            
                            docObj.confidenceScore = TabibiAPI.calculateConfidenceScore(docObj.rating, docObj.reviewsCount, docObj.patientsTreated);
                            
                            if (existingIdx > -1) {
                                merged[existingIdx] = { ...merged[existingIdx], ...docObj };
                            } else {
                                merged.push(docObj);
                            }
                        });
                        return merged;
                    });
                }
            })
            .catch(err => {
                console.warn("Could not fetch live doctors, using local doctors list:", err);
            });
    }, []);

    useEffect(() => {
        if (scrollBoxRef.current) {
            scrollBoxRef.current.scrollTop = scrollBoxRef.current.scrollHeight;
        }
    }, [messages]);

    const saveMessage = async (role, msgObj) => {
        const user = TabibiAPI.getUser() || currentUser;
        const msgData = {
            userEmail: user ? user.email : 'guest',
            role,
            text: msgObj.text,
            isEmergency: !!msgObj.isEmergency,
            isOfflineFallback: !!msgObj.isOfflineFallback,
            isAr: !!msgObj.isAr,
            doctors: Array.isArray(msgObj.doctors) ? msgObj.doctors : [],
            specialty: msgObj.specialty || ''
        };

        const cacheKey = user ? `tabibi_chatbot_${user.email}` : 'tabibi_chatbot_guest';
        const currentCache = JSON.parse(localStorage.getItem(cacheKey) || '[]');
        currentCache.push(msgData);
        localStorage.setItem(cacheKey, JSON.stringify(currentCache));

        if (user) {
            try {
                await axios.post('/api/chatbot/messages', msgData);
            } catch (err) {
                console.error("Failed to sync chatbot message to DB:", err);
            }
        }
    };

    const handleNewChat = () => {
        setMessages([]);
        setShowWelcome(true);
        const user = TabibiAPI.getUser() || currentUser;
        if (user) {
            axios.delete(`/api/chatbot/messages?email=${encodeURIComponent(user.email)}`)
                .catch(err => console.error("Failed to clear chatbot messages:", err));
            localStorage.removeItem(`tabibi_chatbot_${user.email}`);
        } else {
            localStorage.removeItem('tabibi_chatbot_guest');
        }
    };

    const sendMsg = async (textOverride) => {
        const val = (textOverride || input).trim();
        if (!val) return;
        setShowWelcome(false);
        setInput('');
        if (textareaRef.current) textareaRef.current.style.height = '48px';

        const userMsg = { role: 'user', text: val };
        setMessages(prev => [...prev, userMsg]);
        saveMessage('user', userMsg);

        const lower = val.toLowerCase();
        const isAr = /[\u0600-\u06FF]/.test(val);

        const emergencyEnRegex = /\b(severe\s*chest\s*pain|pain\s*in\s*my\s*chest\s*is\s*severe|suicidal|suicide|kill\s*myself|want\s*to\s*die|stroke|facial\s*droop|paralysis|coughing\s*blood)\b/i;
        const emergencyArRegex = /(الم\s*شديد\s*في\s*الصدر|الم\s*صدر\s*شديد|وجع\s*شديد\s*في\s*الصدر|انتحار|اموت\s*نفسي|جلطة\s*مخ|جلطه\s*مخ|شلل|كحة\s*دم|كحه\s*دم|ضيق\s*تنفس\s*شديد|اختناق)/i;
        const isEmergency = emergencyEnRegex.test(lower) || emergencyArRegex.test(lower);
        
        if (isEmergency) {
            const typingId = Date.now();
            setMessages(prev => [...prev, { role: 'ai', typing: true, id: typingId }]);
            
            const text = isAr 
                ? "<div style='direction: rtl; text-align: right; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>" +
                  "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> تحذير حالة طبية حرجة!</h4>" +
                  "<p style='color: #991B1B; font-weight: 600; margin-bottom: 8px;'>لقد تم اكتشاف مؤشرات على حالة طوارئ طبية محتملة.</p>" +
                  "<p style='color: #7F1D1D; font-size: 14px; margin-bottom: 12px;'>برجاء عدم الانتظار وتلقي الرعاية الطبية الفورية! توجه فوراً إلى أقرب قسم طوارئ أو اتصل بالإسعاف (999) للحصول على المساعدة اللازمة دون تأخير.</p>" +
                  "<p style='font-size: 12px; color: #B91C1C; border-top: 1px dashed #FCA5A5; padding-top: 8px;'><em>ملاحظة: هذا التحذير مبني على الكلمات الافتتاحية المدخلة لتأمين سلامتك ولا يغني عن التدخل الطبي الطارئ.</em></p>" +
                  "</div>"
                : "<div style='direction: ltr; text-align: left; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>" +
                  "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> Critical Medical Emergency Warning!</h4>" +
                  "<p style='color: #991B1B; font-weight: 600; margin-bottom: 8px;'>Indicators of a potential severe or life-threatening medical emergency were detected.</p>" +
                  "<p style='color: #7F1D1D; font-size: 14px; margin-bottom: 12px;'>Please seek immediate medical attention! Go to the nearest emergency room or call emergency services (999) immediately. Do not wait for an online consultation.</p>" +
                  "<p style='font-size: 12px; color: #B91C1C; border-top: 1px dashed #FCA5A5; padding-top: 8px;'><em>Disclaimer: This alert is triggered based on critical keywords to prioritize your safety and must not delay professional emergency services.</em></p>" +
                  "</div>";
                  
            setTimeout(() => {
                const aiMsg = { role: 'ai', text, isEmergency: true };
                setMessages(prev => {
                    const filtered = prev.filter(m => m.id !== typingId);
                    return [...filtered, aiMsg];
                });
                saveMessage('ai', aiMsg);
            }, 600);
            return;
        }

        const greetingEnRegex = /\b(hi|hello|hey|greetings|welcome|good\s*morning|good\s*evening|good\s*afternoon)\b/i;
        const greetingArRegex = /(مرحبا|اهلا|اهلاً|السلام\s*عليكم|صباح\s*الخير|مساء\s*الخير|هلا)/i;
        const isGreeting = greetingEnRegex.test(lower) || greetingArRegex.test(lower) || ['hi', 'hello', 'hey', 'مرحبا', 'أهلاً', 'اهلا'].includes(lower.trim());
        
        if (isGreeting) {
            const typingId = Date.now();
            setMessages(prev => [...prev, { role: 'ai', typing: true, id: typingId }]);
            const text = isAr
                ? "<div style='direction: rtl; text-align: right; line-height: 1.6;'>" +
                  "أهلاً بك! أنا شِفاء، مساعدك الطبي الذكي. كيف يمكنني مساعدتك اليوم؟ " +
                  "يمكنك وصف الأعراض التي تشعر بها (مثال: أشعر بصداع شديد وتنميل)، أو سؤالي عن طريقة حجز المواعيد وإلغائها." +
                  "</div>"
                : "<div style='direction: ltr; text-align: left; line-height: 1.6;'>" +
                  "Hello! I am Shifaa, your intelligent medical assistant. How can I help you today? " +
                  "You can describe your symptoms (e.g. 'I have chest pain and shortness of breath') to find the right specialist, or ask me for help booking/cancelling appointments." +
                  "</div>";
            setTimeout(() => {
                const aiMsg = { role: 'ai', text };
                setMessages(prev => {
                    const filtered = prev.filter(m => m.id !== typingId);
                    return [...filtered, aiMsg];
                });
                saveMessage('ai', aiMsg);
            }, 600);
            return;
        }

        const bookEnRegex = /\b(how\s*to\s*book|booking|book\s*appointment|book\s*doctor|create\s*booking)\b/i;
        const bookArRegex = /(كيف\s*احجز|طريقة\s*الحجز|حجز\s*موعد|عايز\s*احجز|احجز\s*ازاي|احجز\s*ازاى|كيفية\s*الحجز)/i;
        const isBook = bookEnRegex.test(lower) || bookArRegex.test(lower);
        
        if (isBook) {
            const typingId = Date.now();
            setMessages(prev => [...prev, { role: 'ai', typing: true, id: typingId }]);
            const text = isAr
                ? "<div style='direction: rtl; text-align: right; line-height: 1.6;'>" +
                  "<h4 style='color: #2563EB; margin-bottom: 8px;'><i class='fas fa-calendar-alt'></i> طريقة حجز موعد جديد:</h4>" +
                  "<ol style='margin: 0; padding-right: 20px;'>" +
                  "<li>قم بوصف أعراضك لي وسأقوم بترشيح التخصص والأطباء المناسبين لك فوراً.</li>" +
                  "<li>أو انتقل إلى صفحة <strong>دليل الأطباء (Doctors)</strong> من القائمة الجانبية أو العلوية.</li>" +
                  "<li>اختر الطبيب المناسب واضغط على زر <strong>حجز الآن (Book Now)</strong>.</li>" +
                  "<li>اختر التاريخ والوقت المناسبين لك، ثم أكد الحجز!</li>" +
                  "</ol>" +
                  "</div>"
                : "<div style='direction: ltr; text-align: left; line-height: 1.6;'>" +
                  "<h4 style='color: #2563EB; margin-bottom: 8px;'><i class='fas fa-calendar-alt'></i> How to Book an Appointment:</h4>" +
                  "<ol style='margin: 0; padding-left: 20px;'>" +
                  "<li>Describe your symptoms to me, and I will recommend the right department and doctors instantly.</li>" +
                  "<li>Or visit the <strong>Doctors Directory</strong> from the navigation menu.</li>" +
                  "<li>Find your preferred doctor and click the <strong>Book Now</strong> button.</li>" +
                  "<li>Choose an available date and time slot, then confirm your booking!</li>" +
                  "</ol>" +
                  "</div>";
            setTimeout(() => {
                const aiMsg = { role: 'ai', text };
                setMessages(prev => {
                    const filtered = prev.filter(m => m.id !== typingId);
                    return [...filtered, aiMsg];
                });
                saveMessage('ai', aiMsg);
            }, 600);
            return;
        }

        const cancelEnRegex = /\b(how\s*to\s*cancel|cancel\s*appointment|cancel\s*booking|delete\s*appointment|delete\s*booking)\b/i;
        const cancelArRegex = /(كيف\s*الغي\s*الحجز|كيف\s*الغي|الغاء\s*الحجز|الغي\s*موعد|عايز\s*الغي|الغي\s*ازاي|الغي\s*ازاى|كيفية\s*الغاء)/i;
        const isCancel = cancelEnRegex.test(lower) || cancelArRegex.test(lower);
        
        if (isCancel) {
            const typingId = Date.now();
            setMessages(prev => [...prev, { role: 'ai', typing: true, id: typingId }]);
            const text = isAr
                ? "<div style='direction: rtl; text-align: right; line-height: 1.6;'>" +
                  "<h4 style='color: #DC2626; margin-bottom: 8px;'><i class='fas fa-times-circle'></i> كيفية إلغاء حجز موعد:</h4>" +
                  "<ol style='margin: 0; padding-right: 20px;'>" +
                  "<li>انتقل إلى صفحة <strong>مواعيدي (My Appointments)</strong> من شريط التنقل الجانبي.</li>" +
                  "<li>ابحث عن الموعد الذي ترغب في إلغائه في قائمة المواعيد النشطة.</li>" +
                  "<li>اضغط على زر <strong>إلغاء الحجز (Cancel Appointment)</strong> الموجود بجانب تفاصيل الموعد.</li>" +
                  "<li>قم بتأكيد الإلغاء في النافذة المنبثقة، وسيتم إزالة الموعد فوراً.</li>" +
                  "</ol>" +
                  "</div>"
                : "<div style='direction: ltr; text-align: left; line-height: 1.6;'>" +
                  "<h4 style='color: #DC2626; margin-bottom: 8px;'><i class='fas fa-times-circle'></i> How to Cancel an Appointment:</h4>" +
                  "<ol style='margin: 0; padding-left: 20px;'>" +
                  "<li>Navigate to the <strong>My Appointments</strong> page from the sidebar menu.</li>" +
                  "<li>Find the active appointment you wish to cancel.</li>" +
                  "<li>Click the <strong>Cancel Appointment</strong> button next to the appointment details.</li>" +
                  "<li>Confirm the cancellation in the pop-up modal, and the slot will be cleared instantly.</li>" +
                  "</ol>" +
                  "</div>";
            setTimeout(() => {
                const aiMsg = { role: 'ai', text };
                setMessages(prev => {
                    const filtered = prev.filter(m => m.id !== typingId);
                    return [...filtered, aiMsg];
                });
                saveMessage('ai', aiMsg);
            }, 600);
            return;
        }

        const typingId = Date.now();
        setMessages(prev => [...prev, { role: 'ai', typing: true, id: typingId }]);

        try {
            const res = await axios.post('/api/recommend-doc', { symptoms: val });
            const result = res.data;

            let aiMsg = {};
            if (result.status === 'conversational') {
                aiMsg = { role: 'ai', text: result.message };
            } else if (result.error) {
                aiMsg = { role: 'ai', text: result.error };
            } else if (result.status === 'emergency') {
                aiMsg = { role: 'ai', text: result.message, isEmergency: true };
            } else {
                const rawSpecialty = result.top_specialty || 'General physician';
                const normalizedSpecialty = SPECIALTY_MAP[rawSpecialty.toLowerCase()] || rawSpecialty;

                const allDocs = liveDocs.length > 0 ? liveDocs : TabibiAPI.getDoctors();
                const matchedDocs = allDocs.filter(d => {
                    const docSpec = (d.specialty || '').toLowerCase();
                    const targetSpec = normalizedSpecialty.toLowerCase();
                    return docSpec === targetSpec || SPECIALTY_MAP[docSpec] === SPECIALTY_MAP[targetSpec];
                });

                if (matchedDocs.length === 0) {
                    TabibiAPI.logActivity('Missing Specialty', `System lacks active doctors for predicted specialty: ${normalizedSpecialty}`);
                }

                aiMsg = {
                    role: 'ai',
                    text: result.message || `Based on your symptoms, I recommend consulting a specialist in <strong>${normalizedSpecialty}</strong>.`,
                    doctors: matchedDocs,
                    specialty: normalizedSpecialty,
                };
            }

            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== typingId);
                return [...filtered, aiMsg];
            });
            saveMessage('ai', aiMsg);
        } catch (error) {
            console.warn("Django AI Backend offline or failed. Running fallback...", error);
            
            let reportMsg = "";
            if (isAr) {
                reportMsg = "<div style='direction: rtl; text-align: right; line-height: 1.6;'>" +
                            "<h4 style='color: #D97706; font-size: 17px; margin-bottom: 8px;'><i class='fas fa-exclamation-circle' style='margin-left: 6px;'></i> عذراً، خدمة الفرز والتشخيص الطبي غير متصلة الآن</h4>" +
                            "<p style='margin-bottom: 12px; color: #4B5563;'>أواجه صعوبة في الاتصال بخدمة تحليل الفرز الطبي المعتمدة على الذكاء الاصطناعي حالياً. لتوجيهك بشكل أفضل، يمكنك اختيار القسم الذي تحتاجه مباشرة من الخيارات بالأسفل لعرض أطبائنا المتوفرين فوراً:</p>" +
                            "</div>";
            } else {
                reportMsg = "<div style='direction: ltr; text-align: left; line-height: 1.6;'>" +
                            "<h4 style='color: #D97706; font-size: 17px; margin-bottom: 8px;'><i class='fas fa-exclamation-circle' style='margin-right: 6px;'></i> AI triage service is currently offline</h4>" +
                            "<p style='margin-bottom: 12px; color: #4B5563;'>I am having trouble connecting to my AI triage service right now. To help you find the correct care, please select one of the departments below to see our available doctors immediately:</p>" +
                            "</div>";
            }

            const aiMsg = {
                role: 'ai',
                text: reportMsg,
                isOfflineFallback: true,
                isAr: isAr
            };

            setMessages(prev => {
                const filtered = prev.filter(m => m.id !== typingId);
                return [...filtered, aiMsg];
            });
            saveMessage('ai', aiMsg);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    };

    const handleInput = (e) => {
        setInput(e.target.value);
        e.target.style.height = '48px';
        e.target.style.height = e.target.scrollHeight + 'px';
    };

    return (
        <div id="chatbot-root">
            <div className="app-container">
                {/* SIDEBAR */}
                <aside className="cb-sidebar">
                    <button className="btn-new" onClick={handleNewChat}>
                        <i className="fas fa-plus"></i> New Chat
                    </button>

                    <div className="sb-group">
                        <div className="sb-label">Recent History</div>
                        <div className="sb-link active"><i className="far fa-comment"></i> General consultation</div>
                        <div className="sb-link"><i className="far fa-comment"></i> Booking help</div>
                    </div>

                    <div className="sb-group">
                        <div className="sb-label">Systems</div>
                        <div className="sb-link" onClick={() => navigate('/doctors')}><i className="fas fa-user-md"></i> Doctors Directory</div>
                        <div className="sb-link" onClick={() => navigate('/admin')}><i className="fas fa-chart-line"></i> Appointment Logs</div>
                    </div>

                    <button className="emergency-btn">
                        <i className="fas fa-phone"></i> Emergency Contact: 999
                    </button>
                </aside>

                {/* MAIN CHAT */}
                <main className="main-chat">
                    <header className="chat-header-mini">
                        <div className="status-dot"></div>
                        <span className="status-text">Shifaa AI Online</span>
                    </header>

                    <div className="scroll-box" ref={scrollBoxRef}>
                        <div className="chat-centered">
                            {/* Welcome */}
                            {showWelcome && (
                                <div className="welcome-hero">
                                    <div className="shifaa-icon-sq">
                                        <img src="/assets/images/shifa.jpg" alt="Shifaa AI" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                                    </div>
                                    <h1>Hello, I'm Shifaa</h1>
                                    <p>Your intelligent healthcare assistant. I can help you find doctors, understand symptoms, or guide you through the booking process.</p>
                                    <div className="suggest-grid">
                                        <div className="suggest-item" onClick={() => sendMsg('I want to book an appointment')}>
                                            <i className="fas fa-calendar-check"></i>
                                            <strong>Book an appointment</strong>
                                            <span>Step-by-step guidance</span>
                                        </div>
                                        <div className="suggest-item" onClick={() => sendMsg('Find the best specialists')}>
                                            <i className="fas fa-user-md"></i>
                                            <strong>Find specialists</strong>
                                            <span>Search across disciplines</span>
                                        </div>
                                        <div className="suggest-item" onClick={() => sendMsg('General health tips')}>
                                            <i className="fas fa-lightbulb"></i>
                                            <strong>Health tips</strong>
                                            <span>For a better lifestyle</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Messages */}
                            {messages.map((msg, idx) => (
                                <div key={msg.id || idx} className={`msg-container ${msg.role}`}>
                                    {msg.role === 'user' ? (
                                        <div className="bubble-user">{msg.text}</div>
                                    ) : (
                                        <div className="ai-inner">
                                            <div className="ai-avatar">
                                                <img src="/assets/images/shifa.jpg" alt="Shifaa AI" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
                                            </div>
                                            <div className="ai-box">
                                                <div className="ai-card">
                                                    {msg.typing ? (
                                                        <div className="typing-dots"><span></span><span></span><span></span></div>
                                                    ) : (
                                                        <div dangerouslySetInnerHTML={{ __html: msg.text }} />
                                                    )}
                                                </div>

                                                {!msg.typing && msg.isOfflineFallback && (
                                                    <div style={{ marginTop: '12px' }}>
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginTop: '10px' }}>
                                                            <button className="btn-book" style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: '1.5px solid #2563EB', borderRadius: '10px', background: '#F8FAFC', width: '100%', height: 'auto', minHeight: '60px', justifyContent: 'center' }} onClick={() => sendMsg(msg.isAr ? 'طبيب عام باطنة' : 'General physician')}>
                                                                <i className="fas fa-user-md" style={{ color: '#2563EB', fontSize: '18px', marginBottom: '4px' }}></i>
                                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>{msg.isAr ? 'طبيب عام / باطنة' : 'General Practice'}</span>
                                                            </button>
                                                            <button className="btn-book" style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: '1.5px solid #059669', borderRadius: '10px', background: '#F8FAFC', width: '100%', height: 'auto', minHeight: '60px', justifyContent: 'center' }} onClick={() => sendMsg(msg.isAr ? 'اطفال حديثي الولادة' : 'Pediatrician')}>
                                                                <i className="fas fa-baby" style={{ color: '#059669', fontSize: '18px', marginBottom: '4px' }}></i>
                                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>{msg.isAr ? 'طب الأطفال' : 'Pediatrics'}</span>
                                                            </button>
                                                            <button className="btn-book" style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: '1.5px solid #D97706', borderRadius: '10px', background: '#F8FAFC', width: '100%', height: 'auto', minHeight: '60px', justifyContent: 'center' }} onClick={() => sendMsg(msg.isAr ? 'حساسية جلدية وهرش' : 'Dermatologist')}>
                                                                <i className="fas fa-hand-holding-medical" style={{ color: '#D97706', fontSize: '18px', marginBottom: '4px' }}></i>
                                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>{msg.isAr ? 'الأمراض الجلدية' : 'Dermatology'}</span>
                                                            </button>
                                                            <button className="btn-book" style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: '1.5px solid #7C3AED', borderRadius: '10px', background: '#F8FAFC', width: '100%', height: 'auto', minHeight: '60px', justifyContent: 'center' }} onClick={() => sendMsg(msg.isAr ? 'صداع واعصاب' : 'Neurologist')}>
                                                                <i className="fas fa-brain" style={{ color: '#7C3AED', fontSize: '18px', marginBottom: '4px' }}></i>
                                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>{msg.isAr ? 'المخ والأعصاب' : 'Neurology'}</span>
                                                            </button>
                                                            <button className="btn-book" style={{ padding: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', border: '1.5px solid #EC4899', borderRadius: '10px', background: '#F8FAFC', width: '100%', height: 'auto', minHeight: '60px', justifyContent: 'center' }} onClick={() => sendMsg(msg.isAr ? 'حامل وولادة نساء' : 'Gynecologist')}>
                                                                <i className="fas fa-female" style={{ color: '#EC4899', fontSize: '18px', marginBottom: '4px' }}></i>
                                                                <span style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>{msg.isAr ? 'النساء والتوليد' : 'Gynecology'}</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {!msg.typing && msg.doctors && msg.doctors.length > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: '13px', fontWeight: 600, margin: '10px 0 8px' }}>Here are some top-rated doctors for you:</div>
                                                        {msg.doctors.map(doc => (
                                                            <div key={doc.id} className="doc-profile-card">
                                                                <img src={doc.photo_url || '/assets/images/M1.png'} className="doc-img" alt={doc.name} onError={e => e.target.src='/assets/images/M1.png'} />
                                                                <div className="doc-info">
                                                                    <h4>{doc.name}</h4>
                                                                    <p>{doc.specialty} &bull; ⭐ {doc.rating} &bull; 🛡️ {doc.confidence_score || doc.confidenceScore || 0}% Trust</p>
                                                                    <button className="btn-book" onClick={() => navigate(`/appointment?id=${doc.id}`)}>Book Now</button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {!msg.typing && msg.specialty && (!msg.doctors || msg.doctors.length === 0) && !msg.isOfflineFallback && (
                                                    <div style={{ marginTop: '10px' }}>
                                                        I don't have a {msg.specialty} in my current list, but you can check all our doctors here:<br />
                                                        <button className="btn-book" style={{ width: 'auto', padding: '8px 16px', marginTop: '8px' }} onClick={() => navigate('/doctors')}>View All Doctors</button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Input Footer */}
                    <footer className="footer-shifaa">
                        <div className="input-wrap">
                            <button className="ic-btn" title="Add file">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                </svg>
                            </button>
                            <textarea
                                ref={textareaRef}
                                placeholder="Message Shifaa AI..."
                                value={input}
                                onChange={handleInput}
                                onKeyDown={handleKeyPress}
                            />
                            <button className="btn-send" onClick={() => sendMsg()}><i className="fas fa-arrow-up"></i></button>
                        </div>
                        <p className="disclaimer">Shifaa can make mistakes. Consider checking important information.</p>
                    </footer>
                </main>
            </div>
        </div>
    );
};

export default Chatbot;
