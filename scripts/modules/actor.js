import { COMMON } from '../common.js';
import { logger } from '../logger.js';
import { Spellcasting } from './spellcasting.js';
import { SybRestDialog } from './apps/syb-rest-dialog.js';
import { Resting } from './resting.js';

export class ActorSyb5e {
	static NAME = 'ActorSyb5e';

	static register() {
		this.patch();
		this.hooks();
	}

	static patch() {
		const target = dnd5e.documents.Actor5e.prototype;
		const targetPath = 'dnd5e.documents.Actor5e.prototype';

		const patches = {
			getRollData: {
				value: ActorSyb5e.getRollData,
				mode: 'WRAPPER',
			},
			longRest: {
				value: ActorSyb5e.longRest,
			},
			shortRest: {
				value: ActorSyb5e.shortRest,
			},
			convertSybCurrency: {
				value: ActorSyb5e.convertSybCurrency,
				enumerable: true,
			},
			isSybActor: {
				value: ActorSyb5e.isSybActor,
				enumerable: true,
			},
			extendedRest: {
				value: ActorSyb5e.extendedRest,
				enumerable: true,
			},
			corruption: {
				get: ActorSyb5e.getCorruption,
				enumerable: true,
			},
			shadow: {
				get: ActorSyb5e.getShadow,
				enumerable: true,
			},
			manner: {
				get: ActorSyb5e.getManner,
				enumerable: true,
			},
		};

		COMMON.patch(target, targetPath, patches);
		this.patchDataModel();
	}

	static patchDataModel() {
		const CharacterData = dnd5e.dataModels?.actor?.CharacterData;
		if (!CharacterData) return;

		const original = CharacterData.defineSchema;
		CharacterData.defineSchema = function () {
			const schema = original.call(this);
			schema.corruption = new foundry.data.fields.SchemaField({
				value: new foundry.data.fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
				max: new foundry.data.fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
				temp: new foundry.data.fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
				permanent: new foundry.data.fields.NumberField({ required: true, nullable: false, integer: true, initial: 0, min: 0 }),
				ability: new foundry.data.fields.StringField({ required: true, nullable: false, initial: "cha" }),
				bonus: new foundry.data.fields.NumberField({ required: true, nullable: false, integer: true, initial: 0 })
			});
			return schema;
		}
	}

	/* -------------------------------------------- */

	static hooks() {
		Hooks.on('preUpdateActor', ActorSyb5e._preUpdateActor);
	}

	/* -------------------------------------------- */

	/* @override */
	static getRollData(wrapped, ...args) {
		let data = wrapped(...args);

		if (this.isSybActor()) {
			data.attributes.corruption = this.corruption;
			data.details.shadow = this.shadow;
			data.details.manner = this.manner;
		}

		return data;
	}

	/* @override */
	static prepareDerivedData(wrapped, ...args) {
		/* perform normal steps */
		wrapped(...args);

		if (this.isSybActor()) {
			logger.debug('core derived data:', this);

			/* check for half caster and "fix" for syb5e half-caster progression */
			Spellcasting._modifyDerivedProgression(this);
		}
	}

	/* -------------------------------------------- */

	/* @override */
	static async longRest(wrapped, { dialog = true, chat = true, newDay = true } = {}, ...args) {
		const initHd = this.system.attributes.hd;
		const initHp = this.system.attributes.hp.value;
		const initCorr = this.corruption.temp;

		if (!this.isSybActor()) {
			return wrapped({ dialog, chat, newDay }, ...args);
		}

		// Maybe present a confirmation dialog
		if (dialog) {
			try {
				newDay = await SybRestDialog.restDialog({ actor: this, type: game.dnd5e.config.restTypes.long });
			} catch (err) {
				if (err == 'cancelled') logger.debug('Rest dialog cancelled.');
				return false;
			}
		}

		//do long rest
		await Resting._sybRest(
			this,
			game.dnd5e.config.restTypes.long,
			chat,
			newDay,
			this.system.attributes.hd - initHd,
			this.system.attributes.hp.value - initHp,
			this.corruption.temp - initCorr
		);
	}

	/* -------------------------------------------- */

	static async shortRest(wrapped, { dialog = true, chat = true, autoHD = false, autoHDThreshold = 3 } = {}, ...args) {
		const initHd = this.system.attributes.hd;
		const initHp = this.system.attributes.hp.value;
		const initCorr = this.corruption.temp;

		if (!this.isSybActor()) {
			return wrapped({ dialog, chat, autoHD, autoHDThreshold }, ...args);
		}

		// Maybe present a confirmation dialog
		if (dialog) {
			try {
				await SybRestDialog.restDialog({ actor: this, type: game.dnd5e.config.restTypes.short });
			} catch (err) {
				if (err == 'cancelled') logger.debug('Rest dialog cancelled.');
				return false;
			}
		}

		//do extended rest
		await Resting._sybRest(
			this,
			game.dnd5e.config.restTypes.short,
			chat,
			false,
			this.system.attributes.hd - initHd,
			this.system.attributes.hp.value - initHp,
			this.corruption.temp - initCorr
		);
	}

	/* -------------------------------------------- */

	static getCorruption() {
		/* Try to get from system data (Schema injection) */
		if (this.system.corruption) {
			const corruption = this.system.corruption;

			// Ensure we have defaults if somehow missing (though schema handles this)
			if (corruption.temp === undefined) corruption.temp = 0;
			if (corruption.permanent === undefined) corruption.permanent = 0;

			// Calculate derived values
			corruption.value = corruption.temp + corruption.permanent;
			corruption.max = ActorSyb5e._calcMaxCorruption(this);

			return corruption;
		}
		return null;
	}

	/* -------------------------------------------- */

	static getShadow() {
		const shadow = this.getFlag(COMMON.DATA.name, 'shadow') ?? game.syb5e.CONFIG.DEFAULT_FLAGS.shadow;
		return shadow;
	}

	static getManner() {
		const manner = this.getFlag(COMMON.DATA.name, 'manner') ?? game.syb5e.CONFIG.DEFAULT_FLAGS.manner;
		return manner;
	}

	/* -------------------------------------------- */

	/**
	 * Convert all carried currency to the highest possible denomination to reduce the number of raw coins being
	 * carried by an Actor.
	 * @returns {Promise<Actor5e>}
	 */
	static convertSybCurrency() {
		/* dont convert syb currency if not an syb actor */
		if (!this.isSybActor()) {
			logger.error(COMMON.localize('SYB5E.error.notSybActor'));
			return;
		}

		const conversion = Object.entries(game.syb5e.CONFIG.CURRENCY_CONVERSION);
		const current = foundry.utils.duplicate(this.system.currency);

		for (const [denom, data] of conversion) {
			/* get full coin conversion to next step */
			const denomUp = Math.floor(current[denom] / data.each);

			/* subtract converted coins and add converted coins */
			current[denom] -= denomUp * data.each;
			current[data.into] += denomUp;
		}

		return this.update({ 'data.currency': current });
	}

	/* -------------------------------------------- */

	/* Corruption Threshold = (prof * 2) + charisma mod; minimum 2
	 * Source: PGpg37
	 * or if full caster (prof + spellcastingMod) * 2
	 */
	static _calcMaxCorruption(actor) {
		const CONFIG = game.syb5e.CONFIG;
		const paths = CONFIG.PATHS;
		let corruptionAbility = foundry.utils.getProperty(actor, paths.corruption.ability);
		/* handle special cases */
		switch (corruptionAbility) {
			case 'custom':
				return foundry.utils.getProperty(actor, paths.corruption.max);
			case 'thorough':
				return 0;
		}

		/* otherwise determine corruption calc -- full casters get a special one */

		const corrMod = actor.system.abilities[corruptionAbility].mod ?? 0;
		const prof = actor.system.attributes.prof ?? 0;
		const currentBonus = dnd5e.utils.simplifyBonus(
			(foundry.utils.getProperty(actor, paths.corruption.bonus) ?? 0)
		);
		const { fullCaster } =
			actor.type === 'character' ? Spellcasting._maxSpellLevelByClass(Object.values(actor.classes)) : Spellcasting._maxSpellLevelNPC(actor.system);

		/* we can only apply a bonus to an automatically computed maximum (i.e. derived from attributes) */
		const rawMax = fullCaster ? (prof + corrMod) * 2 : Math.max(corrMod + prof * 2, 2);

		return rawMax + currentBonus;
	}

	/* -------------------------------------------- */

	static isSybActor() {
		var retval = this.getFlag(COMMON.DATA.name, 'syb5eActor') ?? false;
		return retval;
	}

	/* -------------------------------------------- */

	static async extendedRest({ dialog = true, chat = true, newDay = true } = {}) {
		if (!this.isSybActor()) {
			return false;
		}

		// Maybe present a confirmation dialog
		if (dialog) {
			try {
				newDay = await SybRestDialog.restDialog({ actor: this, type: game.dnd5e.config.restTypes.ext });
			} catch (err) {
				if (err == 'cancelled') logger.debug('Rest dialog cancelled.');
				return false;
			}
		}

		//do extended rest
		await Resting._sybRest(this, game.dnd5e.config.restTypes.ext, chat, newDay);
	}

	/* handles the "soulless" trait */
	static _preUpdateActor(actor, update) {
		/* is corruption being modified? */
		const { temp, permanent } = foundry.utils.getProperty(update, game.syb5e.CONFIG.PATHS.corruption.root) ?? { temp: null, permanent: null };

		/* if no corruption update, does not concern us */
		if (temp == null && permanent == null) return;

		/* If the current actor has the 'soulless' trait, mirror this damage to current/max health */
		const { scope, key } = game.syb5e.CONFIG.PATHS.sybSoulless;
		if (actor.getFlag(scope, key)) {
			/* compute the total change in corruption */
			const current = actor.corruption;
			const gainedCorruption = (temp ?? current.temp) - current.temp + (permanent ?? current.permanent) - current.permanent;

			logger.debug('Soulless Initial Values:', actor, update);
			const hpPath = 'system.attributes.hp';

			let {
				value: currentHp,
				tempmax: currentMaxDelta,
				max: currentMax,
			} = foundry.utils.mergeObject(foundry.utils.getProperty(actor, hpPath), foundry.utils.getProperty(update, hpPath) ?? {}, { inplace: false });
			currentMaxDelta = (currentMaxDelta ?? 0) - gainedCorruption;

			/* clamp current HP between max HP and 0 */
			currentHp = Math.max(Math.min(currentHp, currentMax + currentMaxDelta), 0);

			/* add in our hp changes to the update object */
			foundry.utils.setProperty(update, hpPath, { value: currentHp, tempmax: currentMaxDelta });
			logger.debug('Soulless Update:', update);
		}
	}
}
