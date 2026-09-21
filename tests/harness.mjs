let passed = 0;
let failed = 0;
const failures = [];

export function check(label, got, want) {
  const ok = Object.is(got, want) || String(got) === String(want);
  if (ok) passed += 1;
  else {
    failed += 1;
    failures.push(`${label}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
  }
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
}

export function suite(name, fn) {
  console.log(`\n${name}`);
  // Returned so an async suite can be awaited; sync suites are unaffected.
  return fn();
}

export function report() {
  console.log(`\n${passed} passed, ${failed} failed`);
  for (const f of failures) console.log(`  - ${f}`);
  return failed;
}
