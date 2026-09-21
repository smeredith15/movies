export function Ballot({ year }: { year: number }) {
  return (
    <div className="panel">
      <h2>
        {year} ballot
        <span className="sub">not built yet</span>
      </h2>
      <p className="small muted">
        Everything underneath it is ready: the eligibility rules, the catalog,
        the 30 categories in <code>data/categories.json</code>, and per-person
        ballot storage. What is missing is the voting interface itself.
      </p>
      <p className="small muted">
        The shape it needs to take — every category offers one winner and up to
        four honorable mentions, whether or not those slots score. Categories
        are one of five kinds: pick a movie, pick an actor (the rows expand to
        show cast), pick a character (the rows expand to show roles), pick a
        movie and type the answer, or skip the lists entirely and just type
        something. All of them take a write-in.
      </p>
      <p className="small muted">
        The last five categories are blank slots you each fill in on the day —
        name, type and picks all chosen at voting time, so neither of you sees
        what the other invented.
      </p>
      <p className="small muted">
        Each ballot saves to <code>data/ballots/{year}.&lt;person&gt;.json</code>,
        so the two of you write to separate files and never collide mid-vote.
        Neither is shown until both are submitted and one of you hits Reveal.
      </p>
    </div>
  );
}
