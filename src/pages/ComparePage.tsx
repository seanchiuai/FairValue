import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Check, Copy, Gavel, GitCompareArrows, Home, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useProperties, type Property } from '../data/properties';
import { usePropertyComparison } from '../hooks/usePropertyComparison';
import {
  buildComparePath,
  formatComparisonMoney,
  formatComparisonPercent,
} from '../lib/propertyComparison';
import './ComparePage.css';

function typeLabel(value: string) {
  return ({
    SINGLE_FAMILY: 'House',
    CONDO: 'Condo',
    MULTI_FAMILY: 'Multi-family',
    APARTMENT: 'Apartment',
    LOT: 'Lot',
  } as Record<string, string>)[value] || value || 'Not available';
}

function priceDelta(property: Property) {
  if (!property.zestimate || !property.price) return null;
  return ((property.zestimate - property.price) / property.price) * 100;
}

function comparisonValue(property: Property, field: string) {
  switch (field) {
    case 'price': return formatComparisonMoney(property.price);
    case 'zestimate': return formatComparisonMoney(property.zestimate);
    case 'delta': return formatComparisonPercent(priceDelta(property));
    case 'beds': return property.bedrooms == null ? 'Not available' : String(property.bedrooms);
    case 'baths': return property.bathrooms == null ? 'Not available' : String(property.bathrooms);
    case 'area': return property.livingArea == null ? 'Not available' : `${property.livingArea.toLocaleString()} sqft`;
    case 'year': return property.yearBuilt == null ? 'Not available' : String(property.yearBuilt);
    case 'type': return typeLabel(property.homeType);
    case 'source': return property.listingDataSource || property.listingSource || 'FairValue property snapshot';
    default: return 'Not available';
  }
}

export default function ComparePage() {
  const { properties, loading } = useProperties();
  const [searchParams] = useSearchParams();
  const { propertyIds, setPropertyIds, remove, clear } = usePropertyComparison();
  const [copyState, setCopyState] = useState('Copy share link');

  useEffect(() => {
    const queryIds = (searchParams.get('ids') || '').split(',').map((id) => decodeURIComponent(id)).filter(Boolean);
    if (queryIds.length) setPropertyIds(queryIds);
  }, [searchParams, setPropertyIds]);

  const selectedProperties = useMemo(
    () => propertyIds.map((id) => properties.find((property) => property.id === id)).filter(Boolean) as Property[],
    [properties, propertyIds]
  );

  const missingCount = Math.max(0, propertyIds.length - selectedProperties.length);
  const sharePath = buildComparePath(selectedProperties.map((property) => property.id));

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${sharePath}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('Link copied');
    } catch {
      setCopyState('Copy unavailable');
    }
    window.setTimeout(() => setCopyState('Copy share link'), 1800);
  };

  if (loading) {
    return <main className="compare-page" role="status">Loading comparison workspace...</main>;
  }

  return (
    <main className="compare-page" data-testid="compare-page">
      <header className="compare-page__header">
        <Link to="/" className="compare-page__back"><ArrowLeft size={15} aria-hidden="true" /> Markets</Link>
        <div className="compare-page__identity"><GitCompareArrows size={18} aria-hidden="true" /> Property comparison</div>
        <div className="compare-page__header-actions">
          <button type="button" className="compare-page__secondary-action" onClick={handleCopyLink} disabled={!selectedProperties.length}>
            {copyState === 'Link copied' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copyState}
          </button>
          <button type="button" className="compare-page__clear-action" onClick={clear} disabled={!propertyIds.length}>
            <X size={15} aria-hidden="true" /> Clear
          </button>
        </div>
      </header>

      <section className="compare-page__intro">
        <div>
          <span className="compare-page__eyebrow">Decision workspace</span>
          <h1>See the trade-offs before you host the room.</h1>
          <p>Line up up to four properties using the same snapshot fields, then open the market you want to test with your group.</p>
        </div>
        <Link to="/" className="compare-page__browse"><Home size={15} aria-hidden="true" /> Add a property <ArrowRight size={15} aria-hidden="true" /></Link>
      </section>

      {missingCount > 0 && (
        <div className="compare-page__notice" role="status">
          {missingCount} saved comparison item{missingCount === 1 ? '' : 's'} is no longer in the current property snapshot.
        </div>
      )}

      {selectedProperties.length === 0 ? (
        <section className="compare-page__empty">
          <GitCompareArrows size={28} aria-hidden="true" />
          <h2>Your comparison is empty</h2>
          <p>Select properties from the market browse or save one from a property detail page.</p>
          <Link to="/" className="compare-page__primary-action"><Home size={15} aria-hidden="true" /> Browse properties</Link>
        </section>
      ) : (
        <section className="compare-page__workspace" aria-label="Selected property comparison">
          <div className="compare-page__property-grid" style={{ '--compare-columns': selectedProperties.length } as CSSProperties}>
            {selectedProperties.map((property) => (
              <article key={property.id} className="compare-page__property">
                <div className="compare-page__property-image">
                  {property.imgSrc ? <img src={property.imgSrc} alt="" /> : <div />}
                  <button type="button" onClick={() => remove(property.id)} aria-label={`Remove ${property.address} from comparison`}>
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <div className="compare-page__property-body">
                  <span className="compare-page__property-type">{typeLabel(property.homeType)}</span>
                  <h2>{property.address}</h2>
                  <p>{property.city}, {property.state} {property.zipCode}</p>
                  <div className="compare-page__property-actions">
                    <Link to={`/market/${property.id}`}><Bookmark size={14} aria-hidden="true" /> Open market</Link>
                    <Link to={`/join?propertyId=${encodeURIComponent(property.id)}`}><Gavel size={14} aria-hidden="true" /> Host room</Link>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="compare-page__table-wrap">
            <table className="compare-page__table">
              <caption>Property snapshot comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Snapshot field</th>
                  {selectedProperties.map((property) => <th scope="col" key={property.id}>{property.address}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  ['price', 'Asking price'],
                  ['zestimate', 'Reference estimate'],
                  ['delta', 'Estimate vs ask'],
                  ['beds', 'Bedrooms'],
                  ['baths', 'Bathrooms'],
                  ['area', 'Living area'],
                  ['year', 'Year built'],
                  ['type', 'Property type'],
                  ['source', 'Listing source'],
                ].map(([field, label]) => (
                  <tr key={field}>
                    <th scope="row">{label}</th>
                    {selectedProperties.map((property) => <td key={property.id}>{comparisonValue(property, field)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="compare-page__disclaimer">Snapshot fields are reference context for a simulation market, not appraisal or investment advice. A host chooses and records the settlement evidence.</p>
        </section>
      )}
    </main>
  );
}
