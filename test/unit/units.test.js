/* parseLen / fmtLen. Everything is stored in millimetres and formatted at
   render time, so these two are the boundary the entire app's numbers cross.
   Round-trips matter more than any individual value.

   Pure logic, imported straight from src/ — no harness, no jsdom, no app. */

import { describe, it, expect } from 'vitest';
import { parseLen, fmtLen, fmtArea } from '../../src/core/units.js';

describe('parseLen — explicit units win regardless of the display unit', () => {
  const cases = [
    ['100mm', 'ftin', 100],
    ['100 mm', 'm', 100],
    ['100 millimetres', 'in', 100],
    ['100 millimeters', 'in', 100],
    ['5cm', 'ftin', 50],
    ['5 centimetres', 'ftin', 50],
    ['2m', 'ftin', 2000],
    ['2 metres', 'ftin', 2000],
    ['2 meters', 'ftin', 2000],
    ['1in', 'mm', 25.4],
    ['1 inch', 'mm', 25.4],
    ['1 inches', 'mm', 25.4],
    ['1"', 'mm', 25.4],
    ['1”', 'mm', 25.4],
    ['1ft', 'mm', 304.8],
    ['1 foot', 'mm', 304.8],
    ['1 feet', 'mm', 304.8],
    ["1'", 'mm', 304.8],
    ['1’', 'mm', 304.8],
  ];
  for (const [input, unit, mm] of cases) {
    it(`${JSON.stringify(input)} in ${unit} -> ${mm}mm`, () => {
      expect(parseLen(input, unit)).toBeCloseTo(mm, 6);
    });
  }
});

describe('parseLen — a bare number takes the display unit', () => {
  const bare = [
    ['12', 'ftin', 12 * 25.4],   // ft+in mode reads a bare number as inches
    ['12', 'in', 12 * 25.4], ['12', 'cm', 120], ['12', 'mm', 12], ['12', 'm', 12000],
  ];
  for (const [input, unit, mm] of bare) {
    it(`"${input}" in ${unit} -> ${mm}mm`, () => expect(parseLen(input, unit)).toBeCloseTo(mm, 6));
  }
  it('falls back to millimetres when the display unit is unknown', () =>
    expect(parseLen('12', 'furlongs')).toBe(12));
});

describe('parseLen — compound and fractional input', () => {
  it('sums a feet-and-inches pair', () => {
    expect(parseLen(`3' 6"`, 'ftin')).toBeCloseTo(1066.8, 6);
    expect(parseLen(`3ft 6in`, 'ftin')).toBeCloseTo(1066.8, 6);
  });
  it('sums three terms', () => expect(parseLen('1m 20cm 5mm', 'mm')).toBeCloseTo(1205, 6));
  it('reads a fraction', () => {
    expect(parseLen('1/2"', 'ftin')).toBeCloseTo(12.7, 6);
    expect(parseLen('3/8 in', 'ftin')).toBeCloseTo(9.525, 6);
  });
  it('reads feet plus a fractional inch as two terms', () =>
    expect(parseLen(`2' 1/2"`, 'ftin')).toBeCloseTo(609.6 + 12.7, 6));
  it('is case-insensitive and tolerates surrounding space', () =>
    expect(parseLen('  10 CM  ', 'mm')).toBeCloseTo(100, 6));
  it('divides by zero into NaN, which is then skipped', () =>
    expect(Number.isNaN(parseLen('1/0"', 'ftin'))).toBe(true));
});

describe('parseLen — unicode minus signs', () => {
  for (const [label, dash] of [['hyphen-minus', '-'], ['U+2212 minus', '−'], ['en dash', '–'], ['em dash', '—']]) {
    it(`${label} yields a negative length`, () =>
      expect(parseLen(`${dash}250mm`, 'mm')).toBeCloseTo(-250, 6));
  }
});

describe('parseLen — nothing usable is NaN', () => {
  for (const bad of [null, undefined, '', '   ', 'abc', '—', 'wide']) {
    it(`${JSON.stringify(bad)} -> NaN`, () => expect(Number.isNaN(parseLen(bad, 'mm'))).toBe(true));
  }
});

describe('fmtLen', () => {
  const cases = [
    [0, 'mm', '0 mm'],
    [1234.6, 'mm', '1235 mm'],
    [1234.6, 'cm', '123.5 cm'],
    [1234.6, 'm', '1.23 m'],
    [1234.6, 'in', '48.61"'],
    [0, 'ftin', '0"'],
    [304.8, 'ftin', `1'`],          // a whole number of feet prints no inches part
    [1066.8, 'ftin', `3' 6"`],
    [25.4, 'ftin', '1"'],
    [12.7, 'ftin', '0 1/2"'],       // a bare fraction still prints its zero inches
    [9.525, 'ftin', '0 3/8"'],
    [317.5, 'ftin', `1' 0 1/2"`],
    [-1066.8, 'ftin', `-3' 6"`],
  ];
  for (const [mm, unit, out] of cases) {
    it(`${mm}mm in ${unit} -> ${out}`, () => expect(fmtLen(mm, unit)).toBe(out));
  }

  it('renders a non-finite length as an em dash', () => {
    expect(fmtLen(NaN, 'mm')).toBe('—');
    expect(fmtLen(Infinity, 'ftin')).toBe('—');
  });

  it('rounds ft+in to the nearest eighth of an inch', () => {
    expect(fmtLen(1.5875, 'ftin')).toBe('0 1/8"');   // exactly 1/16", rounds up
    expect(fmtLen(0.5, 'ftin')).toBe('0"');          // below half of 1/16", rounds away
  });
});

describe('round trip: fmtLen -> parseLen', () => {
  const lengths = [0, 1, 12.7, 25.4, 100, 304.8, 1066.8, 2438.4, 4270, 12700];
  /* each unit round-trips only to the precision it actually displays:
     mm 0dp, cm 1dp (=1mm), m 2dp (=10mm), in 2dp (=0.254mm), ftin 1/8" */
  const TOL = { mm: 0.5, cm: 0.5, m: 5, in: 0.005 * 25.4, ftin: 25.4 / 16 };
  for (const unit of Object.keys(TOL)) {
    it(`every length survives a trip through ${unit}`, () => {
      for (const mm of lengths) {
        expect(Math.abs(parseLen(fmtLen(mm, unit), unit) - mm)).toBeLessThanOrEqual(TOL[unit]);
      }
    });
  }

  /* CHARACTERIZED DEFECT, NOT ENDORSED. fmtLen puts one leading '-' on the whole
     string, but parseLen sums each term with its own sign, so it reads that back
     as -3ft PLUS 6in = -762mm. ft+in is the only compound unit and so the only
     lossy round trip. Logged in BACKLOG.md "Known defects". */
  it('a negative ft+in length does NOT round-trip (known defect)', () => {
    expect(fmtLen(-1066.8, 'ftin')).toBe(`-3' 6"`);
    expect(parseLen(`-3' 6"`, 'ftin')).toBeCloseTo(-762, 6);
  });

  it('negative lengths DO round-trip in every non-compound unit', () => {
    for (const [unit, mm] of [['mm', -250], ['cm', -250], ['m', -2500], ['in', -254]]) {
      expect(parseLen(fmtLen(mm, unit), unit)).toBeCloseTo(mm, 3);
    }
  });
});

describe('fmtArea', () => {
  it('is square feet in imperial modes and square metres otherwise', () => {
    expect(fmtArea(92903.04, 'ftin')).toBe('1 sq ft');
    expect(fmtArea(92903.04, 'in')).toBe('1 sq ft');
    expect(fmtArea(1e6, 'm')).toBe('1 m²');
    expect(fmtArea(1e6, 'cm')).toBe('1 m²');
    expect(fmtArea(1e6, 'mm')).toBe('1 m²');
  });
});

describe('UNIT_RE is stateful — a regression guard', () => {
  /* UNIT_RE is a module-level /g regex and parseLen resets lastIndex itself.
     Move the regex and the reset apart and consecutive calls start returning
     wrong answers. */
  it('gives the same answer when called repeatedly', () => {
    for (let i = 0; i < 5; i++) {
      expect(parseLen(`3' 6"`, 'ftin')).toBeCloseTo(1066.8, 6);
    }
  });
});
