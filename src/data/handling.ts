import { parseHandling } from '../engine/handling/parse';
import handlingJson from './handling.json';

/** The hand skills, validated once; procedures name them by id. */
export const handlingCatalogue = parseHandling(handlingJson);

export const handlingIds: readonly string[] = Object.keys(handlingCatalogue.sequences);
