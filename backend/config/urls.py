from django.urls import path
from vault import views

urlpatterns = [
    path('api/health/', views.health, name='health'),
    path('api/files/', views.UploadView.as_view(), name='upload'),
    path('api/files/<str:token>/stats/', views.StatsView.as_view(), name='stats'),
    path('api/shares/<str:token>/', views.ShareDetailView.as_view(), name='share'),
    path('api/shares/<str:token>/download/', views.DownloadView.as_view(), name='download'),
]
