import { Trash2 } from 'lucide-react';
import type { SavedMarketStudioDraft } from '../../lib/marketStudioDrafts';
import './MarketStudioSavedDrafts.css';

interface MarketStudioSavedDraftsProps {
  drafts: SavedMarketStudioDraft[];
  onLoad: (draft: SavedMarketStudioDraft) => void;
  onDelete: (id: string) => void;
}

export default function MarketStudioSavedDrafts({
  drafts,
  onLoad,
  onDelete,
}: MarketStudioSavedDraftsProps) {
  if (drafts.length === 0) return null;

  return (
    <section
      className="market-studio-saved"
      aria-label="Saved market drafts"
      data-testid="market-studio-saved-drafts"
    >
      <div className="market-studio-saved__header">Saved drafts</div>
      <div className="market-studio-saved__list">
        {drafts.map((saved) => (
          <div key={saved.id} className="market-studio-saved__item">
            <button
              type="button"
              className="market-studio-saved__load"
              onClick={() => onLoad(saved)}
            >
              <span className="market-studio-saved__title">{saved.title}</span>
              <span className="market-studio-saved__meta">
                {saved.price_label || 'Price needed'}
              </span>
            </button>
            <button
              type="button"
              className="market-studio-saved__delete"
              aria-label={`Delete ${saved.title}`}
              onClick={() => onDelete(saved.id)}
            >
              <Trash2 size={15} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
