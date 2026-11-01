## ADDED Requirements

### Requirement: Connection-choice request
The release target SHALL be the first port in the existing deterministic candidate order that is compatible or requires a choice; the host SHALL never be asked which port. Only when the policy returns a choice with several alternatives for that target SHALL the view ask a host chooser, and it SHALL ship no picker. The request SHALL carry the source, the target, its alternatives as keyed options in policy order, the release position, and a cancellation signal.

#### Scenario: Policy offers two connection kinds
- **WHEN** a chooser is installed, the policy returns two alternatives for a port pair, and the user releases a drag on that target port
- **THEN** the chooser receives two options with distinct keys for that port, in policy order, and nothing is committed while it is pending

#### Scenario: Overlapping ports are not a choice
- **WHEN** a chooser is installed and two compatible ports of overlapping nodes lie under the release point
- **THEN** the chooser is not called and one connect command is submitted to the first port in the existing candidate order

#### Scenario: Single valid target does not ask
- **WHEN** a chooser is installed and the release target is a compatible port whose policy accepts directly
- **THEN** one connect command is submitted and the chooser is not called

### Requirement: Pending choice resolution
While a choice is pending, the preview SHALL stay at the release point, only Escape among graph shortcuts SHALL run, and nothing SHALL be committed. Choosing an option SHALL submit one connect command, revalidated at commit. Declining, a failing chooser, an unknown key, Escape, a new press outside overlay content, disposal, a reset, or removal of the source or target port SHALL commit nothing, clear the preview, abort the signal, and ignore later answers.

#### Scenario: Host picks an option
- **WHEN** a choice between two connection kinds is pending and the chooser resolves with the second option's key
- **THEN** one connection of the second kind is created as one history entry and the preview is cleared

#### Scenario: Host declines
- **WHEN** the chooser resolves with no option
- **THEN** no command is submitted, the history is unchanged, and the preview is cleared

#### Scenario: Escape while choosing
- **WHEN** a choice is pending and the user presses Escape with focus in the editor or its overlay
- **THEN** the signal is aborted, nothing is committed, the preview is cleared, a later resolution from the chooser has no effect, and keyboard focus can return to the editor root

#### Scenario: Press elsewhere cancels
- **WHEN** a choice is pending and the user presses on the canvas outside overlay content
- **THEN** the choice is cancelled with nothing committed, and that press does not start a gesture

#### Scenario: Target removed while choosing
- **WHEN** a choice is pending and an external change removes the target port's node
- **THEN** the choice is cancelled, the signal is aborted, and nothing is committed

#### Scenario: Dispose while choosing
- **WHEN** the view is disposed while a choice is pending
- **THEN** the signal is aborted, nothing is committed, and no listener or timer remains

#### Scenario: Revalidated at commit
- **WHEN** a choice is pending, another edit fills the chosen target's last free slot, and the host then picks that option
- **THEN** the connect command is rejected with the exhausted-capacity reason and no connection is created

### Requirement: Release without a chooser
Without a chooser the view SHALL never pick among policy alternatives. Releasing on a target that requires a choice SHALL commit nothing, and the target SHALL show a choice-required cue that is not color alone. A target the policy accepts directly SHALL be connected as before.

#### Scenario: No chooser and a policy choice
- **WHEN** no chooser is installed and the user releases on a port whose policy returns alternatives
- **THEN** nothing is committed, and before release the target showed a choice-required cue that is not color alone

#### Scenario: No chooser and a direct accept
- **WHEN** no chooser is installed and the user releases on a port the policy accepts directly
- **THEN** one connect command is submitted for that port pair, as before

#### Scenario: Choice required not color-only
- **WHEN** a connection target requires a choice during a gesture
- **THEN** the target shows a glyph distinct from the compatible, incompatible and pending cues
