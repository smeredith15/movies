export function Ballot({ year }: { year: number }) {
  return (
    <div className="panel">
      <h2>
        {year} ballot
        <span className="sub">waiting on the category list</span>
      </h2>
      <p className="small muted">
        The eligibility engine, the catalog, and the per-person ballot storage are already in
        place. What is missing is the list of categories — how many there are, which take movies
        vs. actors vs. characters vs. moments, and whether any are ranked rather than a single
        pick. Drop that list in and this page fills itself in.
      </p>
      <p className="small muted">
        Each ballot saves to <code>data/ballots/{year}.&lt;person&gt;.json</code>, so the two of
        you write to separate files and never collide mid-vote. Neither ballot is shown in the UI
        until both are submitted and one of you hits Reveal.
      </p>
    </div>
  );
}
