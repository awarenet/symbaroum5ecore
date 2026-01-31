/* Common operations and utilities for all
 * core submodules
 */

const NAME = 'symbaroum5ecore';
const TITLE = 'Symbaroum 5E Ruins of Symbaroum - Core System';
const PATH = `modules/${NAME}`;

export class COMMON {

  /** CONSTANTS **/
  static DATA = {
    name: NAME,
    path: PATH,
    title: TITLE,
  };

  static buildNotification(type, message) {
    Hooks.once('ready', () => {
      ui.notifications[type](message);
    })
  }

  static NAME = this.name;

  static register() {
    COMMON.globals();
  }

  static globals() {

    /* register our namespace */
    globalThis.game.syb5e = {
      debug: {},
    };
  }

  /** HELPER FUNCTIONS **/
  static setting(key, value = null) {

    if (value !== null) {
      return game.settings.set(COMMON.DATA.name, key, value);
    }

    return game.settings.get(COMMON.DATA.name, key);
  }

  static localize(stringId, data = {}) {
    return game.i18n.format(stringId, data);
  }

  static applySettings(settingsData, moduleKey = COMMON.DATA.name) {
    Object.entries(settingsData).forEach(([key, data]) => {
      game.settings.register(
        moduleKey, key, {
        name: COMMON.localize(`SYB5E.setting.${key}.name`),
        hint: COMMON.localize(`SYB5E.setting.${key}.hint`),
        ...data
      }
      );
    });
  }

  static translateObject(obj) {
    Object.keys(obj).forEach(key => obj[key] = COMMON.localize(obj[key]));
    return obj;
  }

  static patch(target, path, patches) {
    if (!target) return;

    Object.entries(patches).forEach(([name, data]) => {
      const type = data.type ?? 'WRAPPER';
      //Shim allows for 'WRAPPER', 'MIXED', 'OVERRIDE'

      /* if we have a type, use it, otherwise check the mode */
      const mode = data.mode ?? type;

      libWrapper.register(COMMON.DATA.name, `${path}.${name}`, data.value, mode);
    });
  }

}

