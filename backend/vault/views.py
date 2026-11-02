import hashlib
import hmac
import os
from django.contrib.auth.hashers import check_password
from django.db import transaction
from django.http import FileResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_GET
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from .models import SharedFile
from .serializers import UploadSerializer


@require_GET
def health(request):
    return JsonResponse({'status': 'ok'})


def public_info(entry):
    return {
        'token': entry.public_token,
        'name': entry.original_name,
        'size': entry.file_size,
        'created_at': entry.created_at.isoformat(),
        'expires_at': entry.expires_at.isoformat(),
        'password_required': entry.password_required,
        'max_downloads': entry.max_downloads,
        'remaining_downloads': entry.remaining_downloads,
        'active': entry.is_active,
        'inactive_reason': entry.inactive_reason,
    }


class UploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'upload'

    def post(self, request):
        serializer = UploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry, manage_key = serializer.save()
        return Response({
            **public_info(entry),
            'share_path': f'/s/{entry.public_token}',
            'manage_key': manage_key,  # Returned only once to the uploader.
            'download_count': 0,
        }, status=status.HTTP_201_CREATED)


class ShareDetailView(APIView):
    def get(self, request, token):
        entry = get_object_or_404(SharedFile, public_token=token)
        return Response(public_info(entry))


class DownloadView(APIView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'download'

    def post(self, request, token):
        # Validate the password outside the row lock (hash verification is relatively slow).
        initial = get_object_or_404(SharedFile, public_token=token)
        if not initial.is_active:
            return Response({'detail': initial.inactive_reason}, status=status.HTTP_410_GONE)
        password = request.data.get('password', '')
        if initial.password_required and (not isinstance(password, str) or not check_password(password, initial.password_hash)):
            return Response({'detail': 'Incorrect password.'}, status=status.HTTP_403_FORBIDDEN)

        with transaction.atomic():
            # PostgreSQL row lock ensures two parallel requests cannot exceed the download limit.
            entry = get_object_or_404(SharedFile.objects.select_for_update(), public_token=token)
            if not entry.is_active:
                return Response({'detail': entry.inactive_reason}, status=status.HTTP_410_GONE)
            try:
                file_handle = entry.stored_file.open('rb')
            except (OSError, ValueError):
                return Response({'detail': 'File is unavailable on the server.'}, status=status.HTTP_410_GONE)
            entry.download_count += 1
            entry.save(update_fields=['download_count'])

        # A count records a download START, not proof of successful transfer completion.
        response = FileResponse(file_handle, as_attachment=True, filename=entry.original_name, content_type='application/octet-stream')
        response['Cache-Control'] = 'no-store'
        return response


class StatsView(APIView):
    def get(self, request, token):
        entry = get_object_or_404(SharedFile, public_token=token)
        manage_key = request.headers.get('X-Manage-Key', '')
        supplied_hash = hashlib.sha256(manage_key.encode()).hexdigest()
        if not manage_key or not hmac.compare_digest(supplied_hash, entry.manage_key_hash):
            return Response({'detail': 'Invalid management key.'}, status=status.HTTP_403_FORBIDDEN)
        return Response({
            **public_info(entry),
            'download_count': entry.download_count,
            'file_deleted': entry.deleted_at is not None,
        })
