/* Ordering probe for the multi-block build test. Each inline module script in
   the fixture's index.html calls mark() with a distinctive literal; the test
   then asserts those literals appear in the single inlined bundle in the same
   order the script blocks appear in the document. */
export function mark(tag){
  (globalThis.__order ||= []).push(tag);
}
