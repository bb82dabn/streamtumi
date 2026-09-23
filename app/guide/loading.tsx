export default function GuideLoading() {
  return <main className="shell page guide-page guide-loading" aria-busy="true" aria-label="Loading Guide">
    <div className="guide-loading-heading" />
    <div className="guide-tabs guide-loading-tabs"><span /><span /><span /></div>
    <div className="guide-loading-filter" />
    <div className="guide-grid">{Array.from({ length: 6 }, (_, index) => <div className="guide-card guide-loading-card" key={index}><div className="guide-loading-art" /><div className="guide-loading-lines"><span /><span /><span /></div></div>)}</div>
  </main>;
}
