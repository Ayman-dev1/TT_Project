import sys
import os
import django

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'HospitalManagement.settings')
django.setup()

from ai_engine.predictor import predict_from_symptoms

res = predict_from_symptoms("انا عندي دوخة وخدلان")
with open("test_out.txt", "w", encoding="utf-8") as f:
    f.write(str(res))
print("SUCCESS: Output written to test_out.txt")
