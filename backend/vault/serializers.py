from pathlib import PurePosixPath
from datetime import timedelta
from django.utils import timezone
from rest_framework import serializers

MAX_FILE_SIZE = 20 * 1024 * 1024


class UploadSerializer(serializers.Serializer):
    file = serializers.FileField(allow_empty_file=False)
    expires_in_hours = serializers.ChoiceField(choices=[1, 24, 168], default=24)
    max_downloads = serializers.IntegerField(min_value=1, max_value=100, required=False, allow_null=True, default=None)
    password = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False, max_length=128, write_only=True)

    def validate_file(self, value):
        if value.size > MAX_FILE_SIZE:
            raise serializers.ValidationError('Maximum allowed file size is 20 MB.')
        return value

    def validate_password(self, password):
        if password and len(password) < 4:
            raise serializers.ValidationError('Use at least 4 characters for the password.')
        return password

    def create(self, validated_data):
        from django.contrib.auth.hashers import make_password
        from hashlib import sha256
        import secrets
        from .models import SharedFile

        uploaded = validated_data['file']
        # Sanitize separators across Windows and POSIX clients, and strip control chars.
        cleaned = uploaded.name.replace('\\', '/')
        cleaned = PurePosixPath(cleaned).name
        cleaned = ''.join(c for c in cleaned if ord(c) >= 32 and ord(c) != 127).strip()
        cleaned = cleaned[:180] or 'download'
        key = secrets.token_urlsafe(32)
        entry = SharedFile.objects.create(
            manage_key_hash=sha256(key.encode()).hexdigest(),
            original_name=cleaned,
            file_size=uploaded.size,
            stored_file=uploaded,
            expires_at=timezone.now() + timedelta(hours=int(validated_data['expires_in_hours'])),
            max_downloads=validated_data['max_downloads'],
            password_hash=make_password(validated_data['password']) if validated_data.get('password') else '',
        )
        return entry, key
