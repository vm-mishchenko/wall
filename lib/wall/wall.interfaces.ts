// https://github.com/s-panferov/awesome-typescript-loader/issues/411
import { WallDefinition } from "./components/wall/interfaces/wall-definition.interface";
import { Subscription } from 'rxjs/Subscription';

export const awesomeTypescriptLoaderBug2 = true;

// Register new brick
export interface BrickSpecification {
    tag: string;
    component: any;
    supportText?: true;
}

export interface IWallViewModel {
    canvasLayout: any;

    selectBrick(brickId: string): void;

    selectBricks(brickId: string[]): void;

    addBrickToSelection(brickId: string): void;

    removeBrickFromSelection(brickId: string): void;

    unSelectBricks(): void;

    onFocusedBrick(brickId: string): void;

    getSelectedBrickIds(): void;

    getFocusedBrickId(): string;

    focusOnBrickId(brickId: string): void

    focusOnPreviousTextBrick(brickId: string): void;

    focusOnNextTextBrick(brickId: string): void;

    enableMediaInteraction(): void;

    disableMediaInteraction(): void;


}

export interface IWallModel {
    id: string;

    getNextBrickId(brickId: string): string;

    getPreviousBrickId(brickId: string): string;

    getPlan(): WallDefinition;

    updateBrickState(brickId, brickState): void;

    turnBrickInto(brickId: string, newTag: string);

    isRegisteredBrick(tag: string): boolean;

    addDefaultBrick(): void;

    addBrick(tag: string, targetRowIndex: number, targetColumnIndex: number, positionIndex: number): void;

    addBrickToNewRow(tag: string, targetRowIndex: number): void;

    addBrickAfterInSameColumn(brickId: string, tag: string): void;

    addBrickAfterInNewRow(brickId: string, tag: string): void;

    addBrickAfterBrickId(brickId: string, tag: string): void;

    addBrickAtTheEnd(tag: string): void;

    moveBrickAfterBrickId(targetBrickIds: string[], beforeBrickId: string): void;

    moveBrickBeforeBrickId(targetBrickIds: string[], beforeBrickId: string): void;

    moveBrickToNewColumn(targetBrickIds: string[], beforeBrickId: string, side: string): void;

    removeBrick(brickId: string): void;

    removeBricks(brickIds): void;

    isBrickAheadOf(firstBrickId: string, secondBrickId: string): boolean;

    subscribe(callback: any): Subscription;
}