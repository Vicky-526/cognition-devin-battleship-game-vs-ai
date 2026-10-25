import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// GitHub Pages caches files for 10 minutes. Every local script and stylesheet
// reference carries the same ?v= so a deploy never mixes old and new files.
test('all local asset references share one cache-busting version', () => {
  const sources = ['index.html', ...readdirSync('js').filter((f) => f.endsWith('.js')).map((f) => `js/${f}`)];
  const refs = [];
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:from |src=|href=)["']((?:\.\/|js\/)?[\w./-]+\.(?:js|css)(?:\?[^"']*)?)["']/g)) {
      if (!/^https?:/.test(m[1])) refs.push({ file, ref: m[1] });
    }
  }
  assert.ok(refs.length >= 8, `found ${refs.length} references`);
  const versions = new Set(refs.map(({ file, ref }) => {
    const v = /\?v=(\w+)$/.exec(ref);
    assert.ok(v, `${file}: ${ref} is missing ?v=`);
    return v[1];
  }));
  assert.equal(versions.size, 1, `mixed versions: ${[...versions].join(', ')}`);
});
