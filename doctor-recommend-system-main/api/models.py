from django.db import models
from django.conf import settings

class Specialty(models.Model):
    name = models.CharField(max_length=100, unique=True)
    # e.g. "Cardiology", "Neurology"

    def __str__(self):
        return self.name

class MedicalKeyword(models.Model):
    word = models.CharField(max_length=100, unique=True)
    specialty = models.ForeignKey(Specialty, on_delete=models.CASCADE)
    is_emergency = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.word} ({self.specialty.name})"

class Doctor(models.Model):
    name        = models.CharField(max_length=200)
    specialty   = models.ForeignKey(Specialty, on_delete=models.PROTECT)
    bio         = models.TextField(blank=True)
    rating      = models.FloatField(default=0.0)
    is_active   = models.BooleanField(default=True)
    photo_url   = models.URLField(blank=True)
    email       = models.EmailField(unique=True, null=True)
    patients_treated = models.IntegerField(default=0)
    reviews_count    = models.IntegerField(default=0)
    clinic_address   = models.CharField(max_length=255, default='Main Clinic')
    created_at  = models.DateTimeField(auto_now_add=True)

    @property
    def confidence_score(self):
        R = self.rating or 0.0
        v = self.reviews_count or 0
        p = self.patients_treated or 0
        if R == 0:
            return 0
        rating_percentage = (R / 5.0) * 100.0
        reviews_factor = v / (v + 5.0)
        patients_factor = p / (p + 15.0)
        confidence_factor = 0.5 * reviews_factor + 0.5 * patients_factor
        return round(rating_percentage * confidence_factor)

    def __str__(self):
        return self.name

class Schedule(models.Model):
    DAYS = [(0,'Mon'),(1,'Tue'),(2,'Wed'),(3,'Thu'),(4,'Fri'),(5,'Sat'),(6,'Sun')]
    doctor     = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name='schedules')
    day_of_week= models.IntegerField(choices=DAYS)
    start_time = models.TimeField()
    end_time   = models.TimeField()
    slot_duration_minutes = models.IntegerField(default=30)

    def __str__(self):
        return f"{self.doctor.name} - {self.get_day_of_week_display()}"
