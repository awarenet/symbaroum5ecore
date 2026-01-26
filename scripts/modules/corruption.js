import { SYB5E } from '../config.js';

export class Corruption {
    static NAME = 'Corruption';

    /* Generate the raw expression string based on level and favor */
    static _generateCorruptionExpression(castLevel, favored, prepMode) {
        /* cantrips have a level of "0" (string) for some reason */
        var level = parseInt(castLevel);

        if (isNaN(level)) {
            return false;
        }

        switch (prepMode) {
            case 'atwill':
            case 'innate':
                return '0';
        }

        if (favored) {
            /* favored cantrips cost 0, favored spells cost level */
            return level == 0 ? '0' : `${level}`;
        }

        /* cantrips cost 1, leveled spells are 1d4+level */
        return level == 0 ? '1' : `1d4 + ${level}`;
    }

    /* Determine if a cast generates corruption */
    static generatesCorruption(castLevel, favored, prepMode) {
        var level = parseInt(castLevel);
        switch (prepMode) {
            case 'atwill':
            case 'innate':
                return false;
        }
        return !(level == 0 && favored);
    }

    static register() {
        this.hooks();
    }

    static hooks() {
        Hooks.on('dnd5e.postUseActivity', Corruption.onPostUseActivity);
    }

    /* Hook handler to apply corruption when "Corruption" target is consumed */
    static async onPostUseActivity(activity, event, result) {
        // result = { config: ..., message: ..., updates: ..., rolls: ...} (based on previous traces)
        // If system generated a roll (e.g. for consumption), it should be in result.rolls

        if (result && result.updates && result.updates.rolls && result.updates.rolls.length > 0) {
            const message = result.message;
            if (!message) return;

            const existingRolls = message.rolls;
            // Filter for rolls not already in the message (should catch the new consumption roll)
            const newRolls = result.updates.rolls.filter(r => !existingRolls.includes(r));

            if (newRolls.length > 0) {
                newRolls.forEach(r => {
                    if (!r.options.flavor) r.options.flavor = game.i18n.localize("SYB5E.Corruption.Label");
                });

                await message.update({ rolls: [...existingRolls, ...newRolls] });
            }
        }
    }
    static isFavored(itemData) {
        // If it's a real item instance, check the system data first
        if (itemData.system?.favored !== undefined) return itemData.system.favored;

        // Fallback or raw data check via path
        return foundry.utils.getProperty(itemData, game.syb5e.CONFIG.PATHS.favored) ?? false;
    }

    /* Get the full corruption expression including overrides */
    static corruptionExpression(itemData, level = itemData.system.level) {
        /* get default expression */
        let expression = itemData.type === 'spell' ? Corruption._generateCorruptionExpression(level, Corruption.isFavored(itemData)) : '0';
        let type = 'temp';

        /* has custom corruption? */
        const custom =
            foundry.utils.getProperty(itemData, game.syb5e.CONFIG.PATHS.corruptionOverride.root) ??
            foundry.utils.duplicate(game.syb5e.CONFIG.DEFAULT_ITEM.corruptionOverride);

        /* modify the expression (always round up) minimum 1 unless custom */
        if (custom.mode !== game.syb5e.CONFIG.DEFAULT_ITEM.corruptionOverride.mode) {
            //has override
            switch (custom.mode) {
                case CONST.ACTIVE_EFFECT_MODES.ADD:
                    expression = `${expression} + (${custom.value})`;
                    break;
                case CONST.ACTIVE_EFFECT_MODES.MULTIPLY:
                    expression = `(${expression}) * (${custom.value})`;
                    break;
                case CONST.ACTIVE_EFFECT_MODES.OVERRIDE:
                    expression = custom.value;
                    break;
            }
        }

        /* modify the target */
        if (custom.type !== game.syb5e.CONFIG.DEFAULT_ITEM.corruptionOverride.type) {
            type = custom.type;
        }

        /* after all modifications have been done, return the final expression */
        return { expression, type };
    }
}
