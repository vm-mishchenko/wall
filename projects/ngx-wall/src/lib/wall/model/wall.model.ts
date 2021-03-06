import {Observable, Subject} from 'rxjs';
import {BrickRegistry} from '../registry/brick-registry.service';
import {WallPluginInitializedEvent} from './events/wall-plugin-initialized.event';
import {IWallModelConfig2} from './interfaces/wall-model-config.interface2';
import {IWallModel} from './interfaces/wall-model.interface';
import {IWallPlugin} from './interfaces/wall-plugin.interface';

export class WallModel implements IWallModel {
    version: '0.0.0';

    // plugin api
    api = {
        core2: null
    };

    events$: Observable<any> = new Subject();
    apiRegistered$: Observable<string> = new Subject<string>();

    private plugins: Map<string, IWallPlugin> = new Map();

    constructor(private brickRegistry: BrickRegistry, config: IWallModelConfig2) {
        // initialize 3rd party plugins
        config.plugins.forEach((plugin) => this.initializePlugin(plugin));
    }

    // register external API
    registerApi(apiName: string, api: object) {
        this.api[apiName] = api;
        (this.apiRegistered$ as Subject<string>).next(apiName);
    }

    destroy() {
        this.plugins.forEach((plugin) => this.destroyPlugin(plugin));
    }

    private dispatch(e: any): void {
        (this.events$ as Subject<any>).next(e);
    }

    private initializePlugin(plugin: IWallPlugin) {
        plugin.onWallInitialize(this);

        this.plugins.set(plugin.name, plugin);

        this.dispatch(new WallPluginInitializedEvent(plugin.name));
    }

    private destroyPlugin(plugin: IWallPlugin) {
        if (plugin.onWallPluginDestroy) {
            plugin.onWallPluginDestroy();
        }
    }
}
