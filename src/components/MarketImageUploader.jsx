import React, { useState, useRef } from 'react';
import { Upload, X, ImageIcon } from 'lucide-react';

export function MarketImageUploader({ marketId, imageUrl, onUpload, onRemove }) {
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsUploading(true);

    try {
      await onUpload(file);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async () => {
    try {
      await onRemove();
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="market-image-uploader">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden-input"
        style={{ display: 'none' }}
      />

      <div className="uploader-actions">
        {imageUrl ? (
          <>
            <button
              onClick={triggerFileInput}
              disabled={isUploading}
              className="uploader-btn upload-btn"
              title="Replace image"
            >
              <Upload size={14} />
              <span>{isUploading ? '...' : 'Replace'}</span>
            </button>
            <button
              onClick={handleRemove}
              className="uploader-btn remove-btn"
              title="Remove image"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <button
            onClick={triggerFileInput}
            disabled={isUploading}
            className="uploader-btn upload-btn"
            title="Upload image"
          >
            <ImageIcon size={14} />
            <span>{isUploading ? '...' : 'Upload'}</span>
          </button>
        )}
      </div>

      {error && (
        <div className="uploader-error">
          {error}
        </div>
      )}

      <style>{`
        .market-image-uploader {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .uploader-actions {
          display: flex;
          gap: 6px;
          align-items: center;
        }

        .uploader-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 10px;
          background: #273445;
          border: 1px solid #3A4A5D;
          border-radius: 4px;
          color: #A9B7C8;
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .uploader-btn:hover:not(:disabled) {
          background: #314255;
          border-color: #455670;
          color: #EAF0F7;
        }

        .uploader-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .upload-btn {
          color: #4BA3FF;
        }

        .upload-btn:hover:not(:disabled) {
          background: rgba(75, 163, 255, 0.15);
          border-color: #4BA3FF;
        }

        .remove-btn {
          padding: 5px;
          color: #C05656;
        }

        .remove-btn:hover {
          background: rgba(192, 86, 86, 0.15);
          border-color: #C05656;
        }

        .uploader-error {
          font-size: 11px;
          color: #C05656;
          padding: 4px 8px;
          background: rgba(192, 86, 86, 0.1);
          border-radius: 4px;
          border: 1px solid rgba(192, 86, 86, 0.3);
        }
      `}</style>
    </div>
  );
}

export default MarketImageUploader;
