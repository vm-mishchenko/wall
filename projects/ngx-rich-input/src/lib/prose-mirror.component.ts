import {Component, ComponentFactoryResolver, ElementRef, Inject, OnInit, ViewChild} from '@angular/core';

import {EditorState, Plugin, PluginKey, Selection, TextSelection} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {DOMParser, DOMSerializer, Schema} from 'prosemirror-model';
import {ReplaceStep} from 'prosemirror-transform';
import {STICKY_MODAL_DATA, StickyModalRef, StickyModalService, StickyPositionStrategy} from 'ngx-sticky-modal';
import {BehaviorSubject} from 'rxjs';

const debug = false;

@Component({
  template: `
      Text: {{config.text$ | async}}
  `,
  styles: [`
      :host {
          background: red;
      }
  `]
})
export class ContextMenuComponent implements OnInit {
  constructor(@Inject(STICKY_MODAL_DATA) public config: any) {
  }

  ngOnInit() {
    console.log(this.config.text$.getValue());
  }
}

function appendStarNode(view) {
  const type = view.state.doc.type.schema.nodes.star;
  const {$from} = view.state.selection;

  if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) {
    return false;
  }

  view.dispatch(view.state.tr.replaceSelectionWith(type.create()));
  return true;
}

function addHighlightMarkToSelectedText(view) {
  if (!isTextSelected(view.state.selection)) {
    console.warn('Text is not selected');
    return;
  }

  const tr = view.state.tr;
  const {from, to} = view.state.selection;
  const highlightMark = view.state.doc.type.schema.marks.highlight.create();

  tr.addMark(from, to, highlightMark);

  view.dispatch(tr);
}

function addSuggestionMarkToPreviousCharacter(view) {
  if (isTextSelected(view.state.selection)) {
    console.warn('Text is selected');
    return;
  }

  const tr = view.state.tr;
  const {$cursor} = view.state.selection;
  const suggestionMark = view.state.doc.type.schema.marks.suggestion.create();

  tr.addMark($cursor.pos - 1, $cursor.pos, suggestionMark)
    .setMeta('suggestion-stage', 'enter');

  view.dispatch(tr);
}

function removeAllSuggestionMarks(view) {
  console.log(`removeAllSuggestionMarks`);
  const tr = view.state.tr;

  tr.removeMark(0, view.state.doc.content.size, view.state.doc.type.schema.marks.suggestion)
    .setMeta('suggestion-stage', 'exit');

  view.dispatch(tr);
}

function getTextBeginningToCursor(selection) {
  if (isTextSelected(selection)) {
    console.warn('Cannot get getTextBeginningToCursor - Text is selected.');
    return;
  }

  return getTextFromAndTo(selection.$cursor.parent, 0, selection.$cursor.pos);
}

function getTextFromAndTo(doc, from, to) {
  return doc.textBetween(from, to);
}

function isTextSelected(selection) {
  // another way to test it - if ($cursor = null) text is selected
  return !selection.empty;
}

function isCursorBetweenNodes(selection) {
  if (isTextSelected(selection)) {
    return;
  }

  return selection.$cursor.textOffset === 0;
}

function getCurrentNode(selection) {
  // For all these cases Node is not determined
  // 1. <node>|<node>
  // 2. |<node>...
  // 3. ...<node>|

  if (isTextSelected(selection) || isCursorBetweenNodes(selection)) {
    return;
  }

  const $cursor = selection.$cursor;

  return $cursor.parent.child($cursor.index());
}

function suggestionPluginFactory({
                                   character = '/',
                                   onFocusedWithoutCursorChange = (context) => {
                                     console.log(`onFocusedWithoutCursorChange handler`);

                                     return false;
                                   },
                                   onKeyDown = (context) => {
                                     console.log(`onKeyDown handler`);

                                     return false;
                                   },
                                   onChange = (context) => {
                                     console.log(`onChange with text: ${context.match.text}`);
                                     return false;
                                   },
                                   onExit = (context) => {
                                     console.log(`onExit`);

                                     return false;
                                   },
                                   onEnter = (context) => {
                                     console.log(`onEnter`);
                                     // need to show dialog

                                     return false;
                                   },
                                 }) {
  const pluginInstance = new Plugin({
    replaceWithText(view, text) {
      const currentState = this.key.getState(view.state);

      if (!currentState.active) {
        throw new Error(`Ignore replaceWithText call: plugin is inactive`);
      }

      let suggestionNode = null;
      let suggestionPosition = null;

      view.state.doc.descendants((node, pos) => {
        if (node.marks.map(mark => mark.type).includes(view.state.doc.type.schema.marks.suggestion)) {
          suggestionNode = node;
          suggestionPosition = pos;

          // `false` to prevent traversal of its child nodes
          return false;
        }
      });

      view.dispatch(view.state.tr.insertText(text, suggestionPosition, suggestionPosition + suggestionNode.nodeSize));
    },

    replaceWithNode(view, newNode) {
      const currentState = this.key.getState(view.state);

      if (!currentState.active) {
        throw new Error(`Ignore replaceWithNode call: plugin is inactive`);
      }

      let suggestionNode = null;
      let suggestionPosition = null;

      view.state.doc.descendants((node, pos) => {
        if (node.marks.map(mark => mark.type).includes(view.state.doc.type.schema.marks.suggestion)) {
          suggestionNode = node;
          suggestionPosition = pos;

          // `false` to prevent traversal of its child nodes
          return false;
        }
      });

      view.dispatch(view.state.tr.replaceWith(suggestionPosition, suggestionPosition + suggestionNode.nodeSize, newNode));
    },

    key: new PluginKey('suggestions'),

    props: {
      // false = default behaviour
      handleKeyDown(view, event) {
        console.log('handleKeyDown');
        const escapeCode = ['Escape'];
        const {active} = this.getState(view.state);

        if (!active) {
          // default implementation should handle that event
          console.log(`handleKeyDown: Ignored`);
          return false;
        }

        // de-activate suggestion
        // event.code - ignore layout
        if (escapeCode.includes(event.code)) {
          const tr = view.state.tr.setMeta(this.key, {
            active: false,
            match: {}
          });

          view.dispatch(tr);

          // default implementation should handle that event
          return false;
        }

        return onKeyDown({view, event});
      },

      handleClick(view, pos, event) {
        const currentPluginState = this.getState(view.state);

        if (!currentPluginState.active) {
          console.log(`Ignore handleClick: plugin is not active`);
          return;
        }

        if (view.state.selection.$cursor.pos !== pos) {
          console.log(`Ignore handleClick: cursor position was changed, so there should be a new transaction that handle the change`);
          return;
        }

        return onFocusedWithoutCursorChange({view, match: currentPluginState.match});
      }
    },

    // called on each transaction
    // designed to somehow react on current Editor state (show/hide dialog, tooltip, etc...)
    view(editorView) {
      return {
        /**
         * For each transaction check, whether state is active which is sign to show the dialog
         * */
        update: (view, prevState) => {
          const prevValue = this.key.getState(prevState);
          const nextValue = this.key.getState(view.state);

          // See how the state changed
          const moved = prevValue.active && nextValue.active && prevValue.match.cursorPosition !== nextValue.match.cursorPosition;
          const started = !prevValue.active && nextValue.active;
          const stopped = prevValue.active && !nextValue.active;
          const changed = !started && !stopped && prevValue.match.text !== nextValue.match.text;

          // Trigger the hooks when necessary
          if (stopped) {
            removeAllSuggestionMarks(view);

            onExit({view, match: prevValue.match});
          }
          if (changed) {
            onChange({view, match: nextValue.match});
          }
          if (started) {
            addSuggestionMarkToPreviousCharacter(view);

            onEnter({view, match: nextValue.match});
          }
        },
      };
    },

    state: {
      init() {
        return {
          active: false,
          match: {}
        };
      },

      /**
       * Calculate new plugin state basic on the current transaction. Check whether it's suitable moment to show the dialog.
       * plugin "view" callback will be called next, which is actually responsible to show dialog or somehow else react to
       * the plugin state
       * */
      apply(tr, prevValue, oldState, newState) {
        const meta = tr.getMeta(this.key);
        if (meta) {
          return meta;
        }

        const {selection} = tr;
        const nextValue = {...prevValue};

        if (isTextSelected(selection)) {
          console.log(`Ignore: text is selected`);
          return {active: false, match: {}};
        }

        if (prevValue.active === false) {
          if ((tr.getMeta('suggestion-stage') === 'exit')) {
            console.log(`Ignore: Exit phase`);
            return {active: false, match: {}};
          }

          if (!tr.docChanged) {
            // ignore if doc was not changed
            console.log(`Ignore: doc is not changed`);
            return {active: false, match: {}};
          }

          const text = getTextBeginningToCursor(tr.curSelection);

          if (text.length === 0) {
            console.log(`Ignore: text is empty`);
            return {active: false, match: {}};
          }

          if (text[text.length - 1] !== character) {
            console.log(`Ignore: "${character}" character was no added`);
            return {active: false, match: {}};
          }

          if (text[text.length - 2] && text[text.length - 2] !== ' ') {
            console.log(`Ignore: there is symbol before "${character}" character.`);
            return {active: false, match: {}};
          }

          // check that current transaction actually added "{{character}}" symbol
          if (tr.steps.length !== 1) {
            console.log(`Ignore: Expect only one transaction step present`);
            return {active: false, match: {}};
          }

          if (!(tr.steps[0] instanceof ReplaceStep)) {
            console.log(`Ignore: Unexpected transaction step`);
            return {active: false, match: {}};
          }

          const replaceStepContent = tr.steps[0].slice.content.textBetween(0, tr.steps[0].slice.content.size);
          if (replaceStepContent !== character) {
            console.log(`Ignore: transaction step contains unexpected content:${replaceStepContent}`);
            return {active: false, match: {}};
          }

          // finally initialize plugin state
          return {
            active: true,
            match: {
              text: '',
              cursorPosition: tr.curSelection.$cursor.pos
            }
          };
        } else {
          // plugin is already active

          if (tr.getMeta('suggestion-stage') === 'enter') {
            console.log(`Ignore: Enter phase`);
            return prevValue;
          }

          // handle copy-paste case
          if (isCursorBetweenNodes(tr.curSelection)) {
            if (!tr.curSelection.$cursor.nodeBefore) {
              console.log(`Ignore: Extra strange behaviour.`);
              return {active: false, match: {}};
            }

            const markSuggestion = tr.curSelection.$cursor.nodeBefore.marks.find((mark) => {
              return mark.type === newState.doc.type.schema.marks.suggestion;
            });

            // node before does not have suggestion mark
            // it means that user type "{{character}}" and them copy-paste some text
            // that text is copied to the new text node, rather than into suggestion node
            // as result we need to abort suggestion process
            if (!markSuggestion) {
              console.log(`Ignore: node before cursor is not suggestion. Might happen during copy-paste functionality.`);
              return {active: false, match: {}};
            }
          }

          // check whether text after "{{character}}" does not have any spaces
          // if it has than abort suggestion
          const text = getTextBeginningToCursor(tr.curSelection);
          // match all after "{{character}}" except space
          const regexp = new RegExp(`.*\\${character}([^ ]*)$`);
          const match = text.match(regexp);

          if (!match) {
            console.log(`Ignore: cannot find appropriate text in: ${text}`);
            return {active: false, match: {}};
          }

          return {
            active: true,
            match: {
              text: match[1],
              cursorPosition: tr.curSelection.$cursor.pos
            }
          };
        }
      }
    },

    // designed to be able to observe any state change and react to it, once
    appendTransaction(transactions, oldState, newState) {
      if (transactions.length !== 1) {
        return;
      }

      const transaction = transactions[0];

      if (transaction.getMeta('suggestion-stage') !== 'exit') {
        return false;
      }

      return newState.tr.setStoredMarks([]);
    }
  });

  console.log(pluginInstance);

  return pluginInstance;
}

const statePlugin = new Plugin({
  state: {
    init: () => {
      return 0;
    },

    // Apply the given transaction to this state field, producing a new field value.
    // Note that the newState argument is again a partially constructed state
    // does not yet contain the state from plugins coming after this one.
    apply: (tr, value, oldState, newState) => {
      return 1;
    },

    // how I save the state of the plugin = state.toJSON({<arbitrary field name>:<plugin instance>})
    toJSON: () => {
      return {
        count: 0
      };
    }
  }
});

const filterTransactionPlugin = new Plugin({
  filterTransaction: (transaction, editorState): boolean => {
    // true - allows transaction
    return true;
  },

  // designed to be able to observe any state change and react to it, once
  appendTransaction(transactions, oldState, newState) {
    if (/*condition*/ false) {
      const newTransaction = newState.tr;

      return newTransaction
        .setMeta('originator', 'filterTransactionPlugin')
        .insertText('Inserted', 0, 10);
    }
  }
});

function keyHandlerPluginFactory(keyCode) {
  return new Plugin({
    props: {
      handleKeyDown: (editorView, event) => {
        if (event.code === keyCode) {
          console.log(`Intercept event with ${keyCode} pressed!`);
          return true;
        }

        // default implementation should handle that event
        return false;
      },
    },
  });
}

class SelectionSizeTooltip {
  tooltip: any;

  constructor(view) {
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'tooltip';
    view.dom.parentNode.appendChild(this.tooltip);

    this.update(view, null);
  }

  // called on each state update
  update(view, prevState) {
    const state = view.state;
    // Don't do anything if the document/selection didn't change
    if (prevState && prevState.doc.eq(state.doc) &&
      prevState.selection.eq(state.selection)) {
      return;
    }

    // Hide the tooltip if the selection is empty
    if (state.selection.empty) {
      this.tooltip.style.display = 'none';
      return;
    }

    // Otherwise, reposition it and update its content
    this.tooltip.style.display = '';
    const {from, to} = state.selection;
    // These are in screen coordinates
    const start = view.coordsAtPos(from), end = view.coordsAtPos(to);
    // The box in which the tooltip is positioned, to use as base
    const box = this.tooltip.offsetParent.getBoundingClientRect();
    // Find a center-ish x position from the selection endpoints (when
    // crossing lines, end may be more to the left)
    const left = Math.max((start.left + end.left) / 2, start.left + 3);
    this.tooltip.style.left = (left - box.left) + 'px';
    this.tooltip.style.bottom = (box.bottom - start.top) + 'px';
    this.tooltip.textContent = to - from;
  }

  destroy() {
    this.tooltip.remove();
  }
}

const tooltipPlugin = new Plugin({
  // allows to define object with the hooks whenever state will be updated
  view(editorView) {
    return new SelectionSizeTooltip(editorView);
  }
});

const nodes = {
  doc: {
    // may contains 0 or multiple text nodes
    content: 'inline*'
  },
  text: {
    inline: true,
    group: 'inline',
  },
  star: {
    inline: true,
    group: 'inline',
    toDOM() {
      return ['star', '🟊'];
    },
    parseDOM: [{tag: 'star'}]
  },
};

const marks = {
  suggestion: {
    inclusive: true,
    parseDOM: [{tag: 'suggestion'}],
    toDOM() {
      return ['suggestion', 0];
    }
  },
  highlight: {
    inclusive: false,
    parseDOM: [{tag: 'highlight'}],
    toDOM() {
      return ['highlight', 0];
    }
  },
  em: {
    parseDOM: [
      {
        tag: 'i'
      }, {
        tag: 'em'
      }, {
        style: 'font-style=italic'
      }
    ],
    toDOM() {
      return ['em', 0];
    }
  },
  b: {
    parseDOM: [
      {
        tag: 'b'
      }, {
        tag: 'strong'
      },
      {
        style: 'font-weight',
        getAttrs: value => /^(bold(er)?|[5-9]\d{2,})$/.test(value) && null
      }
    ],
    toDOM() {
      return ['strong', 0];
    }
  },
  link: {
    inclusive: false, // Whether this mark should be active when the cursor is positioned at its ends
    attrs: {
      href: {},
      title: {default: null}
    },
    parseDOM: [{
      tag: 'a[href]', getAttrs(dom) {
        return {
          href: dom.getAttribute('href'),
          title: dom.getAttribute('title')
        };
      }
    }],
    toDOM(node) {
      const {href, title} = node.attrs;

      return ['a', {href, title}, 0];
    }
  }
};

const customSchema = new Schema({nodes, marks});

const serializer = DOMSerializer.fromSchema(customSchema);

@Component({
  selector: 'prose-mirror',
  templateUrl: `./prose-mirror.component.html`,
  styles: [`
      #container {
          padding: 5px;
          border: 1px solid silver;
      }

      ::ng-deep suggestion {
          padding: 2px;
          color: cornflowerblue;
      }

      .property {
          margin-bottom: 5px;
      }
  `]
})
export class ProseMirrorComponent {
  @ViewChild('container') container: ElementRef;

  view: any;
  stateProperties: any = {};

  constructor(private ngxStickyModalService: StickyModalService,
              private componentFactoryResolver: ComponentFactoryResolver) {
  }

  ngOnInit() {
    const domNode = document.createElement('div');
    // domNode.innerHTML = 'Simple <highlight>custom</highlight><b>bold</b> simple <a href="http://google.com">Link</a>'; // innerHTML;
    // domNode.innerHTML = 'Simple <suggestion>custom</suggestion>Some'; // innerHTML;
    domNode.innerHTML = ''; // innerHTML;
    // // Read-only, represent document as hierarchy of nodes
    const doc = DOMParser.fromSchema(customSchema).parse(domNode);

    let modalRef: StickyModalRef;
    const textChange = new BehaviorSubject('');
    const suggestionPlugin = suggestionPluginFactory({
      character: '/',

      onEnter: (context) => {
        modalRef = this.ngxStickyModalService.open({
          component: ContextMenuComponent,
          data: {
            text$: textChange,
          },
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

        modalRef.result.finally(() => {
          modalRef = null;
        });

        return false;
      },

      onChange: (context) => {
        console.log(`onChange`);

        if (!modalRef) {
          modalRef = this.ngxStickyModalService.open({
            component: ContextMenuComponent,
            data: {
              text$: textChange,
            },
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

          modalRef.result.finally(() => {
            modalRef = null;
          });
        }

        textChange.next(context.match.text);
        return false;
      },

      onExit() {
        if (modalRef) {
          modalRef.dismiss();
          modalRef = null;
        }

        return false;
      },

      onFocusedWithoutCursorChange: (context) => {
        console.log(`onFocusedWithoutCursorChange`);

        if (!modalRef) {
          modalRef = this.ngxStickyModalService.open({
            component: ContextMenuComponent,
            data: {
              text$: textChange,
            },
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

          modalRef.result.finally(() => {
            modalRef = null;
          });
        }

        textChange.next(context.match.text);
        return false;
      },

      // called only when plugin is active
      onKeyDown(context) {
        if (context.event.code === 'Enter') {
          console.log(`Enter! Convert to the Star!`);

          // suggestionPlugin.spec.replaceWithText(context.view, 'DONE');
          suggestionPlugin.spec.replaceWithNode(context.view, context.view.state.doc.type.schema.nodes.star.create());
          return true;
        }

        if (context.event.code === 'ArrowUp') {
          console.log(`ArrowUp! Prevent while suggestion active!`);
          return true;
        }

        if (context.event.code === 'ArrowDown') {
          console.log(`ArrowDown! Prevent while suggestion active!`);
          return true;
        }
      }
    });

    const state = EditorState.create({
      doc,
      schema: customSchema,
      plugins: [
        suggestionPlugin,
        // statePlugin,
        // filterTransactionPlugin,
        // keyHandlerPluginFactory('ControlLeft'),
        // tooltipPlugin
      ]
    });
    this.view = new EditorView(this.container.nativeElement, {
      state,
      dispatchTransaction: (transaction) => {
        if (transaction.docChanged) {
          debug && console.log(`doc was changed`);
        }

        if (transaction.selectionSet) {
          debug && console.log(`selection was explicitly updated by this transaction.`);
        }

        if (transaction.getMeta('pointer')) {
          debug && console.log(`Transaction caused by mouse or touch input`);
        }

        const newState = this.view.state.apply(transaction);

        // The updateState method is just a shorthand to updating the "state" prop.
        this.view.updateState(newState);

        debug && console.log(transaction);

        this.updateStateProperties();
      },
    });

    this.updateStateProperties();
  }

  updateStateProperties() {
    this.stateProperties = {
      representation: {
        text: this.getTextRepresentation(this.view.state.doc),
        html: this.getHTMLRepresentation(this.view.state.doc),
        contentJson: this.getContentJSON(this.view.state.doc)
      },
      selection: {
        isTextSelected: isTextSelected(this.view.state.selection),
        isCursorBetweenNodes: isCursorBetweenNodes(this.view.state.selection),
        isCursorAtTheStart: this.isCursorAtTheStart(this.view.state),
        isCursorAtTheEnd: this.isCursorAtTheEnd(this.view.state),
        selectedText: this.getSelectedText(this.view.state),
        selectedHTML: this.getSelectedHTML(this.view.state),
        rightText: this.getTextCursorToEnd(this.view.state),
        rightHTML: this.getHTMLCursorToEnd(this.view.state),
        leftText: getTextBeginningToCursor(this.view.state.selection),
        leftHTML: this.getHTMLBeginningToCursor(this.view.state),
        text: this.getSelectionAsText(this.view.state),
        currentNode: getCurrentNode(this.view.state.selection)
      }
    };
  }

  getContentJSON(doc) {
    return doc.content.content.map((childNode) => {
      const result = {
        name: childNode.type.name,
        text: childNode.text,
      };

      if (childNode.marks.length) {
        result['marks'] = childNode.marks.map((mark) => {
          const markResult = {
            name: mark.type.name,
          };

          if (Object.keys(mark.attrs).length) {
            markResult['attrs'] = mark.attrs;
          }

          return markResult;
        });
      }

      return result;
    });
  }

  getTextRepresentation(doc) {
    return doc.textContent;
  }

  getHTMLRepresentation(doc) {
    const documentFragment = serializer.serializeFragment(doc.content);
    const div = document.createElement('DIV');

    div.append(documentFragment);

    return div.innerHTML;
  }

  getSelectionAsText(state) {
    const content = state.selection.content();

    // console.log(content.openStart);
    // console.log(content.openEnd);
  }

  getHTMLBeginningToCursor(state) {
    const $from = state.selection.$from;

    // Create a copy of this node with only the content between the given positions.
    const doc = $from.parent.cut(0, $from.pos);

    return this.getHTMLRepresentation(doc);
  }

  getTextCursorToEnd(state) {
    const $from = state.selection.$from;

    // Create a copy of this node with only the content between the given positions.
    const doc = $from.parent.cut($from.pos);

    return this.getTextRepresentation(doc);
  }

  getHTMLCursorToEnd(state) {
    const $from = state.selection.$from;

    // Create a copy of this node with only the content between the given positions.
    const doc = $from.parent.cut($from.pos);

    return this.getHTMLRepresentation(doc);
  }

  getSelectedText(state) {
    const $to = state.selection.$to;
    const $from = state.selection.$from;

    // Create a copy of this node with only the content between the given positions.
    const doc = $from.parent.cut($from.pos, $to.pos);

    return this.getTextRepresentation(doc);
  }

  getSelectedHTML(state) {
    const $to = state.selection.$to;
    const $from = state.selection.$from;

    // Create a copy of this node with only the content between the given positions.
    const doc = $from.parent.cut($from.pos, $to.pos);

    return this.getHTMLRepresentation(doc);
  }

  isCursorAtTheStart(state) {
    if (isTextSelected(state.selection)) {
      return;
    }

    return state.selection.$cursor.pos === 0;
  }

  isCursorAtTheEnd(state) {
    if (isTextSelected(state.selection)) {
      return;
    }

    return state.selection.$cursor.pos === state.selection.$cursor.parent.content.size;
  }

  // experimental functions
  appendStarNode(view) {
    appendStarNode(view);
  }

  appendTextAtTheBeginning() {
    this.view.dispatch(
      this.view.state.tr.insertText('Manually inserted text. ')
    );
  }

  setCursorAtTheStart() {
    this.view.dispatch(
      this.view.state.tr.setSelection(Selection.atStart(this.view.state.doc))
    );
  }

  setCursorAtTheEnd() {
    this.view.dispatch(
      this.view.state.tr.setSelection(Selection.atEnd(this.view.state.doc))
    );
  }

  setCursorAtPosition(position: number) {
    this.view.dispatch(
      this.view.state.tr.setSelection(TextSelection.create(this.view.state.doc, /* anchor= */position, /* head? */position))
    );
  }

  addHighlightMarkToSelectedText(view) {
    addHighlightMarkToSelectedText(view);
  }
}
