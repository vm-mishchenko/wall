import { Injectable } from '@angular/core';
import { Subject } from 'rxjs/Subject';
import { Subscription } from 'rxjs/Subscription';

import { WallApi } from './wall-api.service';
import { WALL } from './wall.constant';
import { ReactiveProperty, ReactiveReadOnlyProperty } from '../../../reactive-property';
import { WallState } from './interfaces/wall-state.interface';
import { IWallModel, IWallViewModel } from '../../wall.interfaces';
import {
    AddBrickEvent,
    MoveBrickEvent,
    RemoveBrickEvent,
    RemoveBricksEvent,
    TurnBrickIntoEvent
} from '../../model/wall.events';
import { BrickRegistry } from '../../registry/brick-registry.service';

@Injectable()
export class WallViewModel implements IWallViewModel {
    wallModel: IWallModel = null;

    events: Subject<any> = new Subject();

    // UI
    focusedBrickId: string = null;

    selectedBricks: string[] = [];

    private writeState = {
        mode: new ReactiveProperty<string>(WALL.MODES.EDIT),
        isMediaInteractionEnabled: new ReactiveProperty<boolean>(true)
    };

    state: WallState = {
        mode: new ReactiveReadOnlyProperty(this.writeState.mode.getValue(), this.writeState.mode.valueChanged),
        isMediaInteractionEnabled: new ReactiveReadOnlyProperty(this.writeState.isMediaInteractionEnabled.getValue(), this.writeState.isMediaInteractionEnabled.valueChanged)
    };

    constructor(public api: WallApi,
                private brickRegistry: BrickRegistry) {
    }

    get canvasLayout() {
        return this.wallModel ? this.getCanvasLayout() : null;
    }

    getCanvasLayout() {
        const canvasLayout = {
            rows: []
        };

        this.wallModel.traverse((row) => {
            canvasLayout.rows.push({
                columns: row.columns.map((column) => {
                    return {
                        bricks: column.bricks.map((brickConfig) => {
                            const component = this.brickRegistry.get(brickConfig.tag).component;

                            return {
                                id: brickConfig.id,
                                hash: brickConfig.tag + brickConfig.id,
                                state: brickConfig.state,
                                component: component
                            };
                        })
                    };
                })
            });
        });

        return canvasLayout;
    }

    initialize(wallModel: IWallModel) {
        this.wallModel = wallModel;

        // initialize view core API
        const coreApi = [
            'state',

            // SELECTION
            'getSelectedBrickIds',
            'selectBrick',
            'selectBricks',
            'addBrickToSelection',
            'removeBrickFromSelection',
            'unSelectBricks',

            // FOCUS
            'focusOnBrickId',
            'getFocusedBrickId',
            'focusOnPreviousTextBrick',
            'focusOnNextTextBrick',

            // REMOVE BRICK
            'removeBrick',
            'removeBricks',

            // NAVIGATION
            'getPreviousBrickId',
            'getNextBrickId',
            'isBrickAheadOf',

            // BEHAVIOUR
            'enableMediaInteraction',
            'disableMediaInteraction',

            // CLIENT
            'getPlan',
            'subscribe',

            // BRICk
            'isRegisteredBrick',
            'turnBrickInto',

            // MOVE BRICK
            'moveBrickAfterBrickId',
            'moveBrickBeforeBrickId',
            'moveBrickToNewColumn',

            // ADD BRICK
            'addBrickAfterBrickId'
        ].reduce((result, methodName) => {
            let method;

            if (this[methodName] && this[methodName].bind) {
                method = this[methodName].bind(this);
            }

            if (!method && this.wallModel[methodName] && this.wallModel[methodName].bind) {
                method = this.wallModel[methodName].bind(this.wallModel);
            }

            result[methodName] = method;

            return result;
        }, {});

        this.api.registerCoreApi(coreApi);

        // protect API from extending
        Object.seal(this.api.core);

        this.wallModel.subscribe((event) => {
            if (event instanceof AddBrickEvent) {
                this.focusOnBrickId(event.brickId);
            }

            if (event instanceof TurnBrickIntoEvent) {
                this.focusOnBrickId(event.brickId);
            }

            if (event instanceof MoveBrickEvent) {
                this.unSelectBricks();
            }

            if (event instanceof RemoveBrickEvent) {
                if (event.previousBrickId) {
                    this.focusOnBrickId(event.previousBrickId);
                } else if (event.nextBrickId) {
                    this.focusOnBrickId(event.nextBrickId);
                }
            }

            if (event instanceof RemoveBricksEvent) {
                if (event.previousBrickId) {
                    this.focusOnBrickId(event.previousBrickId);
                } else if (event.nextBrickId) {
                    this.focusOnBrickId(event.nextBrickId);
                } else if (!this.wallModel.getBricksCount()) {
                    // this.wallModel.addBrick('text', 0, 0, 0);
                }
            }
        });
    }

    /**
     * @public-api
     * */
    selectBrick(brickId: string): void {
        this.selectedBricks = [brickId];
        this.focusedBrickId = null;
    }

    /**
     * @public-api
     * */
    selectBricks(brickIds: string[]) {
        this.selectedBricks = brickIds;
    }

    /**
     * @public-api
     * */
    addBrickToSelection(brickId: string): void {
        this.selectedBricks = this.selectedBricks.slice(0);
        this.selectedBricks.push(brickId);
    }

    /**
     * @public-api
     * */
    removeBrickFromSelection(brickId: string): void {
        const brickIdIndex = this.selectedBricks.indexOf(brickId);

        this.selectedBricks.splice(brickIdIndex, 1);

        this.selectedBricks = this.selectedBricks.slice(0);
    }

    /**
     * @public-api
     * */
    unSelectBricks(): void {
        this.selectedBricks = [];
    }

    /**
     * @public-api
     * */
    getSelectedBrickIds(): string[] {
        return this.selectedBricks;
    }

    /**
     * @public-api
     * */
    getFocusedBrickId(): string {
        return this.focusedBrickId;
    }

    /**
     * @public-api
     * */
    focusOnBrickId(brickId: string): void {
        this.focusedBrickId = null;

        // wait until new brick will be rendered
        setTimeout(() => {
            this.focusedBrickId = brickId;
        });
    }

    /**
     * @public-api
     * */
    focusOnPreviousTextBrick(brickId: string) {
        const previousTextBrickId = this.wallModel.getPreviousTextBrickId(brickId);

        if (previousTextBrickId) {
            this.focusOnBrickId(previousTextBrickId);
        }
    }

    /**
     * @public-api
     * */
    focusOnNextTextBrick(brickId: string) {
        const nextTextBrickId = this.wallModel.getNextTextBrickId(brickId);

        if (nextTextBrickId) {
            this.focusOnBrickId(nextTextBrickId);
        }
    }

    /**
     * @public-api
     * */
    enableMediaInteraction() {
        this.writeState.isMediaInteractionEnabled.setValue(true);
    };

    /**
     * @public-api
     * */
    disableMediaInteraction() {
        this.writeState.isMediaInteractionEnabled.setValue(false);
    };

    /**
     * @public-api
     * */
    subscribe(callback: any): Subscription {
        return this.events.subscribe(callback);
    }

    /**
     * @public-api
     * */
    moveBrickAfterBrickId(targetBrickIds: string[], beforeBrickId: string) {
        if (targetBrickIds.indexOf(beforeBrickId) === -1) {
            this.wallModel.moveBrickAfterBrickId(targetBrickIds, beforeBrickId);
        }
    }

    /**
     * @public-api
     * */
    moveBrickBeforeBrickId(targetBrickIds: string[], beforeBrickId: string) {
        if (targetBrickIds.indexOf(beforeBrickId) === -1) {
            this.wallModel.moveBrickBeforeBrickId(targetBrickIds, beforeBrickId);
        }
    }

    /**
     * @public-api
     * */
    moveBrickToNewColumn(targetBrickIds: string[], beforeBrickId: string, side: string) {
        if (targetBrickIds.indexOf(beforeBrickId) === -1) {
            this.wallModel.moveBrickToNewColumn(targetBrickIds, beforeBrickId, side);
        }
    }

    /**
     * @public-api
     * */
    removeBrick(brickId: string) {
        const brickIds = this.wallModel.getBrickIds();

        if (brickIds.length === 1 && this.wallModel.getBrickTag(brickIds[0]) === 'text') {
            this.focusOnBrickId(brickIds[0]);
        } else {
            this.wallModel.removeBrick(brickId);
        }
    }

    /**
     * @public-api
     * */
    removeBricks(brickIds: string[]) {
        const currentBrickIds = this.wallModel.getBrickIds();

        if (currentBrickIds.length === 1 && this.wallModel.getBrickTag(currentBrickIds[0]) === 'text') {
            this.focusOnBrickId(currentBrickIds[0]);
        } else {
            this.wallModel.removeBricks(brickIds);
        }
    }

    onFocusedBrick(brickId: string) {
        this.focusedBrickId = brickId;

        this.unSelectBricks();
    }

    isRegisteredBrick(tag: string) {
        return Boolean(this.brickRegistry.get(tag));
    }

    reset() {
        this.focusedBrickId = null;

        this.unSelectBricks();
    }
}