# react-integration Specification

## Purpose

Defines the React entry point: a provider, a mounting component, and hooks that let React
application shells (palettes, inspectors, toolbars) work with the editor, plus the later
capability of React content inside nodes. React is never required by core or the plain view.

## Requirements

### Requirement: Provider, mount component, and hooks
The react entry point SHALL provide a mounting component, a provider, and hooks for instance access, selection, viewport, command availability, and entity-level subscriptions, so inspectors and palettes can be built as ordinary React components.

#### Scenario: Inspector follows selection
- **WHEN** an inspector component uses the selection hook and the user selects a node
- **THEN** the inspector re-renders with that node's ID

#### Scenario: Command availability hook
- **WHEN** a toolbar button uses the command availability hook for delete and the selection becomes empty
- **THEN** the hook reports delete as unavailable with its reason

### Requirement: React is a peer dependency
React and ReactDOM SHALL be peer dependencies. Neither the core entry point nor the non-React view entry point SHALL import React.

#### Scenario: Plain view without React installed
- **WHEN** a project without React installed imports the core and view entry points
- **THEN** both import and mount successfully

### Requirement: React content inside nodes
The view SHALL support React custom-node content with normal context, event, form, and portal behavior, with content size changes updating geometry through a bounded measurement path. This SHALL be delivered after the symbol renderer meets its performance budgets; earlier slices reserve the DOM overlay slot only.

#### Scenario: Form inside a node
- **WHEN** a node type registers React body content containing a text input and the user types in it
- **THEN** the input receives the text with normal React context available and no graph shortcut fires

#### Scenario: Content resize
- **WHEN** React node content grows taller
- **THEN** the node geometry and incident routes update after measurement without a per-frame measurement loop

### Requirement: Subscription granularity
The React integration SHALL NOT commit React state updates for every raw pointer sample and SHALL NOT re-render every subscribed component on an unrelated selection or status change. Subscription granularity SHALL be documented.

#### Scenario: Drag does not re-render inspector
- **WHEN** a node is dragged and an inspector is subscribed to a different node
- **THEN** the inspector does not re-render during the drag

#### Scenario: Entity-level subscription
- **WHEN** one node's status changes in a graph with 1k nodes
- **THEN** only components subscribed to that node re-render

### Requirement: Strict Mode and remount safety
The React integration SHALL survive development Strict Mode setup, cleanup, and re-setup, prop updates, renderer remounts, and repeated disposal without duplicate listeners, duplicate commands, or stuck gestures.

#### Scenario: Strict Mode double effect
- **WHEN** the editor component mounts under React Strict Mode
- **THEN** exactly one set of input listeners is active after mount

### Requirement: Server rendering safety
The react and view entry points SHALL be importable during server rendering without accessing browser globals. Server output MAY be an inert container; interactivity SHALL begin on mount in the browser.

#### Scenario: Import in Node
- **WHEN** the react entry point is imported and rendered to a string in Node
- **THEN** no browser global is accessed and an inert container is produced

### Requirement: Focus stability
Focused React content SHALL stay mounted and focused across unrelated graph refreshes. If the edited entity disappears, its editor SHALL close and announce the reason instead of committing to a stale ID.

#### Scenario: Unrelated update keeps focus
- **WHEN** a user is typing in a node editor and another node is moved by an external change
- **THEN** the editor keeps focus and its unsaved text

#### Scenario: Edited entity removed
- **WHEN** the node being edited is deleted by an external change
- **THEN** the editor closes, reports that the node was removed, and submits nothing
