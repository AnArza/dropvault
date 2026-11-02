from django.db import migrations, models
import django.db.models.deletion
import vault.models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name='SharedFile',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('public_token', models.CharField(default=vault.models.random_token, max_length=64, unique=True)),
                ('manage_key_hash', models.CharField(max_length=64)),
                ('original_name', models.CharField(max_length=180)),
                ('file_size', models.PositiveBigIntegerField()),
                ('stored_file', models.FileField(upload_to=vault.models.stored_file_path)),
                ('password_hash', models.CharField(blank=True, max_length=256)),
                ('max_downloads', models.PositiveIntegerField(blank=True, null=True)),
                ('download_count', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField(db_index=True)),
                ('deleted_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
