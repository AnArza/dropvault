import secrets
import uuid
from django.db import models
from django.utils import timezone


def random_token():
    return secrets.token_urlsafe(24)


def stored_file_path(instance, filename):
    # Never use user filenames in the filesystem path.
    return f'{instance.public_token}/{uuid.uuid4().hex}'


class SharedFile(models.Model):
    public_token = models.CharField(max_length=64, unique=True, default=random_token)
    manage_key_hash = models.CharField(max_length=64)
    original_name = models.CharField(max_length=180)
    file_size = models.PositiveBigIntegerField()
    stored_file = models.FileField(upload_to=stored_file_path)
    password_hash = models.CharField(max_length=256, blank=True)
    max_downloads = models.PositiveIntegerField(null=True, blank=True)
    download_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    @property
    def is_active(self):
        return self.deleted_at is None and timezone.now() < self.expires_at and (
            self.max_downloads is None or self.download_count < self.max_downloads
        )

    @property
    def remaining_downloads(self):
        return None if self.max_downloads is None else max(0, self.max_downloads - self.download_count)

    @property
    def password_required(self):
        return bool(self.password_hash)

    @property
    def inactive_reason(self):
        if self.deleted_at is not None:
            return 'File no longer available'
        if timezone.now() >= self.expires_at:
            return 'This link has expired'
        if self.max_downloads is not None and self.download_count >= self.max_downloads:
            return 'Download limit reached'
        return None

    def __str__(self):
        return self.original_name
