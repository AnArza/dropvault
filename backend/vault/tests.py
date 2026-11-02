import os
import tempfile
from datetime import timedelta
from unittest.mock import patch
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from .management.commands.cleanup_expired import Command
from .models import SharedFile


class DropVaultTests(TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.addCleanup(self.folder.cleanup)
        self.setting = override_settings(MEDIA_ROOT=self.folder.name)
        self.setting.enable()
        self.addCleanup(self.setting.disable)
        self.client = APIClient()

    def upload(self, **kwargs):
        payload = {
            'file': SimpleUploadedFile('hello.txt', b'hello from dropvault', content_type='text/plain'),
            'expires_in_hours': '24',
            'max_downloads': '1',
            **kwargs,
        }
        response = self.client.post('/api/files/', payload, format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_upload_and_one_download_limit(self):
        entry = self.upload()
        token = entry['token']
        shared = self.client.get(f'/api/shares/{token}/')
        self.assertEqual(shared.status_code, 200)
        self.assertTrue(shared.data['active'])
        response = self.client.post(f'/api/shares/{token}/download/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b''.join(response.streaming_content), b'hello from dropvault')
        denied = self.client.post(f'/api/shares/{token}/download/', {}, format='json')
        self.assertEqual(denied.status_code, 410)
        self.assertEqual(SharedFile.objects.get(public_token=token).download_count, 1)

    def test_password_and_private_statistics(self):
        entry = self.upload(password='passphrase', max_downloads='5')
        token = entry['token']
        url = f'/api/shares/{token}/download/'
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 403)
        self.assertEqual(self.client.post(url, {'password': 'wrong'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(url, {'password': 'passphrase'}, format='json').status_code, 200)
        stats_url = f'/api/files/{token}/stats/'
        self.assertEqual(self.client.get(stats_url).status_code, 403)
        stats = self.client.get(stats_url, HTTP_X_MANAGE_KEY=entry['manage_key'])
        self.assertEqual(stats.status_code, 200)
        self.assertEqual(stats.data['download_count'], 1)
        self.assertNotIn('manage_key', stats.data)
        self.assertNotIn('password_hash', stats.data)

    def test_expired_link_and_cleanup(self):
        entry = self.upload()
        record = SharedFile.objects.get(public_token=entry['token'])
        path = record.stored_file.path
        self.assertTrue(os.path.exists(path))
        record.expires_at = timezone.now() - timedelta(minutes=1)
        record.save(update_fields=['expires_at'])
        self.assertEqual(self.client.post(f'/api/shares/{entry["token"]}/download/', {}, format='json').status_code, 410)
        self.assertEqual(Command().sweep(), 1)
        self.assertFalse(os.path.exists(path))
        record.refresh_from_db()
        self.assertIsNotNone(record.deleted_at)
        self.assertEqual(self.client.get(f'/api/files/{entry["token"]}/stats/', HTTP_X_MANAGE_KEY=entry['manage_key']).data['download_count'], 0)

    def test_exhausted_limit_cleanup_keeps_stats(self):
        entry = self.upload()
        response = self.client.post(f'/api/shares/{entry["token"]}/download/', {}, format='json')
        b''.join(response.streaming_content)
        self.assertEqual(Command().sweep(), 1)
        record = SharedFile.objects.get(public_token=entry['token'])
        self.assertEqual(record.download_count, 1)
        self.assertIsNotNone(record.deleted_at)

    def test_reject_oversized_and_weak_password(self):
        big = SimpleUploadedFile('too-large.bin', b'0' * (20 * 1024 * 1024 + 1))
        response = self.client.post('/api/files/', {'file': big, 'expires_in_hours': '24'}, format='multipart')
        self.assertEqual(response.status_code, 400)
        response = self.client.post('/api/files/', {
            'file': SimpleUploadedFile('tiny.txt', b'ok'), 'password': 'abc'
        }, format='multipart')
        self.assertEqual(response.status_code, 400)
