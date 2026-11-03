# Tasks

## 1. Grips and evaluation (view/interact, view/render)

- [ ] 1.1 Make the connect evaluation take a planner callback so reconnect can pass its own (D1); verify the existing `connect-tool.test.ts` still passes unchanged and a new `connect-evaluation.test.ts` case titled INT-14, CON-01a shows that a port occupied only by the connection being moved evaluates as compatible, not occupied
- [ ] 1.2 Add the endpoint-grip geometry (endpoint hit test in CSS pixels, selected single connection only, disabled when `can` rejects) and paint the grips beside the route-edit grips (D2, D4); verify `reconnect-grips.test.ts` titled INT-14, PRT-05: hit radius is constant in CSS pixels at zoom 0.5 and 2, no grips with two connections selected, a grip is disabled when the capability model forbids editing, the endpoint grip wins over an overlapping route handle

## 2. Reconnect tool (view/interact)

- [ ] 2.1 Implement `reconnect-tool.ts` as a pure transition function with the states of D3, the release outcomes of D5 and the `onEmptyDrop` option; verify `reconnect-tool.test.ts` in the style of `connect-tool.test.ts`, titled INT-14, INT-14a, CON-07, INT-05, INT-08: reconnect to a valid port submits one `reconnect`; to an invalid port nothing is submitted and the reason is in the preview; to empty space `cancel` submits nothing and `delete` submits one `disconnect`; Escape, pointercancel, lost capture, fixed-end removal and reset cancel; below the threshold it is a click; dropping on the current port is a no-op; a choice outcome commits nothing; 200 pointer moves yield one command
- [ ] 2.2 Register the tool before the connect tool in `default-tools.ts` with its options in `ToolOptions` and the mount options, and add the `reconnect` preview kind and painter (D2, D3); verify `tool-router.test.ts` ordering case titled INT-14 (a press on a grip of a selected wire reaches the reconnect tool; a press on a port still reaches the connect tool) and the preview painter test that the stored connection stays painted while the provisional path is drawn
- [ ] 2.3 Verify core behavior used by the tool, without changing it: `reconnect.test.ts` in `core/edit/commands` titled CON-02, CON-07, CON-08: parallel connections reconnect independently with their IDs kept, a rejected reconnect leaves the connection unchanged, a reconnect is one history entry and undo restores the old endpoint (add the test only if missing; if the planner needs a change, stop and ask)

## 3. Browser verification and the async path

- [ ] 3.1 After `add-async-connection-policy` lands, add the pending wait for a release on a pending target (INT-13 mechanism) and the `onRejection` delivery; verify the reconnect-tool tests titled INT-14a, INT-13, CON-10: release on pending then accepted submits one `reconnect`, then rejected submits nothing and delivers the reason, Escape and a new press cancel the wait
- [ ] 3.2 Browser test `src/view/reconnect.browser.test.ts` in Chrome titled INT-14, INT-14a, CON-07, INT-08: select a wire, drag its end to another compatible port and assert the wire's ID, endpoints and one history entry (undo restores), drop on an incompatible port and assert the original is kept, drop on empty space for both options, Escape keeps the original, and an orthogonal wire's route-edit drag still works away from its ends

## 4. Docs and gates

- [ ] 4.1 Document the gesture, options (`onEmptyDrop`, grip radius) and precedence in `docs/guide-view.md` and enable it in `examples/plain-js`; verify `npm run demo` shows endpoint grips on a selected wire and reconnecting works, and `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:browser` pass
