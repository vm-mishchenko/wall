import {
    Component,
    ComponentFactoryResolver,
    Injector,
    Input,
    OnInit,
    ViewChild,
    ViewContainerRef
} from '@angular/core';
import { WallCanvasApi } from '../../wall-canvas.api';
import { LocationUpdatedEvent, Radar } from "../../../../../../modules/radar";

@Component({
    selector: 'wall-canvas-brick',
    templateUrl: './wall-canvas-brick.component.html'
})
export class WallCanvasBrickComponent implements OnInit {
    @Input() brick: any;

    @ViewChild('brickContainer', {read: ViewContainerRef}) container: ViewContainerRef;

    private selected: boolean = false;

    private isMouseNear: boolean = false;

    constructor(private injector: Injector,
                private resolver: ComponentFactoryResolver,
                private radar: Radar,
                private wallCanvasApi: WallCanvasApi) {
    }

    ngOnInit() {
        const componentReference = this.renderBrick();

        this.wallCanvasApi.core.registerCanvasBrickInstance(this.brick.id, this, componentReference.instance);

        this.radar.subscribe((e) => {
            if (e instanceof LocationUpdatedEvent) {
                this.isMouseNear = e.spots[0].data === this.brick.id;
            }
        });
    }

    onFocused() {
        this.wallCanvasApi.core.onFocused(this.brick.id);
    }

    select() {
        this.selected = true;
    }

    unselect() {
        this.selected = false;
    }

    private renderBrick() {
        const factory = this.resolver.resolveComponentFactory(this.brick.component);

        const componentReference = this.container.createComponent(factory, null, this.injector);

        componentReference.instance['id'] = this.brick.id;

        return componentReference;
    }
}