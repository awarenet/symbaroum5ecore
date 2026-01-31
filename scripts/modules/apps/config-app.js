const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
import { COMMON } from '../../common.js';

export class SybConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    tag: "form",
    id: "symbaroum5ecoreSettings",
    classes: ["dnd5e2", "syb5e", "standard-form"],
    window: {
      title: "SYB5E.setting.config-menu-label.name",
      resizable: true,
      icon: "fas fa-cogs"
    },
    position: {
      width: 700,
      height: "auto"
    },
    form: {
      handler: SybConfigApp._onSubmitForm,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: {
      template: `modules/symbaroum5ecore/templates/apps/config-app.html`
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.useSymbaroumCurrency = COMMON.setting('useSymbaroumCurrency');
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
  }

  static async _onSubmitForm(event, form, formData) {
    const data = formData.object;
    await COMMON.setting('useSymbaroumCurrency', data.useSymbaroumCurrency);

    // Reload to apply changes since currency is applied at init
    // Or we could try to apply them dynamically, but reload is safer for init-time configs.
    if (Object.keys(data).length > 0) {
      foundry.utils.debouncedReload();
    }
  }
}
