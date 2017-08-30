import { Subject } from 'rxjs/Subject';
import { WallModel } from './wall.model';
import { IWallDefinition } from '../../wall.interfaces';
import { Subscription } from 'rxjs/Subscription';

// TODO: need to implement IWallCoreApi interface

export class WallCoreApi {
    events: Subject<any> = new Subject();

    constructor(private wallModel: WallModel) {
    }

    getPlan(): IWallDefinition {
        return this.wallModel.getPlan();
    }

    getBrickStore(brickId: string) {
        return this.wallModel.getBrickStore(brickId);
    }

    subscribe(callback): Subscription {
        return this.events.subscribe(callback);
    }
}