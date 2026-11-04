/**
 * Write the current delegated population, against the live IANA root list.
 *
 *   node research/gtld/population-current.mjs
 *
 * in : https://data.iana.org/TLD/tlds-alpha-by-domain.txt   (fetched live)
 *      research/gtld/population.json                        (pinned, July)
 * out: research/gtld/population-current.json
 *      research/gtld/raw/iana-tlds-alpha-current.txt        (the fetched bytes)
 *
 * population.json is pinned to the July ICANN snapshot. That is correct for
 * reproducing the study and wrong for any claim about what is delegated today:
 * two of its 1,099 entries, helsinki and juniper, have since left the root.
 * This writes the second file so both questions can be asked without ambiguity,
 * and leaves the pinned one untouched.
 *
 * What it is, exactly: the pinned population, less the entries no longer in the
 * live root list. Same shape as population.json, so --population takes either.
 *
 * What it is not: a fresh derivation of the population. The study's scope is
 * "delegated 2013-01-01 or later, not contract-terminated, no removal date",
 * which comes from ICANN's gtlds.json. The root list carries no delegation
 * dates and no contract state, so it cannot rebuild that scope; it can only say
 * which strings are in the root now. Strings delegated after July are therefore
 * reported below as a count, and not added. Widening the population needs a
 * fresh gtlds.json pass, which is a different question and a different file.
 *
 * The fetched bytes are archived next to the pinned list that root-census.mjs
 * reads, so the run is reproducible after the live list moves on.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const URL = 'https://data.iana.org/TLD/tlds-alpha-by-domain.txt';
const PINNED = 'research/gtld/population.json';
const ARCHIVE = 'research/gtld/raw/iana-tlds-alpha-current.txt';
const OUT = 'research/gtld/population-current.json';

const r = await fetch(URL);
if (!r.ok) { console.error(`${URL}: HTTP ${r.status}`); process.exit(1); }
const body = await r.text();
const fetchedAt = new Date().toISOString();
const sha256 = crypto.createHash('sha256').update(body).digest('hex');

const lines = body.split('\n').map(s => s.trim()).filter(Boolean);
const version = lines.find(s => s.startsWith('#')) ?? '(no version header)';
const root = new Set(lines.filter(s => !s.startsWith('#')).map(s => s.toLowerCase()));
if (root.size < 1000) {
  console.error(`root list parsed to ${root.size} entries, which is too few to trust. Not writing.`);
  process.exit(1);
}

const pinned = JSON.parse(fs.readFileSync(PINNED, 'utf8'));
const current = pinned.filter(t => root.has(t));
const gone = pinned.filter(t => !root.has(t));
// Strings in the root that the pinned population does not carry. This is mostly
// ccTLDs and pre-2012 gTLDs, which were never in scope, plus any post-July
// delegation. The two cannot be told apart without gtlds.json, so neither is added.
const outsidePinned = root.size - new Set(pinned.filter(t => root.has(t))).size;

fs.writeFileSync(ARCHIVE, body);
// Byte-for-byte the shape of population.json: one string a line, no trailing newline.
fs.writeFileSync(OUT, '[\n' + current.map(t => JSON.stringify(t)).join(',\n') + '\n]');

console.log(JSON.stringify({
  source: URL,
  version,
  fetchedAt,
  sha256,
  archive: ARCHIVE,
  rootListEntries: root.size,
  pinnedPopulation: pinned.length,
  currentPopulation: current.length,
  leftTheRoot: gone,
  inRootOutsidePinnedPopulation: outsidePinned,
  note: 'ccTLDs, pre-2012 gTLDs and any post-July delegation are all in that last '
      + 'count and none are added. Widening the population needs ICANN gtlds.json.',
}, null, 2));
