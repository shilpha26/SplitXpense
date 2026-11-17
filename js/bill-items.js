/**
 * The saved "who had what" breakdown of a bill, kept with its expense so that anyone in the group can
 * look at it later.
 *
 * Shape (amounts in rupees):
 *   { v: 1, total, itemsTotal, extra,
 *     items:  [{ name, amount, who: [names] }],
 *     people: [{ name, items, extra, total }] }
 *
 * Group members can write to the shared database, so everything read back is treated as untrusted:
 * normalize() checks the shape and limits, and the page escapes every text value when it shows it.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.BillItems = api;
})(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    const MAX_ITEMS = 60;
    const MAX_PEOPLE = 50;

    function rupees(value) {
        const n = Number(value);
        return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
    }

    function text(value, max) {
        return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    }

    // Returns a clean copy, or null when the value is missing or not a valid breakdown
    function normalize(value) {
        let v = value;
        if (typeof v === 'string') {
            try { v = JSON.parse(v); } catch (e) { return null; }
        }
        if (!v || typeof v !== 'object' || Array.isArray(v)) return null;

        const items = (Array.isArray(v.items) ? v.items : []).slice(0, MAX_ITEMS).map(function (item) {
            if (!item || typeof item !== 'object') return null;
            const name = text(item.name, 60);
            const amount = rupees(item.amount);
            if (!name || !(amount >= 0)) return null;
            const who = (Array.isArray(item.who) ? item.who : []).slice(0, MAX_PEOPLE)
                .map(function (n) { return text(n, 60); }).filter(Boolean);
            return { name: name, amount: amount, who: who };
        }).filter(Boolean);

        const people = (Array.isArray(v.people) ? v.people : []).slice(0, MAX_PEOPLE).map(function (p) {
            if (!p || typeof p !== 'object') return null;
            const name = text(p.name, 60);
            const total = rupees(p.total);
            if (!name || !(total >= 0)) return null;
            const own = rupees(p.items);
            const extra = rupees(p.extra);
            return { name: name, items: isFinite(own) ? own : total, extra: isFinite(extra) ? extra : 0, total: total };
        }).filter(Boolean);

        const total = rupees(v.total);
        if (!items.length || !people.length || !(total > 0)) return null;

        const itemsTotal = rupees(v.itemsTotal);
        const extra = rupees(v.extra);
        return {
            v: 1,
            total: total,
            itemsTotal: isFinite(itemsTotal) ? itemsTotal : rupees(items.reduce(function (s, i) { return s + i.amount; }, 0)),
            extra: isFinite(extra) ? extra : 0,
            items: items,
            people: people
        };
    }

    /**
     * Builds the saved form from the split screen's numbers (all in whole paise).
     * input: { items: [{ name, amount, who: [names] }], rows: [{ name, items, extra, total }],
     *          total, itemsTotal, extra }
     */
    function build(input) {
        const r = function (paise) { return Math.round(paise) / 100; };
        return normalize({
            v: 1,
            total: r(input.total),
            itemsTotal: r(input.itemsTotal),
            extra: r(input.extra),
            items: input.items.map(function (i) { return { name: i.name, amount: r(i.amount), who: i.who }; }),
            people: input.rows.map(function (p) { return { name: p.name, items: r(p.items), extra: r(p.extra), total: r(p.total) }; })
        });
    }

    /**
     * True when a saved breakdown still describes the expense: same total, same people, same amount for each.
     * If someone changes the amounts by hand after using the split screen, the breakdown is out of date and
     * must not be kept.
     */
    function matches(details, amount, customAmounts) {
        const b = normalize(details);
        if (!b || !customAmounts || typeof customAmounts !== 'object') return false;
        if (Math.abs(b.total - Number(amount)) > 0.01) return false;
        const names = Object.keys(customAmounts);
        if (names.length !== b.people.length) return false;
        return b.people.every(function (p) {
            return Object.prototype.hasOwnProperty.call(customAmounts, p.name) &&
                Math.abs(Number(customAmounts[p.name]) - p.total) <= 0.01;
        });
    }

    return { normalize: normalize, build: build, matches: matches };
});
