import re
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from ai_engine.triage import triage_patient, get_conversational_response, is_arabic, SPECIALTY_DATABASE
from api.models import Doctor, Specialty, MedicalKeyword

# Arabic Translation Maps for Professional Medical Reports
AR_SYMPTOMS = {
    "abdominal_pain": "ألم في البطن",
    "acid_reflux": "ارتجاع المريء",
    "acne": "حب الشباب",
    "anxiety": "القلق والتوتر",
    "appetite_changes": "تغيرات في الشهية",
    "back_pain": "ألم في الظهر",
    "bad_breath": "رائحة الفم الكريهة",
    "blurred_vision": "زغللة أو تشوش في الرؤية",
    "body_aches": "آلام في الجسم",
    "bone_fracture": "كسر في العظام",
    "bone_pain": "ألم في العظام",
    "burning_urination": "حرقان أثناء التبول",
    "chest_pain": "ألم في الصدر",
    "chest_tightness": "ضيق أو ثقل في الصدر",
    "chills": "قشعريرة",
    "cough": "سعال أو كحة",
    "constipation": "إمساك",
    "diarrhea": "إسهال",
    "difficulty_breathing": "صعوبة في التنفس",
    "difficulty_swallowing": "صعوبة في البلع",
    "dizziness": "دوخة أو دوار",
    "dry_skin": "جفاف الجلد",
    "ear_pain": "ألم في الأذن",
    "excessive_thirst": "عطش زائد أو مستمر",
    "eye_pain": "ألم في العين",
    "eye_redness": "احمرار العين",
    "fatigue": "تعب وإرهاق شديد",
    "fever": "سخونة أو ارتفاع درجة الحرارة",
    "frequent_urination": "كثرة التبول",
    "hair_loss": "تساقط الشعر",
    "headache": "صداع في الرأس",
    "heart_palpitations": "خفقان أو تسارع في ضربات القلب",
    "heartburn": "حموضة أو حرقان في الصدر",
    "hives": "ارتيكاريا أو حساسية جلدية",
    "itchy_eyes": "حكة في العين",
    "itchy_skin": "حكة في الجلد",
    "joint_pain": "ألم في المفاصل",
    "joint_swelling": "تورم في المفاصل",
    "loss_of_appetite": "فقدان الشهية",
    "muscle_pain": "ألم في العضلات",
    "muscle_spasms": "تشنجات عضلية",
    "nausea": "غثيان",
    "neck_pain": "ألم في الرقبة",
    "runny_nose": "رشح أو سيلان الأنف",
    "severe_back_pain": "ألم شديد في الظهر",
    "severe_headache": "صداع شديد في الرأس",
    "severe_joint_pain": "ألم شديد في المفاصل",
    "shortness_of_breath": "ضيق في التنفس",
    "skin_redness": "احمرار الجلد",
    "sore_throat": "التهاب أو ألم في الحلق",
    "spinning_sensation": "شعور بالدوران",
    "stomach_pain": "ألم في المعدة",
    "sweating": "تعرق زائد",
    "swelling": "تورم",
    "tinnitus": "طنين الأذن",
    "vomiting": "قيء أو ترجيع",
    "weakness": "ضعف عام"
}

AR_DISEASES = {
    "Acne": "حب الشباب",
    "Anemia": "الأنيميا (فقر الدم)",
    "Anxiety": "اضطراب القلق",
    "Arrhythmia": "عدم انتظام ضربات القلب",
    "Arthritis": "التهاب المفاصل",
    "Asthma": "الربو الشعبي",
    "Back Pain": "آلام الظهر",
    "Bronchitis": "التهاب الشعب الهوائية",
    "COPD": "الانسداد الرئوي المزمن",
    "Cataracts": "المياه البيضاء في العين",
    "Conjunctivitis": "الرمد أو التهاب ملتحمة العين",
    "Depression": "الاكتئاب",
    "Diabetes": "مرض السكري",
    "Eczema": "الإكزيما الجلدية",
    "Epilepsy": "الصرع أو نوبات التشنج",
    "Fracture": "كسور العظام",
    "Fungal Infection": "عدوى فطرية",
    "GERD": "ارتجاع المريء المزمن",
    "Gastroenteritis": "النزلات المعوية",
    "Glaucoma": "المياه الزرقاء (ارتفاع ضغط العين)",
    "Gout": "النقرس",
    "Heart Disease": "أمراض القلب والشرايين",
    "Heart Failure": "قصور عضلة القلب",
    "Hypertension": "ارتفاع ضغط الدم",
    "IBS": "متلازمة القولون العصبي",
    "Insomnia": "الأرق وصعوبة النوم",
    "Kidney Disease": "مرض الكلى",
    "Kidney Stones": "حصوات الكلى",
    "Liver Disease": "أمراض الكبد",
    "Migraine": "الصداع النصفي",
    "Obesity": "السمنة وزيادة الوزن",
    "Osteoporosis": "هشاشة العظام",
    "Otitis Media": "التهاب الأذن الوسطى",
    "Peptic Ulcer": "قرحة المعدة",
    "Pneumonia": "الالتهاب الرئوي",
    "Psoriasis": "الصدفية الجلدية",
    "Rheumatoid Arthritis": "الروماتويد المفصلي",
    "Sinusitis": "التهاب الجيوب الأنفية",
    "Skin Allergy": "حساسية الجلد",
    "Sports Injury": "إصابة رياضية",
    "Stroke": "السكتة الدماغية",
    "Thyroid Disorder": "اضطرابات الغدة الدرقية",
    "Tonsillitis": "التهاب اللوزتين",
    "Tuberculosis": "الدرن (السل الرئوي)",
    "UTI": "التهاب مجرى البول",
    "Vertigo": "الدوار الدهليزي"
}

AR_SPECIALTIES = {
    "Cardiology": "أمراض القلب والأوعية الدموية",
    "Dermatology": "الأمراض الجلدية والتجميل",
    "ENT": "الأنف والأذن والحنجرة",
    "Gastroenterology": "أمراض الجهاز الهضمي والكبد",
    "Gynecology": "أمراض النساء والتوليد",
    "Internal Medicine": "الأمراض الباطنة العامة",
    "Neurology": "المخ والأعصاب",
    "Ophthalmology": "طب وجراحة العيون",
    "Orthopedics": "طب وجراحة العظام والمفاصل",
    "Psychiatry": "الطب النفسي والصحة النفسية",
    "Pulmonology": "الأمراض الصدرية والجهاز التنفسي",
    "Rheumatology": "الروماتيزم وأمراض المناعة",
    "Urology": "جراحة المسالك البولية والتناسلية",
    "Emergency Medicine": "طب الطوارئ والحالات الحرجة"
}

def generate_medical_message(result, is_ar):
    specialty = result.get('specialty')
    possible_diagnosis = result.get('possible_diagnosis')
    confidence = result.get('confidence')
    matched_keywords = result.get('matched_keywords', [])
    reasoning = result.get('reasoning')
    urgency = result.get('urgency')
    description = result.get('description', '')
    precautions = result.get('precautions', [])
    severity_score = result.get('severity_score', 3)

    # Specialty display name
    spec_info = SPECIALTY_DATABASE.get(specialty, {})
    spec_name = spec_info.get("name_ar", specialty) if is_ar else specialty

    # Colors based on urgency
    urgency_colors = {
        "EMERGENCY": ("#DC2626", "#FEF2F2", "حالة طارئة" if is_ar else "EMERGENCY"),
        "Urgent": ("#D97706", "#FFFBEB", "عاجل" if is_ar else "Urgent"),
        "عاجل": ("#D97706", "#FFFBEB", "عاجل" if is_ar else "Urgent"),
        "Routine": ("#2563EB", "#F0F9FF", "روتيني" if is_ar else "Routine"),
        "روتيني": ("#2563EB", "#F0F9FF", "روتيني" if is_ar else "Routine"),
    }
    urg_color, urg_bg, urg_txt = urgency_colors.get(urgency, ("#4B5563", "#F9FAFB", urgency))

    # Severity Level Calculations
    if severity_score < 5:
        sev_label = "خفيف" if is_ar else "Mild"
        sev_color = "#10B981"
        sev_bg = "#ECFDF5"
        sev_pct = 30
    elif severity_score < 9:
        sev_label = "متوسط" if is_ar else "Moderate"
        sev_color = "#F59E0B"
        sev_bg = "#FFFBEB"
        sev_pct = 65
    else:
        sev_label = "مرتفع / شديد" if is_ar else "High / Severe"
        sev_color = "#EF4444"
        sev_bg = "#FEF2F2"
        sev_pct = 100

    # Build Symptoms List (plain text list, no pill badges)
    symptoms_translated = []
    if is_ar:
        for kw in matched_keywords:
            kw_key = kw.lower().strip().replace(' ', '_')
            symptoms_translated.append(AR_SYMPTOMS.get(kw_key, kw))
        syms_str = "، ".join(symptoms_translated)
    else:
        syms_str = ", ".join(matched_keywords)

    symptoms_html = f"<strong style='color: #1E293B; font-size: 14.5px;'>{syms_str}</strong>"

    # Build Precautions List HTML
    precs_html = ""
    icon_margin = "margin-left: 8px;" if is_ar else "margin-right: 8px;"
    for p in precautions:
        precs_html += (
            f"<div style='background: #F0FDF4; border: 1px solid #DCFCE7; padding: 8px 12px; border-radius: 8px; display: flex; align-items: center; gap: 8px; margin-bottom: 6px;'>"
            f"<i class='fas fa-check-circle' style='color: #10B981; font-size: 15px; {icon_margin}'></i>"
            f"<span style='font-size: 13.5px; color: #14532D; font-weight: 500;'>{p}</span>"
            f"</div>"
        )

    if is_ar:
        msg = (
            f"<div style='direction: rtl; text-align: right; line-height: 1.6; font-family: system-ui, -apple-system, sans-serif; max-width: 100%; border: 1px solid #E2E8F0; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; background: #FFFFFF; margin: 10px 0;'>"
            f"  <div style='background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color: #FFFFFF; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;'>"
            f"    <h4 style='margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 6px;'><i class='fas fa-stethoscope'></i> تقرير الفرز الطبي الذكي من شِفاء</h4>"
            f"    <span style='font-size: 12px; font-weight: bold; opacity: 0.95;'>شِفاء AI</span>"
            f"  </div>"
            f"  <div style='padding: 16px;'>"
            f"    <p style='margin: 0 0 14px; color: #4B5563; font-size: 13.5px;'>لقد قمت بتحليل الأعراض التي وصفتها بعناية. إليك تقرير الفرز الطبي المبدئي والتوجيهات اللازمة:</p>"
            f"    <div style='display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;'>"
            f"      <div style='background: #F8FAFC; border: 1px solid #F1F5F9; border-radius: 10px; padding: 10px;'>"
            f"        <span style='font-size: 11px; color: #64748B; display: block; margin-bottom: 2px;'>التخصص الطبي المقترح</span>"
            f"        <strong style='font-size: 14px; color: #2563EB; display: block;'>{spec_name}</strong>"
            f"      </div>"
            f"      <div style='background: #F8FAFC; border: 1px solid #F1F5F9; border-radius: 10px; padding: 10px;'>"
            f"        <span style='font-size: 11px; color: #64748B; display: block; margin-bottom: 2px;'>التشخيص المبدئي المحتمل</span>"
            f"        <strong style='font-size: 14px; color: #1E293B; display: block;'>{possible_diagnosis}</strong>"
            f"      </div>"
            f"    </div>"
            f"    <div style='margin-bottom: 14px;'>"
            f"      <span style='font-size: 12.5px; color: #4B5563; font-weight: 600; display: block; margin-bottom: 4px;'>الأعراض المكتشفة:</span>"
            f"      {symptoms_html}"
            f"    </div>"
            f"    <div style='background: #F8FAFC; border: 1px solid #F1F5F9; border-radius: 10px; padding: 12px; margin-bottom: 14px;'>"
            f"      <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;'>"
            f"        <span style='font-size: 12.5px; color: #4B5563; font-weight: 600;'>مؤشر الخطورة السريرية:</span>"
            f"        <strong style='font-size: 12px; color: {sev_color};'>{sev_label} (درجة الخطورة: {severity_score})</strong>"
            f"      </div>"
            f"      <div style='background: #E2E8F0; height: 6px; border-radius: 3px; overflow: hidden; position: relative;'>"
            f"        <div style='background: linear-gradient(90deg, #10B981 0%, #F59E0B 60%, #EF4444 100%); width: {sev_pct}%; height: 100%; border-radius: 3px;'></div>"
            f"      </div>"
            f"    </div>"
            f"    <div style='background: #EFF6FF; border-right: 4px solid #3B82F6; border-radius: 8px; padding: 12px; margin-bottom: 14px;'>"
            f"      <strong style='font-size: 13.5px; color: #1E40AF; display: block; margin-bottom: 4px;'><i class='fas fa-info-circle'></i> نبذة عن الحالة المحتملة:</strong>"
            f"      <p style='margin: 0; font-size: 13px; color: #1E3A8A; text-align: justify; line-height: 1.5;'>{description}</p>"
            f"    </div>"
            f"    <div style='margin-bottom: 14px;'>"
            f"      <strong style='font-size: 13.5px; color: #10B981; display: block; margin-bottom: 6px;'><i class='fas fa-shield-alt'></i> التدابير والإجراءات الوقائية الموصى بها:</strong>"
            f"      <div style='display: flex; flex-direction: column;'>{precs_html}</div>"
            f"    </div>"
            f"    <div style='margin-bottom: 14px; padding: 10px; background: #F1F5F9; border-radius: 8px; font-size: 13px; color: #334155;'>"
            f"      <strong>التحليل الطبي المفسر:</strong> {reasoning}"
            f"    </div>"
            f"    <p style='font-size: 12px; color: #9CA3AF; margin: 10px 0 0; border-top: 1px solid #E2E8F0; padding-top: 8px; text-align: center;'><em>تنبيه: هذا التقرير هو دليل استرشادي لمساعدتك في التوجه للقسم الصحيح بناءً على الكلمات المفتاحية الطبية، ولا يغني أبداً عن الفحص السريري المباشر لدى الطبيب المختص.</em></p>"
            f"  </div>"
            f"</div>"
        )
    else:
        msg = (
            f"<div style='direction: ltr; text-align: left; line-height: 1.6; font-family: system-ui, -apple-system, sans-serif; max-width: 100%; border: 1px solid #E2E8F0; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); overflow: hidden; background: #FFFFFF; margin: 10px 0;'>"
            f"  <div style='background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%); color: #FFFFFF; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;'>"
            f"    <h4 style='margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 6px;'><i class='fas fa-stethoscope'></i> Shifaa AI Smart Triage Report</h4>"
            f"    <span style='font-size: 12px; font-weight: bold; opacity: 0.95;'>Shifaa AI</span>"
            f"  </div>"
            f"  <div style='padding: 16px;'>"
            f"    <p style='margin: 0 0 14px; color: #4B5563; font-size: 13.5px;'>I have carefully analyzed your symptom description. Here is your preliminary triage summary and guidance:</p>"
            f"    <div style='display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;'>"
            f"      <div style='background: #F8FAFC; border: 1px solid #F1F5F9; border-radius: 10px; padding: 10px;'>"
            f"        <span style='font-size: 11px; color: #64748B; display: block; margin-bottom: 2px;'>Recommended Specialty</span>"
            f"        <strong style='font-size: 14px; color: #2563EB; display: block;'>{spec_name}</strong>"
            f"      </div>"
            f"      <div style='background: #F8FAFC; border: 1px solid #F1F5F9; border-radius: 10px; padding: 10px;'>"
            f"        <span style='font-size: 11px; color: #64748B; display: block; margin-bottom: 2px;'>Possible Diagnosis</span>"
            f"        <strong style='font-size: 14px; color: #1E293B; display: block;'>{possible_diagnosis}</strong>"
            f"      </div>"
            f"    </div>"
            f"    <div style='margin-bottom: 14px;'>"
            f"      <span style='font-size: 12.5px; color: #4B5563; font-weight: 600; display: block; margin-bottom: 4px;'>Detected Symptoms:</span>"
            f"      {symptoms_html}"
            f"    </div>"
            f"    <div style='background: #F8FAFC; border: 1px solid #F1F5F9; border-radius: 10px; padding: 12px; margin-bottom: 14px;'>"
            f"      <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;'>"
            f"        <span style='font-size: 12.5px; color: #4B5563; font-weight: 600;'>Clinical Severity Indicator:</span>"
            f"        <strong style='font-size: 12px; color: {sev_color};'>{sev_label} (Score: {severity_score})</strong>"
            f"      </div>"
            f"      <div style='background: #E2E8F0; height: 6px; border-radius: 3px; overflow: hidden; position: relative;'>"
            f"        <div style='background: linear-gradient(90deg, #10B981 0%, #F59E0B 60%, #EF4444 100%); width: {sev_pct}%; height: 100%; border-radius: 3px;'></div>"
            f"      </div>"
            f"    </div>"
            f"    <div style='background: #EFF6FF; border-left: 4px solid #3B82F6; border-radius: 8px; padding: 12px; margin-bottom: 14px;'>"
            f"      <strong style='font-size: 13.5px; color: #1E40AF; display: block; margin-bottom: 4px;'><i class='fas fa-info-circle'></i> About the Condition:</strong>"
            f"      <p style='margin: 0; font-size: 13px; color: #1E3A8A; text-align: justify; line-height: 1.5;'>{description}</p>"
            f"    </div>"
            f"    <div style='margin-bottom: 14px;'>"
            f"      <strong style='font-size: 13.5px; color: #10B981; display: block; margin-bottom: 6px;'><i class='fas fa-shield-alt'></i> Recommended Preventive Actions:</strong>"
            f"      <div style='display: flex; flex-direction: column;'>{precs_html}</div>"
            f"    </div>"
            f"    <div style='margin-bottom: 14px; padding: 10px; background: #F1F5F9; border-radius: 8px; font-size: 13px; color: #334155;'>"
            f"      <strong>Clinical Reasoning:</strong> {reasoning}"
            f"    </div>"
            f"    <p style='font-size: 12px; color: #9CA3AF; margin: 10px 0 0; border-top: 1px solid #E2E8F0; padding-top: 8px; text-align: center;'><em>Disclaimer: This virtual triage is for guidance only to help you locate the appropriate specialist and does not replace a physical clinical diagnosis.</em></p>"
            f"  </div>"
            f"</div>"
        )

    return msg

class DoctorSerializer(serializers.ModelSerializer):
    specialty = serializers.CharField(source='specialty.name')
    confidence_score = serializers.IntegerField(read_only=True)
    
    class Meta:
        model = Doctor
        fields = ['id', 'name', 'specialty', 'rating', 'photo_url', 'patients_treated', 'reviews_count', 'confidence_score', 'clinic_address']

class PredictDoctorAPI(APIView):
    def post(self, request):
        symptoms = request.data.get('symptoms', '').strip()
        if not symptoms:
            return Response({'error': 'symptoms field required'}, status=status.HTTP_400_BAD_REQUEST)

        # 1. Detect language
        is_ar = is_arabic(symptoms)

        # 2. Check for general conversational queries first
        conv_response = get_conversational_response(symptoms)
        if conv_response:
            return Response(conv_response, status=status.HTTP_200_OK)

        # 3. Use the new Intelligent Medical Triage Assistant
        result = triage_patient(symptoms)
        
        found_specialty_name = result.get('specialty')
        if not found_specialty_name:
            if is_ar:
                html_err = (
                    "<div style='direction: rtl; text-align: right; line-height: 1.6; font-family: sans-serif; padding: 18px; background: #F8FAFC; border-right: 4px solid #D97706; border-radius: 12px; margin: 10px 0;'>"
                    "<h4 style='color: #D97706; font-size: 18px; margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;'>"
                    "<i class='fas fa-question-circle'></i> عذراً، لم أستطع فهم الأعراض الموصوفة بدقة"
                    "</h4>"
                    "<p style='color: #4B5563; font-size: 14px; margin: 0 0 12px 0;'>"
                    "أنا هنا لمساعدتك، ولكنني لم أتمكن من العثور على كلمات مفتاحية طبية متوافقة مع الأعراض المدخلة. لكي أتمكن من توجيهك إلى التخصص الطبي الأنسب، يرجى كتابة الشكوى بطريقة أخرى."
                    "</p>"
                    "<div style='background: #FFFFFF; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; margin-bottom: 12px;'>"
                    "<strong style='color: #1E293B; display: block; margin-bottom: 6px; font-size: 13px;'>💡 نصائح لكتابة وصف واضح:</strong>"
                    "<ul style='margin: 0; padding-right: 20px; font-size: 13px; color: #6B7280; list-style-type: disc;'>"
                    "<li style='margin-bottom: 4px;'>صف العرض الأساسي مباشرة (مثال: \"صداع مستمر\"، \"ألم أسفل الظهر\").</li>"
                    "<li style='margin-bottom: 4px;'>تجنب استخدام الكلمات غير المفهومة أو الرموز التعبيرية فقط.</li>"
                    "<li style='margin-bottom: 4px;'>اذكر العضو أو المكان المصاب بوضوح (مثال: \"وجع في المعدة\").</li>"
                    "</ul>"
                    "</div>"
                    "<p style='color: #4B5563; font-size: 14px; margin: 0;'>"
                    "يمكنك أيضاً تصفح <a href='/doctors' style='color: #2563EB; font-weight: 600; text-decoration: none; border-bottom: 1.5px solid #2563EB;'>دليل الأطباء بالكامل</a> واختيار القسم الطبي بنفسك."
                    "</p>"
                    "</div>"
                )
            else:
                html_err = (
                    "<div style='direction: ltr; text-align: left; line-height: 1.6; font-family: sans-serif; padding: 18px; background: #F8FAFC; border-left: 4px solid #D97706; border-radius: 12px; margin: 10px 0;'>"
                    "<h4 style='color: #D97706; font-size: 18px; margin: 0 0 10px 0; display: flex; align-items: center; gap: 8px;'>"
                    "<i class='fas fa-question-circle'></i> Sorry, I couldn't clearly identify your symptoms"
                    "</h4>"
                    "<p style='color: #4B5563; font-size: 14px; margin: 0 0 12px 0;'>"
                    "I want to guide you to the right care, but the text entered doesn't match any clinical indicators in my database. To get an accurate department recommendation, please describe your condition differently."
                    "</p>"
                    "<div style='background: #FFFFFF; border: 1px solid #E2E8F0; padding: 12px; border-radius: 8px; margin-bottom: 12px;'>"
                    "<strong style='color: #1E293B; display: block; margin-bottom: 6px; font-size: 13px;'>💡 Tips for writing a clear description:</strong>"
                    "<ul style='margin: 0; padding-left: 20px; font-size: 13px; color: #6B7280; list-style-type: disc;'>"
                    "<li style='margin-bottom: 4px;'>State your primary symptom directly (e.g., \"persistent headache\", \"stomach pain\").</li>"
                    "<li style='margin-bottom: 4px;'>Avoid typing random characters or only using emojis.</li>"
                    "<li style='margin-bottom: 4px;'>Specify the affected body area clearly (e.g., \"lower back ache\").</li>"
                    "</ul>"
                    "</div>"
                    "<p style='color: #4B5563; font-size: 14px; margin: 0;'>"
                    "Alternatively, you may explore our <a href='/doctors' style='color: #2563EB; font-weight: 600; text-decoration: none; border-bottom: 1.5px solid #2563EB;'>Doctors Directory</a> to choose a department manually."
                    "</p>"
                    "</div>"
                )
            return Response({'error': html_err}, status=status.HTTP_200_OK)

        # Step 1: Detect Status
        urgency = result.get('urgency')
        is_emergency = (urgency == 'EMERGENCY')
        matched_kws = result.get('matched_keywords', [])

        if is_emergency:
            # Determine rule trigger for specific emergency warning UI
            rule_trigger = 'general'
            if any(k in matched_kws for k in ['suicidal thoughts']):
                rule_trigger = 'suicidal_thoughts'
            elif any(k in matched_kws for k in ['facial droop', 'paralysis', 'stroke symptoms']):
                rule_trigger = 'bp_stroke_crisis'
            elif any(k in matched_kws for k in ['child fever', 'fever']) and any(k in matched_kws for k in ['neck pain', 'neck swelling', 'stiffness', 'morning stiffness']):
                rule_trigger = 'meningitis_risk'
            elif any(k in matched_kws for k in ['chest pain', 'severe chest pain']) and any(k in matched_kws for k in ['shortness of breath', 'difficulty breathing', 'coughing blood']):
                rule_trigger = 'cardiac_emergency'

            if rule_trigger == 'suicidal_thoughts':
                if is_ar:
                    msg = ("<div style='direction: rtl; text-align: right; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>"
                           "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> تحذير طبي عاجل: أفكار انتحارية</h4>"
                           "<p style='color: #991B1B; font-size: 15px; margin: 0 0 10px;'>يرجى العلم أن حياتك غالية ومهمة جداً. تم رصد رغبة أو تفكير في إيذاء النفس.</p>"
                           "<p style='color: #B91C1C; font-weight: 700; font-size: 15px; margin: 0;'>⚠️ يرجى التواصل فوراً مع الخط الساخن للصحة النفسية (16328 في مصر) أو التوجه لأقرب طبيب نفسي أو مستشفى للحصول على المساعدة العاجلة.</p>"
                           "</div>")
                else:
                    msg = ("<div style='direction: ltr; text-align: left; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>"
                           "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> Urgent Clinical Warning: Self-Harm Risk</h4>"
                           "<p style='color: #991B1B; font-size: 15px; margin: 0 0 10px;'>Your life is extremely valuable. We detected signals indicating self-harm or suicidal thoughts.</p>"
                           "<p style='color: #B91C1C; font-weight: 700; font-size: 15px; margin: 0;'>⚠️ Please contact emergency services or a local crisis line (such as 988 or local psychiatry services) immediately for support.</p>"
                           "</div>")
            elif rule_trigger == 'bp_stroke_crisis':
                if is_ar:
                    msg = ("<div style='direction: rtl; text-align: right; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>"
                           "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> تحذير طبي عاجل: اشتباه في أزمة ضغط دم أو سكتة</h4>"
                           "<p style='color: #991B1B; font-size: 15px; margin: 0 0 10px;'>تم رصد أعراض <strong>دوخة أو ارتخاء في الوجه أو شلل</strong>. قد يشير هذا المزيج من الأعراض إلى وجود مشكلة مفاجئة في ضغط الدم أو خطر الإصابة بسكتة دماغية.</p>"
                           "<p style='color: #B91C1C; font-weight: 700; font-size: 15px; margin: 0;'>⚠️ يجب التوجه فوراً إلى أقرب مستشفى أو قسم طوارئ للاطمئنان وفحص ضغط الدم.</p>"
                           "</div>")
                else:
                    msg = ("<div style='direction: ltr; text-align: left; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>"
                           "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> Urgent Medical Warning: Blood Pressure / Stroke Risk</h4>"
                           "<p style='color: #991B1B; font-size: 15px; margin: 0 0 10px;'>We detected <strong>facial droop, paralysis, or stroke signs</strong>. This clinical presentation can indicate a sudden blood pressure crisis or stroke risk.</p>"
                           "<p style='color: #B91C1C; font-weight: 700; font-size: 15px; margin: 0;'>⚠️ Please go to the nearest emergency room immediately to get checked.</p>"
                           "</div>")
            elif rule_trigger == 'meningitis_risk':
                if is_ar:
                    msg = ("<div style='direction: rtl; text-align: right; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>"
                           "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> تحذير طبي عاجل: اشتباه في الحمى الشوكية</h4>"
                           "<p style='color: #991B1B; font-size: 15px; margin: 0 0 10px;'>تم رصد أعراض <strong>سخونة/حرارة</strong> مصاحبة لـ <strong>ألم أو تصلب الرقبة</strong>. قد تشير هذه الأعراض إلى التهاب السحايا (الحمى الشوكية).</p>"
                           "<p style='color: #B91C1C; font-weight: 700; font-size: 15px; margin: 0;'>⚠️ يجب التوجه فوراً لأقرب مستشفى لتلقي الرعاية الطبية الفورية.</p>"
                           "</div>")
                else:
                    msg = ("<div style='direction: ltr; text-align: left; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>"
                           "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> Urgent Medical Warning: Meningitis Risk</h4>"
                           "<p style='color: #991B1B; font-size: 15px; margin: 0 0 10px;'>We detected <strong>fever</strong> combined with <strong>neck pain/stiffness</strong>. This can indicate meningeal irritation (Meningitis).</p>"
                           "<p style='color: #B91C1C; font-weight: 700; font-size: 15px; margin: 0;'>⚠️ Please visit the nearest emergency room immediately for medical evaluation.</p>"
                           "</div>")
            elif rule_trigger == 'cardiac_emergency':
                if is_ar:
                    msg = ("<div style='direction: rtl; text-align: right; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>"
                           "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> تحذير طبي عاجل: اشتباه في أزمة قلبية/تنفسية</h4>"
                           "<p style='color: #991B1B; font-size: 15px; margin: 0 0 10px;'>تم رصد أعراض <strong>ألم أو ضغط في الصدر</strong> مصاحبة لـ <strong>ضيق أو صعوبة التنفس أو السعال المدمم</strong>. قد تشير هذه الأعراض إلى أزمة قلبية حادة أو انسداد رئوي.</p>"
                           "<p style='color: #B91C1C; font-weight: 700; font-size: 15px; margin: 0;'>⚠️ يرجى طلب الإسعاف أو التوجه فوراً لقسم الطوارئ.</p>"
                           "</div>")
                else:
                    msg = ("<div style='direction: ltr; text-align: left; background: #FEF2F2; border: 1.5px solid #FCA5A5; padding: 16px; border-radius: 16px; margin: 10px 0;'>"
                           "<h4 style='color: #DC2626; font-size: 18px; margin-bottom: 8px;'><i class='fas fa-exclamation-triangle'></i> Urgent Medical Warning: Cardiac/Respiratory Emergency</h4>"
                           "<p style='color: #991B1B; font-size: 15px; margin: 0 0 10px;'>We detected <strong>chest pain</strong> combined with <strong>shortness of breath or coughing blood</strong>. This presentation can indicate acute coronary syndrome or pulmonary embolism.</p>"
                           "<p style='color: #B91C1C; font-weight: 700; font-size: 15px; margin: 0;'>⚠️ Please call emergency services or go to the nearest ER immediately.</p>"
                           "</div>")
            else:
                msg = '🚨 Critical symptoms detected! Please seek immediate medical attention or call emergency services (999).'
                if is_ar:
                    msg = '🚨 تم رصد أعراض طارئة وحرجة للغاية! يرجى التوجه فوراً لأقرب مستشفى أو الاتصال بالطوارئ (999).'

            return Response({
                'status': 'emergency',
                'top_specialty': found_specialty_name,
                'message': msg,
                'available_doctors': []
            }, status=status.HTTP_200_OK)

        # Step 2: Fetch Specialty and Doctors (SQLite)
        try:
            specialty = Specialty.objects.get(name=found_specialty_name)
            doctors = Doctor.objects.filter(specialty=specialty, is_active=True).order_by('-rating')[:5]
        except (Specialty.DoesNotExist, Exception):
            specialty = Specialty.objects.filter(name__icontains=found_specialty_name).first()
            if specialty:
                doctors = Doctor.objects.filter(specialty=specialty, is_active=True).order_by('-rating')[:5]
            else:
                doctors = []

        doctors_data = DoctorSerializer(doctors, many=True).data

        # Construct beautiful structured response message
        detailed_msg = generate_medical_message(result, is_ar)

        response_data = {
            'status': 'success',
            'top_specialty': specialty.name if specialty else found_specialty_name,
            'confidence_score': 1.0,
            'matched_symptoms': result.get('matched_keywords', []),
            'message': detailed_msg,
            'available_doctors': doctors_data
        }

        return Response(response_data, status=status.HTTP_200_OK)

