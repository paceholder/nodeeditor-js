# composite-signatures Specification

## Purpose

Defines composite ports: one visible socket carrying several independently typed members,
connected and edited as one atomic assembly. The library knows member keys, schema references,
roles, and mapping rules but never interprets their application meaning.

## Requirements

### Requirement: SIG-00 Optional composite signatures
A port MAY have no composite signature, a single member, only value roles, or several members. The library SHALL NOT require every port to contain a mandatory member category. Required structural members, provided values, and required values SHALL remain distinct roles.

#### Scenario: Plain port
- **WHEN** a port declares only a type key and no signature
- **THEN** it connects through the ordinary connection policy with no member mapping

#### Scenario: Distinct roles
- **WHEN** a socket declares mandatory `fluid` and `heat` members and an offered `label` value
- **THEN** the signature reports two required structural members and one provided value

### Requirement: SIG-01 Stable signature description
Signatures SHALL be described by stable schema/version identifiers and member keys, independent of painter, label, port order, and application payload storage.

#### Scenario: Relabel member
- **WHEN** a member's display label changes
- **THEN** its key, schema reference, and existing bindings are unchanged

### Requirement: SIG-02 Opaque and mapped members
Signatures SHALL support both opaque typed members (indivisible application-defined tuples) and independently mapped members. The default policy SHALL NOT partially bind an opaque tuple.

#### Scenario: Partial tuple rejected
- **WHEN** a plan binds only part of an opaque tuple member
- **THEN** the default policy rejects it with a member-specific reason

### Requirement: SIG-03 Mandatory members fully mapped
Every declared mandatory member on both ends SHALL receive a permitted mapping. For full-match profiles, member count and pairwise compatibility SHALL match exactly.

#### Scenario: Missing mandatory member
- **WHEN** a peer socket lacks a member matching the source's mandatory `heat` member
- **THEN** the plan is rejected naming the `heat` member

#### Scenario: Labels do not imply equality
- **WHEN** two members have the same display label but different keys and no declared mapping
- **THEN** they are not matched

### Requirement: SIG-04 Required values resolve to one provider
Every required value on either side SHALL resolve to exactly one compatible provider. Unused offered values SHALL be legal. Two providers for one required value SHALL NOT be merged silently, and a missing required value SHALL NOT acquire a default.

#### Scenario: Unused offer
- **WHEN** a source offers a `label` value and the peer does not require it
- **THEN** the plan is accepted and reports `label` as an unbound offer

#### Scenario: Two providers
- **WHEN** a required value could be supplied by two different offers
- **THEN** the outcome is choice-required, not an automatic pick

### Requirement: SIG-05 Composite plan preview
Before committing a composite connection, the library SHALL show member mappings, missing requirements, unbound optional offers, and auxiliary actions. Ambiguous mappings SHALL require a choice rather than array-order selection.

#### Scenario: Preview mapping
- **WHEN** a composite connection is dragged over a compatible socket
- **THEN** the preview lists each member mapping and each unbound offer before release

### Requirement: SIG-06 Atomic assemblies
Creating, deleting, reconnecting, copying, and undoing an assembly SHALL be atomic. Editing an individual member binding SHALL require an explicit unpack or member-edit action permitted by the host.

#### Scenario: One undo removes assembly
- **WHEN** an assembly of three member bindings is created and then undone once
- **THEN** all three bindings are removed together

#### Scenario: Member edit without permission
- **WHEN** a user tries to detach one member of an assembly and the host does not permit unpacking
- **THEN** the edit is rejected and the assembly is unchanged

### Requirement: SIG-07 Collapsed and expanded presentation
An assembly SHALL be presentable as one collapsed cable or as expanded member lanes without changing its logical bindings. Hidden members SHALL remain discoverable and individually inspectable.

#### Scenario: Expand lanes
- **WHEN** a collapsed cable is expanded into member lanes and collapsed again
- **THEN** the patch history contains no binding changes

### Requirement: SIG-08 Signature separate from compatibility policy
Signature description SHALL be separate from compatibility policy. Hosts SHALL be able to add shape, format, version, or other checks without changing core geometry or adding node subclasses.

#### Scenario: Host adds version check
- **WHEN** a host policy rejects members whose schema versions differ
- **THEN** that rule takes effect without changes to signature declarations or rendering
