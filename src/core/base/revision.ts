/**
 * A revision counts the changes shown by a model's read model: 0 for a fresh model, one
 * more for every committed change or whole-document replacement. The model, its reader,
 * the graph state, accepted outcomes and events all use this one integer, so two
 * revisions compare with `===`. A host's own revision token (a server revision, say) is
 * a separate value and never has to fit here.
 */
export type Revision = number;
