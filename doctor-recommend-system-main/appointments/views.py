from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .models import TimeSlot, Appointment
from .serializers import AppointmentSerializer
from api.models import Doctor

class ListSlotsView(APIView):
    def get(self, request):
        doctor_id = request.query_params.get('doctor_id')
        date = request.query_params.get('date')
        
        if not doctor_id or not date:
            return Response({'error': 'doctor_id and date query params are required'}, status=400)
            
        slots = TimeSlot.objects.filter(doctor_id=doctor_id, date=date)
        data = [
            {'id': s.id, 'time': s.start_time.strftime('%H:%M'), 'available': not s.is_booked}
            for s in slots
        ]
        
        return Response({
            'doctor_id': doctor_id,
            'date': date,
            'slots': data
        })

class BookAppointmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        doctor_id = request.data.get('doctor_id')
        slot_id = request.data.get('slot_id')
        symptoms = request.data.get('symptoms_description', '')

        try:
            slot = TimeSlot.objects.get(id=slot_id, doctor_id=doctor_id, is_booked=False)
            doctor = Doctor.objects.get(id=doctor_id)
        except (TimeSlot.DoesNotExist, Doctor.DoesNotExist):
            return Response({'error': 'Invalid slot or doctor selected'}, status=400)

        appointment = Appointment.objects.create(
            patient=request.user,
            doctor=doctor,
            slot=slot,
            symptoms_description=symptoms,
            status='confirmed'
        )

        slot.is_booked = True
        slot.save()

        serializer = AppointmentSerializer(appointment)
        return Response(serializer.data, status=201)
