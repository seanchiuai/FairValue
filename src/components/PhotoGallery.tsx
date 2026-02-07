import React, { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Photo {
  url: string;
  width: number;
}

interface PhotoGalleryProps {
  photos: Photo[];
}

const PhotoGallery: React.FC<PhotoGalleryProps> = ({ photos }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  const photoLen = photos?.length || 0;

  const goNext = useCallback(() => {
    setActiveIndex(i => (i + 1) % photoLen);
  }, [photoLen]);

  const goPrev = useCallback(() => {
    setActiveIndex(i => (i - 1 + photoLen) % photoLen);
  }, [photoLen]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKey);
    };
  }, [lightboxOpen, closeLightbox, goNext, goPrev]);

  if (!photos || photos.length <= 1) return null;

  const thumbs = photos.map(p => p.url);
  const fullRes = photos.map(p => {
    const url = p.url;
    if (p.width < 960 && url.includes(`_${p.width}.`)) {
      return url.replace(`_${p.width}.`, '_1536.');
    }
    return url;
  });

  const openLightbox = (index: number) => {
    setActiveIndex(index);
    setLightboxOpen(true);
  };

  return (
    <>
      <div className="gallery-strip">
        {thumbs.slice(0, 6).map((url, i) => (
          <button key={i} className="gallery-thumb" onClick={() => openLightbox(i)}>
            <img src={url} alt={`Photo ${i + 1}`} />
            {i === 5 && photos.length > 6 && (
              <span className="gallery-more">+{photos.length - 6}</span>
            )}
          </button>
        ))}
      </div>

      {lightboxOpen && (
        <div className="lightbox-overlay" onClick={closeLightbox}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={closeLightbox}><X size={20} /></button>
            <button className="lightbox-prev" onClick={goPrev}><ChevronLeft size={28} /></button>
            <img src={fullRes[activeIndex]} alt="" className="lightbox-img" />
            <button className="lightbox-next" onClick={goNext}><ChevronRight size={28} /></button>
            <div className="lightbox-counter">{activeIndex + 1} / {photos.length}</div>
          </div>
        </div>
      )}

      <style>{`
        .gallery-strip {
          display: flex; gap: 8px;
          overflow-x: auto; padding: 0 0 4px;
          scrollbar-width: none;
          margin-top: -8px; margin-bottom: 16px;
        }
        .gallery-strip::-webkit-scrollbar { display: none; }
        .gallery-thumb {
          flex-shrink: 0; position: relative;
          width: 80px; height: 60px;
          border-radius: 12px; overflow: hidden;
          border: 2px solid rgba(255,255,255,0.5);
          cursor: pointer; padding: 0;
          background: transparent;
          transition: all 0.2s;
        }
        .gallery-thumb:hover {
          border-color: #007AFF;
          transform: scale(1.05);
        }
        .gallery-thumb img {
          width: 100%; height: 100%;
          object-fit: cover; display: block;
        }
        .gallery-more {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.5);
          color: white; font-size: 14px; font-weight: 700;
        }

        .lightbox-overlay {
          position: fixed; inset: 0; z-index: 9999;
          background: rgba(0,0,0,0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          display: flex; align-items: center; justify-content: center;
          animation: lbFade 0.2s ease;
        }
        @keyframes lbFade { from { opacity: 0; } to { opacity: 1; } }

        .lightbox-content {
          position: relative;
          max-width: 90vw; max-height: 90vh;
          display: flex; align-items: center;
        }
        .lightbox-img {
          max-width: 85vw; max-height: 85vh;
          object-fit: contain; border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .lightbox-close {
          position: fixed; top: 20px; right: 20px;
          width: 40px; height: 40px;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 50%;
          color: white; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.2s;
        }
        .lightbox-close:hover { background: rgba(255,255,255,0.25); }

        .lightbox-prev, .lightbox-next {
          position: absolute;
          width: 44px; height: 44px;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 50%;
          color: white; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s; z-index: 1;
        }
        .lightbox-prev { left: -56px; }
        .lightbox-next { right: -56px; }
        .lightbox-prev:hover, .lightbox-next:hover {
          background: rgba(255,255,255,0.3);
          transform: scale(1.1);
        }

        .lightbox-counter {
          position: fixed; bottom: 24px;
          left: 50%; transform: translateX(-50%);
          padding: 6px 16px;
          background: rgba(255,255,255,0.15);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 980px;
          color: white; font-size: 13px; font-weight: 600;
        }

        @media (max-width: 768px) {
          .lightbox-prev { left: 8px; }
          .lightbox-next { right: 8px; }
          .lightbox-img { max-width: 95vw; border-radius: 12px; }
          .gallery-thumb { width: 64px; height: 48px; border-radius: 10px; }
        }
      `}</style>
    </>
  );
};

export default PhotoGallery;
