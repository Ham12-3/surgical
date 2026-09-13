/**
 * What the open appendectomy's wound looks like after a set of completed
 * steps: how far each layer of the abdominal wall is open, where the caecum
 * is, and what has been done to the mesoappendix and the appendix.
 *
 * Plain data, so the scene draws it and a test checks it without a browser.
 * The step ids are the ones in openAppendectomy.json; the test checks that
 * every id used here is there.
 */

export const WALL_LAYERS = ['skin', 'fat', 'externalOblique', 'internalOblique', 'peritoneum'] as const;
export type WallLayer = (typeof WALL_LAYERS)[number];

/** How open a layer is once cut but not yet held apart; 0 is intact or closed again, 1 held open. */
export const SLIT = 0.35;

export interface WoundStage {
  readonly layers: Readonly<Record<WallLayer, number>>;
  readonly caecumDelivered: boolean;
  readonly mesoappendix: 'intact' | 'clamped' | 'divided' | 'tied';
  readonly appendixBase: 'intact' | 'crushed' | 'tied' | 'removed';
}

export const STAGE_STEP_IDS = [
  'skin_incision',
  'deepen_through_fat',
  'open_external_oblique',
  'split_internal_oblique',
  'open_peritoneum',
  'deliver_caecum',
  'clamp_mesoappendix',
  'divide_mesoappendix',
  'tie_mesoappendix',
  'crush_appendix_base',
  'tie_appendix_base',
  'remove_appendix',
  'return_caecum',
  'close_peritoneum',
  'close_muscles',
  'close_external_oblique',
  'close_skin',
] as const;
type StageStep = (typeof STAGE_STEP_IDS)[number];

/**
 * The wound opened down to one layer, for the anatomy explorer: every layer
 * above `depth` held open, so the layer at `depth` is the one on show. At the
 * deepest layer the caecum is lifted into the wound, where it is easiest to see.
 */
export function layerStage(depth: number): WoundStage {
  const open = (index: number): number => (index < depth ? 1 : 0);
  return {
    layers: { skin: open(0), fat: open(1), externalOblique: open(2), internalOblique: open(3), peritoneum: open(4) },
    caecumDelivered: depth >= WALL_LAYERS.length,
    mesoappendix: 'intact',
    appendixBase: 'intact',
  };
}

export function woundStage(done: ReadonlySet<string>): WoundStage {
  const has = (id: StageStep): boolean => done.has(id);
  // The retractor goes in when the muscles are split, and holds every layer
  // above them wide from then until each is closed.
  const held = has('split_internal_oblique');
  const superficial = (cut: StageStep, closed: StageStep): number => {
    if (has(closed) || !has(cut)) return 0;
    return held ? 1 : SLIT;
  };

  return {
    layers: {
      skin: superficial('skin_incision', 'close_skin'),
      fat: superficial('deepen_through_fat', 'close_skin'),
      externalOblique: superficial('open_external_oblique', 'close_external_oblique'),
      internalOblique: held && !has('close_muscles') ? 1 : 0,
      peritoneum: has('open_peritoneum') && !has('close_peritoneum') ? 1 : 0,
    },
    caecumDelivered: has('deliver_caecum') && !has('return_caecum'),
    mesoappendix: has('tie_mesoappendix')
      ? 'tied'
      : has('divide_mesoappendix')
        ? 'divided'
        : has('clamp_mesoappendix')
          ? 'clamped'
          : 'intact',
    appendixBase: has('remove_appendix')
      ? 'removed'
      : has('tie_appendix_base')
        ? 'tied'
        : has('crush_appendix_base')
          ? 'crushed'
          : 'intact',
  };
}
