import time
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone
from vault.models import SharedFile


class Command(BaseCommand):
    help = 'Delete stored blobs after link expiry or exhausted download limits.'

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true', help='Run continuously for Docker Compose.')
        parser.add_argument('--interval', type=int, default=60, help='Seconds between cleanup scans.')

    def handle(self, *args, **options):
        if options['loop'] and options['interval'] < 1:
            raise ValueError('Interval must be positive.')
        while True:
            removed = self.sweep()
            self.stdout.write(f'Cleanup: removed {removed} blob(s).')
            if not options['loop']:
                break
            time.sleep(options['interval'])

    def sweep(self):
        now = timezone.now()
        candidates = SharedFile.objects.filter(deleted_at__isnull=True).filter(
            Q(expires_at__lte=now) | (Q(max_downloads__isnull=False) & Q(download_count__gte=F('max_downloads')))
        ).values_list('pk', flat=True)[:1000]
        removed = 0
        for pk in list(candidates):
            with transaction.atomic():
                item = SharedFile.objects.select_for_update().get(pk=pk)
                if item.is_active or item.deleted_at is not None:
                    continue
                # Clear the file path but keep metadata and statistics in PostgreSQL.
                if item.stored_file:
                    item.stored_file.delete(save=False)
                item.deleted_at = timezone.now()
                item.save(update_fields=['stored_file', 'deleted_at'])
                removed += 1
        return removed
