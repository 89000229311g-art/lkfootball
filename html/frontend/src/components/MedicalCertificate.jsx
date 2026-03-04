import React, { useState, useRef } from 'react';
import { Calendar, Upload, FileText, AlertCircle, CheckCircle, X, Activity } from 'lucide-react';
import { uploadAPI as fileUploadAPI, studentsAPI } from '../api/client';
import { useAuth } from '../context/AuthContext';

import CustomDatePicker from './CustomDatePicker';

const MedicalCertificate = ({ student, onUpdate, t, hideHeaderOnMobile = false }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  const [expiryDate, setExpiryDate] = useState(student.medical_certificate_expires || '');
  const [editingDate, setEditingDate] = useState(false);

  // Check status
  const today = new Date();
  const expiry = student.medical_certificate_expires ? new Date(student.medical_certificate_expires) : null;
  const isExpired = expiry && expiry < today;
  const isValid = expiry && expiry >= today;
  const hasFile = !!student.medical_certificate_file;

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      // 1. Upload file
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fileUploadAPI.uploadMedicalDoc(formData);
      const fileUrl = response.url;

      // 2. Update student record
      await studentsAPI.update(student.id, {
        medical_certificate_file: fileUrl,
        // If date is not set, maybe set it? User should set date manually.
      });

      onUpdate();
    } catch (error) {
      console.error('Failed to upload medical certificate:', error);
      alert(t('uploadError'));
    } finally {
      setUploading(false);
    }
  };

  const handleDateSave = async () => {
    setLoading(true);
    try {
      await studentsAPI.update(student.id, {
        medical_certificate_expires: expiryDate || null
      });
      setEditingDate(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to update date:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickUpdate = async (months) => {
    setLoading(true);
    try {
      const date = new Date();
      date.setMonth(date.getMonth() + months);
      const dateStr = date.toISOString().split('T')[0];
      
      await studentsAPI.update(student.id, {
        medical_certificate_expires: dateStr
      });
      setExpiryDate(dateStr);
      onUpdate();
    } catch (error) {
      console.error('Failed to quick update:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm(t('confirm_delete'))) return;
    setLoading(true);
    try {
      await studentsAPI.update(student.id, {
        medical_certificate_expires: null,
        medical_certificate_file: null
      });
      setExpiryDate('');
      onUpdate();
    } catch (error) {
      console.error('Failed to clear:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNotesSave = async () => {
    setLoading(true);
    try {
      await studentsAPI.update(student.id, {
        medical_notes: medicalNotes
      });
      setEditingNotes(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to update notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const [medicalNotes, setMedicalNotes] = useState(student.medical_notes || '');
  const [editingNotes, setEditingNotes] = useState(false);

  const canEditNotes = ['admin', 'super_admin', 'parent', 'coach', 'owner'].includes(user?.role);
  const canEditCertificate = ['admin', 'super_admin', 'coach', 'owner'].includes(user?.role); // Admins and Coaches edit validity
  const canUploadFile = ['admin', 'super_admin', 'parent', 'coach', 'owner'].includes(user?.role); // Parents and Coaches can upload

  return (
    <div className="space-y-4">
      {/* Medical Notes Section */}
      <div className="bg-white/5 rounded-xl p-3 border border-white/10 mb-4">
        <h3 className="text-base font-bold text-brand-yellow mb-2 flex items-center gap-2">
          <AlertCircle className="text-brand-yellow" size={18} />
          {t('medical_contraindications') || 'Медицинские противопоказания'}
        </h3>
        
        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            {t('medical_notes_description')}
          </p>
          
          <div className="relative">
            <textarea
              value={medicalNotes}
              onChange={(e) => setMedicalNotes(e.target.value)}
              disabled={!canEditNotes || !editingNotes}
              placeholder={t('medical_notes_placeholder')}
              rows={2}
              className={`w-full min-h-[50px] bg-black/20 border rounded-lg p-2 text-sm text-white focus:outline-none focus:border-yellow-500 transition-all ${
                editingNotes ? 'border-yellow-500/50' : 'border-white/10 opacity-80'
              }`}
            />
            {canEditNotes && (
              <div className="absolute bottom-2 right-2 flex gap-1">
                {!editingNotes ? (
                  <button
                    onClick={() => setEditingNotes(true)}
                    className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white transition-colors"
                  >
                    {t('edit')}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setMedicalNotes(student.medical_notes || '');
                        setEditingNotes(false);
                      }}
                      className="px-2 py-0.5 bg-white/10 hover:bg-white/20 rounded text-[10px] text-white transition-colors"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={handleNotesSave}
                      disabled={loading}
                      className="px-2 py-0.5 bg-brand-yellow hover:bg-yellow-400 rounded text-[10px] text-black font-bold transition-colors"
                    >
                      {t('save')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white/5 rounded-xl p-3 border border-white/10">
      <h3 className={`text-base font-bold text-brand-yellow mb-3 flex items-center gap-2 ${hideHeaderOnMobile ? 'hidden md:flex' : ''}`}>
        <Activity 
          className="text-brand-yellow" 
        />
        {t('medical_certificate')}
      </h3>

      <div className="space-y-4">
        {/* Status Banner */}
        <div className={`p-3 rounded-lg flex items-start gap-3 ${
          isValid ? 'bg-green-500/10 border border-green-500/20' : 
          isExpired ? 'bg-red-500/10 border border-red-500/20' : 
          'bg-yellow-500/10 border border-yellow-500/20'
        }`}>
          {isValid ? <CheckCircle className="text-green-500 shrink-0" /> : 
           isExpired ? <AlertCircle className="text-red-500 shrink-0" /> : 
           <AlertCircle className="text-yellow-500 shrink-0" />}
          
          <div className="flex-1">
            <h4 className={`font-bold ${
              isValid ? 'text-green-400' : 
              isExpired ? 'text-red-400' : 
              'text-yellow-400'
            }`}>
              {isValid ? t('certificate_valid') : 
               isExpired ? t('certificate_expired') : 
               t('certificate_missing')}
            </h4>
            {expiry && (
              <p className="text-sm text-white/60 mt-1">
                {t('valid_until')}: {new Date(expiry).toLocaleDateString()}
              </p>
            )}
            
            {/* Quick Actions */}
            {canEditCertificate && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  onClick={() => handleQuickUpdate(6)}
                  disabled={loading}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white border border-white/10 transition-colors"
                >
                  +6 {t('month_short')}
                </button>
                <button
                  onClick={() => handleQuickUpdate(12)}
                  disabled={loading}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs text-white border border-white/10 transition-colors"
                >
                  +1 {t('year_short')}
                </button>
                {(isValid || isExpired) && (
                  <button
                    onClick={handleClear}
                    disabled={loading}
                    className="px-2 py-1 bg-red-500/10 hover:bg-red-500/20 rounded text-xs text-red-400 border border-red-500/20 transition-colors"
                  >
                    {t('delete')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Expiry Date Input */}
        <div className="space-y-2">
          <label className="text-sm text-gray-400">{t('expiry_date')}</label>
          <div className="flex gap-2">
            <div className="w-full">
              <CustomDatePicker
                selected={expiryDate ? new Date(expiryDate) : null}
                onChange={(date) => {
                  if (date) {
                    const year = date.getFullYear();
                    const month = String(date.getMonth() + 1).padStart(2, '0');
                    const day = String(date.getDate()).padStart(2, '0');
                    setExpiryDate(`${year}-${month}-${day}`);
                  } else {
                    setExpiryDate('');
                  }
                }}
                disabled={!canEditCertificate || (!editingDate && expiryDate)}
                placeholder={t('select_date')}
                className="bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white w-full focus:outline-none focus:border-yellow-500 disabled:opacity-50"
              />
            </div>
            {canEditCertificate && (
              !editingDate && expiryDate ? (
                <button 
                  onClick={() => setEditingDate(true)}
                  className="px-3 py-2 bg-white/10 rounded-lg hover:bg-white/20 text-white"
                >
                  {t('edit')}
                </button>
              ) : (
                <button 
                  onClick={handleDateSave}
                  disabled={loading}
                  className="px-3 py-2 bg-brand-yellow text-black font-bold rounded-lg hover:bg-yellow-400"
                >
                  {loading ? '...' : t('save')}
                </button>
              )
            )}
          </div>
        </div>

        {/* File Upload/View */}
        <div className="space-y-2">
          <label className="text-sm text-gray-400">{t('document_file')}</label>
          
          {hasFile ? (
            <div className="flex items-center justify-between bg-white/5 p-3 rounded-lg border border-white/10">
              <div className="flex items-center gap-3">
                <FileText className="text-blue-400" />
                <span className="text-sm text-white truncate max-w-[200px]">
                  {t('certificate_file')}
                </span>
              </div>
              <div className="flex gap-2">
                <a 
                  href={`http://localhost:8000${student.medical_certificate_file}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-white/10 rounded-lg text-blue-400 text-sm"
                >
                  {t('view')}
                </a>
                {canUploadFile && (
                  <button 
                    onClick={() => {
                       if (window.confirm(t('confirm_replace_file'))) {
                         fileInputRef.current?.click();
                       }
                    }}
                    disabled={uploading}
                    className="p-2 hover:bg-white/10 rounded-lg text-yellow-400 text-sm"
                  >
                    {t('replace')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            canUploadFile && (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-brand-yellow/50 hover:bg-white/5 transition-all group"
              >
                <div className="p-3 bg-white/5 rounded-full group-hover:bg-brand-yellow/20 transition-colors">
                  <Upload className="text-white/40 group-hover:text-brand-yellow" size={24} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-white group-hover:text-brand-yellow transition-colors">
                    {t('upload_certificate')}
                  </p>
                  <p className="text-xs text-white/40 mt-1">{t('file_formats')}</p>
                </div>
              </div>
            )
          )}
          
          <input 
            type="file" 
            ref={fileInputRef}
            className="hidden" 
            accept="image/*,.pdf"
            onChange={handleFileUpload}
          />
        </div>
      </div>
      </div>
    </div>
  );
};

export default MedicalCertificate;
