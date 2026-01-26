import { COMMON } from './common.js';
import { logger } from './logger.js';
import { LibWrapperShim } from './libraries/LibWrapper/shim.js'
import { SYB5E } from './config.js'
import { Spellcasting } from './modules/spellcasting.js'
import { Resting } from './modules/resting.js'
import { ActorSyb5e } from './modules/actor.js'
import { ItemSyb5e } from './modules/item.js'
import { Tidy5eIntegration } from './modules/tidy5e-integration.js';
import { Corruption } from './modules/corruption.js';

const SUB_MODULES = [
  LibWrapperShim,
  COMMON,
  SYB5E,
  logger,
  ActorSyb5e,
  ItemSyb5e,
  Corruption,
  Spellcasting,
  Resting,
  Tidy5eIntegration
]

Hooks.on('init', () => {
  // register all submodules
  SUB_MODULES.forEach((cl) => {
    logger.info(COMMON.localize('SYB5E.Init.SubModule', { name: cl.NAME }));
    cl.register();
  });
});
