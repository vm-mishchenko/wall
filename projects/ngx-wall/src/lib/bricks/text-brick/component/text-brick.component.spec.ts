import {CommonModule} from '@angular/common';
import {DebugElement} from '@angular/core';
import {async, ComponentFixture, fakeAsync, TestBed, tick} from '@angular/core/testing';
import {FormsModule} from '@angular/forms';
import {By} from '@angular/platform-browser';
import {StickyModalModule} from 'ngx-sticky-modal';
import {ContenteditableModule} from '../../../modules/contenteditable';
import {HelperComponentsModule} from '../../../modules/helper-components';
import {PlaceCaretToPosition} from '../../../modules/utils/node/place-caret-to-position';
import {IWallModel} from '../../../wall';
import {DEBOUNCE_TIME, FOCUS_INITIATOR} from '../../base-text-brick/base-text-brick.constant';
import {IBaseTextState} from '../../base-text-brick/base-text-state.interface';
import {TEXT_BRICK_TAG} from '../text-brick.constant';
import {TextBrickComponent} from './text-brick.component';

interface TestScopeOptions {
    initialState?: IBaseTextState;
}

class TestScope {
    initialState: IBaseTextState = {
        text: 'initial',
        tabs: 0
    };

    mockWallModel: any = {
        api: {
            core: {},
            ui: {}
        }
    };

    // elements
    nativeElement: HTMLElement;
    rootNativeElement: HTMLElement;
    component: TextBrickComponent;
    debugElement: DebugElement;
    fixture: ComponentFixture<TextBrickComponent>;

    constructor(options?: TestScopeOptions) {
        if (options && options.initialState) {
            this.initialState = {
                ...this.initialState,
                ...options.initialState
            };
        }
    }

    initialize(): Promise<any> {
        return this.createComponent();
    }

    destroy() {
    }

    updateComponentState(newState: IBaseTextState): Promise<any> {
        this.fixture.componentInstance.state = newState;
        this.fixture.componentInstance.onWallStateChange(newState);
        this.fixture.detectChanges();

        return this.fixture.whenStable();
    }

    setDOMInnerText(newText: string) {
        this.nativeElement.innerText = newText;

        // after dispatching Angular call template call back
        this.nativeElement.dispatchEvent(new Event('input'));

        // tick - execute all async tasks which will be finished in passed time
        tick(DEBOUNCE_TIME);
    }

    getDOMInnerHTML(): string {
        return this.nativeElement.innerHTML;
    }

    // mocking
    /*
    * @param {string} apiString "core.removeBrick"
    * @param {string} apiString "ui.focusOnBrick"
    * */
    mock(apiString: string): jasmine.Spy {
        const [api, method] = apiString.split('.');

        this.mockWallModel.api[api][method] = jasmine.createSpy(method);

        return this.mockWallModel.api[api][method];
    }

    mockMethods(apis: string[]) {
        apis.forEach((apiString) => this.mock(apiString));
    }

    getRecentArguments(apiString): any[] {
        const [api, method] = apiString.split('.');

        return (this.mockWallModel.api[api][method] as any)
            .calls.mostRecent().args;
    }

    private createComponent(): Promise<any> {
        // Fixture for debugging and testing a component.
        this.fixture = TestBed.createComponent(TextBrickComponent);

        // DebugElement is abstraction over nativeElement,
        // because nativeElement might be different in different environments
        this.debugElement = this.fixture.debugElement;

        // it's root of component, not direct component so
        // type is HTMLElement because we run it in Browser, for mobile nativeElement might be different
        this.rootNativeElement = this.fixture.nativeElement;

        // P HTMLElement
        this.nativeElement = this.debugElement.query(By.css('p')).nativeElement;

        // represents the Angular TypeScript class for the running component
        this.component = this.fixture.componentInstance;

        // simulate the parent setting the input property
        this.component.id = '1';
        this.component.wallModel = (this.mockWallModel as IWallModel);
        this.component.state = this.initialState;

        this.fixture.detectChanges();

        // waiting for component rendering
        return this.fixture.whenStable();
    }
}

describe('TextBrickComponent', () => {
    let testScope: TestScope;

    beforeEach(async(() => {
        TestBed.configureTestingModule({
            imports: [
                FormsModule,
                CommonModule,
                ContenteditableModule,
                HelperComponentsModule,
                StickyModalModule
            ],
            declarations: [TextBrickComponent]
        }).compileComponents();
    }));

    beforeEach((done) => {
        testScope = new TestScope();
        testScope.initialize().then(done);
    });

    afterEach(() => {
        testScope.destroy();
        testScope = null;
    });

    it('should create', () => {
        expect(testScope.component).toBeDefined();
    });

    describe('[Basic]', () => {
        it('should render new text from model', async(() => {
            const newState = {
                text: 'initial state'
            };

            testScope.updateComponentState({
                text: 'initial state',
                tabs: 0
            }).then(() => {
                expect(testScope.getDOMInnerHTML()).toBe(newState.text);
            });
        }));
    });

    describe('[Text change]', () => {
        it('should save state when text is changed from DOM', fakeAsync(() => {
            const newEnteredText = 'test';

            let capturedState;

            testScope.component.stateChanges.subscribe((newState) => capturedState = newState);

            testScope.setDOMInnerText(newEnteredText);

            expect(capturedState.text).toBe(newEnteredText);
        }));
    });

    describe('[Keypress Navigation]', () => {
        describe('[Enter]', () => {
            it('should create new text brick and split text', async(() => {
                const mockGetSelection = spyOn(window, 'getSelection');

                testScope.mockWallModel.api.core.addBrickAfterBrickId = jasmine.createSpy('addBrickAfterBrickId');

                [
                    {
                        initialText: 'initial',
                        focusOffset: 7,
                        focusNode: () => testScope.nativeElement.childNodes[0],
                        expectedFirstText: 'initial',
                        expectedNewText: '',
                    },
                    {
                        initialText: 'initial',
                        focusOffset: 4,
                        focusNode: () => testScope.nativeElement.childNodes[0],
                        expectedFirstText: 'init',
                        expectedNewText: 'ial',
                    },
                    {
                        initialText: 'text <b>STRING</b> text',
                        focusOffset: 5,
                        focusNode: () => testScope.nativeElement.childNodes[2],
                        expectedFirstText: 'text <b>STRING</b> text',
                        expectedNewText: '',
                    },
                    {
                        initialText: 'text <b>STRING</b> text',
                        focusOffset: 2,
                        focusNode: () => testScope.nativeElement.childNodes[1].childNodes[0],
                        expectedFirstText: 'text <b>ST</b>',
                        expectedNewText: '<b>RING</b> text',
                    },
                    {
                        initialText: 'text <b>STR<i>ING</i></b> text',
                        focusOffset: 1,
                        focusNode: () => testScope.nativeElement.childNodes[1].childNodes[1].childNodes[0], // I text string
                        expectedFirstText: 'text <b>STR<i>I</i></b>',
                        expectedNewText: '<b><i>NG</i></b> text'
                    }
                ].reduce((promise, config) => {
                    return promise.then(() => {
                        return testScope.updateComponentState({
                            text: config.initialText,
                            tabs: 0
                        }).then(() => {
                            const keyEvent = new KeyboardEvent('keydown', {code: 'Enter'});

                            mockGetSelection.and.returnValue({
                                focusOffset: config.focusOffset,
                                focusNode: config.focusNode()
                            });

                            // test action
                            testScope.component.onKeyPress(keyEvent);

                            // test assertions
                            const callArguments = (testScope.mockWallModel.api.core.addBrickAfterBrickId as any)
                                .calls.mostRecent().args;

                            expect(testScope.mockWallModel.api.core.addBrickAfterBrickId).toHaveBeenCalled();
                            expect(callArguments[0]).toBe(testScope.component.id);
                            expect(callArguments[1]).toBe(TEXT_BRICK_TAG);
                            expect(callArguments[2]).toEqual({
                                text: config.expectedNewText,
                                tabs: testScope.component.state.tabs
                            });
                            expect(testScope.component.scope.text).toEqual(config.expectedFirstText);

                            (window.getSelection as jasmine.Spy).calls.reset();
                        });
                    });
                }, Promise.resolve());
            }));
        });

        describe('[Top key]', () => {
            it('should focus on previous text Brick', async(() => {
                const mockGetSelection = spyOn(window, 'getSelection');

                testScope.mockWallModel.api.ui.focusOnPreviousTextBrick = jasmine.createSpy('focusOnPreviousTextBrick');

                testScope.updateComponentState({
                    text: 'initial',
                    tabs: 0
                }).then(() => {
                    const keyEvent = new KeyboardEvent('keydown', {code: 'ArrowUp'});

                    mockGetSelection.and.returnValue({
                        focusOffset: 0,
                        focusNode: testScope.nativeElement.childNodes[0]
                    });

                    // test action
                    testScope.component.onKeyPress(keyEvent);

                    // test assertions
                    const callArguments = (testScope.mockWallModel.api.ui.focusOnPreviousTextBrick as any)
                        .calls.mostRecent().args;

                    expect(testScope.mockWallModel.api.ui.focusOnPreviousTextBrick).toHaveBeenCalled();
                    expect(/*initiator component id*/callArguments[0]).toBe(testScope.component.id);
                    expect(callArguments[1]).toEqual({
                        initiator: FOCUS_INITIATOR,
                        details: {
                            topKey: true,
                            caretLeftCoordinate: 0
                        }
                    });
                });
            }));

            it('should not focus on previous text Brick when cursor is not on first line', async(() => {
                const mockGetSelection = spyOn(window, 'getSelection');

                testScope.mockWallModel.api.ui.focusOnPreviousTextBrick = jasmine.createSpy('focusOnPreviousTextBrick');

                const newState = {
                    text: 'Long initial text, Long initial text, Long initial text, Long initial text',
                    tabs: 0
                };

                testScope.updateComponentState(newState).then(() => {
                    const keyEvent = new KeyboardEvent('keydown', {code: 'ArrowUp'});

                    mockGetSelection.and.returnValue({
                        focusOffset: newState.text.length - 5,
                        focusNode: testScope.nativeElement.childNodes[0]
                    });

                    // make width narrow so cursor will be not in the first line
                    testScope.nativeElement.style.width = '20px';

                    // test action
                    testScope.component.onKeyPress(keyEvent);

                    // test assertions
                    expect(testScope.mockWallModel.api.ui.focusOnPreviousTextBrick).not.toHaveBeenCalled();
                });
            }));
        });

        describe('[Bottom key]', () => {
            it('should focus on next text Brick', async(() => {
                const mockGetSelection = spyOn(window, 'getSelection');

                testScope.mockWallModel.api.ui.focusOnNextTextBrick = jasmine.createSpy('focusOnNextTextBrick');

                testScope.updateComponentState({
                    text: 'initial',
                    tabs: 0
                }).then(() => {
                    const keyEvent = new KeyboardEvent('keydown', {code: 'ArrowDown'});

                    mockGetSelection.and.returnValue({
                        focusOffset: 0,
                        focusNode: testScope.nativeElement.childNodes[0]
                    });

                    // test action
                    testScope.component.onKeyPress(keyEvent);

                    // test assertions
                    const callArguments = (testScope.mockWallModel.api.ui.focusOnNextTextBrick as any)
                        .calls.mostRecent().args;

                    expect(testScope.mockWallModel.api.ui.focusOnNextTextBrick).toHaveBeenCalled();
                    expect(/*initiator component id*/callArguments[0]).toBe(testScope.component.id);
                    expect(callArguments[1]).toEqual({
                        initiator: FOCUS_INITIATOR,
                        details: {
                            bottomKey: true,
                            caretLeftCoordinate: 0
                        }
                    });
                });
            }));

            it('should not focus on next text Brick when cursor is not on last line', async(() => {
                const mockGetSelection = spyOn(window, 'getSelection');

                testScope.mockWallModel.api.ui.focusOnNextTextBrick = jasmine.createSpy('focusOnNextTextBrick');

                const newState = {
                    text: 'Long initial text, Long initial text, Long initial text, Long initial text',
                    tabs: 0
                };

                testScope.updateComponentState(newState).then(() => {
                    const keyEvent = new KeyboardEvent('keydown', {code: 'ArrowDown'});

                    mockGetSelection.and.returnValue({
                        focusOffset: 0,
                        focusNode: testScope.nativeElement.childNodes[0]
                    });

                    // make width narrow so cursor will be not in the first line
                    testScope.nativeElement.style.width = '20px';

                    // test action
                    testScope.component.onKeyPress(keyEvent);

                    // test assertions
                    expect(testScope.mockWallModel.api.ui.focusOnNextTextBrick).not.toHaveBeenCalled();
                });
            }));
        });

        describe('[Left key]', () => {
            it('should navigate to previous text brick', async(() => {
                testScope.mockWallModel.api.ui.focusOnPreviousTextBrick = jasmine.createSpy('focusOnPreviousTextBrick');

                testScope.updateComponentState({
                    text: 'initial',
                    tabs: 0
                }).then(() => {
                    const keyEvent = new KeyboardEvent('keydown', {code: 'ArrowLeft'});

                    // place caret at first position
                    (new PlaceCaretToPosition(testScope.nativeElement.childNodes[0], /*cursor position*/0)).place();

                    // test action
                    testScope.component.onKeyPress(keyEvent);

                    // test assertions
                    const callArguments = (testScope.mockWallModel.api.ui.focusOnPreviousTextBrick as any)
                        .calls.mostRecent().args;

                    expect(testScope.mockWallModel.api.ui.focusOnPreviousTextBrick).toHaveBeenCalled();

                    expect(callArguments[0]).toBe(testScope.component.id);
                    expect(callArguments[1]).toEqual({
                        initiator: FOCUS_INITIATOR,
                        details: {
                            leftKey: true
                        }
                    });
                });
            }));

            it('should not navigate to previous text brick when cursor is not at the beginning', async(() => {
                testScope.mockWallModel.api.ui.focusOnPreviousTextBrick = jasmine.createSpy('focusOnPreviousTextBrick');

                testScope.updateComponentState({
                    text: 'initial',
                    tabs: 0
                }).then(() => {
                    const keyEvent = new KeyboardEvent('keydown', {code: 'ArrowLeft'});

                    // place caret at first position
                    (new PlaceCaretToPosition(testScope.nativeElement.childNodes[0], /*cursor position*/1)).place();

                    // test action
                    testScope.component.onKeyPress(keyEvent);

                    // test assertions
                    expect(testScope.mockWallModel.api.ui.focusOnPreviousTextBrick).not.toHaveBeenCalled();
                });
            }));
        });

        describe('[Right key]', () => {
            it('should navigate to next text brick', async(() => {
                testScope.mockWallModel.api.ui.focusOnNextTextBrick = jasmine.createSpy('focusOnNextTextBrick');

                const newState = {
                    text: 'initial',
                    tabs: 0
                };

                testScope.updateComponentState(newState).then(() => {
                    const keyEvent = new KeyboardEvent('keydown', {code: 'ArrowRight'});

                    // place caret at first position
                    (new PlaceCaretToPosition(
                        testScope.nativeElement.childNodes[0],
                        /*cursor position*/newState.text.length))
                        .place();

                    // test action
                    testScope.component.onKeyPress(keyEvent);

                    // test assertions
                    const callArguments = (testScope.mockWallModel.api.ui.focusOnNextTextBrick as any)
                        .calls.mostRecent().args;

                    expect(testScope.mockWallModel.api.ui.focusOnNextTextBrick).toHaveBeenCalled();

                    expect(callArguments[0]).toBe(testScope.component.id);
                    expect(callArguments[1]).toEqual({
                        initiator: FOCUS_INITIATOR,
                        details: {
                            rightKey: true
                        }
                    });
                });
            }));

            it('should not navigate to next text brick when cursor is not at the end', async(() => {
                testScope.mockWallModel.api.ui.focusOnNextTextBrick = jasmine.createSpy('focusOnNextTextBrick');

                testScope.updateComponentState({
                    text: 'initial',
                    tabs: 0
                }).then(() => {
                    const keyEvent = new KeyboardEvent('keydown', {code: 'ArrowRight'});

                    // place caret at first position
                    (new PlaceCaretToPosition(
                        testScope.nativeElement.childNodes[0],
                        /*cursor position*/0))
                        .place();

                    // test action
                    testScope.component.onKeyPress(keyEvent);

                    // test assertions
                    expect(testScope.mockWallModel.api.ui.focusOnNextTextBrick).not.toHaveBeenCalled();
                });
            }));
        });

        describe('[Backspace key]', () => {
            it('should delete current brick and focus on previous text brick', async(() => {
                testScope.updateComponentState({
                    text: '',
                    tabs: 0
                }).then(() => {
                    const previousTextBrickId = '2';

                    testScope.mock('core.getPreviousTextBrickId').and.returnValue(previousTextBrickId);
                    testScope.mockMethods(['ui.removeBrick', 'ui.focusOnBrickId']);

                    (new PlaceCaretToPosition(testScope.nativeElement, /*cursor position*/0)).place();

                    // test action
                    testScope.component.onKeyPress(new KeyboardEvent('keydown', {code: 'Backspace'}));

                    // test assertions
                    expect(testScope.mockWallModel.api.core.getPreviousTextBrickId).toHaveBeenCalled();
                    expect(testScope.mockWallModel.api.ui.removeBrick).toHaveBeenCalled();
                    expect(testScope.mockWallModel.api.ui.focusOnBrickId).toHaveBeenCalled();

                    // test assertions
                    const removeBrickCallArguments = testScope.getRecentArguments('ui.removeBrick');
                    const focusOnBrickIdCallArguments = testScope.getRecentArguments('ui.focusOnBrickId');

                    expect(removeBrickCallArguments[0]).toBe(testScope.component.id);
                    expect(focusOnBrickIdCallArguments[0]).toBe(previousTextBrickId);
                    expect(focusOnBrickIdCallArguments[1]).toEqual({
                        initiator: FOCUS_INITIATOR,
                        details: {
                            deletePreviousText: true
                        }
                    });
                });
            }));

            it('should concat with previous text supporting brick and delete current brick', async(() => {
                const newState = {
                    text: 'initial',
                    tabs: 0
                };

                testScope.updateComponentState(newState).then(() => {
                    const previousTextBrickId = '2';
                    const previousTextSupportingBrickSnapshot = {
                        state: {
                            text: 'previous'
                        }
                    };

                    testScope.mock('core.getPreviousTextBrickId').and.returnValue(previousTextBrickId);
                    testScope.mock('core.getBrickSnapshot').and.returnValue(previousTextSupportingBrickSnapshot);
                    testScope.mockMethods(['ui.removeBrick', 'ui.focusOnBrickId', 'core.updateBrickState']);

                    (new PlaceCaretToPosition(testScope.nativeElement, /*cursor position*/0)).place();

                    // test action
                    testScope.component.onKeyPress(new KeyboardEvent('keydown', {code: 'Backspace'}));

                    // test assertions
                    expect(testScope.mockWallModel.api.core.getPreviousTextBrickId).toHaveBeenCalled();
                    expect(testScope.mockWallModel.api.core.getBrickSnapshot).toHaveBeenCalled();
                    expect(testScope.mockWallModel.api.core.updateBrickState).toHaveBeenCalled();
                    expect(testScope.mockWallModel.api.ui.removeBrick).toHaveBeenCalled();
                    expect(testScope.mockWallModel.api.ui.focusOnBrickId).toHaveBeenCalled();

                    // test assertions
                    const removeBrickCallArguments = testScope.getRecentArguments('ui.removeBrick');
                    const focusOnBrickIdCallArguments = testScope.getRecentArguments('ui.focusOnBrickId');
                    const updateBrickStateCallArguments = testScope.getRecentArguments('core.updateBrickState');

                    expect(removeBrickCallArguments[0]).toBe(testScope.component.id);
                    expect(focusOnBrickIdCallArguments[0]).toBe(previousTextBrickId);
                    expect(focusOnBrickIdCallArguments[1]).toEqual({
                        initiator: FOCUS_INITIATOR,
                        details: {
                            concatText: true,
                            concatenationText: newState.text
                        }
                    });
                    expect(updateBrickStateCallArguments[0]).toBe(previousTextBrickId);
                    expect(updateBrickStateCallArguments[1]).toEqual({
                        text: previousTextSupportingBrickSnapshot.state.text + newState.text
                    });
                });
            }));
        });
    });

    describe('[TextContextMenuComponent]', () => {
        // test all interaction with TextContextMenuComponent there
        // TextContextMenuComponent component will be tested separately
    });

    describe('[BricksListComponent]', () => {
        // test all interaction with BricksListComponent there
        // BricksListComponent component will be tested separately
    });
});
