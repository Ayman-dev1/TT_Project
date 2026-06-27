import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ai_engine.triage import triage_patient

test_cases = [
    # English tests
    "I have severe chest pain and shortness of breath",
    "I feel itchy skin and rash",
    "frequent urination, excessive thirst, and feeling very tired",
    "I want to die, having suicidal thoughts",
    
    # Arabic tests
    "عندي مغص شديد وترجيع وإسهال",
    "عندي صداع نصفي شديد وتنميل في اليد",
    "حرارة مرتفعة لطفلي مع كحة مستمرة",
    "عندي وجع في أسنانى وضرسى بيوجعنى",
    "أنا حامل وعايزة أطمن على البيبي"
]

print("="*60)
print("TESTING TRIAGE ENGINE")
print("="*60)
for t in test_cases:
    res = triage_patient(t)
    print(f"\n📝 Input: '{t}'")
    print(f"   Specialty: {res['specialty']}")
    print(f"   Diagnosis: {res['possible_diagnosis']}")
    print(f"   Confidence: {res['confidence']}")
    print(f"   Urgency: {res['urgency']}")
    print(f"   Severity Score: {res.get('severity_score')}")
    print(f"   Description: {res.get('description')}")
    print(f"   Precautions: {res.get('precautions')}")
    print(f"   Reasoning: {res['reasoning']}")
print("="*60)
