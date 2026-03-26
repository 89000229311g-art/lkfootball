import { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../context/LanguageContext';

const AvatarUpload = ({ currentAvatar, onUpload, onDelete, size = 'large' }) => {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentAvatar);
  const fileInputRef = useRef(null);

  // Sync preview with currentAvatar when it changes (e.g., after upload)
  useEffect(() => {
    setPreview(currentAvatar);
  }, [currentAvatar]);

  const sizeClasses = {
    small: 'w-16 h-16',
    medium: 'w-24 h-24',
    large: 'w-32 h-32',
    xlarge: 'w-40 h-40'
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert(t('only_images_allowed') || 'Только изображения разрешены (JPG, PNG)');
      return;
    }

    // Validate HEIC (Apple format) - often problematic for direct preview/upload without conversion
    if (file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic')) {
        alert(t('heic_not_supported') || 'Формат HEIC (Apple) пока не поддерживается напрямую. Пожалуйста, сделайте скриншот фото или измените настройки камеры на "Наиболее совместимый" (JPEG), чтобы загрузить фото прямо с телефона.');
        return;
    }

    // Validate file size (Increased to 50MB to match server config)
    if (file.size > 50 * 1024 * 1024) {
      alert(t('file_too_large') || 'Файл слишком большой (макс. 50MB)');
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);

    // Upload
    setUploading(true);
    try {
      await onUpload(file);
    } catch (error) {
      console.error('Upload error:', error);
      const msg = error.response?.data?.detail || error.message || 'Ошибка загрузки';
      alert(`${t('upload_failed') || 'Ошибка загрузки'}: ${msg}`);
      setPreview(currentAvatar);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('delete_photo_confirm') || 'Удалить фото?')) return;

    setUploading(true);
    try {
      await onDelete();
      setPreview(null);
    } catch (error) {
      console.error('Delete error:', error);
      alert(t('delete_failed') || 'Ошибка удаления');
    } finally {
      setUploading(false);
    }
  };

  const getInitials = () => {
    // You can pass user/student name as prop if needed
    return '👤';
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar Display */}
      <div className={`relative ${sizeClasses[size]} rounded-full overflow-hidden bg-gray-200 border-4 border-white shadow-lg`}>
        {preview ? (
          <img
            src={preview}
            alt={t('avatar_alt')}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-400">
            {getInitials()}
          </div>
        )}
        
        {/* Upload overlay */}
        {!uploading && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-40 transition-all duration-200 flex items-center justify-center opacity-0 hover:opacity-100"
          >
            <span className="text-white text-sm font-medium">
              📷 {t('change_photo')}
            </span>
          </button>
        )}

        {/* Loading overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          📤 {preview ? t('change_photo') : t('upload_photo')}
        </button>
        
        {preview && (
          <button
            onClick={handleDelete}
            disabled={uploading}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            🗑️ {t('delete_photo')}
          </button>
        )}
      </div>

      {/* File requirements hint */}
      <p className="text-xs text-gray-500 text-center">
        {t('photo_requirements')}
      </p>
    </div>
  );
};

export default AvatarUpload;
