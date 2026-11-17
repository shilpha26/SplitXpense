/**
 * Bill scanner for "Who had what".
 *
 * Reads a photo of a restaurant bill on the device (nothing is uploaded) and returns
 * the item names, their prices and the printed total. The reader (Tesseract.js) is only
 * downloaded the first time someone scans a bill.
 *
 * parseReceiptText() is a pure function so it can be tested in Node without a browser.
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.BillScanner = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
    'use strict';

    // Pinned version with an integrity hash, so the browser refuses a changed file.
    const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
    const TESSERACT_SRI = 'sha384-2BQ3U3OdKOb0Uczxqr41I9UvZkzr4V9Hv8uSzMMZAlmhsFClvdZX5wi5fDCzG+tM';

    const MAX_ITEMS = 60;
    const MAX_ITEM_AMOUNT = 99999.99;
    const MAX_TOTAL = 9999999.99;

    // ------------------------------------------------------------------
    // Parsing
    // ------------------------------------------------------------------

    // Lines that are headers, taxes, payment details or other bill furniture, not food.
    const NOT_AN_ITEM = new RegExp('\\b(' + [
        'sub\\s*-?\\s*total', 'total', 'grand', 'net\\s*(amt|amount|payable)', 'payable', 'amount', 'amt',
        'gst', 'cgst', 'sgst', 'igst', 'vat', 'tax(es)?', 'cess', 'charges?', 'chg', 'service',
        'round\\s*-?\\s*off', 'rounding', 'discount', 'disc', 'coupon', 'offer', 'saving',
        'balance', 'cash', 'change', 'upi', 'paid', 'payment', 'card', 'tip', 'due',
        'invoice', 'bill', 'receipt', 'order', 'table', 'date', 'time', 'phone', 'ph', 'mob', 'mobile', 'tel',
        'gstin', 'fssai', 'thank', 'visit', 'waiter', 'server', 'cashier', 'steward',
        'covers?', 'pax', 'guests?', 'qty', 'quantity', 'rate', 'price', 'description', 'particulars', 'item', 'items',
        'kot', 'token', 'customer', 'dine', 'dine-in', 'takeaway', 'delivery', 'address', 'www', 'http', 'email', 'e-mail'
    ].join('|') + ')\\b', 'i');

    const GRAND_TOTAL = /(grand\s*total|net\s*(amt|amount|payable)|amount\s*(payable|due)|total\s*(amt|amount|payable|due)|bill\s*amount|total\s*bill|you\s*pay|payable)/i;
    const PLAIN_TOTAL = /^\W*total\b/i;
    const TOTAL_IS_COUNT = /total\s*(qty|quantity|items?|pax|guests?|covers?)/i;
    const SUB_TOTAL = /sub\s*-?\s*total/i;
    // Address lines ("11/2 Sector- 37,") have numbers too, but are never food
    const ADDRESS_LINE = /\b(sector|road|rd|nagar|colony|plot|phase|floor|block|marg|chowk|pin\s*-?\s*code|pincode|pin)\b|^\s*\d+\s*\/\s*\d+/i;
    const CHARGE_LINE = /\b(cgst|sgst|igst|gst|vat|tax(es)?|cess|service|charges?|chg|round\s*-?\s*off|rounding)\b/i;
    const DISCOUNT_LINE = /\b(discount|disc|coupon)\b/i;

    function parseAmount(token) {
        if (!token) return NaN;
        let t = String(token).replace(/\s+/g, '');
        if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(t)) t = t.replace(/,/g, '');
        else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
        else if (/^\d+\.\d{3,}$/.test(t)) t = t.replace(/^(\d+\.\d{2})\d+$/, '$1');   // "309.756": a stray extra digit
        else t = t.replace(/,/g, '');
        const n = Number(t);
        return isFinite(n) ? n : NaN;
    }

    function cleanLine(line) {
        return String(line || '')
            .replace(/[\u20B9\u00A3$]/g, ' ')
            .replace(/\b(?:rs|inr)\.?(?=\s|\d|$)/gi, ' ')
            .replace(/\/-/g, ' ')
            .replace(/[|\u2022_~=*]+/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/[\s.,:;]+$/, '')
            .trim();
    }

    // Splits a cleaned line into its text and its trailing numbers, e.g.
    // "Paneer Tikka 2 150.00 300.00" -> { text: "Paneer Tikka", numbers: ["2", "150.00", "300.00"] }
    const TRAILING_NUMBER = /^(.*?)(?:^|\s)(\d[\d,]*(?:[.,]\d{1,3})?)$/;

    function splitTrailingNumbers(line) {
        let text = line.trim();
        const numbers = [];
        while (numbers.length < 3) {
            const m = text.match(TRAILING_NUMBER);
            if (!m) break;
            numbers.unshift(m[2]);
            text = m[1].trim();
        }
        return { text: text, numbers: numbers };
    }

    function isDecimalToken(token) {
        return /\.\d{1,3}$|,\d{1,2}$/.test(token);
    }

    function titleCase(name) {
        if (name !== name.toUpperCase()) return name;
        return name.toLowerCase().replace(/(^|[\s\-(\/])([a-z])/g, function (_, a, b) { return a + b.toUpperCase(); });
    }

    function cleanName(name) {
        return name
            .replace(/^\s*\d{1,2}\s*[.)\-:]\s*/, '')     // "1. Paneer", "2) Dosa"
            .replace(/^\s*\d{1,2}\s+(?=[A-Za-z])/, '')   // "2 Masala Dosa" (serial or quantity)
            .replace(/[^A-Za-z0-9&'()\/+\-.,% ]+/g, ' ')
            .replace(/^[\s\-:.,/+]+|[\s\-:.,/+]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Turns the text read from a bill into { items: [{ name, amount }], total }.
     * Anything it is unsure about is left out, because the user reviews every row.
     */
    function parseReceiptText(text) {
        const lines = String(text || '').split(/\r?\n/);
        // Everything above the table header (shop name, address, phone, invoice no.) is not food
        const headerIndex = lines.findIndex(function (raw) { return isTableHeader(cleanLine(raw)); });
        let result = parseLines(lines, headerIndex);
        // If the header was a false alarm and nothing was found below it, read the whole text instead
        if (headerIndex >= 0 && !result.items.length) result = parseLines(lines, -1);
        return result;
    }

    // "Item  Qty  Rate  Total" or "Units Description U.Price Total": a name column plus at least one more column
    function isTableHeader(line) {
        if (!line) return false;
        const l = line.toLowerCase();
        if (!/\b(item|items|description|descr\w*|particulars|units?|product)\b/.test(l)) return false;
        const others = [/\b(qty|quantity|units?)\b/, /\b(rate|price)\b/, /\b(amount|amt|total)\b/]
            .filter(function (r) { return r.test(l); }).length;
        return others >= 2 || (others >= 1 && l.split(/\s+/).length <= 3);
    }

    // Smallest gap between what the items add up to and the sub total. Some bills print tax-inclusive line
    // totals, so the items may equal the sub total plus some of the tax / charge lines.
    function subtotalGap(itemsSum, subtotal, charges) {
        const list = (charges || []).slice(0, 8);
        let best = Math.abs(itemsSum - subtotal);
        for (let mask = 1; mask < (1 << list.length); mask++) {
            let extra = 0;
            for (let k = 0; k < list.length; k++) if (mask & (1 << k)) extra += list[k];
            best = Math.min(best, Math.abs(itemsSum - (subtotal + extra)));
        }
        return best;
    }

    // True when `amount` equals the sum of some of the listed amounts (within `tolerance`)
    function matchesSomeOf(amount, list, tolerance) {
        const parts = (list || []).slice(0, 8);
        for (let mask = 1; mask < (1 << parts.length); mask++) {
            let sum = 0;
            for (let k = 0; k < parts.length; k++) if (mask & (1 << k)) sum += parts[k];
            if (Math.abs(sum - amount) <= tolerance) return true;
        }
        return false;
    }

    function parseLines(lines, headerIndex) {
        const result = { items: [], total: null, subtotal: null, charges: [], warnings: [] };
        let grandTotal = null;
        let plainTotal = null;
        let chargesSum = 0;    // tax, service charge, round-off lines
        let discountSum = 0;

        // A name that wraps onto two lines ("HYDERABADI MURG" / "BIRYANI 1 375.00 393.75") puts its numbers on
        // the second line. Only used inside the table, and only when the first line starts with a capital.
        let pendingName = '';

        lines.forEach(function (raw, index) {
            if (index <= headerIndex) return;
            const wrappedName = pendingName;
            pendingName = '';
            const line = cleanLine(raw);
            if (!line || line.length < 3) return;

            // Totals first, since their words are also on the "not an item" list
            if (SUB_TOTAL.test(line)) {
                const s = splitTrailingNumbers(line).numbers;
                const v = s.length ? parseAmount(s[s.length - 1]) : NaN;
                if (v > 0 && v <= MAX_TOTAL) result.subtotal = v;
                return;
            }
            if ((GRAND_TOTAL.test(line) || PLAIN_TOTAL.test(line)) && !TOTAL_IS_COUNT.test(line)) {
                const nums = splitTrailingNumbers(line).numbers;
                const v = nums.length ? parseAmount(nums[nums.length - 1]) : NaN;
                if (v > 0 && v <= MAX_TOTAL) {
                    if (GRAND_TOTAL.test(line)) grandTotal = v; else plainTotal = v;
                }
                return;
            }

            if (NOT_AN_ITEM.test(line) || ADDRESS_LINE.test(line)) {
                // Remember tax / charge / discount amounts so the total can be cross-checked
                const kind = DISCOUNT_LINE.test(line) ? 'discount' : (CHARGE_LINE.test(line) ? 'charge' : '');
                if (kind) {
                    const n = splitTrailingNumbers(line).numbers;
                    const v = n.length ? parseAmount(n[n.length - 1]) : NaN;
                    if (v > 0 && v <= MAX_ITEM_AMOUNT) {
                        if (kind === 'discount') discountSum += v;
                        else { chargesSum += v; result.charges.push(v); }
                    }
                }
                return;
            }

            const parts = splitTrailingNumbers(line);
            if (!parts.numbers.length) {
                if (headerIndex >= 0 && /^[A-Z]/.test(line) && /[A-Za-z]{2,}/.test(line)) pendingName = line;
                return;
            }

            const amount = parseAmount(parts.numbers[parts.numbers.length - 1]);
            if (!(amount > 0) || amount > MAX_ITEM_AMOUNT) return;

            // Work out which of the other trailing numbers are quantity / rate columns
            let columns = parts.numbers.slice(0, -1);
            let text2 = parts.text;
            let qty = 1;
            const nums = columns.map(parseAmount);

            // Layout "Units Description U.Price Total": the unit count starts the line, often stuck to the
            // name ("3NAR MOCKTAIL 30 90.00"). It is only trusted when units x price = total.
            const lead = columns.length ? parts.text.match(/^\s*(\d{1,2})\s*(?=[A-Za-z])/) : null;
            const rate = columns.length ? parseAmount(columns[columns.length - 1]) : NaN;
            const leadQty = lead ? Number(lead[1]) : 0;

            if (leadQty >= 1 && rate > 0 && Math.abs(leadQty * rate - amount) < 0.51) {
                qty = leadQty;
                text2 = parts.text.slice(lead[0].length);
                // Numbers before the price column belong to the name, e.g. the 4 in "FIRE STARTER MIX 4 68 68.00"
                if (columns.length > 1) text2 += ' ' + columns.slice(0, -1).join(' ');
                columns = [];
            } else if (columns.length === 2 && Number.isInteger(nums[0]) && nums[0] >= 1 && nums[0] <= 50 &&
                Math.abs(nums[0] * nums[1] - amount) < 0.51) {
                qty = nums[0];                    // qty x rate = amount
            } else {
                // Price equal to the total means quantity 1, so a number before it is part of the name
                if (columns.length === 2 && nums[1] === amount && !isDecimalToken(columns[0])) {
                    text2 += ' ' + columns[0];
                    columns = [columns[1]];
                }
                // Put back leading numbers that are not columns, e.g. the 65 in "Chicken 65 180"
                while (columns.length) {
                    const token = columns[0];
                    const v = parseAmount(token);
                    const looksLikeColumn = isDecimalToken(token) || (Number.isInteger(v) && v >= 1 && v <= 20 && v <= amount) || v === amount;
                    if (looksLikeColumn) break;
                    text2 += ' ' + token;
                    columns.shift();
                }
                const firstInt = columns.map(parseAmount).find(function (v) { return Number.isInteger(v) && v >= 1 && v <= 20; });
                if (firstInt) qty = firstInt;
            }

            const qtyPrefix = text2.match(/^\s*(\d{1,2})\s*[xX\u00D7]\s+/);
            if (qtyPrefix) { qty = Number(qtyPrefix[1]); text2 = text2.slice(qtyPrefix[0].length); }

            let name = cleanName(text2);
            if (!/[A-Za-z]{2,}/.test(name)) return;
            if (wrappedName) name = cleanName(wrappedName) + ' ' + name;
            name = titleCase(name).slice(0, 56);
            if (qty > 1) name += ' x' + qty;

            if (result.items.length < MAX_ITEMS) result.items.push({ name: name, amount: Math.round(amount * 100) / 100 });
        });

        let total = grandTotal || plainTotal || null;
        // A total far below the sub total is a misread digit, not a real total
        if (total && result.subtotal && total < result.subtotal * 0.5) total = null;
        result.total = total;

        // An "item" larger than the bill is a misread, not food (but never throw everything away)
        const cap = Math.max(result.total || 0, result.subtotal || 0);
        if (cap > 0) {
            const kept = result.items.filter(function (item) { return item.amount <= cap; });
            if (kept.length) result.items = kept;
        }

        // Cross-checks, so a misread digit is pointed out instead of silently splitting the wrong amount
        const itemsSum = result.items.reduce(function (sum, item) { return sum + item.amount; }, 0);
        if (result.subtotal && subtotalGap(itemsSum, result.subtotal, result.charges) > 0.51) {
            result.warnings.push('The items add up to ' + money(itemsSum) + ' but the bill sub total is ' +
                money(result.subtotal) + '. Some items may be missing or misread.');
        }
        if (result.total && result.subtotal) {
            const expected = result.subtotal + chargesSum - discountSum;
            const gap = result.total - expected;
            // A bill often prints a tax summary line ("S.Tax", "Total GST") on top of CGST and SGST. If the gap
            // is the same as some of the tax lines that were read, a summary line was just not picked up.
            const explained = gap > 0 && matchesSomeOf(gap, result.charges, 1.01);
            if (Math.abs(gap) > Math.max(1.5, expected * 0.005) && !explained) {
                result.warnings.push('The bill total ' + money(result.total) + ' does not match the sub total plus the tax lines that were read (' +
                    money(expected) + '). A tax line may have been missed, so check the total against the paper bill.');
            }
        }
        return result;
    }

    function money(value) {
        return '\u20B9' + (Math.round(value * 100) / 100).toFixed(2);
    }

    // ------------------------------------------------------------------
    // Browser side: image preparation and reading
    // ------------------------------------------------------------------

    function loadImage(file) {
        if (typeof createImageBitmap === 'function') {
            return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return loadWithImageTag(file); });
        }
        return loadWithImageTag(file);
    }

    function loadWithImageTag(file) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not open that image.')); };
            img.src = url;
        });
    }

    // Greyscale copy of the photo with its longest side at about `target` pixels. The best size depends on
    // how big the text is in the photo (too small and it is unreadable, too big and it blurs), so the scanner
    // tries a few. Enlarging is capped at 4x.
    function grayAt(source, target) {
        const longest = Math.max(source.width, source.height);
        const scale = Math.min(target / longest, 4);
        const w = Math.max(1, Math.round(source.width * scale));
        const h = Math.max(1, Math.round(source.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(source.image, 0, 0, w, h);

        const px = ctx.getImageData(0, 0, w, h).data;
        const gray = new Uint8ClampedArray(w * h);
        for (let i = 0, p = 0; i < px.length; i += 4, p++) {
            gray[p] = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
        }
        return { w: w, h: h, gray: gray };
    }

    function openSource(file) {
        return loadImage(file).then(function (image) {
            const width = image.width || image.naturalWidth;
            const height = image.height || image.naturalHeight;
            if (!width || !height) throw new Error('Could not open that image.');
            return { image: image, width: width, height: height };
        });
    }

    function closeSource(source) {
        if (source && source.image && source.image.close) source.image.close();
    }

    // Stretches the contrast so the darkest 1% becomes black and the lightest 1% white
    function autoContrast(gray) {
        const histogram = new Uint32Array(256);
        for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
        let low = 0, high = 255, seen = 0;
        for (let v = 0; v < 256; v++) { seen += histogram[v]; if (seen >= gray.length * 0.01) { low = v; break; } }
        seen = 0;
        for (let v = 255; v >= 0; v--) { seen += histogram[v]; if (seen >= gray.length * 0.01) { high = v; break; } }
        const out = new Uint8ClampedArray(gray.length);
        if (high - low <= 30) { out.set(gray); return out; }
        const range = high - low;
        for (let i = 0; i < gray.length; i++) out[i] = Math.round((gray[i] - low) * 255 / range);
        return out;
    }

    // Box blur with running sums (edges are clamped)
    function boxBlur(src, w, h, r) {
        const tmp = new Float32Array(w * h);
        const out = new Float32Array(w * h);
        const size = 2 * r + 1;
        for (let y = 0; y < h; y++) {
            const row = y * w;
            let sum = 0;
            for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))];
            for (let x = 0; x < w; x++) {
                tmp[row + x] = sum / size;
                sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
            }
        }
        for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
            for (let y = 0; y < h; y++) {
                out[y * w + x] = sum / size;
                sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
            }
        }
        return out;
    }

    // Makes thin, soft text crisper
    function sharpen(gray, w, h) {
        const blurred = boxBlur(gray, w, h, 3);
        const out = new Uint8ClampedArray(gray.length);
        for (let i = 0; i < gray.length; i++) out[i] = gray[i] + 1.8 * (gray[i] - blurred[i]);
        return out;
    }

    // Plain black and white, split at the level that best separates text from paper (Otsu)
    function binarize(gray) {
        const histogram = new Uint32Array(256);
        for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;
        let sumAll = 0;
        for (let v = 0; v < 256; v++) sumAll += v * histogram[v];
        let sumBack = 0, weightBack = 0, best = 0, threshold = 127;
        for (let v = 0; v < 256; v++) {
            weightBack += histogram[v];
            if (!weightBack) continue;
            const weightFore = gray.length - weightBack;
            if (!weightFore) break;
            sumBack += v * histogram[v];
            const meanBack = sumBack / weightBack;
            const meanFore = (sumAll - sumBack) / weightFore;
            const between = weightBack * weightFore * (meanBack - meanFore) * (meanBack - meanFore);
            if (between > best) { best = between; threshold = v; }
        }
        const out = new Uint8ClampedArray(gray.length);
        for (let i = 0; i < gray.length; i++) out[i] = gray[i] > threshold ? 255 : 0;
        return out;
    }

    function grayToCanvas(gray, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(w, h);
        for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
            image.data[i] = image.data[i + 1] = image.data[i + 2] = gray[p];
            image.data[i + 3] = 255;
        }
        ctx.putImageData(image, 0, 0);
        return canvas;
    }

    // Kept for callers that only want one cleaned-up image
    function prepareImage(file) {
        return openSource(file).then(function (source) {
            const g = grayAt(source, 1400);
            closeSource(source);
            return grayToCanvas(autoContrast(g.gray), g.w, g.h);
        });
    }

    let tesseractLoading = null;

    function loadTesseract() {
        if (root && root.Tesseract) return Promise.resolve(root.Tesseract);
        if (!tesseractLoading) {
            tesseractLoading = new Promise(function (resolve, reject) {
                const script = document.createElement('script');
                script.src = TESSERACT_URL;
                script.integrity = TESSERACT_SRI;
                script.crossOrigin = 'anonymous';
                script.onload = function () {
                    if (root.Tesseract) resolve(root.Tesseract);
                    else { tesseractLoading = null; reject(new Error('The bill reader did not start.')); }
                };
                script.onerror = function () {
                    tesseractLoading = null;
                    script.remove();
                    reject(new Error('Could not load the bill reader. Check your internet connection and try again.'));
                };
                document.head.appendChild(script);
            });
        }
        return tesseractLoading;
    }

    // How trustworthy a reading looks. Items that add up to the printed sub total are the strongest sign.
    function scoreReading(parsed) {
        const sum = parsed.items.reduce(function (s, i) { return s + i.amount; }, 0);
        let score = parsed.items.length;
        if (parsed.subtotal) {
            const diff = subtotalGap(sum, parsed.subtotal, parsed.charges);
            score += 5 + (diff <= 0.51 ? 100 : -Math.min(50, diff / parsed.subtotal * 50));
        } else if (parsed.total && sum > 0) {
            score += (sum <= parsed.total * 1.001 && sum >= parsed.total / 1.4) ? 10 : -10;
        }
        if (parsed.total) score += 5;
        if (isVerified(parsed)) score += 20;
        return score;
    }

    // True only when the items were actually cross-checked against the bill and passed.
    // A reading with nothing to check against (no sub total or total found) is NOT verified.
    // (A doubtful bill total is shown as a warning, but retrying the scan would not fix it.)
    function isVerified(parsed) {
        if (!parsed.items.length) return false;
        const sum = parsed.items.reduce(function (s, i) { return s + i.amount; }, 0);
        if (parsed.subtotal) return subtotalGap(sum, parsed.subtotal, parsed.charges) <= 0.51;
        if (parsed.total) return sum <= parsed.total * 1.001 && sum >= parsed.total / 1.4;
        return false;
    }

    /**
     * Reads a bill photo. `onStatus` gets { stage: 'load' | 'prepare' | 'read', progress: 0..1, attempt, attempts }.
     * Photos are read up to four ways (different image sizes and page layout settings). It stops as soon as
     * the items add up to the bill's sub total, otherwise the most consistent reading is used.
     * Resolves with { items, total, subtotal, warnings, text, attempts }.
     */
    async function scanBill(file, onStatus) {
        const report = typeof onStatus === 'function' ? onStatus : function () {};
        if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Please choose a photo of the bill.');

        report({ stage: 'load', progress: 0 });
        const Tesseract = await loadTesseract();

        report({ stage: 'prepare', progress: 0 });
        const source = await openSource(file);

        // Cleaned-up copies are made on demand, once per size
        const cleaned = {};
        function cleanedAt(target) {
            if (!cleaned[target]) {
                const g = grayAt(source, target);
                cleaned[target] = { w: g.w, h: g.h, sharp: sharpen(autoContrast(g.gray), g.w, g.h) };
            }
            return cleaned[target];
        }
        function imageFor(attempt) {
            const c = cleanedAt(attempt.size);
            return grayToCanvas(attempt.mode === 'binary' ? binarize(c.sharp) : c.sharp, c.w, c.h);
        }

        const PSM = Tesseract.PSM || { SINGLE_COLUMN: '4', SINGLE_BLOCK: '6' };
        // Different sizes first: the right one depends on how big the text is in the photo
        const attempts = [
            { size: 1400, mode: 'sharp', psm: PSM.SINGLE_COLUMN },
            { size: 2000, mode: 'sharp', psm: PSM.SINGLE_COLUMN },
            { size: 1000, mode: 'sharp', psm: PSM.SINGLE_COLUMN },
            { size: 1400, mode: 'binary', psm: PSM.SINGLE_BLOCK }
        ];

        let attempt = 0;
        const worker = await Tesseract.createWorker('eng', 1, {
            logger: function (m) {
                if (!m || typeof m.progress !== 'number') return;
                if (m.status === 'recognizing text') report({ stage: 'read', progress: m.progress, attempt: attempt, attempts: attempts.length });
                else report({ stage: 'load', progress: m.progress });
            }
        });

        let best = null;
        try {
            for (let i = 0; i < attempts.length; i++) {
                attempt = i + 1;
                await worker.setParameters({ tessedit_pageseg_mode: attempts[i].psm, preserve_interword_spaces: '1' });
                const out = await worker.recognize(imageFor(attempts[i]));
                const text = (out && out.data && out.data.text) || '';
                const parsed = parseReceiptText(text);
                parsed.text = text;
                parsed.score = scoreReading(parsed);
                if (!best || parsed.score > best.score) best = parsed;
                if (isVerified(parsed)) break;   // the items add up to the bill: no need to try again
            }
        } finally {
            closeSource(source);
            try { await worker.terminate(); } catch (e) { /* nothing to clean up */ }
        }

        return {
            items: best.items, total: best.total, subtotal: best.subtotal,
            warnings: best.warnings, text: best.text, attempts: attempt
        };
    }

    return { parseReceiptText: parseReceiptText, parseAmount: parseAmount, scanBill: scanBill, prepareImage: prepareImage, scoreReading: scoreReading, isVerified: isVerified,
        _image: { autoContrast: autoContrast, boxBlur: boxBlur, sharpen: sharpen, binarize: binarize } };
});
