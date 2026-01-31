const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { Resting } from '../resting.js';

export class SybRestDialog extends HandlebarsApplicationMixin(ApplicationV2) {
	constructor(options = {}) {
		super(options);
		this.actor = options.actor;
		this.type = options.type;
		this._denom = null;

		/* We'll use a local promise resolution for the dialog result */
		this._resolve = options.resolve;
		this._reject = options.reject;
	}

	static DEFAULT_OPTIONS = {
		tag: "form",
		id: "syb-rest-dialog",
		classes: ["dnd5e2", "standard-form"], // using standard-form to mimic dialog styling
		window: {
			title: "Rest", // overridden in initialization
			resizable: true,
			icon: "fas fa-bed"
		},
		position: {
			width: 400,
			height: "auto"
		},
		form: {
			handler: SybRestDialog._onSubmit,
			closeOnSubmit: true
		}
	};

	static PARTS = {
		form: {
			template: `modules/symbaroum5ecore/templates/apps/rest.hbs`
		}
	};

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);

		/* Re-implementing core Short Rest logic loosely since we can't easily mix V1/V2 inheritance */
		context.availableHD = this.actor.system.attributes.hd;
		context.denomination = this._denom;

		const restTypes = game.dnd5e.config.restTypes;
		this.window.title = this.type?.label ?? "Rest";

		context.isExtended = this.type === restTypes.ext;
		context.isShort = this.type === restTypes.short;
		context.promptNewDay = this.type !== restTypes.short;

		/* Preview calculations */
		const actor5eData = this.actor.system;
		const gain = Resting._restHpGain(this.actor, this.type);
		const corruption = this.actor.corruption;
		const corrRecovery = Resting._getCorruptionRecovery(this.actor, this.type);

		context.preview = {
			hp: actor5eData.attributes.hp.value + gain,
			maxHp: actor5eData.attributes.hp.max,
			tempCorr: Math.max(corruption.temp - corrRecovery, 0),
			maxCorr: corruption.max,
		};

		context.preview.totalCorr = context.preview.tempCorr + corruption.permanent;
		context.preview.hp = Math.min(context.preview.hp, context.preview.maxHp);

		/* Replicating dnd5e short rest data structure if needed by template */
		context.canRoll = context.availableHD.value > 0;
		/* 
		   Prepare denomination options for the select.
		*/
		context.denominations = Object.entries(context.availableHD.bySize).map(([size, value]) => {
			return {
				hitDice: size,
				label: size,
				available: value,
				parent: size
			};
		}).filter(d => d.available > 0);

		return context;
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);

		/* Attach listeners using standard DOM since we are in V2 */
		// Roll Hit Die
		this.element.querySelectorAll('#roll-hd').forEach(b => {
			b.addEventListener("click", this._onRollHitDie.bind(this));
		});

		// Reduce Corruption
		this.element.querySelectorAll('#heal-corr').forEach(b => {
			b.addEventListener("click", this._onReduceCorruption.bind(this));
		});


		// Cancel button (using data-action="cancel" which is standard in V2 but we want custom rejection)
		this.element.querySelectorAll('[data-action="cancel"]').forEach(b => {
			b.addEventListener("click", (e) => {
				e.preventDefault();
				this.close();
				this._reject('cancelled');
			});
		});
	}

	/* Re-implementing logic as we cannot reliably bind V1 methods */
	async _onRollHitDie(event) {
		event.preventDefault();
		const hdSelect = this.element.querySelector('select[name="hd"]');
		if (!hdSelect) return;
		const denom = hdSelect.value;
		await this.actor.rollHitDie({ denomination: denom });
		this.render();
	}

	async _onReduceCorruption(event) {
		event.preventDefault();
		const hdSelect = this.element.querySelector('select[name="hd"]');
		if (!hdSelect) return;
		const denom = hdSelect.value;
		await Resting.expendHitDie(this.actor, denom) && await Resting.corruptionHeal(this.actor, this.actor.system.attributes.prof);
		this.render();
	}

	static async _onSubmit(event, form, formData) {
		// New Day boolean is in formData
		const newDay = formData.object.newDay;
		this._resolve(newDay);
	}

	static async restDialog({ actor, type }) {
		return new Promise((resolve, reject) => {
			new SybRestDialog({
				actor,
				type,
				resolve,
				reject
			}).render(true);
		});
	}
}
