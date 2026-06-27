from django.contrib import admin
from .models import TimeSlot, Appointment

@admin.register(TimeSlot)
class TimeSlotAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'date', 'start_time', 'is_booked')
    list_filter = ('date', 'is_booked')

@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ('patient', 'doctor', 'slot', 'status', 'created_at')
    list_filter = ('status', 'created_at')
