import { SYB5E } from '../config.js';
import { Corruption } from './corruption.js';

/* Casting a Spell:
 * To cast a spell you take an appropriate action and gain tem-
 * porary Corruption. A cantrip causes 1 point of temporary
 * Corruption while a leveled spell causes 1d4 plus the spell’s
 * level points of temporary Corruption.
 *
 * When you cast a favored cantrip you gain no Corruption, and
 * when you cast a leveled favored spell you gain Corruption
 * equal only to the level of the spell.
 */

export class Spellcasting {
	static NAME = 'Spellcasting';

	static register() {
		//this.patch();
		this.hooks();
	}

	static hooks() {
		Hooks.on('dnd5e.getItemContextOptions', Spellcasting._getContextMenuOptions);
		Hooks.on('renderTidy5eCharacterSheetQuadrone', Spellcasting._renderFavoredSpellIcons)
	}

	/* MECHANICS HELPERS */

	/* get max spell level based
	 * on highest class progression
	 * NOTE: this is probably excessive
	 *   but since its a single display value
	 *   we want to show the higest value
	 * @param classData {array<classItemData>}
	 */

	static _getContextMenuOptions(item, options) {
		if (item.type == "spell") {
			var favored = item.system.favored;
			options.push(
				{
					callback: () => {
						item.update({ "system.favored": !!favored ? 0 : 1 });
					},
					group: "common",
					icon: "<i class=\"fas fa-heart fa-fw\"></i>",
					name: !!favored ? "Unfavor" : "Favor"
				}
			);
		}
		return options;

	}

	static _renderFavoredSpellIcons(app, html, data) {
		const actor = app.actor;
		if (!actor) return;

		actor.items.forEach(item => {
			if (item.type !== 'spell') return;
			html.querySelectorAll(`.tidy-table-row-container[data-item-id="${item.id}"]`)
				.forEach(x => {
					if (Corruption.isFavored(item)) {
						x.classList.add('favored-spell');
					} else {
						x.classList.remove('favored-spell');
					}
				});
		});
	}

	static _maxSpellLevelByClass(classData = []) {
		const maxLevel = classData.reduce(
			(acc, cls) => {
				const progression = cls.spellcasting.progression;
				const progressionArray = SYB5E.CONFIG.SPELL_PROGRESSION[progression] ?? false;
				if (progressionArray) {
					const spellLevel = SYB5E.CONFIG.SPELL_PROGRESSION[progression][cls.system.levels] ?? 0;

					return spellLevel > acc.level ? { level: spellLevel, fullCaster: progression == 'full' } : acc;
				}

				/* nothing to accumulate */
				return acc;
			},
			{ level: 0, fullCaster: false }
		);

		const result = {
			level: maxLevel.level,
			label: SYB5E.CONFIG.LEVEL_SHORT[maxLevel.level],
			fullCaster: maxLevel.fullCaster,
		};

		return result;
	}

	/* highest spell level for an NPC:
	 * if a leveled caster, use that level as Full Caster
	 * if not and spellcasting stat is != 'none', use CR as full caster
	 * otherwise, no spellcasting
	 *
	 * @param actor5eData {Object} (i.e. actor.system)
	 */
	static _maxSpellLevelNPC(actor5eData) {
		const casterLevel = actor5eData.details.spellLevel ?? 0;

		/* has caster levels, assume full caster */
		let result = {
			level: 0,
			label: '',
			fullCaster: casterLevel > 0,
		};

		/* modify max spell level if full caster or has a casting stat */
		if (result.fullCaster) {
			/* if we are a full caster, use our caster level */
			result.level = game.syb5e.CONFIG.SPELL_PROGRESSION.full[casterLevel];
		}

		result.label = game.syb5e.CONFIG.LEVEL_SHORT[result.level];

		return result;
	}

	static spellProgression(actor5e) {
		const result =
			actor5e.type == 'character' ? Spellcasting._maxSpellLevelByClass(Object.values(actor5e.classes)) : Spellcasting._maxSpellLevelNPC(actor5e.system);

		return result;
	}

	static _modifyDerivedProgression(actor5e) {
		const progression = Spellcasting.spellProgression(actor5e);

		/* insert our maximum spell level into the spell object */
		actor5e.system.spells.maxLevel = progression.level;

		/* ensure that all spell levels <= maxLevel have a non-zero max */
		const levels = Array.from({ length: progression.level }, (_, index) => `spell${index + 1}`);

		for (const slot of levels) {
			actor5e.system.spells[slot].max = Math.max(actor5e.system.spells[slot].max, 1);
		}
	}
}
