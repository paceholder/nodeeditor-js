## 1. Shorter full runs

- [ ] 1.1 Set the full-run workload length to 10 s in `bench/browser/harness.ts` (keep 3 repeats, 1 s warm-up; quick stays 5 s × 1) and update its comment (D1)
- [ ] 1.2 Update the provenance note in `bench/report/assemble.ts` to "3 repeats of 10 s" and any test that checks it (D3)

## 2. Quick by default

- [ ] 2.1 In `bench/vitest.bench.config.ts`, run quick unless `BENCH_QUICK=0`; check that `scripts/baseline.mjs` still passes `BENCH_QUICK=0` (D2)
- [ ] 2.2 Run `npm run test:bench`, lint and typecheck

## 3. Docs and check

- [ ] 3.1 Update `bench/README.md`: command table, quick and full lengths, pooling text (D3)
- [ ] 3.2 Time one `npm run bench:browser` (quick default) and one headed full run at one ratio (`BENCH_QUICK=0 BENCH_HEADED=1 BENCH_DPR=2`), and record both durations and the p95s in `notes.md`
