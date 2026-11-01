// בדיקת מחולל היד - ללא תלויות. הרצה: node test/hand.test.js
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/\/\* CORE:START[\s\S]*?\*\/([\s\S]*?)\/\* CORE:END \*\//);
assert.ok(m, "CORE markers not found in index.html");
const core = vm.runInNewContext(m[1] + "\n;({ EVENTS, HAND_SIZE, dealHand, correctOrder });", { Math });
const EVENTS = JSON.parse(JSON.stringify(core.EVENTS)); // מעתיק מחוץ ל-vm context
const { HAND_SIZE } = core;
const dealHand = (ev) => Array.from(core.dealHand(core.EVENTS));
const correctOrder = (ev, hand) => Array.from(core.correctOrder(core.EVENTS, hand));

const RUNS = 10000;
const EXCEPTION_TEXT = "תחילת גלי העלייה הגדולים";

const anchors = EVENTS.map((e, i) => i).filter(i => EVENTS[i].anchor);
const pool = EVENTS.map((e, i) => i).filter(i => !EVENTS[i].anchor);
const anchorYears = new Set(anchors.map(i => EVENTS[i].year));

// בדיקות נתונים
assert.strictEqual(anchors.length, 3, "expected 3 anchors");
assert.strictEqual(pool.length, 34, "expected 34 pool events");
assert.strictEqual(HAND_SIZE, 10);
assert.deepStrictEqual(pool.filter(i => EVENTS[i].allowAnchorYear).map(i => EVENTS[i].text), [EXCEPTION_TEXT],
  "only the 1948 aliya event may share a year with an anchor");
assert.strictEqual(new Set(EVENTS.map(e => e.sortKey)).size, EVENTS.length, "sortKeys must be unique");
EVENTS.forEach(e => {
  assert.match(e.sortKey, /^\d{4}-\d{2}-\d{2}$/, "bad sortKey " + e.sortKey);
  assert.strictEqual(Number(e.sortKey.slice(0, 4)), e.year, "year/sortKey mismatch: " + e.text);
});

const seen = new Map();
let exceptionHands = 0;

for (let run = 0; run < RUNS; run++) {
  const hand = dealHand(EVENTS);

  // בדיוק 10 אירועים, ללא כפילויות, כולם מהמאגר
  assert.strictEqual(hand.length, 10, "hand size");
  assert.strictEqual(new Set(hand).size, 10, "duplicate event in hand");
  hand.forEach(i => assert.ok(pool.includes(i), "hand contains a non-pool event"));

  // אין שני אירועים באותה שנה
  const years = hand.map(i => EVENTS[i].year);
  assert.strictEqual(new Set(years).size, 10, "year collision inside hand: " + years.join(","));

  // אין אירוע משנה של עוגן, פרט לחריג
  hand.forEach(i => {
    if (anchorYears.has(EVENTS[i].year)) {
      assert.strictEqual(EVENTS[i].text, EXCEPTION_TEXT, "anchor-year collision: " + EVENTS[i].text);
      exceptionHands++;
    }
  });

  // הסדר הנכון: 13 פריטים, העוגנים כלולים, ממוין לפי sortKey (בדיקה עצמאית)
  const order = correctOrder(EVENTS, hand);
  assert.strictEqual(order.length, 13, "order length");
  anchors.forEach(a => assert.ok(order.includes(a), "anchor missing from order"));
  hand.forEach(h => assert.ok(order.includes(h), "hand event missing from order"));
  const expected = anchors.concat(hand).map(i => EVENTS[i].sortKey).sort();
  assert.deepStrictEqual(order.map(i => EVENTS[i].sortKey), expected, "order does not match sortKey");
  for (let k = 1; k < order.length; k++) {
    assert.ok(EVENTS[order[k - 1]].sortKey < EVENTS[order[k]].sortKey, "order not strictly increasing");
  }
  // החריג תמיד אחרי עוגן ההכרזה
  const ex = order.findIndex(i => EVENTS[i].text === EXCEPTION_TEXT);
  if (ex !== -1) assert.ok(EVENTS[order[ex - 1]].sortKey === "1948-05-14", "aliya must directly follow the 1948 anchor");

  hand.forEach(i => seen.set(i, (seen.get(i) || 0) + 1));
}

// כל אירוע במאגר מופיע לפחות פעם אחת, והחריג אכן מתממש
assert.strictEqual(seen.size, 34, "some pool events never dealt: " + pool.filter(i => !seen.has(i)).map(i => EVENTS[i].text));
assert.ok(exceptionHands > 0, "exception never occurred");

const counts = [...seen.values()];
console.log("OK - " + RUNS + " hands dealt, all assertions passed.");
console.log("  hands containing the 1948 aliya exception: " + exceptionHands);
console.log("  per-event frequency: min " + Math.min(...counts) + ", max " + Math.max(...counts));
