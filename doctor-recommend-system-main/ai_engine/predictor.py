"""
predictor.py  —  v2
====================
ضيفه في:  utils/predictor.py  داخل مشروع Django بتاعك
"""

import pickle
import json
import re
import numpy as np
from pathlib import Path

BASE_DIR = Path(__file__).parent

with open(BASE_DIR / 'model_random_forest.pkl',      'rb') as f: _model_disease   = pickle.load(f)
with open(BASE_DIR / 'model_specialty.pkl',          'rb') as f: _model_specialty = pickle.load(f)
with open(BASE_DIR / 'label_encoder_disease.pkl',    'rb') as f: _le_disease      = pickle.load(f)
with open(BASE_DIR / 'label_encoder_specialty.pkl',  'rb') as f: _le_specialty    = pickle.load(f)
with open(BASE_DIR / 'metadata.json',                'r')  as f: _meta            = json.load(f)

FEATURE_COLS  = _meta['feature_columns']
SPECIALTY_MAP = _meta['specialty_map']

# ── Keyword → feature name ──────────────────────────────────────
KEYWORD_MAP = {
    r'\b(knee|joint|hip)\s*pain\b':                       ('joint_pain', 3),
    r'\bback\s*(pain|ache)\b':                            ('back_pain', 3),
    r'\bchest\s*pain\b':                                  ('chest_pain', 3),
    r'\b(stomach|abdominal|belly)\s*pain\b':              ('stomach_pain', 3),
    r'\bsevere\s*headache\b':                             ('severe_headache', 3),
    r'\b(head\s*ache|headache)\b':                        ('headache', 2),
    r'\bear\s*pain\b':                                    ('ear_pain', 3),
    r'\beye\s*pain\b':                                    ('eye_pain', 3),
    r'\bpelvic\s*pain\b':                                 ('pelvic_pain', 3),
    r'\bmuscle\s*pain\b':                                 ('muscle_pain', 2),
    r'\bside\s*pain|flank\s*pain\b':                      ('side_pain', 3),
    r'\b(groin)\s*pain\b':                                ('pain_in_groin', 3),
    r'\bleft\s*arm\s*pain\b':                             ('left_arm_pain', 3),
    r'\bjaw\s*pain\b':                                    ('jaw_pain', 2),
    r'\bbig\s*toe\s*pain\b':                              ('big_toe_pain', 3),

    r'\bshort(ness)?\s*of\s*breath|difficulty\s*breath\w*|can.?t\s*breath\w*\b': ('shortness_of_breath', 3),
    r'\bdifficulti\w*\s*breath\w*\b':                     ('difficulty_breathing', 3),
    r'\bwheez\w*\b':                                      ('wheezing', 3),
    r'\bchest\s*tight\w*\b':                              ('chest_tightness', 3),
    r'\bpersistent\s*cough\b':                            ('persistent_cough', 3),
    r'\bchronic\s*cough\b':                               ('chronic_cough', 3),
    r'\bcough\b':                                         ('cough', 2),
    r'\bmucus|phlegm|sputum\b':                           ('mucus_production', 2),
    r'\bblood\s*(in\s*)?sputum\b':                        ('blood_in_sputum', 3),
    r'\bnocturnal\s*cough\b':                             ('nocturnal_cough', 3),

    r'\bnausea\b':                                        ('nausea', 2),
    r'\bvomit\w*\b':                                      ('vomiting', 3),
    r'\bdiarrhea\b':                                      ('diarrhea', 3),
    r'\bconstipat\w*\b':                                  ('constipation', 2),
    r'\bbloat\w*\b':                                      ('bloating', 2),
    r'\bheartburn\b':                                     ('heartburn', 3),
    r'\bacid\s*reflux\b':                                 ('acid_reflux', 3),
    r'\bregurgitat\w*\b':                                 ('regurgitation', 3),
    r'\bjaundice|yellow\s*skin\b':                        ('jaundice', 3),
    r'\bdark\s*stool|black\s*stool\b':                    ('dark_stools', 3),
    r'\bloss\s*of\s*appetite|no\s*appetite\b':            ('loss_of_appetite', 2),
    r'\bdark\s*urine\b':                                  ('dark_urine', 3),
    r'\bswoll?en?\s*abdomen\b':                           ('swollen_abdomen', 3),

    r'\bfrequent\s*urinat\w*\b':                          ('frequent_urination', 3),
    r'\bburn\w*\s*(when\s*)?urinat\w*\b':                 ('burning_urination', 3),
    r'\bblood\s*in\s*urine\b':                            ('blood_in_urine', 3),
    r'\bcloudy\s*urine\b':                                ('cloudy_urine', 2),
    r'\bfoamy\s*urine\b':                                 ('foamy_urine', 2),
    r'\bdifficulty\s*urinat\w*\b':                        ('difficulty_urinating', 3),
    r'\bweak\s*urine\s*stream\b':                         ('weak_urine_stream', 3),

    r'\bitchy?\s*skin\b':                                 ('itchy_skin', 2),
    r'\brash\b':                                          ('rash', 2),
    r'\bdry\s*skin\b':                                    ('dry_skin', 2),
    r'\bpimple\b|\bacne\b':                               ('pimples', 3),
    r'\bhive\b':                                          ('hives', 3),
    r'\bscal\w*\b':                                       ('scaling', 2),
    r'\bskin\s*redness\b':                                ('skin_redness', 2),
    r'\bbutterfly\s*rash\b':                              ('butterfly_rash', 3),
    r'\bpale\s*skin\b':                                   ('pale_skin', 3),
    r'\bitchy?\s*skin\b':                                 ('itchy_skin', 3),

    r'\bdizz\w*\b':                                       ('dizziness', 2),
    r'\bspinning\s*sensation|vertigo\b':                  ('spinning_sensation', 3),
    r'\bseizure\b':                                       ('seizures', 3),
    r'\btremor|shak\w*\b':                                ('tremor', 3),
    r'\bnumb\w*\b':                                       ('numbness', 2),
    r'\bconfus\w*\b':                                     ('confusion', 2),
    r'\bfaint\w*|loss\s*of\s*conscious\w*\b':             ('fainting', 3),
    r'\bblurred?\s*vision\b':                             ('blurred_vision', 2),
    r'\bvision\s*(loss|problem\w*)\b':                    ('vision_loss', 3),
    r'\blight\s*sensitiv\w*\b':                           ('light_sensitivity', 3),
    r'\bsound\s*sensitiv\w*\b':                           ('sound_sensitivity', 3),
    r'\bbalance\s*problem\w*\b':                          ('balance_problems', 2),
    r'\bfacial\s*(drop|droop)\w*\b':                      ('facial_drooping', 3),
    r'\barm\s*weak\w*\b':                                 ('arm_weakness', 3),
    r'\bspeech\s*(difficult\w*|problem)\b':               ('speech_difficulty', 3),
    r'\bvisual\s*disturb\w*|aura\b':                      ('visual_disturbances', 2),
    r'\bhalo\w*\s*(around|in)\s*light\b':                 ('halos_around_lights', 3),
    r'\bdouble\s*vision\b':                               ('double_vision', 3),
    r'\bglare\s*sensitiv\w*\b':                           ('glare_sensitivity', 3),
    r'\beye\s*redness|red\s*eye\b':                       ('eye_redness', 3),
    r'\beye\s*discharge\b':                               ('eye_discharge', 3),
    r'\bitchy?\s*eye\b':                                  ('itchy_eyes', 3),
    r'\bwater\w*\s*eye\b':                                ('watery_eyes', 2),
    r'\btinnitus|ringing\s*in\s*(the\s*)?ear\b':          ('tinnitus', 3),
    r'\bhearing\s*(loss|problem)\b':                      ('hearing_loss', 3),
    r'\bear\s*full\w*|blocked\s*ear\b':                   ('ear_fullness', 2),
    r'\bfluid\s*from\s*ear\b':                            ('fluid_from_ear', 3),
    r'\bjerking\s*movement\b':                            ('jerking_movements', 3),
    r'\bstaring\s*spell\b':                               ('staring_spells', 3),
    r'\bslow\s*movement\b':                               ('slow_movement', 3),
    r'\bsoft\s*speech\b':                                 ('soft_speech', 2),
    r'\bbladder\s*problem\b':                             ('bladder_problems', 2),

    r'\bfatigu\w*|tired\b|exhaust\w*|weakness\b':         ('fatigue', 2),
    r'\bfever\b':                                         ('fever', 2),
    r'\bchills\b':                                        ('chills', 2),
    r'\bweight\s*gain\b':                                 ('weight_gain', 2),
    r'\bweight\s*loss\b':                                 ('unexplained_weight_loss', 2),
    r'\bhair\s*loss\b':                                   ('hair_loss', 2),
    r'\bsweat\w*\b':                                      ('sweating', 1),
    r'\bnight\s*sweat\b':                                 ('night_sweats', 3),
    r'\bswoll?en?\s*(leg|ankle)\b':                       ('swollen_legs', 3),
    r'\bswoll?en?\b':                                     ('swelling', 1),
    r'\bpalpitat\w*|racing\s*heart\b':                    ('heart_palpitations', 2),
    r'\birregular\s*heartbeat\b':                         ('irregular_heartbeat', 2),
    r'\bsore\s*throat\b':                                 ('sore_throat', 3),
    r'\bdifficulty\s*swallow\w*\b':                       ('difficulty_swallowing', 3),
    r'\bnasal\s*congestion|stuffy\s*nose\b':              ('nasal_congestion', 3),
    r'\brunny\s*nose\b':                                  ('runny_nose', 2),
    r'\bfacial\s*pain\b':                                 ('facial_pain', 3),
    r'\bpostnasal\s*drip\b':                              ('postnasal_drip', 2),
    r'\bbad\s*breath\b':                                  ('bad_breath', 2),
    r'\breduced\s*smell\b':                               ('reduced_smell', 2),
    r'\bswoll?en?\s*lymph\b':                             ('swollen_lymph_nodes', 3),

    r'\bsleep\s*(problem|disorder|issue)\b|\binsomnia\b': ('sleep_problems', 2),
    r'\bdepress\w*\b':                                    ('depression', 2),
    r'\banxiet\w*|anxious\b':                             ('anxiety', 2),
    r'\bmood\s*swing\b':                                  ('mood_swings', 2),
    r'\birritab\w*\b':                                    ('irritability', 2),
    r'\bsadness|sad\b':                                   ('sadness', 3),
    r'\bloss\s*of\s*interest\b':                          ('loss_of_interest', 3),
    r'\bconcentrat\w*\s*problem\b':                       ('concentration_problems', 2),
    r'\bmemory\s*problem\b':                              ('memory_problems', 2),
    r'\bmania|manic\b':                                   ('mania', 3),
    r'\bimpulsiv\w*\b':                                   ('impulsive_behavior', 2),
    r'\bracing\s*thought\b':                              ('racing_thoughts', 2),

    r'\bstiffness|stiff\b':                               ('stiffness', 2),
    r'\bmorning\s*stiffness\b':                           ('morning_stiffness', 3),
    r'\bjoint\s*swoll?\w*\b':                             ('joint_swelling', 3),
    r'\bjoint\s*warm\w*\b':                               ('joint_warmth', 2),
    r'\bjoint\s*redness\b':                               ('joint_redness', 3),
    r'\bmuscle\s*(spasm|cramp)\b':                        ('muscle_spasms', 2),
    r'\bmuscle\s*weak\w*\b':                              ('muscle_weakness', 2),
    r'\bweak\w*\b':                                       ('weakness', 1),
    r'\bbon\w*\s*fracture\b':                             ('bone_fracture', 3),
    r'\bstoop\w*\s*posture\b':                            ('stooped_posture', 2),
    r'\bwidespread\s*pain\b':                             ('widespread_pain', 3),
    r'\binstabilit\w*\b':                                 ('instability', 2),
    r'\btenderness\b':                                    ('tenderness', 2),
    r'\bbruis\w*\b':                                      ('bruising', 2),
    r'\bdeformity\b':                                     ('deformity', 3),
    r'\bcan.?t\s*move\b':                                 ('inability_to_move', 3),

    r'\bfrequent\s*urinat\w*\b':                          ('frequent_urination', 3),
    r'\bexcessiv\w*\s*thirst\b':                          ('excessive_thirst', 3),
    r'\bexcessiv\w*\s*hunger\b':                          ('increased_hunger', 2),
    r'\bslow\s*heal\w*\b':                                ('slow_healing_wounds', 2),
    r'\bnumb\w*\s*(in\s*)?feet\b':                        ('numbness_in_feet', 2),
    r'\bneck\s*swoll?\w*\b':                              ('neck_swelling', 3),
    r'\bcold\s*(hand|feet)\b':                            ('cold_hands_feet', 2),
    r'\bheat\s*intoler\w*\b':                             ('heat_intolerance', 2),
    r'\bcold\s*intoler\w*\b':                             ('cold_intolerance', 2),
    r'\bsnor\w*\b':                                       ('snoring', 2),
    r'\birregular\s*period\b':                            ('irregular_periods', 3),
    r'\bpainful\s*period\b':                              ('painful_periods', 3),
    r'\bheavy\s*bleed\w*\b':                              ('heavy_bleeding', 3),
    r'\bmissed\s*period\b':                               ('missed_periods', 3),
    r'\binfertil\w*\b':                                   ('infertility', 3),
    r'\bexcessiv\w*\s*hair\s*growth\b':                   ('excessive_hair_growth', 3),
    r'\bpain\s*(during|with)\s*intercourse\b':            ('pain_during_intercourse', 3),

    r'\bnosebleed\b':                                     ('nosebleed', 2),
    r'\bdehydrat\w*\b':                                   ('dehydration', 2),
    r'\bcyanosis|blue\s*lip\b':                           ('cyanosis', 3),
    r'\brheumatoid\s*nodul\w*\b':                         ('rheumatoid_nodules', 3),
    r'\bbutterfly\s*rash\b':                              ('butterfly_rash', 3),
    r'\bsun\s*sensitiv\w*\b':                             ('sensitivity_to_sun', 3),
    r'\bmouth\s*ulcer\b':                                 ('mouth_ulcers', 2),
    r'\bhypertension|high\s*blood\s*pressure\b':          ('hypertension', 3),
    r'\bkidney\s*problem\b':                              ('kidney_problems', 2),
    r'\breduce\w*\s*urine\b':                             ('reduced_urine_output', 3),
    r'\bswoll?en?\s*ankle\b':                             ('swollen_ankles', 3),
    r'\bfoamy\s*urine\b':                                 ('foamy_urine', 2),
    r'\berectile\s*dysfunction\b':                        ('erectile_dysfunction', 3),
    r'\bbrittle\s*nail\b':                                ('brittle_nails', 2),
    r'\bnail\s*change\b':                                 ('nail_changes', 2),
    r'\bcolor\s*fad\w*\b':                                ('color_fading', 2),
    r'\bglaucoma\b':                                      ('vision_loss', 3),
}


def text_to_feature_vector(text: str):
    text_lower = text.lower()
    vector = {col: 0 for col in FEATURE_COLS}
    matched = []

    for pattern, (feature_name, weight) in KEYWORD_MAP.items():
        if feature_name in vector and re.search(pattern, text_lower):
            if vector[feature_name] < weight:  # take highest weight
                vector[feature_name] = weight
            if feature_name not in matched:
                matched.append(feature_name)

    return [vector[col] for col in FEATURE_COLS], matched


def predict_from_symptoms(symptom_text: str, top_n: int = 3) -> dict:
    """
    الدالة الرئيسية — استخدمها في الـ Django view

    Example:
        result = predict_from_symptoms("knee pain and difficulty walking")
        # {
        #   "predictions": [{"disease": "Arthritis", "specialty": "Orthopedics", "confidence": 87}, ...],
        #   "top_specialty": "Orthopedics",
        #   "matched_symptoms": ["joint_pain"]
        # }
    """
    vector, matched = text_to_feature_vector(symptom_text)

    if not matched:
        return {
            "input": symptom_text,
            "matched_symptoms": [],
            "predictions": [],
            "top_specialty": None,
            "error": "No recognizable symptoms found. Please describe symptoms in more detail."
        }

    X = np.array(vector).reshape(1, -1)

    # Get raw probabilities from disease model
    disease_probs = _model_disease.predict_proba(X)[0]
    top_indices   = disease_probs.argsort()[-top_n:][::-1]
    top_probs     = disease_probs[top_indices]

    # Normalize to relative confidence among top-N
    total = top_probs.sum()
    rel_probs = (top_probs / total) if total > 0 else top_probs

    predictions = []
    for i, idx in enumerate(top_indices):
        disease   = _le_disease.classes_[idx]
        specialty = SPECIALTY_MAP.get(disease, "General Practice")
        predictions.append({
            "disease":    disease,
            "specialty":  specialty,
            "confidence": round(float(rel_probs[i]) * 100, 1)   # percentage
        })

    return {
        "input":            symptom_text,
        "matched_symptoms": matched,
        "predictions":      predictions,
        "top_specialty":    predictions[0]['specialty'] if predictions else None
    }


# ── Django view integration example ─────────────────────────────
# في api/views.py:
#
# from utils.predictor import predict_from_symptoms
# from rest_framework.views import APIView
# from rest_framework.response import Response
#
# class RecommendDoctorView(APIView):
#     def post(self, request):
#         symptoms = request.data.get('symptoms', '')
#         if not symptoms:
#             return Response({'error': 'symptoms field required'}, status=400)
#         result = predict_from_symptoms(symptoms)
#         return Response(result)


if __name__ == '__main__':
    tests = [
        "knee pain and difficulty walking",
        "chest pain and shortness of breath with left arm pain",
        "frequent urination excessive thirst fatigue blurred vision",
        "severe headache nausea light sensitivity visual disturbances",
        "itchy skin rash dry skin scaling",
        "sore throat fever difficulty swallowing swollen lymph nodes",
        "dizziness spinning sensation nausea balance problems",
        "sadness loss of interest fatigue sleep problems concentration problems",
        "irregular periods weight gain acne hair loss excessive hair growth",
        "joint swelling morning stiffness symmetric joint involvement fatigue",
    ]
    print("\n" + "="*60)
    print("PREDICTOR v2  —  TEST RESULTS")
    print("="*60)
    for t in tests:
        r = predict_from_symptoms(t)
        top = r['predictions'][0] if r['predictions'] else {}
        print(f"\n📝 '{t[:50]}'")
        print(f"   Matched:   {r['matched_symptoms']}")
        print(f"   ► {top.get('disease','?'):30s} {top.get('confidence',0):.0f}%  →  {top.get('specialty','?')}")
        if len(r['predictions']) > 1:
            p2 = r['predictions'][1]
            print(f"   ► {p2.get('disease','?'):30s} {p2.get('confidence',0):.0f}%  →  {p2.get('specialty','?')}")


def is_arabic(text):
    if not text:
        return False
    return any('\u0600' <= char <= '\u06FF' for char in text)
