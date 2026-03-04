"""
🔐 Модуль шифрования для защиты конфиденциальных данных.
Использует AES-256-GCM для шифрования паролей пользователей.

ВАЖНО: 
- Ключ шифрования CREDENTIALS_ENCRYPTION_KEY должен быть в .env
- Ключ должен быть 32 байта (64 hex символа)
- Генерация ключа: python -c "import secrets; print(secrets.token_hex(32))"
"""
import os
import base64
import logging
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

logger = logging.getLogger(__name__)

# Получаем ключ из переменных окружения
_ENCRYPTION_KEY = os.getenv("CREDENTIALS_ENCRYPTION_KEY", "")

# Соль для дополнительной защиты (можно захардкодить или хранить в .env)
_SALT = b"sunny_football_academy_2024"


class CredentialEncryption:
    """
    Класс для шифрования/дешифрования учётных данных.
    
    Использование:
        encryptor = CredentialEncryption()
        
        # Шифрование
        encrypted = encryptor.encrypt("my_password")
        
        # Дешифрование
        decrypted = encryptor.decrypt(encrypted)
    """
    
    def __init__(self):
        self._key = self._derive_key()
        self._aesgcm = AESGCM(self._key) if self._key else None
        
    def _derive_key(self) -> Optional[bytes]:
        """Генерирует ключ шифрования из мастер-ключа."""
        if not _ENCRYPTION_KEY:
            logger.warning(
                "⚠️ CREDENTIALS_ENCRYPTION_KEY не установлен! "
                "Пароли будут храниться без шифрования. "
                "Добавьте ключ в .env: CREDENTIALS_ENCRYPTION_KEY=<64 hex символа>"
            )
            return None
        
        try:
            # Преобразуем hex строку в байты
            master_key = bytes.fromhex(_ENCRYPTION_KEY)
            
            # Используем PBKDF2 для деривации ключа (дополнительная защита)
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,  # 256 бит для AES-256
                salt=_SALT,
                iterations=100000,
            )
            return kdf.derive(master_key)
        except ValueError as e:
            logger.error(f"❌ Неверный формат CREDENTIALS_ENCRYPTION_KEY: {e}")
            return None
    
    @property
    def is_enabled(self) -> bool:
        """Проверяет, включено ли шифрование."""
        return self._aesgcm is not None
    
    def encrypt(self, plaintext: str) -> str:
        """
        Шифрует строку.
        
        Args:
            plaintext: Открытый текст (пароль)
            
        Returns:
            Зашифрованная строка в формате base64 (nonce + ciphertext)
            Или исходный текст, если шифрование отключено
        """
        if not self._aesgcm:
            # Если шифрование не настроено - возвращаем как есть
            # (для обратной совместимости)
            return plaintext
        
        try:
            # Генерируем случайный nonce (12 байт для GCM)
            nonce = os.urandom(12)
            
            # Шифруем
            ciphertext = self._aesgcm.encrypt(
                nonce, 
                plaintext.encode('utf-8'), 
                None  # associated_data
            )
            
            # Объединяем nonce + ciphertext и кодируем в base64
            encrypted_data = nonce + ciphertext
            return base64.b64encode(encrypted_data).decode('utf-8')
            
        except Exception as e:
            logger.error(f"❌ Ошибка шифрования: {e}")
            # В случае ошибки возвращаем исходный текст
            return plaintext
    
    def decrypt(self, encrypted: str) -> str:
        """
        Дешифрует строку.
        
        Args:
            encrypted: Зашифрованная строка в формате base64
            
        Returns:
            Расшифрованный текст
            Или исходная строка, если это не зашифрованные данные
        """
        if not self._aesgcm:
            # Если шифрование не настроено - возвращаем как есть
            return encrypted
        
        try:
            # Декодируем из base64
            encrypted_data = base64.b64decode(encrypted.encode('utf-8'))
            
            # Разделяем nonce и ciphertext
            nonce = encrypted_data[:12]
            ciphertext = encrypted_data[12:]
            
            # Дешифруем
            plaintext = self._aesgcm.decrypt(nonce, ciphertext, None)
            return plaintext.decode('utf-8')
            
        except Exception as e:
            # Если не удалось расшифровать - возможно это старый нешифрованный пароль
            logger.debug(f"Не удалось расшифровать (возможно старый формат): {e}")
            return encrypted
    
    def is_encrypted(self, value: str) -> bool:
        """
        Проверяет, зашифрована ли строка.
        
        Зашифрованные данные в base64 обычно длиннее 
        и содержат только base64 символы.
        """
        if not value or len(value) < 30:
            return False
        
        try:
            # Пробуем декодировать как base64
            decoded = base64.b64decode(value.encode('utf-8'))
            # Зашифрованные данные минимум 12 (nonce) + 16 (auth tag) + 1 (data) байт
            return len(decoded) >= 29
        except:
            return False
    
    def migrate_plaintext(self, plaintext: str) -> str:
        """
        Мигрирует незашифрованный пароль в зашифрованный формат.
        Используется для обновления старых записей.
        """
        if self.is_encrypted(plaintext):
            # Уже зашифрован
            return plaintext
        return self.encrypt(plaintext)


# Глобальный экземпляр
credential_encryptor = CredentialEncryption()


def encrypt_password(password: str) -> str:
    """Удобная функция для шифрования пароля."""
    return credential_encryptor.encrypt(password)


def decrypt_password(encrypted: str) -> str:
    """Удобная функция для дешифрования пароля."""
    return credential_encryptor.decrypt(encrypted)


def is_encryption_enabled() -> bool:
    """Проверяет, включено ли шифрование."""
    return credential_encryptor.is_enabled
