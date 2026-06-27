import os
import django

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'HospitalManagement.settings')
django.setup()

from api.models import Specialty, MedicalKeyword

def seed():
    # 1. Define Specialties
    specialties_data = [
        "Cardiology", "Orthopedics", "Dentistry", "Gastroenterology", 
        "Ophthalmology", "Dermatology", "Emergency Medicine"
    ]
    
    specialty_objs = {}
    for name in specialties_data:
        obj, _ = Specialty.objects.get_or_create(name=name)
        specialty_objs[name] = obj

    # 2. Define Keywords
    keywords = [
        # Cardiology / Emergency
        ('الم في الصدر', 'Cardiology', True),
        ('ذبحة', 'Cardiology', True),
        ('جلطة', 'Cardiology', True),
        ('نوبة', 'Cardiology', True),
        ('مش قادر اتنفس', 'Cardiology', True),
        ('ضيق شديد', 'Cardiology', True),
        
        # Orthopedics
        ('كسر', 'Orthopedics', False),
        ('مكسور', 'Orthopedics', False),
        ('خلع', 'Orthopedics', False),
        ('التواء', 'Orthopedics', False),
        ('مفاصل', 'Orthopedics', False),
        ('فقرات', 'Orthopedics', False),
        ('ركبتي', 'Orthopedics', False),
        ('عظام', 'Orthopedics', False),
        ('ظهري', 'Orthopedics', False),
        
        # Dentistry
        ('ضرس', 'Dentistry', False),
        ('لثة', 'Dentistry', False),
        ('حشو', 'Dentistry', False),
        ('تقويم', 'Dentistry', False),
        ('عصب', 'Dentistry', False),
        ('درس', 'Dentistry', False),
        
        # Gastroenterology
        ('مغص', 'Gastroenterology', False),
        ('اسهال', 'Gastroenterology', False),
        ('امساك', 'Gastroenterology', False),
        ('غثيان', 'Gastroenterology', False),
        ('ترجيع', 'Gastroenterology', False),
        ('حموضة', 'Gastroenterology', False),
        ('معدتي', 'Gastroenterology', False),
        ('بطني', 'Gastroenterology', False),
        
        # Ophthalmology
        ('زغللة', 'Ophthalmology', False),
        ('عيني', 'Ophthalmology', False),
        ('احمرار', 'Ophthalmology', False),
        ('مية بيضا', 'Ophthalmology', False),
        ('القرنية', 'Ophthalmology', False),
        ('مش شايف', 'Ophthalmology', False),
        
        # Dermatology
        ('طفح', 'Dermatology', False),
        ('هرش', 'Dermatology', False),
        ('حكة', 'Dermatology', False),
        ('حبوب', 'Dermatology', False),
        ('ثعلبة', 'Dermatology', False),
        ('قشرة', 'Dermatology', False),
        ('اكزيما', 'Dermatology', False),
    ]

    for word, spec_name, is_emerg in keywords:
        MedicalKeyword.objects.get_or_create(
            word=word,
            specialty=specialty_objs[spec_name],
            is_emergency=is_emerg
        )
    
    print(f"Successfully seeded {len(keywords)} keywords.")

if __name__ == "__main__":
    seed()
