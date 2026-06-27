from django.db import models
from django.conf import settings
from api.models import Doctor

class TimeSlot(models.Model):
    doctor     = models.ForeignKey(Doctor, on_delete=models.CASCADE)
    date       = models.DateField()
    start_time = models.TimeField()
    end_time   = models.TimeField()
    is_booked  = models.BooleanField(default=False)

    class Meta:
        unique_together = ('doctor', 'date', 'start_time')

    def __str__(self):
        return f"{self.doctor.name} - {self.date} {self.start_time}"

class Appointment(models.Model):
    STATUS = [('pending','Pending'),('confirmed','Confirmed'),('cancelled','Cancelled'),('completed','Completed')]
    patient             = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    doctor              = models.ForeignKey(Doctor, on_delete=models.PROTECT)
    slot                = models.OneToOneField(TimeSlot, on_delete=models.PROTECT)
    symptoms_description= models.TextField()
    ai_prediction       = models.JSONField(null=True, blank=True)  # store predictor output
    status              = models.CharField(max_length=20, choices=STATUS, default='pending')
    created_at          = models.DateTimeField(auto_now_add=True)
    notes               = models.TextField(blank=True)

    def __str__(self):
        return f"Appt {self.id} - {self.patient.username} with {self.doctor.name}"
