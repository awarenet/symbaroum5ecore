import { COMMON } from '../common.js';
import { SybCorruptionDialog } from './apps/syb-corruption-dialog.js';

export class Tidy5eIntegration {
    static NAME = "Tidy5eIntegration";

    static register() {
        Hooks.once('tidy5e-sheet.ready', (api) => {
            Tidy5eIntegration.registerCorruption(api);
            Tidy5eIntegration.registerExtRest(api);
        });
        if (COMMON.setting('useSymbaroumCurrency')) {
            Hooks.on('renderActorSheetV2', (app, element, data, forced) => {
                // remove unused currency fields
                document.querySelector('.currency-container .input-group:has(input[data-tidy-field="system.currency.pp"])').style.display = 'none';
                document.querySelector('.currency-container .input-group:has(input[data-tidy-field="system.currency.ep"])').style.display = 'none';
            });
        }
    }

    // Corruption ability bar
    static registerCorruption(api) {
        api.registerActorContent(
            new api.models.HandlebarsContent({
                path: '/modules/symbaroum5ecore/templates/actors/parts/tidy-corruption-container.hbs',
                injectParams: {
                    selector: `.ability.cha`,
                    position: "afterend",
                },
                onRender(params) {
                    const element = params.element;
                    const container = element.querySelector?.(".ability.corruption");
                    container?.addEventListener("click", () => {
                        SybCorruptionDialog.create(params.app.document);
                    });
                },
                // context doesn't have the extension method for get syb5eActor so we have to do it manually
                getData(context) {
                    context.isSybActor = context.actor.flags ? context.actor.flags[COMMON.DATA.name]?.syb5eActor > 0 : false;
                    return context;
                }
            })
        );
    }

    // Extended Rest button
    static registerExtRest(api) {
        api.registerActorContent(
            new api.models.HandlebarsContent({
                path: 'modules/symbaroum5ecore/templates/actors/parts/tidy-extended-rest-container.hbs',
                injectParams: {
                    selector: `[data-tooltip="DND5E.REST.Long.Label"]`,
                    position: "afterend",
                },
                onRender(params) {
                    const element = params.element;
                    const button = element.querySelector?.(".extended-rest");
                    button?.addEventListener("click", () => {
                        params.app.document.extendedRest();
                    });
                },
                getData(context) {
                    // context doesn't have the extension method for get syb5eActor so we have to do it manually
                    context.isSybActor = context.actor.flags ? context.actor.flags[COMMON.DATA.name]?.syb5eActor > 0 : false;
                    return context;
                }
            })
        );
    }
}
