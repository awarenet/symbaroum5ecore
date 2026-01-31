/******************* SHORT REST ******************************
 * Short rests require one hour of light effort, no more than
 * sitting and talking, tending to wounds and the like. You gain
 * the following benefits when you complete a short rest:
 * • You can spend one or more Hit Dice to recover hit points,
 * up to the character’s maximum number of Hit Dice, which
 * is equal to your level. For each Hit Die spent in this way, you
 * roll the die and add your Constitution modifier to it. You
 * regain hit points equal to the total. You can decide to spend
 * an additional Hit Die after each roll. You regain spent Hit
 * Dice upon finishing an extended rest, as explained below.
 * • You reduce your temporary Corruption by your profi-
 * ciency bonus.
 * • You can spend a Hit Die in order to reduce your tempo-
 * rary Corruption by your proficiency bonus again. You can
 * continue to do this as long as you have Hit Dice to spend
 * and temporary Corruption to reduce.
 *************************************************************/

/****************** LONG REST *******************************
 * A long rest requires around eight hours, six of which must
 * be spent sleeping and the other two in light activity, such
 * as being on watch, reading, or conversing with others. You
 * gain the following benefits when you complete a long rest:
 * • You recover hit points equal to the maximum value of
 * your Hit Die (e.g. 8 for 1d8) plus your Constitution mod-
 * ifier. This does not count as using a Hit Die.
 * • You reduce your temporary Corruption by twice your
 * proficiency bonus.
 * • You can spend one or more Hit Dice to recover hit points,
 * up to the character’s maximum number of Hit Dice,
 * which is equal to your level. For each Hit Die spent in this
 * way, you roll the die and add your Constitution modifier
 * to it. You regain hit points equal to the total. You can
 * decide to spend an additional Hit Die after each roll. You
 * regain spent Hit Dice upon finishing an extended rest, as
 * explained below.
 * • You can spend a Hit Die in order to reduce your tempo-
 * rary Corruption by your proficiency bonus again. You can
 * continue to do this as long as you have Hit Dice to spend
 * and temporary Corruption to reduce.
 ***********************************************************/

/**************** EXTENDED REST **************************** 
 * An extended rest requires at least 24 hours in a safe place
 * where you can sleep, relax and tend to your wounds with-
 * out threat of interruption. Extended rests often mark the
 * end of an adventure, or at least a significant break in the
 * action. You gain the following benefits at the end of an
 * extended rest:
 * • You regain all of your hit points.
 * • You recover all of your Hit Dice.
 * • Your temporary Corruption becomes 0.
 ***********************************************************/

export class Resting {

  static register() {
  }

  /* -------------------------------------------- */

  static _getCorruptionRecovery(actor, type) {
    const currCorr = actor.corruption.temp;
    const proficiency = actor.system.attributes.prof;

    const restTypes = game.dnd5e.config.restTypes;

    const recovery = {
      [restTypes.short]: proficiency,
      [restTypes.long]: 2 * proficiency,
      [restTypes.ext]: currCorr
    }[type];

    return Math.min(recovery, currCorr);
  }


  /* -------------------------------------------- */

  static async _sybRest(actor, type, chat = true, newDay = false, dHd = 0, dHp = 0, dco = 0) {

    const result = {
      type: type,
      deleteItems: [],
      deltas: {
        hitPoints: 0,
        hitDice: 0,
        corruption: 0
      },
      newDay: newDay,
      request: true,
      rolls: [],
      updateData: {},
      updateItems: []
    };

    const restTypes = game.dnd5e.config.restTypes;
    let typeKey = null;
    switch (type) {
      case restTypes.short: typeKey = "short"; break;
      case restTypes.long: typeKey = "long"; break;
      case restTypes.ext: typeKey = "ext"; break;
    }
    Resting._getRestHitPointUpdate(actor, type, result);
    type === restTypes.ext && actor._getRestHitDiceRecovery({ maxHitDice: actor.system.details.level, type: typeKey }, result);
    const recovery = Resting._getCorruptionRecovery(actor, type);
    Resting._corruptionHealUpdate(actor.corruption, recovery, result);
    actor._getRestResourceRecovery({ recoverShortRestResources: type === restTypes.short, recoverLongRestResources: type !== restTypes.short }, result);
    await actor._getRestItemUsesRecovery({ type: typeKey, recoverDailyUses: newDay }, result);

    await actor.update(result.actorUpdates);
    await actor.updateEmbeddedDocuments("Item", result.updateItems);

    if (chat) await Resting._displayRestResultMessage(result, actor);

    Hooks.callAll("dnd5e.restCompleted", actor, result, {});

    return result;
  }

  /* -------------------------------------------- */

  static async _displayRestResultMessage(result, actor) {
    /***********************************
     * In large part based on 
     * Actor5e#_displayRestResultMessage
     **********************************/
    const { hitDice, hitPoints, corruption } = result.deltas;
    const restTypes = game.dnd5e.config.restTypes;

    // Define the message key and flavor based on the rest type
    let messageKey;
    let restFlavor;

    switch (result.type) {
      case restTypes.short:
        restFlavor = "SYB5E.Rest.Flavor.Short";
        messageKey = "SYB5E.Rest.Results.Short";
        break;
      case restTypes.long:
        restFlavor = result.newDay ? "SYB5E.Rest.Flavor.LongOvernight" : "SYB5E.Rest.Flavor.Long";
        messageKey = "SYB5E.Rest.Results.Long";
        break;
      case restTypes.ext:
        restFlavor = result.newDay ? "SYB5E.Rest.Flavor.ExtendedRestOvernight" : "SYB5E.Rest.Flavor.ExtendedRestNormal";
        messageKey = "SYB5E.Rest.Results.ExtendedShort";
        break;
    }

    // If any resources were restored, use the "Full" message
    if (hitDice || hitPoints || corruption) {
      let length;
      switch (result.type) {
        case restTypes.short: length = "Short"; break;
        case restTypes.long: length = "Long"; break;
        case restTypes.ext: length = "Extended"; break;
      }
      messageKey = `SYB5E.Rest.Results.${length}Full`;
    }

    // Create a chat message
    let chatData = {
      user: game.user.id,
      speaker: { actor: actor, alias: actor.name },
      flavor: game.i18n.localize(restFlavor),
      content: game.i18n.format(messageKey, {
        name: actor.name,
        dhd: hitDice,
        dhp: hitPoints,
        dco: Math.abs(corruption)
      })
    };

    ChatMessage.applyRollMode(chatData, game.settings.get("core", "rollMode"));
    return ChatMessage.create(chatData);
  }

  /* -------------------------------------------- */

  static _restHpGain(actor, type) {

    const restTypes = game.dnd5e.config.restTypes;
    const actor5eData = actor.system;

    switch (type) {
      case restTypes.short:
        /* no auto gain on short */
        return 0;

      case restTypes.long:
        /* Now find largest Hit Die (tries to accomodate for multiclassing in SYB
         * despite the fact that none should exist)
         */
        const hitDieSize = Object.entries(actor.classes).reduce((acc, [key, cls]) => {
          const dieSize = parseInt(cls.system.hd.denomination.slice(1))
          return dieSize > acc ? dieSize : acc;
        }, 0);

        const hitPointsRecovered = hitDieSize + actor5eData.abilities.con.mod;

        return hitPointsRecovered;

      case restTypes.ext:
        /* Heal to full on extended */
        return actor5eData.attributes.hp.max;

    }

  }

  /* -------------------------------------------- */

  static _getRestHitPointUpdate(actor, type, result) {

    const rawHpGain = Resting._restHpGain(actor, type);
    const clampedFinalHp = Math.min(rawHpGain + actor.system.attributes.hp.value, actor.system.attributes.hp.max);

    const hitPointUpdates = {
      "system.attributes.hp.value": clampedFinalHp
    }

    result.deltas.hitPoints = clampedFinalHp - actor.system.attributes.hp.value;
    result.actorUpdates = hitPointUpdates;
  }

  /* -------------------------------------------- */

  static _corruptionHealUpdate(currentCorruption, amount, result) {
    const newTemp = Math.max(currentCorruption.temp - amount, 0)
    result.deltas.corruption = newTemp - currentCorruption.temp;
    result.actorUpdates[game.syb5e.CONFIG.PATHS.corruption.temp] = newTemp;
  }

  /* -------------------------------------------- */

  static async corruptionHeal(actor, amount) {
    var result = { actorUpdates: {} };
    Resting._corruptionHealUpdate(actor.corruption, amount, result);
    await actor.update(result);
  }

  /* -------------------------------------------- */

  static async expendHitDie(actor, denomination) {
    var cls = null;
    if (!denomination) {
      cls = actor.system.attributes.hd.classes.find(c => c.system.hd.value);
      if (!cls) return false;
      denomination = cls.system.hd.denomination;
    }

    // Otherwise, locate a class (if any) which has an available hit die of the requested denomination
    else cls = actor.system.attributes.hd.classes.find(i => {
      return (i.system.hd.denomination === denomination) && i.system.hd.value;
    });

    // If no class is available, display an error notification
    if (!cls) {
      ui.notifications.error(game.i18n.format("DND5E.HitDiceWarn", { name: actor.name, formula: denomination }));
      return false;
    }
    // Adjust actor data
    await cls.update({
      "system.hd.spent": cls.system.hd.spent + 1
    });

    return true;
  }
}

