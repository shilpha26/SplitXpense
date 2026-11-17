// Run with: node tests/bill-items.test.js
// Tests the saved "who had what" breakdown (js/bill-items.js). All names and amounts are made up.
const assert = require('assert');
const { normalize, build, matches } = require('../js/bill-items.js');

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('ok   ' + name); }
    catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}

const sample = () => ({
    v: 1, total: 570, itemsTotal: 510, extra: 60,
    items: [
        { name: 'Paneer Tikka', amount: 300, who: ['A', 'B'] },
        { name: 'Dosa', amount: 120, who: ['A'] },
        { name: 'Juice', amount: 90, who: ['B', 'C', 'D'] }
    ],
    people: [
        { name: 'A', items: 270, extra: 15, total: 285 },
        { name: 'B', items: 180, extra: 15, total: 195 },
        { name: 'C', items: 30, extra: 15, total: 45 },
        { name: 'D', items: 30, extra: 15, total: 45 }
    ]
});

test('a valid breakdown is accepted as is', () => {
    assert.deepStrictEqual(normalize(sample()), sample());
});

test('it also accepts the JSON text form', () => {
    assert.deepStrictEqual(normalize(JSON.stringify(sample())), sample());
});

test('missing, empty and invalid values give null', () => {
    for (const bad of [null, undefined, '', 'not json', '[]', 5, [], {}, { items: [], people: [], total: 10 }]) {
        assert.strictEqual(normalize(bad), null, 'should reject ' + JSON.stringify(bad));
    }
});

test('a breakdown without a positive total, items or people is rejected', () => {
    assert.strictEqual(normalize({ ...sample(), total: 0 }), null);
    assert.strictEqual(normalize({ ...sample(), items: [] }), null);
    assert.strictEqual(normalize({ ...sample(), people: [] }), null);
});

test('bad rows are dropped, good rows kept', () => {
    const b = sample();
    b.items.push({ name: '', amount: 5, who: [] }, { name: 'Neg', amount: -5, who: [] }, null, 'x', { name: 'NaN', amount: 'abc' });
    b.people.push({ name: 'Z', total: -1 }, { total: 5 }, null);
    const n = normalize(b);
    assert.strictEqual(n.items.length, 3);
    assert.strictEqual(n.people.length, 4);
});

test('hostile text stays as plain text and is length-limited (the page also escapes it)', () => {
    const b = sample();
    b.items[0].name = '<img src=x onerror=alert(1)>' + 'x'.repeat(500);
    b.items[0].who = ['<script>alert(1)</script>', 'ok\u0000\u0007'];
    const n = normalize(b);
    assert.ok(n.items[0].name.length <= 60);
    assert.ok(n.items[0].name.startsWith('<img'));            // kept as text, not removed or run
    assert.deepStrictEqual(n.items[0].who[1], 'ok');           // control characters are gone
});

test('size limits stop a huge payload', () => {
    const b = sample();
    b.items = Array.from({ length: 500 }, (_, i) => ({ name: 'i' + i, amount: 1, who: Array.from({ length: 500 }, () => 'p') }));
    b.people = Array.from({ length: 500 }, (_, i) => ({ name: 'p' + i, items: 1, extra: 0, total: 1 }));
    const n = normalize(b);
    assert.ok(n.items.length <= 60 && n.people.length <= 50 && n.items[0].who.length <= 50);
});

test('build() turns whole paise into rupees', () => {
    const b = build({
        items: [{ name: 'Tea', amount: 2050, who: ['A'] }],
        rows: [{ name: 'A', items: 2050, extra: 205, total: 2255 }],
        total: 2255, itemsTotal: 2050, extra: 205
    });
    assert.strictEqual(b.total, 22.55);
    assert.strictEqual(b.items[0].amount, 20.5);
    assert.strictEqual(b.people[0].extra, 2.05);
});

test('matches() is true when total, people and each amount agree', () => {
    assert.strictEqual(matches(sample(), 570, { A: 285, B: 195, C: 45, D: 45 }), true);
    assert.strictEqual(matches(sample(), '570.00', { A: '285.00', B: 195, C: 45, D: 45.004 }), true);
});

test('matches() is false once the amounts are changed by hand', () => {
    assert.strictEqual(matches(sample(), 570, { A: 290, B: 190, C: 45, D: 45 }), false);   // amounts moved
    assert.strictEqual(matches(sample(), 580, { A: 285, B: 195, C: 45, D: 45 }), false);   // total changed
    assert.strictEqual(matches(sample(), 570, { A: 285, B: 195, C: 90 }), false);          // a person removed
    assert.strictEqual(matches(sample(), 570, { A: 285, B: 195, C: 45, D: 45, E: 0 }), false);   // a person added
    assert.strictEqual(matches(sample(), 570, { A: 285, B: 195, C: 45, X: 45 }), false);   // a different person
});

test('matches() is false for missing data', () => {
    assert.strictEqual(matches(null, 570, { A: 570 }), false);
    assert.strictEqual(matches(sample(), 570, null), false);
    assert.strictEqual(matches(sample(), 570, undefined), false);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
