import {
    ApplicationRef,
    ComponentFactoryResolver,
    ComponentRef,
    Directive,
    EmbeddedViewRef,
    HostListener,
    Inject,
    Injector
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PickOutAreaModel } from './pick-out-area.model';
import { PickOutAreaComponent } from './pick-out-area.component';
import { PickOutHandlerService } from '../pick-out-handler.service';

@Directive({
    selector: '[pick-out-area]'
})
export class PickOutAreaDirective {
    doc: any = null;

    minimumMoveDistance = 5;

    pickOutAreaModel: PickOutAreaModel = null;

    selectionProcessStarted = false;

    selectionRangeComponentRef: ComponentRef<PickOutAreaComponent> = null;

    @HostListener('mousedown', ['$event'])
    mouseDown(event: MouseEvent) {
        this.selectionProcessStarted = false;

        this.pickOutAreaModel = new PickOutAreaModel();

        this.pickOutAreaModel.setInitialPosition(event.clientX, event.clientY);
    }

    mouseMove(event: MouseEvent) {
        if (this.pickOutAreaModel) {
            this.pickOutAreaModel.setCurrentPosition(event.clientX, event.clientY);

            if (this.selectionProcessStarted) {
                this.pickOutHandlerService.pickOutChanged({
                    x: this.pickOutAreaModel.x,
                    y: this.pickOutAreaModel.y,
                    width: this.pickOutAreaModel.width,
                    height: this.pickOutAreaModel.height
                });

                // create UI selection if it's not exist
                if (!this.selectionRangeComponentRef) {
                    this.appendSelectionRangeComponent();
                }
            } else {
                // user drags mouse enough to show UI and start selection process
                if (this.pickOutAreaModel.width > this.minimumMoveDistance || this.pickOutAreaModel.height > this.minimumMoveDistance) {
                    this.pickOutHandlerService.startPickOut();

                    this.selectionProcessStarted = true;
                }
            }
        }
    }

    mouseUp() {
        if (this.pickOutAreaModel) {
            this.pickOutAreaModel.onDestroy();

            if (this.selectionRangeComponentRef) {
                this.removeSelectionRangeComponent();

                this.selectionRangeComponentRef = null;
            }

            this.pickOutAreaModel = null;

            this.pickOutHandlerService.endPickOut();
        }
    }

    appendSelectionRangeComponent() {
        // https://medium.com/@caroso1222/angular-pro-tip-how-to-dynamically-create-components-in-body-ba200cc289e6

        // 1. Create a component reference from the component
        this.selectionRangeComponentRef = this.componentFactoryResolver
            .resolveComponentFactory(PickOutAreaComponent)
            .create(this.injector);

        this.selectionRangeComponentRef.instance.initialize(this.pickOutAreaModel);

        // 2. Attach component to the appRef so that it's inside the ng component tree
        this.appRef.attachView(this.selectionRangeComponentRef.hostView);

        // 3. Get DOM element from component
        const domElem = (this.selectionRangeComponentRef.hostView as EmbeddedViewRef<any>)
            .rootNodes[0] as HTMLElement;

        // 4. Append DOM element to the body
        document.body.appendChild(domElem);
    }

    removeSelectionRangeComponent() {
        this.appRef.detachView(this.selectionRangeComponentRef.hostView);
        this.selectionRangeComponentRef.destroy();
    }

    constructor(@Inject(DOCUMENT) doc,
                private pickOutHandlerService: PickOutHandlerService,
                private componentFactoryResolver: ComponentFactoryResolver,
                private appRef: ApplicationRef,
                private injector: Injector) {
        this.doc = doc;

        this.doc.addEventListener('mousemove', (e) => {
            this.mouseMove(e);
        });

        this.doc.addEventListener('mouseup', (e) => {
            this.mouseUp();
        });
    }
}