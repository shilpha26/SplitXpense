// Run with: node tests/who-had-what.test.js
// Tests the "Who had what" split maths that lives inside group-detail.html. All names and amounts are made up.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'group-detail.html'), 'utf8');
const start = html.indexOf('const whw = {');
const end = html.indexOf('function openWhoHadWhat');
assert.ok(start > 0 && end > start, 'could not find the Who had what code in group-detail.html');
const { whw, whwCompute, whwAllocate } = new Function(
    'formatCurrency',
    html.slice(start, end) + '\nreturn { whw, whwCompute, whwAllocate };'
)((n) => '\u20B9' + n.toFixed(2));

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('ok   ' + name); }
    catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}
const set = (...i) => new Set(i);
const item = (id, amount, ...who) => ({ id, name: 'item' + id, amount: String(amount), members: set(...who) });
const byName = (r) => Object.fromEntries(r.rows.map((x) => [x.name, x.total]));

test('tax and charges are shared equally between everyone who had something', () => {
    whw.people = ['A', 'B', 'C', 'D'];
    whw.items = [item(1, 300, 0, 1), item(2, 120, 0), item(3, 90, 1, 2, 3)];
    whw.total = '570';   // items 510 + 60 of tax
    const r = whwCompute();
    assert.strictEqual(r.ready, true);
    assert.strictEqual(r.extra, 6000);
    // items: A 270, B 180, C 30, D 30, and 15.00 of tax each
    assert.deepStrictEqual(byName(r), { A: 28500, B: 19500, C: 4500, D: 4500 });
    assert.strictEqual(r.sum, 57000);
});

test('someone who had nothing pays no tax', () => {
    whw.people = ['A', 'B', 'C'];
    whw.items = [item(1, 100, 0), item(2, 100, 1)];
    whw.total = '230';   // 30 of tax, only A and B had anything
    const r = whwCompute();
    assert.deepStrictEqual(byName(r), { A: 11500, B: 11500 });
    assert.ok(!('C' in byName(r)));
});

test('a tax amount that does not divide evenly still adds up exactly', () => {
    whw.people = ['A', 'B', 'C'];
    whw.items = [item(1, 100, 0), item(2, 100, 1), item(3, 100, 2)];
    whw.total = '400';   // 100.00 of tax over three people
    const r = whwCompute();
    assert.deepStrictEqual(r.rows.map((x) => x.extra).sort(), [3333, 3333, 3334]);
    assert.strictEqual(r.sum, 40000);
});

test('shared items split exactly: 100 three ways is 33.34 / 33.33 / 33.33', () => {
    whw.people = ['A', 'B', 'C'];
    whw.items = [item(1, 100, 0, 1, 2)];
    whw.total = '';
    const r = whwCompute();
    assert.deepStrictEqual(r.rows.map((x) => x.total).sort(), [3333, 3333, 3334]);
    assert.strictEqual(r.sum, 10000);
});

test('a discount is shared in proportion, so nobody goes negative', () => {
    whw.people = ['A', 'B'];
    whw.items = [item(1, 400, 0), item(2, 100, 1)];
    whw.total = '450';   // 50 off
    const r = whwCompute();
    assert.strictEqual(r.extra, -5000);
    assert.deepStrictEqual(byName(r), { A: 36000, B: 9000 });
    assert.ok(r.rows.every((x) => x.total >= 0));
});

test('an item nobody had blocks the split', () => {
    whw.people = ['A', 'B'];
    whw.items = [item(1, 100, 0), item(2, 50)];
    whw.total = '';
    const r = whwCompute();
    assert.strictEqual(r.ready, false);
    assert.strictEqual(r.unassigned.length, 1);
});

test('bad or empty input is never ready', () => {
    whw.people = ['A'];
    whw.items = [item(1, '', 0)];
    whw.total = 'abc';
    assert.strictEqual(whwCompute().ready, false);
});

test('a bill like the Liquor Street one: five items, 8 people, 52.25 of tax shared equally', () => {
    whw.people = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];
    whw.items = [item(1, 309.75, 0, 1, 2, 3), item(2, 288.75, 0, 1, 2, 3), item(3, 393.75, 4, 5, 6, 7), item(4, 63, 0, 4), item(5, 31.5, 1, 5)];
    whw.total = '1139';
    const r = whwCompute();
    assert.strictEqual(r.ready, true);
    assert.strictEqual(r.itemsSum, 108675);
    assert.strictEqual(r.extra, 5225);
    assert.strictEqual(r.sum, 113900);
    const extras = r.rows.map((x) => x.extra);
    assert.ok(Math.max(...extras) - Math.min(...extras) <= 1, 'equal within one paisa: ' + extras.join(','));
});

test('the saved breakdown matches the amounts the form is filled with (so it is kept on save)', () => {
    const BillItems = require('../js/bill-items.js');
    whw.people = ['Ann', 'Ben', 'Cy'];
    whw.items = [item(1, 309.75, 0, 1), item(2, 288.75, 1, 2), item(3, 63, 0)];
    whw.total = '700';
    const r = whwCompute();
    assert.strictEqual(r.ready, true);
    // same construction as applyWhoHadWhat()
    const saved = BillItems.build({
        items: whw.items.map((i) => ({ name: i.name, amount: Math.round(parseFloat(i.amount) * 100), who: whw.people.filter((_, idx) => i.members.has(idx)) })),
        rows: r.rows, total: r.total, itemsTotal: r.itemsSum, extra: r.extra
    });
    // the form gets (paise / 100).toFixed(2) per person
    const customAmounts = {};
    r.rows.forEach((row) => { customAmounts[row.name] = Number((row.total / 100).toFixed(2)); });
    assert.strictEqual(BillItems.matches(saved, parseFloat(whw.total), customAmounts), true);
    // and not once someone edits an amount
    customAmounts.Ann += 1;
    assert.strictEqual(BillItems.matches(saved, parseFloat(whw.total), customAmounts), false);
});

test('fuzz: shares always add up to the bill total exactly, for any mix of items and tax', () => {
    for (let n = 0; n < 5000; n++) {
        const people = 2 + Math.floor(Math.random() * 7);
        whw.people = Array.from({ length: people }, (_, i) => 'P' + i);
        whw.items = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, (_, i) => {
            const m = new Set();
            for (let k = 0; k < people; k++) if (Math.random() < 0.5) m.add(k);
            if (!m.size) m.add(Math.floor(Math.random() * people));
            return { id: i, name: 'x', amount: (Math.random() * 900 + 1).toFixed(2), members: m };
        });
        const items = whw.items.reduce((s, i) => s + Math.round(parseFloat(i.amount) * 100), 0);
        const delta = Math.round((Math.random() * 0.4 - 0.1) * items);   // -10% .. +30%
        whw.total = (Math.max(100, items + delta) / 100).toFixed(2);
        const r = whwCompute();
        assert.strictEqual(r.sum, r.total, 'sum mismatch');
        assert.ok(r.rows.every((x) => x.total >= 0), 'negative share');
        assert.strictEqual(r.ready, true);
    }
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
