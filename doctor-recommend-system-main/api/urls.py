from django.urls import path
from api.views.new_view import PredictDoctorAPI

urlpatterns = [
    path("recommend-doc", view=PredictDoctorAPI.as_view(), name="recommend-doc")
]