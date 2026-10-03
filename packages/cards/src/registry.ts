import { scriptKey, textHash, type CardDefinition, type CardScript } from '@sve/rules';
import { amataz, amatazEvolved } from './forestcraft/amataz';
import { ariaFairyPrincess, ariaFairyPrincessEvolved } from './forestcraft/aria-fairy-princess';
import { ariaLady, ariaLadyEvolved } from './forestcraft/aria-lady';
import { cc, ccEvolved } from './forestcraft/cc';
import { cynthia, cynthiaEvolved } from './forestcraft/cynthia';
import { fairyCircle } from './forestcraft/fairy-circle';
import { fairyWhisperer, fairyWhispererEvolved } from './forestcraft/fairy-whisperer';
import { feyboltArcher, feyboltArcherEvolved } from './forestcraft/feybolt-archer';
import { liza } from './forestcraft/liza';
import { naturesGuidance } from './forestcraft/natures-guidance';
import { piercye, piercyeEvolved } from './forestcraft/piercye';
import { pixieOfTheForest } from './forestcraft/pixie-of-the-forest';
import { spinaria, spinariaEvolved } from './forestcraft/spinaria';
import { titania, titaniaEvolved } from './forestcraft/titania';
import { waterFairy } from './forestcraft/water-fairy';
import { carrot, miracleCarrot, victoryCarrot } from './umamusume/carrots';
import { chevalGrand, chevalGrandEvolved } from './umamusume/cheval-grand';
import { daiwaScarlet, daiwaScarletEvolved } from './umamusume/daiwa-scarlet';
import {
  grassWonder,
  mejiroMcQueen,
  niceNature,
  silenceSuzuka,
  specialWeek,
  symboliRudolf,
  tokaiTeio,
} from './umamusume/fillers';
import { goldShip, goldShipEvolved } from './umamusume/gold-ship';
import { hishiMiracle, hishiMiracleEvolved } from './umamusume/hishi-miracle';
import { progenitors } from './umamusume/progenitors';
import { sevenMoreCentimeters } from './umamusume/seven-more-centimeters';
import { trialInitiation } from './umamusume/trial-initiation';
import { vodka, vodkaEvolved } from './umamusume/vodka';

export const ALL_SCRIPTS: readonly CardScript[] = [
  fairyCircle,
  feyboltArcher,
  feyboltArcherEvolved,
  ariaFairyPrincess,
  ariaFairyPrincessEvolved,
  ariaLady,
  ariaLadyEvolved,
  piercye,
  piercyeEvolved,
  titania,
  titaniaEvolved,
  cynthia,
  cynthiaEvolved,
  spinaria,
  spinariaEvolved,
  cc,
  ccEvolved,
  amataz,
  amatazEvolved,
  waterFairy,
  pixieOfTheForest,
  fairyWhisperer,
  fairyWhispererEvolved,
  naturesGuidance,
  liza,
  daiwaScarlet,
  daiwaScarletEvolved,
  vodka,
  vodkaEvolved,
  chevalGrand,
  chevalGrandEvolved,
  hishiMiracle,
  hishiMiracleEvolved,
  trialInitiation,
  sevenMoreCentimeters,
  carrot,
  miracleCarrot,
  victoryCarrot,
  progenitors,
  goldShip,
  goldShipEvolved,
  silenceSuzuka,
  specialWeek,
  tokaiTeio,
  grassWonder,
  niceNature,
  mejiroMcQueen,
  symboliRudolf,
];

const BY_KEY = new Map(
  ALL_SCRIPTS.map((script) => [scriptKey(script.name, script.textHash), script]),
);

/** Returns the pinned script when the name and printed-text hash both match. */
export function scriptFor(def: CardDefinition): CardScript | null {
  return BY_KEY.get(scriptKey(def.name, textHash(def.text))) ?? null;
}
