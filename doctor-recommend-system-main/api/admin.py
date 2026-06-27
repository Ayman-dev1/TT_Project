from django.contrib import admin
from .models import Specialty, Doctor, Schedule, MedicalKeyword

@admin.register(Specialty)
class SpecialtyAdmin(admin.ModelAdmin):
    list_display = ('name',)

@admin.register(MedicalKeyword)
class MedicalKeywordAdmin(admin.ModelAdmin):
    list_display = ('word', 'specialty', 'is_emergency')
    list_filter = ('specialty', 'is_emergency')
    search_fields = ('word',)

@admin.register(Doctor)
class DoctorAdmin(admin.ModelAdmin):
    list_display = ('name', 'specialty', 'rating', 'is_active')
    list_filter = ('specialty', 'is_active')
    search_fields = ('name',)

@admin.register(Schedule)
class ScheduleAdmin(admin.ModelAdmin):
    list_display = ('doctor', 'day_of_week', 'start_time', 'end_time')
    list_filter = ('day_of_week',)
