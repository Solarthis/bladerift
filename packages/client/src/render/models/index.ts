/** Every hero's model, by hero id (packages/shared/src/heroes.ts order). */
import type { HeroModel } from './kit';
import m00 from './h00-leon';
import m01 from './h01-kharon';
import m02 from './h02-aurelion';
import m03 from './h03-nyx';
import m04 from './h04-verdan';
import m05 from './h05-lumi';
import m06 from './h06-quill';
import m07 from './h07-hollowmask';
import m08 from './h08-sable';
import m09 from './h09-gorvax';
import m10 from './h10-gray';
import m11 from './h11-ignis';
import m12 from './h12-thornmaw';
import m13 from './h13-aegis';

export const MODELS: HeroModel[] = [m00, m01, m02, m03, m04, m05, m06, m07, m08, m09, m10, m11, m12, m13];
export const modelOf = (hero: number): HeroModel => MODELS[hero] ?? MODELS[0];

// (re-exported so an offline bundle of the models renders with the same rig the models registered their weapons on)
// @ts-expect-error - plain JS module
export { renderHero } from '../heroRig.js';
