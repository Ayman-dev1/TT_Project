from rest_framework import serializers
from .models import TimeSlot, Appointment
from api.models import Doctor

class TimeSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = TimeSlot
        fields = ['id', 'time', 'available'] # This will be customized in the view
        
class AppointmentSerializer(serializers.ModelSerializer):
    doctor_name = serializers.CharField(source='doctor.name', read_only=True)
    specialty = serializers.CharField(source='doctor.specialty.name', read_only=True)
    date = serializers.DateField(source='slot.date', read_only=True)
    time = serializers.TimeField(source='slot.start_time', read_only=True)

    class Meta:
        model = Appointment
        fields = [
            'id', 'doctor', 'doctor_name', 'specialty', 'date', 'time', 
            'status', 'symptoms_description'
        ]
