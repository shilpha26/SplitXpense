// Run with: node tests/bill-scanner.test.js
// Tests the receipt text parser used by "Who had what" -> Scan bill. All bills here are made up.
const assert = require('assert');
const { parseReceiptText, parseAmount, scoreReading, isVerified } = require('../js/bill-scanner.js');

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log('ok   ' + name); }
    catch (e) { console.error('FAIL ' + name + '\n     ' + e.message); process.exitCode = 1; }
}
const names = (r) => r.items.map((i) => i.name);
const amounts = (r) => r.items.map((i) => i.amount);

test('parseAmount handles thousands, decimals and OCR commas', () => {
    assert.strictEqual(parseAmount('1,250.00'), 1250);
    assert.strictEqual(parseAmount('150.50'), 150.5);
    assert.strictEqual(parseAmount('150,00'), 150);
    assert.strictEqual(parseAmount('12,345'), 12345);
    assert.ok(isNaN(parseAmount('abc')));
});

test('simple bill: items, GST and printed total', () => {
    const r = parseReceiptText([
        'THE SPICE GARDEN',
        'MG Road, Bengaluru 560001',
        'GSTIN: 29ABCDE1234F1Z5',
        'Bill No: 4521   Date: 12/05/2026',
        'Table: 7',
        'Item            Qty   Rate    Amount',
        'Paneer Tikka     1   280.00   280.00',
        'Butter Naan      4    50.00   200.00',
        'Masala Dosa      2    90.00   180.00',
        'Fresh Lime Soda  3    60.00   180.00',
        'Sub Total                     840.00',
        'CGST 2.5%                      21.00',
        'SGST 2.5%                      21.00',
        'Service Charge 5%              42.00',
        'Grand Total                   924.00',
        'Thank you, visit again'
    ].join('\n'));
    assert.deepStrictEqual(names(r), ['Paneer Tikka', 'Butter Naan x4', 'Masala Dosa x2', 'Fresh Lime Soda x3']);
    assert.deepStrictEqual(amounts(r), [280, 200, 180, 180]);
    assert.strictEqual(r.total, 924);
    assert.strictEqual(r.subtotal, 840);
});

test('prices without decimals, rupee symbols and serial numbers', () => {
    const r = parseReceiptText([
        '1. Veg Biryani   \u20B9220',
        '2. Chicken 65    Rs. 180',
        '3) Filter Coffee  40/-',
        'TOTAL            Rs 440'
    ].join('\n'));
    assert.deepStrictEqual(names(r), ['Veg Biryani', 'Chicken 65', 'Filter Coffee']);
    assert.deepStrictEqual(amounts(r), [220, 180, 40]);
    assert.strictEqual(r.total, 440);
});

test('"Chicken 65" keeps its 65 and does not use it as a price', () => {
    const r = parseReceiptText('Chicken 65  1  180.00\nTotal 180.00');
    assert.deepStrictEqual(names(r), ['Chicken 65']);
    assert.deepStrictEqual(amounts(r), [180]);
});

test('rate equal to amount for a single item', () => {
    const r = parseReceiptText('Masala Dosa 120 120\nTotal 120');
    assert.deepStrictEqual(names(r), ['Masala Dosa']);
    assert.deepStrictEqual(amounts(r), [120]);
});

test('leading quantity "2 x Item"', () => {
    const r = parseReceiptText('2 x Cold Coffee   240.00\n1 X Brownie   120.00\nTotal 360.00');
    assert.deepStrictEqual(names(r), ['Cold Coffee x2', 'Brownie']);
    assert.deepStrictEqual(amounts(r), [240, 120]);
});

test('thousands separator in prices and total', () => {
    const r = parseReceiptText('Seafood Platter   1,450.00\nWine Bottle   2,200.00\nTotal  3,650.00');
    assert.deepStrictEqual(amounts(r), [1450, 2200]);
    assert.strictEqual(r.total, 3650);
});

test('ALL CAPS names become readable', () => {
    const r = parseReceiptText('PANEER BUTTER MASALA 260.00\nTOTAL 260.00');
    assert.deepStrictEqual(names(r), ['Paneer Butter Masala']);
});

test('tax, charge, payment and header lines are never items', () => {
    const r = parseReceiptText([
        'Invoice No 1234',
        'Phone 9876543210',
        'CGST 9% 45.00',
        'Packing Charges 20.00',
        'Round off 0.40',
        'Discount 50.00',
        'Cash 1000.00',
        'Change 76.00',
        'Total Qty 5',
        'Tip 30.00'
    ].join('\n'));
    assert.deepStrictEqual(r.items, []);
});

test('Net Payable is preferred over a plain Total', () => {
    const r = parseReceiptText('Lassi 90.00\nTotal 90.00\nService Charge 9.00\nNet Payable 99.00');
    assert.strictEqual(r.total, 99);
});

test('an "item" bigger than the printed total is dropped as a misread', () => {
    const r = parseReceiptText('Tea 20.00\nSomething 5000.00\nTotal 20.00');
    assert.deepStrictEqual(names(r), ['Tea']);
});

test('noisy OCR: stray symbols, trailing dots, uneven spacing', () => {
    const r = parseReceiptText([
        '| Idli Vada   *   85.00 .',
        '~~ Mysore  Pak ~~  60.00',
        '=====',
        'TOTAL :  145.00 .'
    ].join('\n'));
    assert.deepStrictEqual(names(r), ['Idli Vada', 'Mysore Pak']);
    assert.deepStrictEqual(amounts(r), [85, 60]);
    assert.strictEqual(r.total, 145);
});

test('empty and junk input gives no items and no total', () => {
    assert.deepStrictEqual(parseReceiptText(''), { items: [], total: null, subtotal: null, charges: [], warnings: [] });
    assert.deepStrictEqual(parseReceiptText(null).items, []);
    assert.deepStrictEqual(parseReceiptText('!!!\n12345\n....').items, []);
});

test('no total on the bill still returns items', () => {
    const r = parseReceiptText('Tea 20.00\nSamosa 30.00');
    assert.deepStrictEqual(amounts(r), [20, 30]);
    assert.strictEqual(r.total, null);
});

// Real OCR output from a photographed restaurant bill (layout: Units Description U.Price Total)
const UNITS_BILL_CLEAR = [
    'NAR', 'Restaurant', 'Units Descr pt fon        u. Price  Total',
    '100 The Rocks Mix Uo 2   0    32.00',
    'IFIRE STARTER MIX 4       68    68.00',
    '2PONOGRANITE JUICE      30   60.00',
    '3NAR MOCKTAIL              30    90.00',
    '1THE NAR MIX GRILL       69    69.00',
    'INAR MOCKTAIL             30    30.00',
    '3Super Juicy Lamb Chop 79 237.00',
    '1THE NAR MIX GRILL       69    69.00',
    'SUB TOTAL 655.00', 'Total 665.00', 'Thank you!!!'
].join('\n');

test('units-first bill: unit count is not part of the name, and the "4" in "MIX 4" stays', () => {
    const r = parseReceiptText(UNITS_BILL_CLEAR);
    assert.deepStrictEqual(amounts(r), [32, 68, 60, 90, 69, 30, 237, 69]);
    // OCR reads the printed "1" before FIRE as "I", which the user can fix on review
    assert.ok(names(r).some((n) => /fire starter mix 4$/i.test(n)), names(r).join(' | '));
    assert.ok(names(r).includes('Super Juicy Lamb Chop x3'), names(r).join(' | '));
    assert.ok(names(r).includes('Nar Mocktail x3'), names(r).join(' | '));
    assert.ok(names(r).some((n) => /^Ponogranite Juice x2$/i.test(n)), names(r).join(' | '));
    assert.strictEqual(r.subtotal, 655);
});

test('a misread total (665 instead of 655) is flagged rather than trusted silently', () => {
    const r = parseReceiptText(UNITS_BILL_CLEAR);
    assert.strictEqual(r.total, 665);
    assert.ok(r.warnings.some((w) => /does not match the sub total/.test(w)), r.warnings.join(' / '));
    assert.ok(!r.warnings.some((w) => /items add up/.test(w)), 'items do add up to the sub total');
});

test('a badly misread total (6.00) never wipes out the items', () => {
    const r = parseReceiptText([
        'Rocks Mix Up 2 32 32.00', 'FIRE STARTER MIX 4      68 68.00', 'SUB TOTAL 656.00', 'Total 6.00'
    ].join('\n'));
    assert.strictEqual(r.items.length, 2);
    assert.strictEqual(r.total, null);
});

test('missing items are flagged when they do not add up to the sub total', () => {
    const r = parseReceiptText('Tea 20.00\nSub Total 50.00\nTotal 50.00');
    assert.ok(r.warnings.some((w) => /items add up to/i.test(w)), r.warnings.join(' / '));
});

test('a consistent bill has no warnings', () => {
    const r = parseReceiptText('Tea 20.00\nSamosa 30.00\nSub Total 50.00\nGST 5% 2.50\nTotal 52.50');
    assert.deepStrictEqual(r.warnings, []);
});

// Real OCR output from a photographed restaurant bill whose line totals already include tax,
// with a shop address line ("11/2 Sector- 37,") that looks like an item.
const TAX_INCLUSIVE_BILL = [
    'Liquor Street', '(ODVJH Private Limited)', '11/2 Sactor- 37,', 'Faridabad-121003.',
    'Invoice Number:                IN001001259', 'Invoice Date:                20-May-18 22:55',
    'Item                  Qty. Rate         Total',
    'Tandoori chicken             1 295.00 309.756',
    'Lasooni Dal Tadka           1 275.00 288.75',
    'HYDERABADI MURG', 'BIRYANI     1 375.00 393.75',
    'Tandoori Roti all food', 'less spicy                       2 30.00 63.00',
    'Tandoori Roti                1      30.00     31.50',
    'Total Qty:                                                             6',
    'Sub Total:                                                 1,035.00',
    'CGST@2.5                                                   25.89',
    'SGST@2.5                                                   25.89',
    'Total:                                                 1,139.00',
    'Thanks For Visit....'
].join('\n');

test('shop address above the table header is not read as an item', () => {
    const r = parseReceiptText(TAX_INCLUSIVE_BILL);
    assert.ok(!names(r).some((n) => /sector|sactor/i.test(n)), names(r).join(' | '));
    assert.strictEqual(r.items.length, 5);
});

test('address-like lines are skipped even when the table header is unreadable', () => {
    const r = parseReceiptText('Liquor Street\n11/2 Sector- 37,\nTea 20.00\nSamosa 30.00');
    assert.deepStrictEqual(names(r), ['Tea', 'Samosa']);
});

test('tax-inclusive line totals are accepted: items = sub total + CGST + SGST', () => {
    const r = parseReceiptText(TAX_INCLUSIVE_BILL);
    assert.deepStrictEqual(amounts(r), [309.75, 288.75, 393.75, 63, 31.5]);
    assert.strictEqual(r.subtotal, 1035);
    assert.strictEqual(r.total, 1139);
    assert.ok(isVerified(r), r.warnings.join(' / '));
    assert.ok(!r.warnings.some((w) => /items add up/.test(w)), r.warnings.join(' / '));
});

test('a missing tax summary line (S.Tax = CGST + SGST) does not trigger a total warning', () => {
    // Total 1139 = 1035 + 51.78 (CGST + SGST) + 52.25 (an unread "S.Tax" summary line of the same amount)
    const r = parseReceiptText(TAX_INCLUSIVE_BILL);
    assert.deepStrictEqual(r.warnings, []);
});

test('a genuinely wrong total is still flagged when no tax line explains the gap', () => {
    const r = parseReceiptText('Item Qty Rate Total\nTea 1 20.00 20.00\nSamosa 1 30.00 30.00\nSub Total 50.00\nCGST 2.5% 1.25\nSGST 2.5% 1.25\nTotal 90.00');
    assert.ok(r.warnings.some((w) => /does not match/.test(w)), r.warnings.join(' / '));
});

test('a stray extra digit after the decimals ("309.756") is dropped, not the whole line', () => {
    const r = parseReceiptText('Item Qty Rate Total\nTandoori chicken 1 295.00 309.756\nSub Total 309.75');
    assert.deepStrictEqual(amounts(r), [309.75]);
});

test('an item name that wraps onto two lines keeps both lines', () => {
    const r = parseReceiptText(TAX_INCLUSIVE_BILL);
    assert.ok(names(r).includes('Hyderabadi Murg Biryani'), names(r).join(' | '));
    assert.ok(names(r).some((n) => /^Tandoori Roti all food less spicy x2$/.test(n)), names(r).join(' | '));
});

test('a lowercase continuation line is not glued onto the next item', () => {
    const r = parseReceiptText('Item Qty Rate Total\nPaneer Tikka 1 200.00 200.00\nless spicy\nNaan 1 40.00 40.00\nSub Total 240.00');
    assert.deepStrictEqual(names(r), ['Paneer Tikka', 'Naan']);
});

test('a reading is only "verified" when it was cross-checked against the bill and passed', () => {
    assert.strictEqual(isVerified(parseReceiptText('Tea 20.00\nSamosa 30.00\nSub Total 50.00')), true);
    assert.strictEqual(isVerified(parseReceiptText('Tea 20.00\nSamosa 30.00\nGST 5% 2.50\nTotal 52.50')), true);
    // nothing to check against: not verified, so the scanner keeps trying other settings
    assert.strictEqual(isVerified(parseReceiptText('Tea 20.00\nSamosa 30.00')), false);
    // items that do not add up to the sub total
    assert.strictEqual(isVerified(parseReceiptText('Tea 20.00\nSub Total 50.00')), false);
    assert.strictEqual(isVerified(parseReceiptText('')), false);
});

test('the scanner prefers a reading whose items add up to the sub total', () => {
    const exact = parseReceiptText('Tea 20.00\nSamosa 30.00\nSub Total 50.00');
    const off = parseReceiptText('Tea 20.00\nSamosa 31.00\nSub Total 50.00');
    const noCheck = parseReceiptText('Tea 20.00\nSamosa 30.00\nVada 25.00');
    assert.ok(scoreReading(exact) > scoreReading(off));
    assert.ok(scoreReading(exact) > scoreReading(noCheck));
});

// A synthetic "photo": dark table, a sheet of paper with printed lines on it
function fakePhoto(w, h, paper) {
    const gray = new Uint8ClampedArray(w * h).fill(55);
    for (let y = paper.y0; y < paper.y1; y++) {
        for (let x = paper.x0; x < paper.x1; x++) {
            const printed = y % 9 < 3 && x > paper.x0 + 15 && x < paper.x1 - 15;   // dark text-like lines
            gray[y * w + x] = printed ? 45 : 225;
        }
    }
    return gray;
}

test('camera photo: the paper is found and the table around it is cut away', () => {
    const { findPaperBox } = require('../js/bill-scanner.js')._image;
    const paper = { x0: 120, x1: 300, y0: 100, y1: 500 };
    const box = findPaperBox(fakePhoto(400, 600, paper), 400, 600);
    assert.ok(box, 'paper should be found');
    // the whole sheet is inside the box, with only a little extra around it
    assert.ok(box.left <= 0.3 && box.right >= 0.75 && box.top <= 100 / 600 && box.bottom >= 500 / 600, JSON.stringify(box));
    assert.ok(box.left >= 0.15 && box.right <= 0.9 && box.top >= 0.05 && box.bottom <= 0.95, JSON.stringify(box));
});

test('a photo that is already mostly bill, or has no clear paper, is not cropped', () => {
    const { findPaperBox } = require('../js/bill-scanner.js')._image;
    assert.strictEqual(findPaperBox(fakePhoto(400, 600, { x0: 5, x1: 395, y0: 5, y1: 595 }), 400, 600), null);
    assert.strictEqual(findPaperBox(new Uint8ClampedArray(400 * 600).fill(180), 400, 600), null);
    assert.strictEqual(findPaperBox(new Uint8ClampedArray(5 * 5).fill(10), 5, 5), null);
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
