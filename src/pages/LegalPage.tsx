import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import './LegalPage.css';

export default function LegalPage() {
  const { pathname } = useLocation();
  const privacy = pathname === '/privacy';

  return (
    <main className="legal-page">
      <header className="legal-page__header">
        <Link to="/" className="legal-page__back"><ArrowLeft size={15} /> FairValue markets</Link>
        <span className="legal-page__badge">{privacy ? <ShieldCheck size={15} /> : <FileText size={15} />} {privacy ? 'Privacy' : 'Terms'}</span>
      </header>
      <article className="legal-page__article">
        <span className="legal-page__eyebrow">FairValue product disclosure</span>
        <h1>{privacy ? 'Privacy at a glance' : 'Terms for simulation rooms'}</h1>
        <p className="legal-page__lede">Last updated August 4, 2026. These concise product pages describe the behavior of this FairValue build.</p>

        {privacy ? (
          <>
            <section><h2>What this build stores</h2><p>A signed browser identity is minted by the FairValue server and kept in this browser so your profile, watchlist, alerts, and room library can be associated with you. Room snapshots and event logs persist room lifecycle state according to the server's configured JSON or Postgres mode.</p></section>
            <section><h2>What public pages expose</h2><p>Settled recaps expose share-safe room state, public timeline items, settlement evidence metadata, and replay verification. Host tokens, user tokens, raw session identifiers, and private evidence documents are excluded from public recap artifacts.</p></section>
            <section><h2>Provider boundaries</h2><p>Optional external intelligence, neighborhood evidence, alert webhook, database, and Cognee adapters are server-side configuration points. This build does not claim an external provider is active unless the server reports provider-backed status.</p></section>
            <section><h2>Your controls</h2><p>You can remove watchlist items, acknowledge in-app alerts, and clear comparison selections from this browser. Room history is scoped by the signed identity token; clearing browser storage removes local access to that identity.</p></section>
          </>
        ) : (
          <>
            <section><h2>Simulation only</h2><p>FairValue rooms use simulation credits. They are not real-money markets, appraisals, investment products, credit decisions, or professional certifications.</p></section>
            <section><h2>Property data</h2><p>Property listings, estimates, rent, tax, school, and neighborhood fields are reference context from the configured FairValue snapshot and provider adapters. They do not determine settlement by themselves.</p></section>
            <section><h2>Room settlement</h2><p>A host defines the market question and records actual appraisal or sale evidence. Settled room state is replayed and made available as a public-safe recap. Hosts are responsible for using evidence they are authorized to share.</p></section>
            <section><h2>Availability</h2><p>External providers, Postgres persistence, webhook delivery, and production hosting require operator configuration. A local or degraded server may show explicit fallback status and is not a claim of production provider availability.</p></section>
          </>
        )}

        <div className="legal-page__links"><Link to={privacy ? '/terms' : '/privacy'}>{privacy ? 'Read simulation terms' : 'Read privacy at a glance'}</Link><Link to="/join">Host or join a room</Link></div>
      </article>
    </main>
  );
}
