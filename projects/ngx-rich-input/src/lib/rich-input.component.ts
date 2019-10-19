import {Component, ComponentFactoryResolver, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {StickyModalService, StickyPositionStrategy} from 'ngx-sticky-modal';
import {baseKeymap} from 'prosemirror-commands';
import {keymap} from 'prosemirror-keymap';
import {DOMParser, DOMSerializer, Schema, Slice} from 'prosemirror-model';

import {marks, nodes} from 'prosemirror-schema-basic';
import {EditorState, Transaction} from 'prosemirror-state';
import {ReplaceStep} from 'prosemirror-transform';
import {EditorView} from 'prosemirror-view';
import {Subject} from 'rxjs';
import {SelectionMenuComponent} from './components/selection-menu/selection-menu.component';

export interface IMark {
  name: string;
  tag: string;
  wrapSymbol?: string;
  hotKey?: string;
  attrs?: IAttr;

  // overview component
  // show or not overview component automatically
  // action when cursor stays inside mark

  // show dialog after special symbol or hot key combination

  // hot key for selected text or cursor position - show summary from different plugins
  // translation, word meaning, open in google images
}

export interface IAttrMap {
  [key: string]: string;
}

export interface IAttr {
  // defines whether mark has a default value
  defaultAttrs: () => IAttrMap;
  // defines component for editing attributes
  editAttrsComp?: any;
  // show edit Attributes component
  hotKey?: string;
}

export interface IRichInputConfig {
  marks: IMark[];
}

class RichInputModel {
  readonly richInputEditor: RichInputEditor;

  constructor(private container: HTMLElement, private config: IRichInputConfig) {
    const richInputMarks = this.config.marks.map((mark) => {
      return new RichInputMark(mark);
    });

    this.richInputEditor = new RichInputEditor({
      container,
      marks: this.config.marks,
      preTransactionHooks: [
        this.convertToMark.bind(this)
      ]
    });
  }

  convertToMark(transaction, view) {
    // some should confirm that current transaction is valid for converting
    // some should create converting transaction
    // show the attribute modal if necessary
    //
  }
}

class RichInputMark {
  constructor(private mark: IMark) {
  }
}

/**
 * Contains core state, provides low level API and defines overall data flow.
 */
class RichInputEditor {
  view: EditorView;

  constructor(private options) {
    const customSchema = new Schema({
      nodes,
      marks: {
        ...marks,

        // register user custom marks
        ...this.options.marks.reduce((result, markConfig) => {
          result[markConfig.name] = {
            inclusive: false,
            parseDOM: [{tag: markConfig.tag}],
            toDOM: function toDOM() {
              return [markConfig.tag, 0];
            }
          };

          return result;
        }, {})
      },
    });

    const serializer = DOMSerializer.fromSchema(customSchema);

    const domNode = document.createElement('div');
    domNode.innerHTML = 'Some initial text';

    // register user custom hotkeys
    const customKeyMapConfig = this.options.marks.filter((markConfig) => {
      return markConfig.hotKey;
    }).reduce((result, markConfig) => {
      result[markConfig.hotKey] = (state, dispatch) => {
        const tr = this.view.state.tr;
        const {from, to} = state.selection;

        const mark = state.doc.type.schema.marks[markConfig.name].create();
        tr.addMark(from, to, mark);

        dispatch(tr);

        return true;
      };

      return result;
    }, {});

    const state = EditorState.create({
      doc: DOMParser.fromSchema(customSchema).parse(domNode),
      schema: customSchema,
      plugins: [
        keymap(customKeyMapConfig),
        keymap(baseKeymap),
      ]
    });

    this.view = new EditorView(this.options.container, {
      state,
      dispatchTransaction: (transaction) => {
        this.options.preTransactionHooks.some((preTransactionHook) => {
          return preTransactionHook(transaction, this.view);
        });

        console.log(`apply transaction`);

        const newState = this.view.state.apply(transaction);
        this.view.updateState(newState);
      }
    });
  }
}

@Component({
  selector: 'rich-input',
  template: `
      <div #container></div>
      <button (click)="openSelectedTextMenu()">Open menu</button>
  `,
  styles: []
})
export class RichInputComponent implements OnInit {
  @ViewChild('container') container: ElementRef;

  @Input() config: IRichInputConfig;

  private view: EditorView;
  private dispatchTransaction$ = new Subject<Transaction>();

  constructor(private ngxStickyModalService: StickyModalService,
              private componentFactoryResolver: ComponentFactoryResolver) {
  }

  ngOnInit() {
    const richInputModel = new RichInputModel(
      this.container.nativeElement,
      this.config
    );

    /*const customSchema = new Schema({
      nodes,
      marks: {
        ...marks,
        ...this.config.marks.reduce((result, markConfig) => {
          result[markConfig.name] = {
            inclusive: false,
            parseDOM: [{tag: markConfig.tag}],
            toDOM: function toDOM() {
              return [markConfig.tag, 0];
            }
          };

          return result;
        }, {})
      },
    });

    const serializer = DOMSerializer.fromSchema(customSchema);

    const domNode = document.createElement('div');
    domNode.innerHTML = 'Some initial text';

    const customKeyMapConfig = this.config.marks.filter((markConfig) => {
      return markConfig.hotKey;
    }).reduce((result, markConfig) => {
      result[markConfig.hotKey] = (state, dispatch) => {
        const tr = this.view.state.tr;
        const {from, to} = state.selection;

        const mark = state.doc.type.schema.marks[markConfig.name].create();
        tr.addMark(from, to, mark);

        dispatch(tr);

        return true;
      };

      return result;
    }, {});

    const state = EditorState.create({
      doc: DOMParser.fromSchema(customSchema).parse(domNode),
      schema: customSchema,
      plugins: [
        keymap(customKeyMapConfig),
        keymap(baseKeymap),
      ]
    });

    this.view = new EditorView(this.container.nativeElement, {
      state,
      dispatchTransaction: (transaction) => {
        if (this.convertToMark(transaction)) {
          return;
        }

        this.dispatchTransaction$.next(transaction);
        const newState = this.view.state.apply(transaction);
        this.view.updateState(newState);
      }
    });

    this.dispatchTransaction$.pipe(
      filter((transaction) => {
        return !transaction.curSelection.empty;
      }),
      debounceTime(500)
    ).subscribe(() => {
      console.log(`selected`);
    });*/
  }

  convertToMark(transaction) {
    const convertToMark = this.config.marks.filter((markConfig) => {
      return this.canConvertToTheMark(transaction, markConfig.wrapSymbol);
    })[0];

    if (!convertToMark) {
      return false;
    }

    const leftNode = this.view.state.selection.$from.nodeBefore;
    const cursorPosition = this.view.state.selection.$from.pos;
    const leftOpenCharacterIndex = leftNode.text.indexOf(convertToMark.wrapSymbol);
    const startPos = cursorPosition - leftNode.nodeSize + leftOpenCharacterIndex;

    const tr = this.view.state.tr;
    tr.delete(startPos, startPos + 1);

    const mark = this.view.state.doc.type.schema.marks[convertToMark.name].create();
    tr.addMark(startPos, tr.selection.$cursor.pos, mark);

    this.view.dispatch(tr);

    return true;
  }

  openSelectedTextMenu() {
    this.ngxStickyModalService.open({
      component: SelectionMenuComponent,
      positionStrategy: {
        name: StickyPositionStrategy.flexibleConnected,
        options: {
          relativeTo: this.container.nativeElement
        }
      },
      position: {
        originX: 'start',
        originY: 'top',
        overlayX: 'start',
        overlayY: 'top'
      },
      overlayConfig: {
        hasBackdrop: true
      },
      componentFactoryResolver: this.componentFactoryResolver
    });
  }

  private canConvertToTheMark(transaction: Transaction, symbol: string) {
    return this.doesReplaceStepModifyOneTextNode(transaction) &&
      this.isAddSymbol(transaction, symbol) &&
      !this.doesBeforeNodeHaveMarks() &&
      this.doesBeforeNodeHaveSymbol(symbol) &&
      this.distanceToSymbolForBeforeNode(symbol);
  }

  private distanceToSymbolForBeforeNode(symbol: string): number {
    const leftNode = this.view.state.selection.$from.nodeBefore;
    const cursorPosition = this.view.state.selection.$from.pos;
    const leftOpenCharacterIndex = leftNode.text.indexOf(symbol);
    const startPos = cursorPosition - leftNode.nodeSize + leftOpenCharacterIndex;

    return cursorPosition - startPos + 1;
  }

  private doesBeforeNodeHaveSymbol(symbol: string) {
    const leftNode = this.view.state.selection.$from.nodeBefore;

    if (!leftNode) {
      return false;
    }

    const leftOpenCharacterIndex = leftNode.text.indexOf(symbol);

    return leftNode.nodeSize && leftOpenCharacterIndex !== -1;
  }

  private doesBeforeNodeHaveMarks() {
    const leftNode = this.view.state.selection.$from.nodeBefore;

    return leftNode && leftNode.marks.length;
  }

  /**
   * Check whether transaction has only ReplaceStep which modifies one text node.
   */
  private doesReplaceStepModifyOneTextNode(transaction: Transaction) {
    if (transaction.steps.length !== 1) {
      return false;
    }

    const step = transaction.steps[0];

    if (!(step instanceof ReplaceStep)) {
      return false;
    }

    //
    return step.slice.content.childCount === 1;
  }

  private isAddSymbol(transaction: Transaction, symbol: string): boolean {
    const step = transaction.steps[0];

    const {text} = step.slice.content.firstChild;

    return text && text[text.length - 1] === symbol;
  }
}
