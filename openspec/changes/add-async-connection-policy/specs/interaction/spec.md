## ADDED Requirements

### Requirement: INT-13 Pending target resolution
While the connect tool's candidate target is pending (CON-09), the target SHALL show the pending state, distinct from compatible, incompatible and choice-required and not color alone (PRT-06, UX-02), and the gesture SHALL stay responsive: the preview follows the pointer and cancellation works (TXN-06). A release on a pending target SHALL keep the preview at the release point and commit nothing until the verdict arrives; an accepted verdict SHALL then submit one connect command, revalidated at commit (CON-05), and a rejected, failed or timed-out verdict SHALL commit nothing, clear the preview and deliver the rejection (CON-10). Escape, a new press outside overlay content, disposal, a reset, or removal of the source or target port SHALL cancel the wait, abort the validator request, ignore a later verdict for it, and commit nothing. A cancelled wait SHALL NOT delay the next gesture: a new press cancels the waiting gesture and then starts normally. Validation SHALL NOT make a submitted edit cancellable (ADP-07) because nothing is submitted while waiting (INT-08).

#### Scenario: Pending shown during drag
- **WHEN** the drag hovers a target whose verdict is unknown
- **THEN** the target shows the pending cue, a later accepted verdict changes it to compatible without the pointer moving, and pan and zoom stay usable

#### Scenario: Release on a pending target, then accepted
- **WHEN** the user releases on a pending target and the validator then accepts
- **THEN** exactly one connect command is submitted and the history gains one entry

#### Scenario: Release on a pending target, then rejected
- **WHEN** the user releases on a pending target and the validator then rejects
- **THEN** nothing is committed, the preview is cleared and the host rejection callback receives the reason

#### Scenario: Escape while waiting
- **WHEN** a release is waiting for a verdict and the user presses Escape
- **THEN** the request is aborted, nothing is committed, and a later verdict has no effect

#### Scenario: New press while waiting
- **WHEN** a release is waiting and the user presses on another port
- **THEN** the waiting gesture is cancelled and a new connect gesture starts from the pressed port

#### Scenario: Target removed while waiting
- **WHEN** an external change removes the target port's node during the wait
- **THEN** the wait is cancelled, the request is aborted and nothing is committed
