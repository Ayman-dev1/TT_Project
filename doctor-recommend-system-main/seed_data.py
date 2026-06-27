import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'HospitalManagement.settings')
django.setup()

from api.models import Specialty, Doctor

specialties = [
    "Cardiology", "Dermatology", "ENT", "Gastroenterology", "Gynecology",
    "Internal Medicine", "Neurology", "Ophthalmology", "Orthopedics",
    "Psychiatry", "Pulmonology", "Rheumatology", "Urology"
]

for s_name in specialties:
    s, created = Specialty.objects.get_or_create(name=s_name)
    if created:
        print(f"Created specialty: {s_name}")

# Create some dummy doctors
docs = [
    ("Dr. Ahmed Ali", "Cardiology", "Expert in heart health", 4.8, 24, 90, "12 El-Galaa St, Cairo"),
    ("Dr. Sarah Hassan", "Dermatology", "Skin specialist", 4.9, 31, 140, "45 Sphinx Square, Giza"),
    ("Dr. Omar Khaled", "Orthopedics", "Bone and joint expert", 4.7, 18, 60, "88 El-Bahr St, Tanta"),
    ("Dr. Mona El-Sayed", "Internal Medicine", "General health expert", 4.6, 12, 35, "32 El-Tahrir St, Dokki, Giza"),
]

for name, spec_name, bio, rating, reviews_count, patients_treated, clinic_address in docs:
    spec = Specialty.objects.get(name=spec_name)
    Doctor.objects.get_or_create(
        name=name,
        specialty=spec,
        defaults={
            'bio': bio,
            'rating': rating,
            'reviews_count': reviews_count,
            'patients_treated': patients_treated,
            'clinic_address': clinic_address,
            'is_active': True
        }
    )
    print(f"Seeded doctor: {name}")
