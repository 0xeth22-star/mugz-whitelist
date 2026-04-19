const SUPABASE_URL = 'https://asesfmdbostoxteycdkn.supabase.co/rest/v1/whitelist';
const API_KEY = 'sb_publishable_feZ8gIajC71LCJ7Wz9c7ig_3yQguV-t';

const TOTAL_USERS = 300;
const CONCURRENCY = 50; // max simultaneous requests

function randHex(len) {
  return [...Array(len)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}
function randWallet() { return '0x' + randHex(40); }
function randUsername() { return 'testuser_' + randHex(6); }
function randTweetId() { return '204' + Math.floor(Math.random() * 9e12).toString().padStart(13, '0'); }
function randCommentLink(u) { return `https://x.com/${u}/status/${randTweetId()}`; }
function randQuoteLink(u) { return `https://x.com/${u}/status/${randTweetId()}`; }

const results = { ok: 0, duplicate: 0, error: 0, networkFail: 0, times: [] };

async function submitUser(i) {
  const username = randUsername();
  const wallet = randWallet();
  const commentLink = randCommentLink(username);
  const quoteLink = randQuoteLink(username);

  const start = Date.now();
  try {
    const res = await fetch(SUPABASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Prefer': 'return=minimal',
        'Origin': 'https://mugz.wtf',
        'Referer': 'https://mugz.wtf/'
      },
      body: JSON.stringify({
        x_username: '@' + username,
        wallet,
        comment_link: commentLink,
        quote_link: quoteLink
      })
    });

    const elapsed = Date.now() - start;
    results.times.push(elapsed);

    if (res.ok || res.status === 201) {
      results.ok++;
      return { status: 'ok', code: res.status, ms: elapsed, i };
    }

    const body = await res.text().catch(() => '');
    if (res.status === 409 || body.includes('duplicate') || body.includes('unique')) {
      results.duplicate++;
      return { status: 'duplicate', code: res.status, ms: elapsed, body: body.slice(0, 120), i };
    }

    results.error++;
    return { status: 'error', code: res.status, ms: elapsed, body: body.slice(0, 120), i };
  } catch (e) {
    results.networkFail++;
    return { status: 'network_fail', ms: Date.now() - start, error: e.message, i };
  }
}

async function runBatch(batch) {
  return Promise.all(batch.map(i => submitUser(i)));
}

(async () => {
  console.log(`\nStress testing with ${TOTAL_USERS} users, ${CONCURRENCY} concurrent\n`);
  const allResults = [];
  const indices = Array.from({ length: TOTAL_USERS }, (_, i) => i);

  for (let i = 0; i < indices.length; i += CONCURRENCY) {
    const batch = indices.slice(i, i + CONCURRENCY);
    process.stdout.write(`  Batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(TOTAL_USERS / CONCURRENCY)} (users ${i + 1}-${Math.min(i + CONCURRENCY, TOTAL_USERS)})... `);
    const batchStart = Date.now();
    const batchResults = await runBatch(batch);
    allResults.push(...batchResults);
    console.log(`done in ${Date.now() - batchStart}ms`);
  }

  // Failures
  const failures = allResults.filter(r => r.status !== 'ok');
  if (failures.length > 0) {
    console.log('\n--- Failures ---');
    const shown = new Set();
    for (const f of failures) {
      const key = `${f.status}:${f.code}:${f.body}`;
      if (!shown.has(key)) {
        shown.add(key);
        console.log(`  [${f.status}] HTTP ${f.code ?? 'N/A'} — ${f.body || f.error || ''}`);
      }
    }
  }

  // Summary
  const times = results.times;
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  const min = times.length ? Math.min(...times) : 0;
  const max = times.length ? Math.max(...times) : 0;
  const p95 = times.length ? [...times].sort((a, b) => a - b)[Math.floor(times.length * 0.95)] : 0;

  console.log('\n=== Results ===');
  console.log(`  Total:       ${TOTAL_USERS}`);
  console.log(`  Success:     ${results.ok}`);
  console.log(`  Duplicate:   ${results.duplicate}`);
  console.log(`  Server err:  ${results.error}`);
  console.log(`  Network fail:${results.networkFail}`);
  console.log(`\n=== Response Times ===`);
  console.log(`  Avg: ${avg}ms  Min: ${min}ms  Max: ${max}ms  p95: ${p95}ms`);

  if (results.error > 0 || results.networkFail > 0) {
    console.log('\n⚠  Issues detected — check failures above');
    process.exit(1);
  } else {
    console.log('\n✓ All submissions succeeded');
  }
})();
