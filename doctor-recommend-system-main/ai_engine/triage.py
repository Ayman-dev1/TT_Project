import re
import csv
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASETS_DIR = os.path.join(os.path.dirname(BASE_DIR), 'datasets')

# 1. Load descriptions
DESCRIPTIONS = {}
desc_path = os.path.join(DATASETS_DIR, 'symptom_Description.csv')
if os.path.exists(desc_path):
    with open(desc_path, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader, None) # skip header
        for row in reader:
            if len(row) >= 2:
                disease = row[0].strip().lower()
                description = row[1].strip()
                DESCRIPTIONS[disease] = description

# 2. Load precautions
PRECAUTIONS = {}
prec_path = os.path.join(DATASETS_DIR, 'symptom_precaution.csv')
if os.path.exists(prec_path):
    with open(prec_path, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader, None) # skip header
        for row in reader:
            if len(row) >= 5:
                disease = row[0].strip().lower()
                precs = [p.strip() for p in row[1:5] if p.strip()]
                PRECAUTIONS[disease] = precs

# 3. Load symptom severity
SEVERITY = {}
sev_path = os.path.join(DATASETS_DIR, 'Symptom-severity.csv')
if os.path.exists(sev_path):
    with open(sev_path, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader, None) # skip header
        for row in reader:
            if len(row) >= 2:
                symptom = row[0].strip().lower().replace(' ', '_')
                try:
                    weight = int(row[1].strip())
                    SEVERITY[symptom] = weight
                except ValueError:
                    pass

PRECAUTION_TRANSLATIONS = {
    "stop irritation": "إيقاف التهيج ومثيرات الحساسية",
    "consult nearest hospital": "استشارة أقرب مستشفى فوراً",
    "stop taking drug": "التوقف عن تناول الدواء المسبب للأعراض",
    "follow up": "المتابعة المستمرة مع الطبيب المختص",
    "avoid oily food": "تجنب الأطعمة الدهنية والمقلية",
    "avoid non veg food": "تجنب الأطعمة غير النباتية والثقيلة",
    "keep mosquitos out": "تجنب لدغات البعوض واستخدم طارد الحشرات",
    "apply calamine": "ضع غسول الكالامين الملطف للجلد",
    "cover area with bandage": "تغطية المنطقة المصابة بضمادة معقمة",
    "use ice to compress itching": "استخدام كمادات الثلج لتخفيف الحكة",
    "reduce stress": "تقليل التوتر وممارسة تمارين الاسترخاء",
    "exercise": "ممارسة التمارين الرياضية بانتظام",
    "eat healthy": "تناول غذاء صحي ومتوازن",
    "get proper sleep": "الحصول على قسط كافٍ من النوم والراحة",
    "wash hands with warm soapy water": "غسل اليدين جيداً بالماء الدافئ والصابون",
    "stop bleeding using pressure": "إيقاف أي نزيف بالضغط الخفيف بالقطن",
    "consult doctor": "استشارة الطبيب المختص للمتابعة",
    "salt baths": "الاستحمام بماء دافئ مضاف إليه ملح",
    "avoid fatty spicy food": "تجنب الأطعمة الدسمة والحارة",
    "avoid lying down after eating": "تجنب الاستلقاء أو النوم بعد الأكل مباشرة",
    "maintain healthy weight": "الحفاظ على وزن صحي ومثالي",
    "cold baths": "الاستحمام بالماء البارد لتهدئة الجلد",
    "anti itch medicine": "استخدام الأدوية المضادة للحكة (مضادات الهيستامين)",
    "wash hands through": "غسل اليدين جيداً وباستمرار",
    "medication": "الالتزام بالأدوية الموصوفة بدقة",
    "acetaminophen": "تناول الباراسيتامول لتخفيف الألم والحرارة",
    "lie down": "الاستلقاء والراحة التامة",
    "avoid sudden change in body": "تجنب التغيرات المفاجئة في وضعية الجسم",
    "avoid abrupt head movment": "تجنب الحركات المفاجئة للرأس",
    "relax": "الاسترخاء والابتعاد عن الإجهاد",
    "lie down on side": "الاستلقاء على الجانب والراحة",
    "check in pulse": "فحص معدل ضربات القلب بانتظام",
    "drink sugary drinks": "تناول مشروبات سكرية لرفع مستوى السكر",
    "bath twice": "الاستحمام مرتين يومياً للحفاظ على النظافة",
    "drink plenty of water": "شرب كميات وفيرة من الماء والسوائل",
    "avoid too many products": "تجنب استخدام الكثير من منتجات البشرة والكيميائيات",
    "have balanced diet": "اتباع نظام غذائي متوازن وغني بالألياف",
    "soak affected area in warm water": "نقع المنطقة المصابة في ماء دافئ",
    "use antibiotics": "استخدام الكريمات أو المضادات الحيوية الموصوفة",
    "remove scabs with wet compressed cloth": "إزالة القشور بلطف باستخدام قطعة قماش مبللة",
    "meditation": "ممارسة التأمل لتقليل الضغط العصبي",
    "consume probiotic food": "تناول الأطعمة الغنية بالبروبيوتيك (مثل الزبادي)",
    "eliminate milk": "تجنب تناول الحليب مؤقتاً لتقليل الغازات",
    "limit alcohol": "الامتناع التام عن المشروبات الكحولية",
    "consume witch hazel": "استخدام بندق الساحرة (Witch Hazel) الملطف للالتهابات",
    "warm bath with epsom salt": "حمام دافئ بملح إبسوم الملطف",
    "consume alovera juice": "تناول عصير الصبار الطبيعي المهدئ",
    "drink vitamin c rich drinks": "شرب المشروبات الغنية بفيتامين سي (ليمون، برتقال)",
    "take vapour": "عمل استنشاق لبخار الماء الدافئ لتسليك المجاري الهوائية",
    "avoid cold food": "تجنب الأطعمة والمشروبات الباردة",
    "keep fever in check": "مراقبة درجة الحرارة باستمرار",
    "use neem in bathing": "استخدام نبات النيم في ماء الاستحمام لمكافحة الالتهاب",
    "consume neem leaves": "تناول شاي أو أوراق النيم الطبية الملطفة",
    "take vaccine": "أخذ اللقاحات الوقائية اللازمة",
    "avoid public places": "تجنب الأماكن العامة المزدحمة لمنع نقل العدوى",
    "use heating pad or cold pack": "استخدام كمادات دافئة أو باردة على مكان الألم",
    "take otc pain reliver": "تناول مسكنات الألم المتاحة دون وصفة عند الحاجة",
    "massage": "عمل تدليك خفيف للمنطقة المتأثرة لتنشيط الدورة الدموية",
    "use lemon balm": "استخدام عشبة مليسة (Lemon balm) المهدئة",
    "take radioactive iodine treatment": "متابعة علاج اليود المشع الموصوف للغدة",
    "increase vitamin c intake": "زيادة تناول فيتامين سي لتعزيز المناعة",
    "drink cranberry juice": "شرب عصير التوت البري لمنع التهابات المسالك البولية",
    "take probiotics": "تناول المكملات الغذائية الداعمة للبكتيريا النافعة",
    "lie down flat and raise the leg high": "الاستلقاء بشكل مسطح ورفع الساقين لأعلى",
    "use oinments": "استخدام الدهانات والمراهم الطبية الموصوفة",
    "use vein compression": "ارتداء الجوارب الضاغطة المخصصة للدوالي",
    "dont stand still for long": "تجنب الوقوف أو الجلوس لفترات طويلة دون حركة",
    "avoid open cuts": "الحذر وتجنب الجروح المفتوحة والوقاية منها",
    "wear ppe if possible": "ارتداء أدوات الوقاية الشخصية لتفادي نقل العدوى",
    "eat high calorie vegitables": "تناول الخضروات المغذية والغنية بالسعرات الحرارية",
    "antiboitic therapy": "الالتزام بالعلاج المضاد للميكروبات الموصوف",
    "vaccination": "الحرص على أخذ اللقاحات والجرعات التنشيطية",
    "use detol or neem in bathing water": "استخدام مطهرات خفيفة أو النيم في ماء الاستحمام",
    "keep infected area dry": "الحفاظ على جفاف ونظافة المنطقة المصابة بالفطريات",
    "use clean cloths": "ارتداء ملابس نظيفة وقطنية وتجنب المشاركة",
    "use poloroid glasses in sun": "ارتداء نظارات شمسية لحماية العين من الضوء الساطع",
    "switch to loose cloothing": "ارتداء ملابس فضفاضة ومريحة",
    "take deep breaths": "أخذ أنفاس عميقة لتهدئة الرئتين",
    "get away from trigger": "الابتعاد فوراً عن مسببات الحساسية أو الغبار",
    "seek help": "طلب المساعدة الطبية أو العائلية على الفور",
    "stop alcohol consumption": "الامتناع التام والنهائي عن الكحوليات",
    "consume milk thistle": "تناول عشبة حليب الشوك (Milk thistle) المفيدة للكبد",
    "eat fruits and high fiberous food": "تناول الفواكه والأطعمة الغنية بالألياف الطبيعية",
    "drink papaya leaf juice": "شرب مستخلص أوراق البابايا لدعم الصفائح الدموية",
    "keep mosquitos away": "تجنب لدغات البعوض ورش الغرفة بمبيدات آمنة",
    "keep hydrated": "شرب السوائل بكثرة لمنع الجفاف ومكافحة الحمى",
    "chew or swallow asprin": "مضغ أو بلع حبة أسبرين فوراً (إذا كان مصرحاً به)",
    "keep calm": "محاولة الهدوء والتنفس بانتظام لتخفيف الضغط عن القلب",
    "try acupuncture": "تجربة العلاج بالإبر الصينية لتخفيف الآلام المزمنة",
    "stop eating solid food for while": "التوقف مؤقتاً عن تناول الأطعمة الصلبة لراحة الأمعاء",
    "try taking small sips of water": "أخذ رشفات صغيرة من الماء بانتظام لمنع الجفاف",
    "ease back into eating": "العودة للغذاء تدريجياً بأطعمة خفيفة (كالشربة والمسلوق)",
    "cover mouth": "تغطية الفم والأنف عند السعال لحماية الآخرين"
}

DISEASE_DESCRIPTION_TRANSLATIONS = {
    "drug reaction": "رد فعل تحسسي ناتج عن تناول أدوية معينة، قد يظهر على شكل طفح جلدي أو حكة أو صعوبة تنفس.",
    "malaria": "مرض معدٍ ينتقل عن طريق لدغات البعوض الحامل للمرض، يسبب حمى شديدة، رعشة، وصداع.",
    "allergy": "تفاعل مفرط من جهاز المناعة تجاه مواد خارجية غير ضارة عادة، مثل حبوب اللقاح أو الأتربة أو أطعمة معينة.",
    "hypothyroidism": "اضطراب ينتج عن خمول الغدة الدرقية وعدم إفرازها كميات كافية من الهرمونات، مما يسبب خمولاً وزيادة في الوزن.",
    "psoriasis": "مرض جلدي مناعي مزمن يسبب تسارع تراكم الخلايا على السطح، مما يشكل قشوراً فضية وبقعاً حمراء مثيرة للحكة.",
    "gerd": "ارتجاع حمض المعدة إلى المريء، مما يسبب تهيجاً للبطانة وشعوراً بالحرقان في الصدر (الحموضة).",
    "chronic cholestasis": "حالة تتصف بضعف أو توقف تدفق العصارة الصفراوية من الكبد إلى الأمعاء، مما قد يسبب يرقاناً وحكة جلدية.",
    "hepatitis a": "عدوى فيروسية شديدة العدوى تصيب الكبد وتسبب التهابه، تنتقل غالباً عبر الطعام أو الماء الملوث.",
    "osteoarthristis": "التهاب المفاصل التنكسي (خشونة المفاصل)، يحدث نتيجة تآكل الغضاريف الواقية عند أطراف العظام بمرور الوقت.",
    "(vertigo) paroymsal  positional vertigo": "دوار الوضعية الانتيابي الحميد، يسبب شعوراً مفاجئاً بالدوران أو أن رأسك يدور مع حركة معينة.",
    "hypoglycemia": "حالة ينخفض فيها مستوى السكر (الجلوكوز) في الدم عن المعدل الطبيعي، مما يسبب دوخة، تعرقاً، وخفقاناً.",
    "acne": "حب الشباب؛ حالة جلدية شائعة تحدث عند انسداد بصيلات الشعر بالزيوت وخلايا الجلد الميتة، مما يسبب بثوراً ورؤوساً سوداء.",
    "diabetes": "مرض مزمن يؤثر على كيفية معالجة الجسم لسكر الدم (الجلوكوز)، وينتج عن نقص الأنسولين أو مقاومة خلاياه له.",
    "diabetes ": "مرض مزمن يؤثر على كيفية معالجة الجسم لسكر الدم (الجلوكوز)، وينتج عن نقص الأنسولين أو مقاومة خلاياه له.",
    "impetigo": "عدوى جلدية بكتيرية شديدة العدوى، تصيب الرضع والأطفال عادة وتظهر كقروح حمراء حول الأنف والفم.",
    "hypertension": "ارتفاع ضغط الدم في الشرايين بشكل مستمر ومزمن، ويتطلب متابعة لمنع مضاعفات في الكلى والقلب.",
    "peptic ulcer diseae": "قرحة هضمية؛ تقرحات تصيب البطانة الداخلية للمعدة أو الجزء الأول من الأمعاء الدقيقة (الاثني عشر).",
    "dimorphic hemorrhoids(piles)": "البواسير؛ أوعية دموية متسعة ومنتفخة في القناة الشرجية تسبب ألماً أو حكة أو نزيفاً خفيفاً.",
    "common cold": "نزلات البرد؛ عدوى فيروسية تصيب الجهاز التنفسي العلوي (الأنف والحلق)، وتعد حالة شائعة وغالباً غير خطيرة.",
    "chicken pox": "الجديري المائي؛ عدوى فيروسية سريعة الانتقال تسبب طفحاً جلدياً مثيراً للحكة على شكل بثور صغيرة مملوءة بالسوائل.",
    "cervical spondylosis": "داء المفاصل العنقية؛ خشونة وتآكل يصيب فقرات الرقبة وغضاريفها نتيجة التقدم في العمر.",
    "hyperthyroidism": "فرط نشاط الغدة الدرقية؛ حالة تفرز فيها الغدة كميات زائدة من هرمون الثايروكسين، مما يسرع عملية التمثيل الغذائي.",
    "urinary tract infection": "التهاب المسالك البولية؛ عدوى تصيب أي جزء من الجهاز البولي (الكلى، الحالبين، المثانة، أو مجرى البول).",
    "varicose veins": "دوالي الساقين؛ أوردة متسعة ومتعرجة تظهر زرقاء داكنة تحت الجلد نتيجة ضعف الصمامات الوريدية.",
    "aids": "متلازمة نقص المناعة المكتسب (الإيدز)؛ حالة مزمنة مهددة للحياة يسببها فيروس HIV الذي يهاجم جهاز المناعة.",
    "paralysis (brain hemorrhage)": "شلل ناتج عن نزيف دماغي؛ يحدث عند انفجار وعاء دموي بالدماغ مما يسبب تلف الخلايا وفقدان الحركة.",
    "typhoid": "حمى التيفويد؛ عدوى بكتيرية خطيرة تسببها بكتيريا السالمونيلا، وتنتقل عبر الطعام أو الماء الملوث.",
    "hepatitis b": "التهاب الكبد الوبائي (ب)؛ عدوى فيروسية خطيرة تصيب الكبد وتنتقل عن طريق الدم أو السوائل الملوثة للفيروس.",
    "fungal infection": "عدوى فطرية تصيب مناطق معينة في الجسم (كالجلد أو الأظافر)، وتحدث عندما يتغلب الفطر على مناعة الجسم.",
    "hepatitis c": "التهاب الكبد الوبائي (سي)؛ عدوى فيروسية تصيب الكبد وتسبب التهابه، وتنتقل عبر الدم الملوث بالفيروس غالباً.",
    "migraine": "الصداع النصفي؛ نوبات ألم شديدة نابضة تصيب عادةً جانباً واحداً من الرأس وترافقها حساسية للضوء والصوت.",
    "bronchial asthma": "الربو الشعبي؛ حالة تضيق فيها المجاري الهوائية وتلتهب وتفرز مخاطاً إضافياً، مما يصعب التنفس ويسبب السعال.",
    "alcoholic hepatitis": "التهاب الكبد الكحولي؛ حالة التهابية خطيرة تصيب الكبد نتيجة استهلاك كميات كبيرة من الكحوليات لفترة طويلة.",
    "jaundice": "اليرقان (الصفراء)؛ اصفرار لون الجلد وبياض العينين نتيجة تراكم مادة البيليروبين الصفراوية في الدم.",
    "hepatitis e": "التهاب الكبد الوبائي (إي)؛ عدوى فيروسية تصيب الكبد وتنتقل عبر شرب مياه ملوثة أو تناول طعام غير مطبوخ جيداً.",
    "dengue": "حمى الضنك؛ عدوى فيروسية تنقلها لغات البعوض وتسبب حمى شديدة وصداعاً وآلاماً حادة في المفاصل والعضلات.",
    "hepatitis d": "التهاب الكبد الوبائي (دي)؛ عدوى فيروسية تصيب الكبد وتحدث فقط لدى المصابين بالتهاب الكبد من النوع (ب).",
    "heart attack": "النوبة القلبية؛ تحدث عند انسداد مجرى الدم المغذي لعضلة القلب بالكامل، مما يهدد حياة المريض ويستدعي الطوارئ.",
    "pneumonia": "الالتهاب الرئوي؛ عدوى تصيب إحدى الرئتين أو كلتيهما وتسبب امتلاء الأكياس الهوائية بالسوائل أو الصديد.",
    "arthritis": "التهاب المفاصل؛ يسبب تورماً وألماً في مفصل أو أكثر من مفاصل الجسم، وتزداد شدته عادة مع تقدم العمر.",
    "gastroenteritis": "النزلة المعوية؛ التهاب في المعدة والأمعاء الدقيقة والغليظة تسببه الفيروسات أو البكتيريا ويؤدي للقيء والإسهال.",
    "tuberculosis": "السل (الدرن)؛ مرض بكتيري معدٍ وخطير يؤثر بشكل أساسي على الرئتين ويمكن أن ينتشر لأجزاء أخرى."
}

# Specialty Mapping Database with English and Arabic Keywords and Possible Diagnoses
# Note: For Arabic keywords, we use prefix-tolerant patterns instead of strict \b boundaries
SPECIALTY_DATABASE = {
    "Cardiology": {
        "name_ar": "أمراض القلب والأوعية الدموية",
        "diagnoses_en": ["Hypertension", "Arrhythmia", "Coronary artery disease", "Heart failure", "Angina"],
        "diagnoses_ar": ["ارتفاع ضغط الدم", "عدم انتظام ضربات القلب", "قصور الشريان التاجي", "فشل عضلة القلب", "الذبحة الصدرية"],
        "keywords": [
            {"name": "chest pain", "regex_en": r"\b(chest\s*pain|heart\s*pain)\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*في\s*الصدر|وجع\s*الصدر|الم\s*الصدر|وجع\s*في\s*الصدر|الم\s*قلب|وجع\s*في\s*القلب)", "severe": True, "diagnoses": [4, 2]},
            {"name": "chest tightness", "regex_en": r"\bchest\s*tightness\b", "regex_ar": r"(?:^|[\sووبفل])(ضيق\s*في\s*الصدر|ضيق\s*الصدر|ثقل\s*في\s*الصدر|ثقل\s*الصدر)", "severe": True, "diagnoses": [4, 3]},
            {"name": "palpitations", "regex_en": r"\bpalpitations\b", "regex_ar": r"(?:^|[\sووبفل])(خفقان|رفرفة\s*في\s*القلب|رفرفه\s*في\s*القلب|ضربات\s*قلب\s*سريعة|ضربات\s*قلب\s*سريعه|تسارع\s*في\s*القلب)", "severe": False, "diagnoses": [1]},
            {"name": "irregular heartbeat", "regex_en": r"\birregular\s*heartbeat\b", "regex_ar": r"(?:^|[\sووبفل])(ضربات\s*قلب\s*غير\s*منتظمة|ضربات\s*قلب\s*غير\s*منتظمه|لخبطة\s*في\s*ضربات\s*القلب)", "severe": False, "diagnoses": [1]},
            {"name": "rapid heartbeat", "regex_en": r"\brapid\s*heartbeat\b", "regex_ar": r"(?:^|[\sووبفل])(تسارع\s*ضربات\s*القلب|سرعة\s*ضربات\s*القلب)", "severe": False, "diagnoses": [1]},
            {"name": "shortness of breath during exertion", "regex_en": r"\b(shortness\s*of\s*breath\s*during\s*exertion|shortness\s*of\s*breath\s*with\s*exertion)\b", "regex_ar": r"(?:^|[\sووبفل])(ضيق\s*تنفس\s*عند\s*المجهود|ضيق\s*تنفس\s*مع\s*الحركة|نهجان\s*مع\s*المجهود)", "severe": True, "diagnoses": [3, 2]},
            {"name": "dizziness with exertion", "regex_en": r"\bdizziness\s*with\s*exertion\b", "regex_ar": r"(?:^|[\sووبفل])(دوخة\s*عند\s*المجهود|دوخه\s*مع\s*الحركة|دوار\s*عند\s*بذل\s*مجهود)", "severe": False, "diagnoses": [3, 0]},
            {"name": "fainting", "regex_en": r"\b(fainting|faint|syncope)\b", "regex_ar": r"(?:^|[\sووبفل])(اغماء|إغماء|فقدان\s*الوعي|فقدان\s*الوعى|مغمى\s*عليا)", "severe": True, "diagnoses": [3, 1]},
            {"name": "high blood pressure", "regex_en": r"\b(high\s*blood\s*pressure|hypertension)\b", "regex_ar": r"(?:^|[\sووبفل])(ضغط\s*دم\s*مرتفع|ضغط\s*عالي|ضغط\s*عالى|ارتفاع\s*الضغط|الضغط\s*مرتفع)", "severe": False, "diagnoses": [0]},
            {"name": "low blood pressure", "regex_en": r"\blow\s*blood\s*pressure\b", "regex_ar": r"(?:^|[\sووبفل])(ضغط\s*دم\s*منخفض|ضغط\s*واطي|ضغط\s*واطى|انخفاض\s*الضغط|الضغط\s*منخفض)", "severe": False, "diagnoses": [1]},
            {"name": "swollen legs", "regex_en": r"\b(swollen\s*legs|leg\s*swelling)\b", "regex_ar": r"(?:^|[\sووبفل])(تورم\s*الرجلين|ورم\s*الساقين|تورم\s*الساقين|ورم\s*الرجلين|ورم\s*في\s*الرجل)", "severe": False, "diagnoses": [3]},
            {"name": "edema", "regex_en": r"\bedema\b", "regex_ar": r"(?:^|[\sووبفل])(وذمة|احتباس\s*سوائل)", "severe": False, "diagnoses": [3]},
            {"name": "cyanosis", "regex_en": r"\b(cyanosis|blue\s*skin|blue\s*lips)\b", "regex_ar": r"(?:^|[\sووبفل])(ازرقاق|ازرقاق\s*الجلد|ازرقاق\s*الشفايف|زرقان\s*في\s*الجلد)", "severe": True, "diagnoses": [3, 2]},
            {"name": "angina", "regex_en": r"\bangina\b", "regex_ar": r"(?:^|[\sووبفل])(ذبحة\s*صدرية|ذبحه\s*صدريه)", "severe": True, "diagnoses": [4]},
            {"name": "pressure in chest", "regex_en": r"\bpressure\s*in\s*chest\b", "regex_ar": r"(?:^|[\sووبفل])(ضغط\s*في\s*الصدر|ضغط\s*بالصدر)", "severe": True, "diagnoses": [4, 2]}
        ]
    },
    "Pulmonology": {
        "name_ar": "الأمراض الصدرية والجهاز التنفسي",
        "diagnoses_en": ["Asthma", "Bronchitis", "Pneumonia", "COPD", "Respiratory infection"],
        "diagnoses_ar": ["الربو الشعبي", "التهاب الشعب الهوائية", "الالتهاب الرئوي", "الانسداد الرئوي المزمن", "عدوى الجهاز التنفسي"],
        "keywords": [
            {"name": "cough", "regex_en": r"\bcough\b", "regex_ar": r"(?:^|[\sووبفل])(كحة|كحه|سعال)", "severe": False, "diagnoses": [1, 4]},
            {"name": "chronic cough", "regex_en": r"\bchronic\s*cough\b", "regex_ar": r"(?:^|[\sووبفل])(كحة\s*مزمنة|كحه\s*مزمنه|سعال\s*مستمر)", "severe": False, "diagnoses": [3, 2]},
            {"name": "dry cough", "regex_en": r"\bdry\s*cough\b", "regex_ar": r"(?:^|[\sووبفل])(كحة\s*ناشفة|كحه\s*ناشفه|سعال\s*جاف)", "severe": False, "diagnoses": [0, 4]},
            {"name": "productive cough", "regex_en": r"\bproductive\s*cough\b", "regex_ar": r"(?:^|[\sووبفل])(كحة\s*ببلغم|كحه\s*ببلغم|سعال\s*مصحوب\s*ببلغم|بلغم)", "severe": False, "diagnoses": [1, 2]},
            {"name": "wheezing", "regex_en": r"\b(wheezing|wheeze)\b", "regex_ar": r"(?:^|[\sووبفل])(تزييق\s*الصدر|صدر\s*بيزيق|صوت\s*تزييق|تزييق\s*في\s*الصدر)", "severe": False, "diagnoses": [0, 3]},
            {"name": "shortness of breath", "regex_en": r"\b(shortness\s*of\s*breath|short\s*breath|dyspnea)\b", "regex_ar": r"(?:^|[\sووبفل])(ضيق\s*التنفس|ضيق\s*تنفس|مش\s*قادر\s*اخذ\s*نفسي|مش\s*قادر\s*اخد\s*نفسى|نهجان)", "severe": True, "diagnoses": [0, 2, 3]},
            {"name": "asthma", "regex_en": r"\bashma\b", "regex_ar": r"(?:^|[\sووبفل])(حساسية\s*الصدر|حساسيه\s*الصدر|الربو|ازمة\s*ربوية)", "severe": False, "diagnoses": [0]},
            {"name": "difficulty breathing", "regex_en": r"\bdifficulty\s*breathing\b", "regex_ar": r"(?:^|[\sووبفل])(صعوبة\s*في\s*التنفس|صعوبه\s*في\s*التنفس|مش\s*عارف\s*اتنفس)", "severe": True, "diagnoses": [0, 2]},
            {"name": "chest congestion", "regex_en": r"\bchest\s*congestion\b", "regex_ar": r"(?:^|[\sووبفل])(احتقان\s*الصدر|بلغم\s*على\s*الصدر|كتمة\s*في\s*الصدر)", "severe": False, "diagnoses": [4, 1]},
            {"name": "coughing blood", "regex_en": r"\b(coughing\s*blood|spitting\s*blood|hemoptysis)\b", "regex_ar": r"(?:^|[\sووبفل])(كحة\s*دم|كحه\s*دم|يبصق\s*دم|سعال\s*مدمم|بجيب\s*دم\s*مع\s*الكحة)", "severe": True, "diagnoses": [2, 3]},
            {"name": "sleep apnea", "regex_en": r"\bsleep\s*apnea\b", "regex_ar": r"(?:^|[\sووبفل])(انقطاع\s*النفس\s*اثناء\s*النوم|شرقة\s*اثناء\s*النوم)", "severe": False, "diagnoses": [3]},
            {"name": "lung pain", "regex_en": r"\blung\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*الرئة|وجع\s*الرئة|وجع\s*الرئه|الم\s*في\s*الرئة)", "severe": False, "diagnoses": [2]}
        ]
    },
    "Gastroenterology": {
        "name_ar": "أمراض الجهاز الهضمي والكبد",
        "diagnoses_en": ["Gastritis", "GERD", "Gastroenteritis", "IBS", "Peptic ulcer"],
        "diagnoses_ar": ["التهاب المعدة", "ارتجاع المريء المزمن", "النزلات المعوية", "متلازمة القولون العصبي", "قرحة المعدة"],
        "keywords": [
            {"name": "stomach pain", "regex_en": r"\bstomach\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*المعدة|الم\s*في\s*المعدة|وجع\s*المعدة|وجع\s*المعده|وجع\s*في\s*المعدة)", "severe": False, "diagnoses": [0, 4]},
            {"name": "abdominal pain", "regex_en": r"\babdominal\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*البطن|الم\s*في\s*البطن|وجع\s*البطن|وجع\s*في\s*البطن)", "severe": False, "diagnoses": [2, 3]},
            {"name": "bloating", "regex_en": r"\b(bloating|bloat)\b", "regex_ar": r"(?:^|[\sووبفل])(انتفاخ|غازات|بطني\s*منفوخة|بطنى\s*منفوخه)", "severe": False, "diagnoses": [3, 0]},
            {"name": "nausea", "regex_en": r"\bnausea\b", "regex_ar": r"(?:^|[\sووبفل])(غثيان|غمام\s*نفس|لوعة|لوعه|نفسي\s*غمامة\s*عليا)", "severe": False, "diagnoses": [2, 0]},
            {"name": "vomiting", "regex_en": r"\b(vomiting|vomit)\b", "regex_ar": r"(?:^|[\sووبفل])(ترجيع|قئ|قيء|استفراغ|برجع)", "severe": False, "diagnoses": [2, 0]},
            {"name": "diarrhea", "regex_en": r"\bdiarrhea\b", "regex_ar": r"(?:^|[\sووبفل])(اسهال|إسهال)", "severe": False, "diagnoses": [2, 3]},
            {"name": "constipation", "regex_en": r"\bconstipation\b", "regex_ar": r"(?:^|[\sووبفل])(امساك|إمساك)", "severe": False, "diagnoses": [3]},
            {"name": "heartburn", "regex_en": r"\bheartburn\b", "regex_ar": r"(?:^|[\sووبفل])(حموضة|حموضه|حرقان\s*في\s*الصدر|حرقان\s*المعدة)", "severe": False, "diagnoses": [1, 0]},
            {"name": "acid reflux", "regex_en": r"\bacid\s*reflux\b", "regex_ar": r"(?:^|[\sووبفل])(ارتجاع\s*المريء|ارتجاع\s*المرئ|ارتجاع)", "severe": False, "diagnoses": [1]},
            {"name": "indigestion", "regex_en": r"\bindigestion\b", "regex_ar": r"(?:^|[\sووبفل])(عسر\s*هضم|تخمة)", "severe": False, "diagnoses": [0, 3]},
            {"name": "blood in stool", "regex_en": r"\bblood\s*in\s*stool\b", "regex_ar": r"(?:^|[\sووبفل])(دم\s*في\s*البراز|براز\s*مدمم|براز\s*اسود)", "severe": True, "diagnoses": [4]},
            {"name": "abdominal cramps", "regex_en": r"\b(abdominal\s*cramps|stomach\s*cramps)\b", "regex_ar": r"(?:^|[\sووبفل])(مغص|مغص\s*في\s*البطن|تقلصات\s*البطن)", "severe": False, "diagnoses": [3, 2]},
            {"name": "gastric pain", "regex_en": r"\bgastric\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*فم\s*المعدة|الم\s*فم\s*المعده|وجع\s*فم\s*المعدة)", "severe": False, "diagnoses": [0, 4]}
        ]
    },
    "Neurology": {
        "name_ar": "المخ والأعصاب",
        "diagnoses_en": ["Migraine", "Epilepsy", "Stroke", "Neuropathy", "Parkinsonism"],
        "diagnoses_ar": ["الصداع النصفي", "الصرع", "السكتة الدماغية", "التهاب الأعصاب الطرفية", "مرض باركنسون (الشلل الرعاش)"],
        "keywords": [
            {"name": "headache", "regex_en": r"\bheadache\b", "regex_ar": r"(?:^|[\sووبفل])(صداع|وجع\s*راس|وجع\s*رأس)", "severe": False, "diagnoses": [0]},
            {"name": "migraine", "regex_en": r"\bmigraine\b", "regex_ar": r"(?:^|[\sووبفل])(شقيقة|شقيقه|صداع\s*نصفي|صداع\s*نصفى)", "severe": False, "diagnoses": [0]},
            {"name": "dizziness", "regex_en": r"\b(dizziness|dizzy)\b", "regex_ar": r"(?:^|[\sووبفل])(دوخة|دوخه|دوار|دايخ)", "severe": False, "diagnoses": [2, 0]},
            {"name": "vertigo", "regex_en": r"\bvertigo\b", "regex_ar": r"(?:^|[\sووبفل])(دوار\s*دهليزي|احساس\s*بالدوران|دوران)", "severe": False, "diagnoses": [2]},
            {"name": "numbness", "regex_en": r"\b(numbness|numb)\b", "regex_ar": r"(?:^|[\sووبفل])(تنميل|خدلان|تخدر)", "severe": False, "diagnoses": [3, 2]},
            {"name": "tingling", "regex_en": r"\btingling\b", "regex_ar": r"(?:^|[\sووبفل])(شكشكة|شكشكه|وخز|تنميل\s*ووخز)", "severe": False, "diagnoses": [3]},
            {"name": "seizures", "regex_en": r"\b(seizures|seizure|convulsions)\b", "regex_ar": r"(?:^|[\sووبفل])(تشنجات|تشنج|صرع|نوبات\s*تشنج|نوبة\s*صرع)", "severe": True, "diagnoses": [1]},
            {"name": "fainting", "regex_en": r"\b(fainting|faint)\b", "regex_ar": r"(?:^|[\sووبفل])(اغماء|إغماء|فقدان\s*الوعي)", "severe": True, "diagnoses": [2, 1]},
            {"name": "memory loss", "regex_en": r"\bmemory\s*loss\b", "regex_ar": r"(?:^|[\sووبفل])(نسيان|فقدان\s*الذاكرة|ضعف\s*الذاكرة|الزهايمر)", "severe": False, "diagnoses": [4]},
            {"name": "weakness", "regex_en": r"\bweakness\b", "regex_ar": r"(?:^|[\sووبفل])(ضعف\s*عضلي|ضعف\s*في\s*الحركة)", "severe": False, "diagnoses": [3, 2]},
            {"name": "tremor", "regex_en": r"\b(tremor|shaking)\b", "regex_ar": r"(?:^|[\sووبفل])(رعشة|رعشه|رعشة\s*في\s*اليد|رعشه\s*في\s*اليد)", "severe": False, "diagnoses": [4]},
            {"name": "difficulty speaking", "regex_en": r"\b(difficulty\s*speaking|slurred\s*speech|speech\s*difficulty)\b", "regex_ar": r"(?:^|[\sووبفل])(ثقل\s*في\s*اللسان|صعوبة\s*في\s*الكلام|صعوبة\s*الكلام|لخبطة\s*في\s*الكلام)", "severe": True, "diagnoses": [2]},
            {"name": "facial droop", "regex_en": r"\b(facial\s*droop|facial\s*drooping)\b", "regex_ar": r"(?:^|[\sووبفل])(اعوجاج\s*الفم|شلل\s*الوجه|ارتخاء\s*في\s*الوجه|العصب\s*السابع)", "severe": True, "diagnoses": [2]},
            {"name": "paralysis", "regex_en": r"\bparalysis\b", "regex_ar": r"(?:^|[\sووبفل])(شلل|عدم\s*القدرة\s*على\s*الحركة|شلل\s*نصفي)", "severe": True, "diagnoses": [2]}
        ]
    },
    "Orthopedics": {
        "name_ar": "طب وجراحة العظام والمفاصل",
        "diagnoses_en": ["Arthritis", "Disc prolapse", "Ligament injury", "Fracture", "Tendinitis"],
        "diagnoses_ar": ["التهاب المفاصل", "الانزلاق الغضروفي (الديسك)", "إصابة الأربطة", "كسور العظام", "التهاب الأوتار"],
        "keywords": [
            {"name": "knee pain", "regex_en": r"\bknee\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*الركبة|الم\s*في\s*الركبة|وجع\s*الركبة|ركبتي|ركبتى)", "severe": False, "diagnoses": [0, 2]},
            {"name": "back pain", "regex_en": r"\bback\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*الظهر|الم\s*في\s*الظهر|وجع\s*الظهر|ظهري|ظهرى)", "severe": False, "diagnoses": [1, 0]},
            {"name": "neck pain", "regex_en": r"\bneck\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*الرقبة|الم\s*في\s*الرقبة|وجع\s*الرقبة|رقبتي|رقبتى)", "severe": False, "diagnoses": [1, 4]},
            {"name": "shoulder pain", "regex_en": r"\bshoulder\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*الكتف|الم\s*في\s*الكتف|وجع\s*الكتف|كتفي|كتفى)", "severe": False, "diagnoses": [4, 2]},
            {"name": "joint pain", "regex_en": r"\bjoint\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*المفاصل|الم\s*في\s*المفاصل|وجع\s*المفاصل|مفاصل)", "severe": False, "diagnoses": [0]},
            {"name": "fracture", "regex_en": r"\b(fracture|broken\s*bone)\b", "regex_ar": r"(?:^|[\sووبفل])(كسر|مكسور|شرخ\s*في\s*العظام)", "severe": True, "diagnoses": [3]},
            {"name": "bone pain", "regex_en": r"\bbone\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*العظام|الم\s*في\s*العظام|وجع\s*العظام)", "severe": False, "diagnoses": [0, 3]},
            {"name": "swelling joint", "regex_en": r"\bswelling\s*joint\b", "regex_ar": r"(?:^|[\sووبفل])(تورم\s*المفصل|ورم\s*في\s*المفاصل|مفصل\s*ورمان)", "severe": False, "diagnoses": [0, 2]},
            {"name": "limited movement", "regex_en": r"\blimited\s*movement\b", "regex_ar": r"(?:^|[\sووبفل])(صعوبة\s*الحركة|مش\s*قادر\s*اتحرك|تصلب\s*الحركة)", "severe": False, "diagnoses": [0, 1]},
            {"name": "sports injury", "regex_en": r"\bsports\s*injury\b", "regex_ar": r"(?:^|[\sووبفل])(اصابة\s*ملاعب|اصابة\s*رياضية|إصابة\s*رياضية)", "severe": False, "diagnoses": [2, 4]},
            {"name": "muscle injury", "regex_en": r"\bmuscle\s*injury\b", "regex_ar": r"(?:^|[\sووبفل])(مزق\s*عضلي|تمزق\s*عضلات|شد\s*عضلي\s*قوي)", "severe": False, "diagnoses": [4]},
            {"name": "spine pain", "regex_en": r"\b(spine|spinal|vertebrae)\b", "regex_ar": r"(?:^|[\sووبفل])(عمود\s*فقري|العمود\s*الفقري|فقرات|الفقرات|فقرة|فقره)", "severe": False, "diagnoses": [1, 0]}
        ]
    },
    "Dermatology": {
        "name_ar": "الأمراض الجلدية والتجميل",
        "diagnoses_en": ["Dermatitis", "Eczema", "Psoriasis", "Acne", "Fungal infection"],
        "diagnoses_ar": ["التهاب الجلد", "الإكزيما", "الصدفية", "حب الشباب", "العدوى الفطرية الجلدية"],
        "keywords": [
            {"name": "rash", "regex_en": r"\brash\b", "regex_ar": r"(?:^|[\sووبفل])(طفح\s*جلدي|طفح\s*جلدى|طفح|حبوب\s*حمراء)", "severe": False, "diagnoses": [0, 1]},
            {"name": "itching", "regex_en": r"\b(itching|itch|itchy)\b", "regex_ar": r"(?:^|[\sووبفل])(هرش|حكة|حكه|بهرش)", "severe": False, "diagnoses": [1, 0]},
            {"name": "skin redness", "regex_en": r"\bskin\s*redness\b", "regex_ar": r"(?:^|[\sووبفل])(احمرار\s*الجلد|جلد\s*احمر|احمرار\s*في\s*الجلد)", "severe": False, "diagnoses": [0, 2]},
            {"name": "acne", "regex_en": r"\bacne\b", "regex_ar": r"(?:^|[\sووبفل])(حب\s*الشباب|حبوب\s*في\s*الوجه|بثور)", "severe": False, "diagnoses": [3]},
            {"name": "eczema", "regex_en": r"\beczema\b", "regex_ar": r"(?:^|[\sووبفل])(اكزيما|إكزيما)", "severe": False, "diagnoses": [1]},
            {"name": "psoriasis", "regex_en": r"\bpsoriasis\b", "regex_ar": r"(?:^|[\sووبفل])(صدفية|صدفيه)", "severe": False, "diagnoses": [2]},
            {"name": "skin infection", "regex_en": r"\bskin\s*infection\b", "regex_ar": r"(?:^|[\sووبفل])(التهاب\s*جلدي|عدوى\s*جلدية|دمامل)", "severe": False, "diagnoses": [4, 0]},
            {"name": "skin lesion", "regex_en": r"\bskin\s*lesion\b", "regex_ar": r"(?:^|[\sووبفل])(تقرحات\s*جلدية|قرحة\s*في\s*الجلد)", "severe": False, "diagnoses": [4]},
            {"name": "mole changes", "regex_en": r"\bmole\s*changes\b", "regex_ar": r"(?:^|[\sووبفل])(تغير\s*في\s*الشامة|تغير\s*شكل\s*الحسنة|حسنة\s*بتكبر)", "severe": False, "diagnoses": [2]},
            {"name": "hair loss", "regex_en": r"\bhair\s*loss\b", "regex_ar": r"(?:^|[\sووبفل])(تساقط\s*الشعر|شعر\s*بيقع|صلع)", "severe": False, "diagnoses": [4]},
            {"name": "dandruff", "regex_en": r"\bdandruff\b", "regex_ar": r"(?:^|[\sووبفل])(قشرة\s*الشعر|قشره\s*الشعر|قشرة\s*في\s*الراس)", "severe": False, "diagnoses": [4]}
        ]
    },
    "Ophthalmology": {
        "name_ar": "طب وجراحة العيون",
        "diagnoses_en": ["Conjunctivitis", "Dry eye syndrome", "Refractive error", "Glaucoma"],
        "diagnoses_ar": ["الرمد (التهاب ملتحمة العين)", "متلازمة جفاف العين", "عيوب الإبصار (طول/قصر النظر)", "المياه الزرقاء (ارتفاع ضغط العين)"],
        "keywords": [
            {"name": "blurry vision", "regex_en": r"\bblurry\s*vision\b", "regex_ar": r"(?:^|[\sووبفل])(زغللة|زغلله|تشوش\s*الرؤية|مش\s*شايف\s*كويس|غمامة\s*على\s*العين)", "severe": False, "diagnoses": [2, 3]},
            {"name": "eye pain", "regex_en": r"\beye\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*العين|الم\s*في\s*العين|وجع\s*العين|عيني\s*بتوجعني)", "severe": False, "diagnoses": [1, 3]},
            {"name": "red eye", "regex_en": r"\bred\s*eye\b", "regex_ar": r"(?:^|[\sووبفل])(احمرار\s*العين|عين\s*حمراء|عيني\s*حمرا)", "severe": False, "diagnoses": [0, 1]},
            {"name": "vision loss", "regex_en": r"\bvision\s*loss\b", "regex_ar": r"(?:^|[\sووبفل])(فقدان\s*النظر|ضعف\s*النظر|مش\s*شايف)", "severe": True, "diagnoses": [3, 2]},
            {"name": "double vision", "regex_en": r"\bdouble\s*vision\b", "regex_ar": r"(?:^|[\sووبفل])(رؤية\s*مزدوجة|بشوف\s*الحاجه\s*اتنين|ازدواج\s*الرؤية)", "severe": False, "diagnoses": [2]},
            {"name": "eye discharge", "regex_en": r"\beye\s*discharge\b", "regex_ar": r"(?:^|[\sووبفل])(عماص|افرازات\s*من\s*العين|دموع\s*كثيرة)", "severe": False, "diagnoses": [0]},
            {"name": "light sensitivity", "regex_en": r"\blight\s*sensitivity\b", "regex_ar": r"(?:^|[\sووبفل])(حساسية\s*من\s*الضوء|مش\s*طيق\s*النور|تأثر\s*بالضوء)", "severe": False, "diagnoses": [3, 0]},
            {"name": "dry eyes", "regex_en": r"\bdry\s*eyes\b", "regex_ar": r"(?:^|[\sووبفل])(جفاف\s*العين|جفاف\s*في\s*العين|نشاف\s*العين)", "severe": False, "diagnoses": [1]}
        ]
    },
    "ENT": {
        "name_ar": "الأنف والأذن والحنجرة",
        "diagnoses_en": ["Tonsillitis", "Sinusitis", "Otitis", "Allergic rhinitis"],
        "diagnoses_ar": ["التهاب اللوزتين", "التهاب الجيوب الأنفية", "التهاب الأذن", "حساسية الأنف (التهاب الأنف التحسسي)"],
        "keywords": [
            {"name": "sore throat", "regex_en": r"\bsore\s*throat\b", "regex_ar": r"(?:^|[\sووبفل])(احتقان\s*الزور|الم\s*في\s*الحلق|احتقان\s*الحلق|وجع\s*حلق|احتقان\s*البلعوم)", "severe": False, "diagnoses": [0, 3]},
            {"name": "ear pain", "regex_en": r"\bear\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*الاذن|وجع\s*الاذن|ودني\s*بتوجعني|ودنى)", "severe": False, "diagnoses": [2]},
            {"name": "hearing loss", "regex_en": r"\bhearing\s*loss\b", "regex_ar": r"(?:^|[\sووبفل])(ضعف\s*السمع|مش\s*سامع\s*كويس|فقدان\s*السمع)", "severe": False, "diagnoses": [2]},
            {"name": "tinnitus", "regex_en": r"\btinnitus\b", "regex_ar": r"(?:^|[\sووبفل])(طنين\s*الاذن|وش\s*في\s*الودن|صفير\s*في\s*الاذن)", "severe": False, "diagnoses": [2]},
            {"name": "sinus pain", "regex_en": r"\bsinus\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*الجيوب\s*الانفية|وجع\s*جيوب\s*انفية|جيوب\s*انفية)", "severe": False, "diagnoses": [1]},
            {"name": "nasal congestion", "regex_en": r"\bnasal\s*congestion\b", "regex_ar": r"(?:^|[\sووبفل])(انسداد\s*الانف|مناخيري\s*مسدودة|انسداد\s*في\s*الأنف)", "severe": False, "diagnoses": [1, 3]},
            {"name": "runny nose", "regex_en": r"\brunny\s*nose\b", "regex_ar": r"(?:^|[\sووبفل])(رشح|سيلان\s*الانف|زكام)", "severe": False, "diagnoses": [3, 1]},
            {"name": "hoarseness", "regex_en": r"\bhoarseness\b", "regex_ar": r"(?:^|[\sووبفل])(بحة\s*في\s*الصوت|تغير\s*الصوت|صوتي\s*مبحوح)", "severe": False, "diagnoses": [0]},
            {"name": "swallowing difficulty", "regex_en": r"\b(swallowing\s*difficulty|difficulty\s*swallowing)\b", "regex_ar": r"(?:^|[\sووبفل])(صعوبة\s*في\s*البلع|صعوبة\s*البلع|مش\s*عارف\s*ابلع)", "severe": False, "diagnoses": [0]}
        ]
    },
    "Urology": {
        "name_ar": "جراحة المسالك البولية والتناسلية",
        "diagnoses_en": ["UTI", "Kidney stones", "Prostatitis"],
        "diagnoses_ar": ["التهاب مجرى البول", "حصوات الكلى", "التهاب البروستاتا"],
        "keywords": [
            {"name": "painful urination", "regex_en": r"\bpainful\s*urination\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*مع\s*التبول|وجع\s*اثناء\s*التبول|وجع\s*في\s*البول)", "severe": False, "diagnoses": [0]},
            {"name": "burning urination", "regex_en": r"\bburning\s*urination\b", "regex_ar": r"(?:^|[\sووبفل])(حرقان\s*البول|حرقان\s*اثناء\s*التبول|حرقان\s*في\s*البول)", "severe": False, "diagnoses": [0]},
            {"name": "blood in urine", "regex_en": r"\bblood\s*in\s*urine\b", "regex_ar": r"(?:^|[\sووبفل])(دم\s*في\s*البول|بول\s*مدمم|نزول\s*دم\s*مع\s*البول)", "severe": True, "diagnoses": [1, 0]},
            {"name": "frequent urination", "regex_en": r"\bfrequent\s*urination\b", "regex_ar": r"(?:^|[\sووبفل])(تبول\s*متكرر|دخول\s*الحمام\s*كتير|كثرة\s*التبول)", "severe": False, "diagnoses": [0, 2]},
            {"name": "urinary retention", "regex_en": r"\burinary\s*retention\b", "regex_ar": r"(?:^|[\sووبفل])(احتباس\s*البول|مش\s*عارف\s*ابول|بول\s*محبوس)", "severe": True, "diagnoses": [2, 1]},
            {"name": "flank pain", "regex_en": r"\bflank\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*في\s*الجنب|الم\s*جنبي|وجع\s*في\s*جنبي)", "severe": False, "diagnoses": [1]},
            {"name": "kidney pain", "regex_en": r"\bkidney\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*الكلى|وجع\s*الكلى|الم\s*في\s*الكلى|كليتي\s*بتوجعني)", "severe": False, "diagnoses": [1]},
            {"name": "kidney stones", "regex_en": r"\bkidney\s*stones\b", "regex_ar": r"(?:^|[\sووبفل])(حصوات\s*الكلى|حصوة\s*على\s*الكلى|حصوة\s*كلية)", "severe": False, "diagnoses": [1]}
        ]
    },
    "Gynecology": {
        "name_ar": "أمراض النساء والتوليد",
        "diagnoses_en": ["PCOS", "Vaginitis", "Pregnancy-related condition"],
        "diagnoses_ar": ["متلازمة تكيس المبايض", "التهاب المهبل", "حالة متعلقة بالحمل"],
        "keywords": [
            {"name": "pelvic pain", "regex_en": r"\bpelvic\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*الحوض|الم\s*في\s*الحوض|وجع\s*الحوض)", "severe": False, "diagnoses": [1, 0]},
            {"name": "menstrual irregularity", "regex_en": r"\b(menstrual\s*irregularity|irregular\s*periods|irregular\s*period)\b", "regex_ar": r"(?:^|[\sووبفل])(لخبطة\s*الدورة|تاخر\s*الدورة|دورة\s*غير\s*منتظمة|لخبطه\s*الدوره)", "severe": False, "diagnoses": [0]},
            {"name": "vaginal discharge", "regex_en": r"\bvaginal\s*discharge\b", "regex_ar": r"(?:^|[\sووبفل])(افرازات\s*مهبلية|إفرازات\s*مهبلية|افرازات\s*نساء)", "severe": False, "diagnoses": [1]},
            {"name": "pregnancy symptoms", "regex_en": r"\bpregnancy\s*symptoms\b", "regex_ar": r"(?:^|[\sووبفل])(اعراض\s*حمل|عايزة\s*احلل\s*حمل|أعراض\s*حمل|متابعة\s*حمل)", "severe": False, "diagnoses": [2]},
            {"name": "vaginal bleeding", "regex_en": r"\bvaginal\s*bleeding\b", "regex_ar": r"(?:^|[\sووبفل])(نزيف\s*مهبلي|نزيف\s*رحمي|دم\s*خارج\s*الدورة)", "severe": True, "diagnoses": [2]},
            {"name": "infertility", "regex_en": r"\binfertility\b", "regex_ar": r"(?:^|[\sووبفل])(تاخر\s*الانجاب|تأخر\s*الإنجاب|عقم|عدم\s*القدرة\s*على\s*الانجاب)", "severe": False, "diagnoses": [0]},
            {"name": "ovarian pain", "regex_en": r"\bovarian\s*pain\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*المبيض|وجع\s*المبيض|وجع\s*في\s*المبايض)", "severe": False, "diagnoses": [0]}
        ]
    },
    "Pediatrics": {
        "name_ar": "طب الأطفال حديثي الولادة",
        "diagnoses_en": ["Common pediatric illnesses"],
        "diagnoses_ar": ["أمراض الأطفال الشائعة"],
        "keywords": [
            {"name": "child fever", "regex_en": r"\b(child\s*fever|baby\s*fever|infant\s*fever)\b", "regex_ar": r"(?:^|[\sووبفل])(سخونة\s*طفل|حرارة\s*طفل|ابني\s*سخن|بنتي\s*سخنة|طفلي\s*حرارته\s*مرتفعة|حرارة\s*الطفل)", "severe": False, "diagnoses": [0]},
            {"name": "child cough", "regex_en": r"\b(child\s*cough|baby\s*cough)\b", "regex_ar": r"(?:^|[\sووبفل])(كحة\s*طفل|كحه\s*طفل|ابني\s*بيكح|بنتي\s*بتكح|سعال\s*الطفل)", "severe": False, "diagnoses": [0]},
            {"name": "poor feeding", "regex_en": r"\bpoor\s*feeding\b", "regex_ar": r"(?:^|[\sووبفل])(refuse\s*feeding|رفض\s*الرضاعة|ضعف\s*الشهية\s*عند\s*الطفل|طفلي\s*مش\s*بيرضع)", "severe": False, "diagnoses": [0]},
            {"name": "delayed development", "regex_en": r"\bdelayed\s*development\b", "regex_ar": r"(?:^|[\sووبفل])(تاخر\s*النمو|ابني\s*مش\s*بيتكلم|تأخر\s*الكلام\s*عند\s*الطفل)", "severe": False, "diagnoses": [0]},
            {"name": "newborn symptoms", "regex_en": r"\b(newborn\s*symptoms|newborn)\b", "regex_ar": r"(?:^|[\sووبفل])(اعراض\s*حديثي\s*الولادة|طفل\s*حديث\s*الولادة|صفراء\s*حديثي\s*الولادة|حديثي\s*الولاده)", "severe": False, "diagnoses": [0]},
            {"name": "pediatric infection", "regex_en": r"\bpediatric\s*infection\b", "regex_ar": r"(?:^|[\sووبفل])(عدوى\s*عند\s*الاطفال|نزلة\s*معوية\s*للطفل)", "severe": False, "diagnoses": [0]}
        ]
    },
    "Psychiatry": {
        "name_ar": "الطب النفسي والصحة النفسية",
        "diagnoses_en": ["Anxiety disorder", "Depression", "Panic disorder", "Sleep disorder"],
        "diagnoses_ar": ["اضطراب القلق العام", "الاكتئاب النفسي", "اضطراب الهلع", "اضطرابات النوم"],
        "keywords": [
            {"name": "anxiety", "regex_en": r"\b(anxiety|anxious|panic)\b", "regex_ar": r"(?:^|[\sووبفل])(قلق|توتر|خوف\s*مستمر|قلقان|خايف\s*دايما)", "severe": False, "diagnoses": [0, 2]},
            {"name": "panic attack", "regex_en": r"\bpanic\s*attack\b", "regex_ar": r"(?:^|[\sووبفل])(نوبة\s*هلع|نوبه\s*هلع|ضربات\s*قلب\s*مع\s*خوف)", "severe": False, "diagnoses": [2]},
            {"name": "depression", "regex_en": r"\b(depression|depressed|sadness)\b", "regex_ar": r"(?:^|[\sووبفل])(اكتئاب|مكتئب|حزن\s*مستمر|يأس|حاسس\s*باكتئاب|حزين)", "severe": False, "diagnoses": [1]},
            {"name": "insomnia", "regex_en": r"\b(insomnia|sleep\s*problems|sleep\s*disorder)\b", "regex_ar": r"(?:^|[\sووبفل])(ارق|أرق|مش\s*عارف\s*انام|قلة\s*النوم|اضطراب\s*النوم)", "severe": False, "diagnoses": [3]},
            {"name": "suicidal thoughts", "regex_en": r"\b(suicidal\s*thoughts|suicidal|suicide|kill\s*myself|want\s*to\s*die)\b", "regex_ar": r"(?:^|[\sووبفل])(افكار\s*انتحارية|تفكير\s*في\s*الانتحار|عايز\s*اموت\s*نفسي|انتحر|أفكار\s*إنتحارية)", "severe": True, "diagnoses": [1]},
            {"name": "mood swings", "regex_en": r"\bmood\s*swings\b", "regex_ar": r"(?:^|[\sووبفل])(تقلبات\s*مزاجية|مزاجي\s*متقلب|تغير\s*المزاج)", "severe": False, "diagnoses": [1]},
            {"name": "hallucinations", "regex_en": r"\b(hallucinations|hallucination|voices)\b", "regex_ar": r"(?:^|[\sووبفل])(هلاوس|سمع\s*اصوات|بشوف\s*حاجات\s*مش\s*موجودة)", "severe": True, "diagnoses": [1, 2]},
            {"name": "stress", "regex_en": r"\b(stress|stressed)\b", "regex_ar": r"(?:^|[\sووبفل])(ضغط\s*نفسي|إرهاق\s*عصبي|مضغوط)", "severe": False, "diagnoses": [0]},
            {"name": "social withdrawal", "regex_en": r"\bsocial\s*withdrawal\b", "regex_ar": r"(?:^|[\sووبفل])(عزلة\s*اجتماعية|مش\s*عايز\s*اكلم\s*حد|انطواء)", "severe": False, "diagnoses": [1]}
        ]
    },
    "Endocrinology": {
        "name_ar": "أمراض الغدد الصماء والسكري",
        "diagnoses_en": ["Diabetes", "Hypothyroidism", "Hyperthyroidism"],
        "diagnoses_ar": ["مرض السكري", "قصور الغدة الدرقية", "نشاط الغدة الدرقية الزائد"],
        "keywords": [
            {"name": "excessive thirst", "regex_en": r"\b(excessive\s*thirst|thirsty)\b", "regex_ar": r"(?:^|[\sووبفل])(عطش\s*شديد|بشرب\s*مية\s*كتير|عطش\s*مستمر|عطشان)", "severe": False, "diagnoses": [0]},
            {"name": "excessive urination", "regex_en": r"\bexcessive\s*urination\b", "regex_ar": r"(?:^|[\sووبفل])(تبول\s*زائد|ببول\s*كتير|بخش\s*الحمام\s*كتير\s*اتبول)", "severe": False, "diagnoses": [0]},
            {"name": "unexplained weight loss", "regex_en": r"\bunexplained\s*weight\s*loss\b", "regex_ar": r"(?:^|[\sووبفل])(خسارة\s*وزن\s*بدون\s*سبب|وزني\s*بيقل|خسيت\s*جامد)", "severe": False, "diagnoses": [0, 2]},
            {"name": "unexplained weight gain", "regex_en": r"\bunexplained\s*weight\s*gain\b", "regex_ar": r"(?:^|[\sووبفل])(زيادة\s*وزن\s*بدون\s*سبب|وزني\s*بيزيد|تخن\s*مفاجئ)", "severe": False, "diagnoses": [1]},
            {"name": "thyroid swelling", "regex_en": r"\bthyroid\s*swelling\b", "regex_ar": r"(?:^|[\sووبفل])(ورم\s*الغدة\s*الدرقية|تضخم\s*الرقبة|غدة\s*درقية)", "severe": False, "diagnoses": [1, 2]},
            {"name": "fatigue", "regex_en": r"\b(fatigue|tired|weakness|exhausted)\b", "regex_ar": r"(?:^|[\sووبفل])(تعب|ارهاق|همدان|خمول|ضعف|تعبان)", "severe": False, "diagnoses": [1, 0]},
            {"name": "cold intolerance", "regex_en": r"\bcold\s*intolerance\b", "regex_ar": r"(?:^|[\sووبفل])(عدم\s*تحمل\s*البرد|سقعان\s*دايما)", "severe": False, "diagnoses": [1]},
            {"name": "heat intolerance", "regex_en": r"\bheat\s*intolerance\b", "regex_ar": r"(?:^|[\sووبفل])(عدم\s*تحمل\s*الحر|حران\s*دايما)", "severe": False, "diagnoses": [2]}
        ]
    },
    "Oncology": {
        "name_ar": "أمراض الأورام والسرطان",
        "diagnoses_en": ["Possible malignancy", "Requires further investigation"],
        "diagnoses_ar": ["اشتباه في ورم (يتطلب فحص طبي)", "يتطلب مزيداً من الفحوصات والاستقصاء"],
        "keywords": [
            {"name": "unexplained weight loss", "regex_en": r"\bunexplained\s*weight\s*loss\b", "regex_ar": r"(?:^|[\sووبفل])(خسارة\s*وزن\s*غير\s*مبررة|وزني\s*بيقل\s*بسرعة)", "severe": True, "diagnoses": [0, 1]},
            {"name": "persistent lump", "regex_en": r"\b(persistent\s*lump|lump)\b", "regex_ar": r"(?:^|[\sووبفل])(كتلة\s*مستمرة|ورم\s*محسوس|كتلة\s*في\s*الجسم|كلكوعة)", "severe": True, "diagnoses": [0]},
            {"name": "enlarged lymph nodes", "regex_en": r"\b(enlarged\s*lymph\s*nodes|lymph\s*node)\b", "regex_ar": r"(?:^|[\sووبفل])(تضخم\s*الغدد\s*اللمفاوية|تضخم\s*الغدد|حيل\s*في\s*الرقبة)", "severe": True, "diagnoses": [0, 1]},
            {"name": "night sweats", "regex_en": r"\bnight\s*sweats\b", "regex_ar": r"(?:^|[\sووبفل])(عرق\s*ليلي|بصحى\s*غرقان\s*عرق|تعرق\s*شديد\s*بالليل)", "severe": False, "diagnoses": [0, 1]},
            {"name": "chronic fatigue", "regex_en": r"\bchronic\s*fatigue\b", "regex_ar": r"(?:^|[\sووبفل])(خمول\s*مستمر|تعب\s*مزمن|ارهاق\s*دائم)", "severe": False, "diagnoses": [1]}
        ]
    },
    "Dentistry": {
        "name_ar": "طب الأسنان",
        "diagnoses_en": ["Dental cavity", "Gingivitis", "Tooth decay", "Tooth abscess"],
        "diagnoses_ar": ["تسوس الأسنان", "التهاب اللثة", "نخر الأسنان", "خراج الأسنان"],
        "keywords": [
            {"name": "toothache", "regex_en": r"\b(toothache|tooth\s*pain|teeth\s*pain)\b", "regex_ar": r"(?:^|[\sووبفل])(وجع\s*اسنان|الم\s*اسنان|وجع\s*الاسنان|الم\s*الاسنان|وجع\s*الضرس|وجع\s*ضرس|الم\s*ضرس|سنانى|سناني|ضرسي|ضرصي|اسنان|أسنان|سنان|وجع\s*سنان|وجع\s*سناني|وجع\s*سنانى)", "severe": False, "diagnoses": [0, 2]},
            {"name": "gum pain", "regex_en": r"\b(gum\s*pain|gums\s*pain|gum\s*bleeding)\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*اللثة|وجع\s*اللثة|نزيف\s*اللثة|الم\s*اللثه|وجع\s*اللثه|نزيف\s*اللثه|لثة|لثه)", "severe": False, "diagnoses": [1]},
            {"name": "cavity", "regex_en": r"\b(cavity|cavities|tooth\s*decay)\b", "regex_ar": r"(?:^|[\sووبفل])(تسوس|تسوس\s*الاسنان|نخر\s*الاسنان|سوسة|سوسه)", "severe": False, "diagnoses": [0, 2]},
            {"name": "dental filling", "regex_en": r"\b(filling|dental\s*filling|crown)\b", "regex_ar": r"(?:^|[\sووبفل])(حشو|طربوش|تلبيسة|تلبيسه)", "severe": False, "diagnoses": [0]},
            {"name": "braces", "regex_en": r"\b(braces|orthodontics)\b", "regex_ar": r"(?:^|[\sووبفل])(تقويم\s*اسنان|تقويم\s*الاسنان|تقويم)", "severe": False, "diagnoses": [1]},
            {"name": "tooth extraction", "regex_en": r"\b(extraction|tooth\s*extraction|molar)\b", "regex_ar": r"(?:^|[\sووبفل])(خلع\s*اسنان|خلع\s*الاسنان|خلع\s*ضرس|خلع)", "severe": False, "diagnoses": [2]}
        ]
    }
}

# Priority score for medical specialties (for resolving multi-system symptom conflicts)
SPECIALTY_PRIORITY = [
    "Oncology",
    "Cardiology",
    "Pulmonology",
    "Neurology",
    "Urology",
    "Gynecology",
    "Gastroenterology",
    "Endocrinology",
    "Pediatrics",
    "ENT",
    "Ophthalmology",
    "Psychiatry",
    "Orthopedics",
    "Dermatology",
    "Dentistry"
]

# Emergency flags definitions
EMERGENCY_FLAGS = [
    {"name": "severe chest pain", "regex_en": r"\b(severe\s*chest\s*pain|pain\s*in\s*my\s*chest\s*is\s*severe)\b", "regex_ar": r"(?:^|[\sووبفل])(الم\s*شديد\s*في\s*الصدر|الم\s*صدر\s*شديد|وجع\s*شديد\s*في\s*الصدر)"},
    {"name": "stroke symptoms", "regex_en": r"\bstroke\s*symptoms\b", "regex_ar": r"(?:^|[\sووبفل])(اعراض\s*سكتة\s*دماغية|اعراض\s*جلطة\s*مخ)"},
    {"name": "facial droop", "regex_en": r"\b(facial\s*droop|facial\s*drooping)\b", "regex_ar": r"(?:^|[\sووبفل])(اعوجاج\s*الفم|شلل\s*نصف\s*الوجه|ارتخاء\s*في\s*الوجه)"},
    {"name": "paralysis", "regex_en": r"\bparalysis\b", "regex_ar": r"(?:^|[\sووبفل])(شلل|عدم\s*القدرة\s*على\s*الحركة|شلل\s*نصفي)"},
    {"name": "coughing blood", "regex_en": r"\b(coughing\s*blood|spitting\s*blood|hemoptysis)\b", "regex_ar": r"(?:^|[\sووبفل])(كحة\s*دم|كحه\s*دم|يبصق\s*دم|سعال\s*مدمم)"},
    {"name": "severe shortness of breath", "regex_en": r"\b(severe\s*shortness\s*of\s*breath|can.?t\s*breathe)\b", "regex_ar": r"(?:^|[\sووبفل])(ضيق\s*تنفس\s*شديد|مش\s*قادر\s*اتنفس\s*خالص|اختناق)"},
    {"name": "unconsciousness", "regex_en": r"\b(unconsciousness|unconscious|passed\s*out)\b", "regex_ar": r"(?:^|[\sووبفل])(فقدان\s*الوعي|مغمى\s*عليه|فقدان\s*الوعى)"},
    {"name": "seizures", "regex_en": r"\b(seizures|seizure|convulsions)\b", "regex_ar": r"(?:^|[\sووبفل])(تشنجات|تشنج|نوبة\s*صرع)"},
    {"name": "severe bleeding", "regex_en": r"\b(severe\s*bleeding|hemorrhage)\b", "regex_ar": r"(?:^|[\sووبفل])(نزيف\s*شديد|نزيف\s*مستمر|بنزف\s*جامد)"},
    {"name": "suicidal thoughts", "regex_en": r"\b(suicidal\s*thoughts|suicidal|suicide|kill\s*myself|want\s*to\s*die)\b", "regex_ar": r"(?:^|[\sووبفل])(افكار\s*انتحارية|تفكير\s*في\s*الانتحار|عايز\s*اموت\s*نفسي|انتحر|أفكار\s*إنتحارية)"}
]

def is_arabic(text: str) -> bool:
    if not text:
        return False
    return any('\u0600' <= char <= '\u06FF' for char in text)

def normalize_text(text: str, is_ar: bool) -> str:
    text = text.lower().strip()
    if is_ar:
        # Remove Arabic diacritics (Harakat)
        text = re.sub(r'[\u064B-\u0652]', '', text)
        # Normalize Alif variants
        text = re.sub(r'[أإآ]', 'ا', text)
        # Normalize Ta Marbuta to Ha
        text = re.sub(r'ة', 'ه', text)
        # Normalize Ya/Alef Maksura to Ya
        text = re.sub(r'ى', 'ي', text)
    return text

def get_conversational_response(text: str) -> dict:
    is_ar = is_arabic(text)
    text_clean = normalize_text(text, is_ar)

    # 1. Greetings patterns
    greetings_en = [r'\b(hi|hello|hey|greetings|welcome|good\s*morning|good\s*evening|good\s*afternoon)\b']
    greetings_ar = [r'(مرحبا|اهلا|اهلاً|السلام\s*عليكم|صباح\s*الخير|مساء\s*الخير|هلا)']
    
    # 2. Thank you patterns
    thanks_en = [r'\b(thank\s*you|thanks|appreciate\s*it|perfect|great|awesome)\b']
    thanks_ar = [r'(شكرا|شكراً|جزاك\s*الله|تسلم|الف\s*شكر|شكرا\s*جزيلا|ثانكس)']

    # 3. Who are you patterns
    who_en = [r'\b(who\s*are\s*you|what\s*is\s*your\s*name|what\s*do\s*you\s*do|who\s*is\s*shifaa)\b']
    who_ar = [r'(من\s*انت|مين\s*انت|ما\s*اسمك|بتعمل\s*ايه|انت\s*مين|اسمك\s*ايه|مين\s*شفا)']

    # 4. How to book patterns
    book_en = [r'\b(how\s*to\s*book|booking|book\s*appointment|book\s*doctor|create\s*booking)\b']
    book_ar = [r'(كيف\s*احجز|طريقة\s*الحجز|حجز\s*موعد|عايز\s*احجز|احجز\s*ازاي|احجز\s*ازاى|كيفية\s*الحجز)']

    # 5. How to cancel patterns
    cancel_en = [r'\b(how\s*to\s*cancel|cancel\s*appointment|cancel\s*booking|delete\s*appointment|delete\s*booking)\b']
    cancel_ar = [r'(كيف\s*الغي\s*الحجز|كيف\s*الغي|الغاء\s*الحجز|الغي\s*موعد|عايز\s*الغي|الغي\s*ازاي|الغي\s*ازاى|كيفية\s*الغاء)']

    # Matching logic
    # Greetings
    if any(re.search(p, text_clean) for p in (greetings_ar if is_ar else greetings_en)):
        return {
            "status": "conversational",
            "message": (
                "<div style='direction: rtl; text-align: right; line-height: 1.6;'>"
                "أهلاً بك! أنا شِفاء، مساعدك الطبي الذكي. كيف يمكنني مساعدتك اليوم؟ "
                "يمكنك وصف الأعراض التي تشعر بها (مثال: أشعر بصداع شديد وتنميل)، أو سؤالي عن طريقة حجز المواعيد وإلغائها."
                "</div>" if is_ar else
                "<div style='direction: ltr; text-align: left; line-height: 1.6;'>"
                "Hello! I am Shifaa, your intelligent medical assistant. How can I help you today? "
                "You can describe your symptoms (e.g. 'I have chest pain and shortness of breath') to find the right specialist, or ask me for help booking/cancelling appointments."
                "</div>"
            )
        }

    # Thank you
    if any(re.search(p, text_clean) for p in (thanks_ar if is_ar else thanks_en)):
        return {
            "status": "conversational",
            "message": (
                "<div style='direction: rtl; text-align: right; line-height: 1.6;'>"
                "على الرحب والسعة! أتمنى لك دوام الصحة والعافية. إذا كان لديك أي استفسار آخر، فلا تتردد في طرحه."
                "</div>" if is_ar else
                "<div style='direction: ltr; text-align: left; line-height: 1.6;'>"
                "You are very welcome! I wish you constant health and wellness. Feel free to ask if you have any other questions."
                "</div>"
            )
        }

    # Who are you
    if any(re.search(p, text_clean) for p in (who_ar if is_ar else who_en)):
        return {
            "status": "conversational",
            "message": (
                "<div style='direction: rtl; text-align: right; line-height: 1.6;'>"
                "أنا <strong>شِفاء (Shifaa AI)</strong>، مساعد طبي ذكي متكامل في المنصة. "
                "وظيفتي هي تحليل الأعراض التي تصفها، وتوجيهك للتخصص الطبي المناسب، واقتراح تشخيصات مبدئية محتملة لمساعدتك، "
                "بالإضافة لمساعدتك في إرشادك لكيفية استخدام المنصة لحجز وإلغاء المواعيد."
                "</div>" if is_ar else
                "<div style='direction: ltr; text-align: left; line-height: 1.6;'>"
                "I am <strong>Shifaa (Shifaa AI)</strong>, your integrated virtual medical triage assistant. "
                "My primary task is to analyze the symptoms you describe, recommend the correct medical specialty, provide possible preliminary diagnoses, "
                "and guide you through booking or cancelling appointments on this platform."
                "</div>"
            )
        }

    # How to book
    if any(re.search(p, text_clean) for p in (book_ar if is_ar else book_en)):
        return {
            "status": "conversational",
            "message": (
                "<div style='direction: rtl; text-align: right; line-height: 1.6;'>"
                "<h4 style='color: #2563EB; margin-bottom: 8px;'><i class='fas fa-calendar-alt'></i> طريقة حجز موعد جديد:</h4>"
                "<ol style='margin: 0; padding-right: 20px;'>"
                "<li>قم بوصف أعراضك لي وسأقوم بترشيح التخصص والأطباء المناسبين لك فوراً.</li>"
                "<li>أو انتقل إلى صفحة <strong>دليل الأطباء (Doctors)</strong> من القائمة الجانبية أو العلوية.</li>"
                "<li>اختر الطبيب المناسب واضغط على زر <strong>حجز الآن (Book Now)</strong>.</li>"
                "<li>اختر التاريخ والوقت المناسبين لك، ثم أكد الحجز!</li>"
                "</ol>"
                "</div>" if is_ar else
                "<div style='direction: ltr; text-align: left; line-height: 1.6;'>"
                "<h4 style='color: #2563EB; margin-bottom: 8px;'><i class='fas fa-calendar-alt'></i> How to Book an Appointment:</h4>"
                "<ol style='margin: 0; padding-left: 20px;'>"
                "<li>Describe your symptoms to me, and I will recommend the right department and doctors instantly.</li>"
                "<li>Or visit the <strong>Doctors Directory</strong> from the navigation menu.</li>"
                "<li>Find your preferred doctor and click the <strong>Book Now</strong> button.</li>"
                "<li>Choose an available date and time slot, then confirm your booking!</li>"
                "</ol>"
                "</div>"
            )
        }

    # How to cancel
    if any(re.search(p, text_clean) for p in (cancel_ar if is_ar else cancel_en)):
        return {
            "status": "conversational",
            "message": (
                "<div style='direction: rtl; text-align: right; line-height: 1.6;'>"
                "<h4 style='color: #DC2626; margin-bottom: 8px;'><i class='fas fa-times-circle'></i> طريقة إلغاء موعد محجوز:</h4>"
                "<ol style='margin: 0; padding-right: 20px;'>"
                "<li>انتقل إلى صفحة <strong>مواعيدي (My Appointments)</strong> من القائمة الجانبية أو العلوية.</li>"
                "<li>ابحث عن الموعد الذي ترغب في إلغائه.</li>"
                "<li>اضغط على زر <strong>إلغاء الموعد (Cancel Appointment)</strong> وسيقوم النظام بحذفه نهائياً وتحديث جدول الطبيب.</li>"
                "</ol>"
                "</div>" if is_ar else
                "<div style='direction: ltr; text-align: left; line-height: 1.6;'>"
                "<h4 style='color: #DC2626; margin-bottom: 8px;'><i class='fas fa-times-circle'></i> How to Cancel an Appointment:</h4>"
                "<ol style='margin: 0; padding-left: 20px;'>"
                "<li>Navigate to the <strong>My Appointments</strong> page from the menu.</li>"
                "<li>Locate the appointment you wish to cancel.</li>"
                "<li>Click the <strong>Cancel Appointment</strong> button next to it. The appointment will be immediately removed.</li>"
                "</ol>"
                "</div>"
            )
        }

    return None

SYMPTOM_SPEL_MAP = {
    "diarrhea": "diarrhoea",
    "shortness_of_breath": "breathlessness",
    "difficulty_breathing": "breathlessness",
    "shortness_of_breath_during_exertion": "breathlessness",
    "chest_tightness": "chest_pain",
    "pressure_in_chest": "chest_pain",
    "palpitations": "fast_heart_rate",
    "irregular_heartbeat": "fast_heart_rate",
    "rapid_heartbeat": "fast_heart_rate",
    "dizziness_with_exertion": "dizziness",
    "fainting": "dizziness",
    "syncope": "dizziness",
    "high_blood_pressure": "headache",
    "low_blood_pressure": "dizziness",
    "swollen_legs": "swollen_legs",
    "leg_swelling": "swollen_legs",
    "edema": "swollen_legs",
    "cyanosis": "breathlessness",
    "angina": "chest_pain",
    "chronic_cough": "cough",
    "dry_cough": "cough",
    "productive_cough": "cough",
    "wheezing": "breathlessness",
    "wheeze": "breathlessness",
    "chest_congestion": "chest_pain",
    "coughing_blood": "cough",
    "spitting_blood": "cough",
    "hemoptysis": "cough",
    "sleep_apnea": "breathlessness",
    "lung_pain": "chest_pain",
    "bloating": "indigestion",
    "bloat": "indigestion",
    "constipation": "constipation",
    "heartburn": "acidity",
    "acid_reflux": "acidity",
    "abdominal_cramps": "cramps",
    "stomach_cramps": "cramps",
    "gastric_pain": "stomach_pain",
    "migraine": "headache",
    "vertigo": "dizziness",
    "numbness": "weakness_in_limbs",
    "tingling": "weakness_in_limbs",
    "seizures": "unsteadiness",
    "seizure": "unsteadiness",
    "convulsions": "unsteadiness",
    "memory_loss": "dizziness",
    "weakness": "weakness_in_limbs",
    "tremor": "weakness_in_limbs",
    "shaking": "weakness_in_limbs",
    "difficulty_speaking": "slurred_speech",
    "slurred_speech": "slurred_speech",
    "facial_droop": "weakness_in_limbs",
    "paralysis": "weakness_in_limbs",
    "knee_pain": "knee_pain",
    "back_pain": "back_pain",
    "neck_pain": "neck_pain",
    "shoulder_pain": "joint_pain",
    "joint_pain": "joint_pain",
    "fracture": "pain_during_bowel_movements",
    "broken_bone": "pain_during_bowel_movements",
    "bone_pain": "joint_pain",
    "swelling_joint": "joint_pain",
    "limited_movement": "weakness_in_limbs",
    "sports_injury": "joint_pain",
    "muscle_injury": "joint_pain",
    "rash": "skin_rash",
    "itching": "itching",
    "skin_redness": "skin_rash",
    "acne": "skin_rash",
    "eczema": "skin_rash",
    "psoriasis": "skin_rash",
    "skin_infection": "skin_rash",
    "skin_lesion": "skin_rash",
    "mole_changes": "skin_rash",
    "hair_loss": "patches_in_throat",
    "dandruff": "patches_in_throat",
    "blurry_vision": "blurred_and_distorted_vision",
    "eye_pain": "pain_behind_the_eyes",
    "red_eye": "redness_of_eyes",
    "vision_loss": "blurred_and_distorted_vision",
    "double_vision": "blurred_and_distorted_vision",
    "eye_discharge": "redness_of_eyes",
    "light_sensitivity": "blurred_and_distorted_vision",
    "dry_eyes": "blurred_and_distorted_vision",
    "sore_throat": "throat_irritation",
    "ear_pain": "pain_behind_the_eyes",
    "hearing_loss": "dizziness",
    "tinnitus": "dizziness",
    "sinus_pain": "sinus_pressure",
    "nasal_congestion": "congestion",
    "runny_nose": "runny_nose",
    "hoarseness": "throat_irritation",
    "swallowing_difficulty": "throat_irritation",
    "painful_urination": "burning_micturition",
    "burning_urination": "burning_micturition",
    "blood_in_urine": "burning_micturition",
    "frequent_urination": "burning_micturition",
    "urinary_retention": "burning_micturition",
    "flank_pain": "back_pain",
    "kidney_pain": "back_pain",
    "kidney_stones": "back_pain"
}

def resolve_disease_details(disease_en: str, specialty: str, is_ar: bool = False):
    disease_key = disease_en.lower().strip()
    
    description_en = ""
    description_ar = ""
    precs_en = []
    
    # Custom overrides for Dentistry and Gynecology
    if specialty == "Dentistry":
        description_en = "Oral and dental health condition, which may include tooth decay, cavities, or gum inflammation."
        description_ar = "حالة تتعلق بصحة الفم والأسنان، قد تشمل تسوس الأسنان، خراء الأسنان، أو التهابات اللثة."
        precs_en = ["consult doctor", "medication", "follow up", "wash hands through"]
    elif specialty == "Gynecology" and disease_key not in DESCRIPTIONS:
        description_en = "Medical condition related to women's health, pregnancy, maternity, or the female reproductive system."
        description_ar = "حالة طبية تتعلق بصحة المرأة أو الحمل والولادة والجهاز التناسلي الأنثوي."
        precs_en = ["consult doctor", "follow up", "eat healthy", "get proper sleep"]
    else:
        # Try exact match
        if disease_key in DESCRIPTIONS:
            description_en = DESCRIPTIONS[disease_key]
            description_ar = DISEASE_DESCRIPTION_TRANSLATIONS.get(disease_key, "")
        else:
            # Try finding a key that is in the disease_key or vice versa
            found_key = None
            for k in DESCRIPTIONS.keys():
                if k in disease_key or disease_key in k:
                    found_key = k
                    break
            if found_key:
                description_en = DESCRIPTIONS[found_key]
                description_ar = DISEASE_DESCRIPTION_TRANSLATIONS.get(found_key, "")
                disease_key = found_key
                
        # Check if we have translation directly
        if not description_en and disease_key in DISEASE_DESCRIPTION_TRANSLATIONS:
            description_ar = DISEASE_DESCRIPTION_TRANSLATIONS[disease_key]
            
        # If still empty description, use specialty-based fallback
        if not description_en:
            fallbacks = {
                "Cardiology": ("heart attack", "Heart condition affecting cardiovascular system."),
                "Pulmonology": ("bronchial asthma", "Respiratory condition affecting lungs and airways."),
                "Gastroenterology": ("gerd", "Gastrointestinal condition affecting stomach and digestion."),
                "Neurology": ("migraine", "Neurological condition affecting brain or nerves."),
                "Orthopedics": ("arthritis", "Musculoskeletal condition affecting joints or bones."),
                "Dermatology": ("fungal infection", "Dermatological condition affecting skin or hair."),
                "Ophthalmology": ("allergy", "Ophthalmic condition affecting eyes or vision."),
                "ENT": ("common cold", "Ear, nose, or throat condition affecting upper respiratory tract."),
                "Urology": ("urinary tract infection", "Urinary tract condition affecting kidneys or bladder."),
                "Gynecology": ("allergy", "Gynecological condition affecting reproductive system."),
                "Pediatrics": ("common cold", "Pediatric condition affecting children."),
                "Psychiatry": ("hypothyroidism", "Mental health condition affecting mood or sleep."),
                "Endocrinology": ("diabetes", "Endocrine condition affecting hormone levels or metabolism."),
                "Oncology": ("fungal infection", "Oncological condition requiring medical evaluation.")
            }
            fb_key, fb_desc = fallbacks.get(specialty, ("allergy", "Medical condition requiring evaluation."))
            description_en = DESCRIPTIONS.get(fb_key, fb_desc)
            description_ar = DISEASE_DESCRIPTION_TRANSLATIONS.get(fb_key, "")
            disease_key = fb_key

    # Resolve Precautions
    if not precs_en:
        precs_en = PRECAUTIONS.get(disease_key, [])
        if not precs_en:
            precs_en = PRECAUTIONS.get(disease_key, ["consult doctor", "follow up", "eat healthy", "reduce stress"])
    
    # Translate Precautions
    precs_ar = []
    for p in precs_en:
        p_clean = p.lower().strip()
        trans = PRECAUTION_TRANSLATIONS.get(p_clean, p)
        precs_ar.append(trans)
        
    if not description_ar:
        description_ar = description_en
        
    return {
        "description": description_ar if is_ar else description_en,
        "precautions": precs_ar if is_ar else precs_en
    }

FRONTEND_KEYWORDS = [
    {
        "specialty": "Neurology",
        "keywords_en": ['headache', 'migraine', 'dizzy', 'dizziness', 'numb', 'numbness', 'seizure', 'convulsion', 'tremor', 'paralysis', 'spine', 'spinal', 'nerve', 'memory loss', 'insomnia', 'fainting', 'syncope', 'vertigo', 'neurology', 'neurologist'],
        "keywords_ar": ['صداع', 'شقيقة', 'شقيقه', 'دوخة', 'دوخه', 'دوار', 'تنميل', 'تخدر', 'تشنج', 'تشنجات', 'أعصاب', 'اعصاب', 'رعشة', 'رعشه', 'شلل', 'فقدان الوعي', 'إغماء', 'اغماء', 'نسيان', 'ذاكرة', 'عمود فقري', 'فقرات', 'اعصاب'],
        "diagnoses_en": ["Migraine", "Paralysis (brain hemorrhage)"],
        "diagnoses_ar": ["الصداع النصفي", "شلل ناتج عن نزيف دماغي"]
    },
    {
        "specialty": "Dermatology",
        "keywords_en": ['skin', 'acne', 'pimple', 'rash', 'itch', 'itchy', 'eczema', 'hives', 'psoriasis', 'hair loss', 'alopecia', 'fungal', 'fungus', 'nail', 'blister', 'burn', 'dermatitis', 'wart', 'mole', 'dermatology', 'dermatologist'],
        "keywords_ar": ['جلد', 'جلدية', 'بشرة', 'بشره', 'حب الشباب', 'بثور', 'طفح', 'حكة', 'حكه', 'إكزيما', 'اكزيما', 'صدفية', 'صدفيه', 'تساقط الشعر', 'فروة الرأس', 'صلع', 'فطريات', 'أظافر', 'اظافر', 'ثآليل', 'حساسية جلدية', 'شامة', 'جلديه'],
        "diagnoses_en": ["Fungal infection", "Acne", "Psoriasis"],
        "diagnoses_ar": ["عدوى فطرية", "حب الشباب", "الصدفية"]
    },
    {
        "specialty": "Pediatrics",
        "keywords_en": ['child', 'baby', 'pediatric', 'kid', 'infant', 'toddler', 'newborn', 'pediatrician', 'vaccination', 'bedwetting', 'teething', 'measles', 'mumps', 'pediatrics', 'pediatricians'],
        "keywords_ar": ['طفل', 'أطفال', 'اطفال', 'رضيع', 'بيبي', 'طفله', 'أولاد', 'حديثي الولادة', 'تطعيمات', 'تبول لا إرادي', 'تسنين', 'حصبه', 'حصبتين', 'حرارة طفل', 'حديثي الولاده'],
        "diagnoses_en": ["Common Cold", "Chicken pox"],
        "diagnoses_ar": ["نزلات البرد", "الجديري المائي"]
    },
    {
        "specialty": "Gynecology",
        "keywords_en": ['pregnant', 'pregnancy', 'period', 'menstruation', 'uterus', 'ovary', 'ovarian', 'vagina', 'contraception', 'menopause', 'maternity', 'obstetrics', 'fertility', 'miscarriage', 'breastfeeding', 'gynecologist', 'gynecology'],
        "keywords_ar": ['حمل', 'حامل', 'ولادة', 'ولاده', 'نساء', 'توليد', 'رحم', 'مبيض', 'تكيس', 'عقم', 'دورة شهرية', 'دوره شهريه', 'حيض', 'إجهاض', 'اجهاض', 'رضاعة طبيعية', 'سائل مهبلي', 'نسائي', 'نسائيه'],
        "diagnoses_en": ["Urinary tract infection", "Allergy"],
        "diagnoses_ar": ["التهاب المسالك البولية", "حساسية مفرطة"]
    },
    {
        "specialty": "Gastroenterology",
        "keywords_en": ['stomach', 'stomachache', 'belly', 'abdomen', 'digestive', 'digest', 'colon', 'ibs', 'nausea', 'vomit', 'vomiting', 'diarrhea', 'constipation', 'acid reflux', 'heartburn', 'bloating', 'gas', 'gastro', 'liver', 'hepatitis', 'gallbladder', 'ulcer', 'gastroenterology', 'gastroenterologist'],
        "keywords_ar": ['بطن', 'معدة', 'معده', 'قولون', 'هضمي', 'امساك', 'إمساك', 'اسهال', 'إسهال', 'غثيان', 'تقيؤ', 'ترجيع', 'حموضة', 'حموضه', 'ارتجاع', 'غازات', 'انتفاخ', 'كبد', 'مرارة', 'قرحة', 'جهاز هضمي', 'هضمى'],
        "diagnoses_en": ["GERD", "Gastroenteritis", "Peptic ulcer diseae"],
        "diagnoses_ar": ["ارتجاع المريء", "النزلة المعوية", "القرحة الهضمية"]
    },
    {
        "specialty": "Dentistry",
        "keywords_en": ['tooth', 'teeth', 'toothache', 'dentist', 'dental', 'gum', 'gums', 'cavity', 'cavities', 'filling', 'crown', 'braces', 'orthodontist', 'extraction', 'molar', 'dentistry'],
        "keywords_ar": ['أسنان', 'اسنان', 'ضرس', 'أضراس', 'اضراس', 'لثة', 'لثه', 'طبيب أسنان', 'طبيب اسنان', 'تسوس', 'حشو', 'تقويم', 'خلع', 'خلع ضرس', 'اسنان', 'سنان', 'وجع سنان'],
        "diagnoses_en": ["Dental cavity", "Gingivitis"],
        "diagnoses_ar": ["تسوس الأسنان", "التهاب اللثة"]
    },
    {
        "specialty": "Cardiology",
        "keywords_en": ['heart', 'cardio', 'cardiology', 'cardiovascular'],
        "keywords_ar": ['قلب', 'القلب', 'قلبى', 'قلبي'],
        "diagnoses_en": ["Heart attack", "Hypertension"],
        "diagnoses_ar": ["النوبة القلبية", "ارتفاع ضغط الدم"]
    }
]

def triage_patient(symptom_text: str) -> dict:
    is_ar = is_arabic(symptom_text)
    norm_text = normalize_text(symptom_text, is_ar)

    matched_specialties = {}
    matched_keyword_names = []
    has_severe = False

    # 1. Match Symptoms across Database
    for spec_name, spec_data in SPECIALTY_DATABASE.items():
        matched_in_spec = []
        spec_diagnoses_indices = set()

        for kw in spec_data["keywords"]:
            pattern = kw["regex_ar"] if is_ar else kw["regex_en"]
            if re.search(pattern, norm_text):
                matched_in_spec.append(kw["name"])
                if kw["name"] not in matched_keyword_names:
                    matched_keyword_names.append(kw["name"])
                if kw["severe"]:
                    has_severe = True
                # collect diagnoses indices
                for d_idx in kw["diagnoses"]:
                    spec_diagnoses_indices.add(d_idx)
        
        if matched_in_spec:
            matched_specialties[spec_name] = {
                "matched_count": len(matched_in_spec),
                "matched_keywords": matched_in_spec,
                "diagnoses_indices": list(spec_diagnoses_indices)
            }

    # 1.5 Fallback to frontend-style keyword checking if no matches were found by regex
    if not matched_specialties:
        for item in FRONTEND_KEYWORDS:
            spec_name = item["specialty"]
            kws = item["keywords_ar"] if is_ar else item["keywords_en"]
            
            matched_in_spec = []
            for kw in kws:
                if is_ar:
                    if kw in norm_text:
                        matched_in_spec.append(kw)
                else:
                    if re.search(r'\b' + re.escape(kw) + r'\b', norm_text):
                        matched_in_spec.append(kw)
            
            if matched_in_spec:
                matched_specialties[spec_name] = {
                    "matched_count": len(matched_in_spec),
                    "matched_keywords": matched_in_spec,
                    "diagnoses_indices": [0]
                }
                for kw in matched_in_spec:
                    if kw not in matched_keyword_names:
                        matched_keyword_names.append(kw)

    # 2. If no symptoms found, return empty results
    if not matched_specialties:
        return {
            "specialty": None,
            "possible_diagnosis": None,
            "confidence": "منخفض" if is_ar else "Low",
            "matched_keywords": [],
            "reasoning": "لم يتم العثور على أعراض مطابقة واضحة. يرجى توضيح الشكوى بشكل أكبر." if is_ar else "No matching symptoms could be clearly identified. Please describe your condition in more detail.",
            "urgency": "روتيني" if is_ar else "Routine",
            "description": "",
            "precautions": [],
            "severity_score": 0
        }

    # 3. Determine the primary specialty using counts and priority order
    best_specialty = None
    max_count = 0

    for spec_name, data in matched_specialties.items():
        count = data["matched_count"]
        if count > max_count:
            max_count = count
            best_specialty = spec_name
        elif count == max_count:
            # Tie breaker: use specialty priority order (lower index is higher priority)
            if best_specialty is None:
                best_specialty = spec_name
            else:
                p1 = SPECIALTY_PRIORITY.index(best_specialty)
                p2 = SPECIALTY_PRIORITY.index(spec_name)
                if p2 < p1:
                    best_specialty = spec_name

    # 4. Resolve Possible Diagnoses
    spec_info = SPECIALTY_DATABASE[best_specialty]
    diagnoses_indices = matched_specialties[best_specialty]["diagnoses_indices"]
    
    diagnoses_list = spec_info["diagnoses_ar"] if is_ar else spec_info["diagnoses_en"]
    matched_diagnoses = [diagnoses_list[idx] for idx in sorted(diagnoses_indices) if idx < len(diagnoses_list)]
    
    if not matched_diagnoses:
        matched_diagnoses = diagnoses_list[:2]
        
    possible_diagnosis = " أو ".join(matched_diagnoses[:2]) if is_ar else " or ".join(matched_diagnoses[:2])

    # Let's get primary diagnosis English name to lookup details
    diagnoses_indices_sorted = sorted(diagnoses_indices)
    if not diagnoses_indices_sorted:
        primary_idx = 0
    else:
        primary_idx = diagnoses_indices_sorted[0]
        
    diagnoses_en_list = spec_info["diagnoses_en"]
    if primary_idx < len(diagnoses_en_list):
        primary_disease_en = diagnoses_en_list[primary_idx]
    else:
        primary_disease_en = diagnoses_en_list[0] if diagnoses_en_list else ""

    # 5. Retrieve Description and Precautions
    details = resolve_disease_details(primary_disease_en, best_specialty, is_ar)
    description = details["description"]
    precautions = details["precautions"]

    # 6. Calculate Severity Score based on matched keywords
    severity_scores = []
    for kw in matched_keyword_names:
        kw_norm = kw.lower().strip().replace(' ', '_')
        kw_mapped = SYMPTOM_SPEL_MAP.get(kw_norm, kw_norm)
        
        weight = SEVERITY.get(kw_mapped, None)
        if weight is None:
            # Try substring matching
            for key, val in SEVERITY.items():
                if key in kw_norm or kw_norm in key:
                    weight = val
                    break
        if weight is not None:
            severity_scores.append(weight)
            
    severity_score = sum(severity_scores) if severity_scores else 3

    # 7. Determine Confidence Level
    total_matched_keywords = len(matched_specialties[best_specialty]["matched_keywords"])
    if total_matched_keywords >= 3:
        confidence = "عالي" if is_ar else "High"
    elif total_matched_keywords == 2:
        confidence = "متوسط" if is_ar else "Medium"
    else:
        confidence = "منخفض" if is_ar else "Low"

    # 8. Check Emergency Flags
    is_emergency = False
    for flag in EMERGENCY_FLAGS:
        pattern = flag["regex_ar"] if is_ar else flag["regex_en"]
        if re.search(pattern, norm_text):
            is_emergency = True
            if flag["name"] not in matched_keyword_names:
                matched_keyword_names.append(flag["name"])
            break

    # 9. Determine Urgency Level
    if is_emergency:
        urgency = "EMERGENCY"
    elif has_severe or max_count >= 2:
        urgency = "عاجل" if is_ar else "Urgent"
    else:
        urgency = "روتيني" if is_ar else "Routine"

    # 10. Construct Reasoning
    matched_keywords_str = "، ".join([k.replace("_", " ") for k in matched_specialties[best_specialty]["matched_keywords"]]) if is_ar else ", ".join(matched_specialties[best_specialty]["matched_keywords"])
    spec_display_name = spec_info["name_ar"] if is_ar else best_specialty
    
    if is_ar:
        reasoning = f"بناءً على رصد الأعراض ({matched_keywords_str})، فإنه يوصى باستشارة طبيب متخصص في قسم {spec_display_name}. الأعراض تشير إلى احتمالية وجود حالة تؤثر على هذا النظام."
        if is_emergency:
            reasoning += " تنبيه: تم رصد أعراض طارئة تتطلب تدخلاً فورياً!"
    else:
        reasoning = f"Based on detected keywords ({matched_keywords_str}), we recommend consulting a physician specializing in {spec_display_name}. These symptoms match clinical indicators of this department."
        if is_emergency:
            reasoning += " Warning: Emergency clinical signs detected! Immediate evaluation is required."

    return {
        "specialty": best_specialty,
        "possible_diagnosis": possible_diagnosis,
        "confidence": confidence,
        "matched_keywords": matched_specialties[best_specialty]["matched_keywords"],
        "reasoning": reasoning,
        "urgency": urgency,
        "description": description,
        "precautions": precautions,
        "severity_score": severity_score
    }

