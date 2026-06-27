from django.urls import path
from .views import BookAppointmentView, ListSlotsView

urlpatterns = [
    path('book', BookAppointmentView.as_view(), name='book-appointment'),
    path('slots', ListSlotsView.as_view(), name='list-available-slots'),
]
