'use strict';var lang_1 = require('angular2/src/facade/lang');
var collection_1 = require('angular2/src/facade/collection');
var change_detection_util_1 = require('./change_detection_util');
var change_detector_ref_1 = require('./change_detector_ref');
var exceptions_1 = require('./exceptions');
var locals_1 = require('./parser/locals');
var constants_1 = require('./constants');
var profile_1 = require('../profile/profile');
var observable_facade_1 = require('./observable_facade');
var async_1 = require('angular2/src/facade/async');
var _scope_check = profile_1.wtfCreateScope("ChangeDetector#check(ascii id, bool throwOnChange)");
var _Context = (function () {
    function _Context(element, componentElement, context, locals, injector, expression) {
        this.element = element;
        this.componentElement = componentElement;
        this.context = context;
        this.locals = locals;
        this.injector = injector;
        this.expression = expression;
    }
    return _Context;
})();
var AbstractChangeDetector = (function () {
    function AbstractChangeDetector(id, numberOfPropertyProtoRecords, bindingTargets, directiveIndices, strategy) {
        this.id = id;
        this.numberOfPropertyProtoRecords = numberOfPropertyProtoRecords;
        this.bindingTargets = bindingTargets;
        this.directiveIndices = directiveIndices;
        this.strategy = strategy;
        this.contentChildren = [];
        this.viewChildren = [];
        // The names of the below fields must be kept in sync with codegen_name_util.ts or
        // change detection will fail.
        this.state = constants_1.ChangeDetectorState.NeverChecked;
        this.locals = null;
        this.mode = null;
        this.pipes = null;
        this.ref = new change_detector_ref_1.ChangeDetectorRef_(this);
    }
    AbstractChangeDetector.prototype.addContentChild = function (cd) {
        this.contentChildren.push(cd);
        cd.parent = this;
    };
    AbstractChangeDetector.prototype.removeContentChild = function (cd) { collection_1.ListWrapper.remove(this.contentChildren, cd); };
    AbstractChangeDetector.prototype.addViewChild = function (cd) {
        this.viewChildren.push(cd);
        cd.parent = this;
    };
    AbstractChangeDetector.prototype.removeViewChild = function (cd) { collection_1.ListWrapper.remove(this.viewChildren, cd); };
    AbstractChangeDetector.prototype.remove = function () { this.parent.removeContentChild(this); };
    AbstractChangeDetector.prototype.handleEvent = function (eventName, elIndex, event) {
        if (!this.hydrated()) {
            this.throwDehydratedError(this.id + " -> " + eventName);
        }
        try {
            var locals = new Map();
            locals.set('$event', event);
            var res = !this.handleEventInternal(eventName, elIndex, new locals_1.Locals(this.locals, locals));
            this.markPathToRootAsCheckOnce();
            return res;
        }
        catch (e) {
            var c = this.dispatcher.getDebugContext(null, elIndex, null);
            var context = lang_1.isPresent(c) ?
                new exceptions_1.EventEvaluationErrorContext(c.element, c.componentElement, c.context, c.locals, c.injector) :
                null;
            throw new exceptions_1.EventEvaluationError(eventName, e, e.stack, context);
        }
    };
    AbstractChangeDetector.prototype.handleEventInternal = function (eventName, elIndex, locals) { return false; };
    AbstractChangeDetector.prototype.detectChanges = function () { this.runDetectChanges(false); };
    AbstractChangeDetector.prototype.checkNoChanges = function () {
        if (lang_1.assertionsEnabled()) {
            this.runDetectChanges(true);
        }
    };
    AbstractChangeDetector.prototype.runDetectChanges = function (throwOnChange) {
        if (this.mode === constants_1.ChangeDetectionStrategy.Detached ||
            this.mode === constants_1.ChangeDetectionStrategy.Checked || this.state === constants_1.ChangeDetectorState.Errored)
            return;
        var s = _scope_check(this.id, throwOnChange);
        this.detectChangesInRecords(throwOnChange);
        this._detectChangesContentChildren(throwOnChange);
        if (!throwOnChange)
            this.afterContentLifecycleCallbacks();
        this._detectChangesInViewChildren(throwOnChange);
        if (!throwOnChange)
            this.afterViewLifecycleCallbacks();
        if (this.mode === constants_1.ChangeDetectionStrategy.CheckOnce)
            this.mode = constants_1.ChangeDetectionStrategy.Checked;
        this.state = constants_1.ChangeDetectorState.CheckedBefore;
        profile_1.wtfLeave(s);
    };
    // This method is not intended to be overridden. Subclasses should instead provide an
    // implementation of `detectChangesInRecordsInternal` which does the work of detecting changes
    // and which this method will call.
    // This method expects that `detectChangesInRecordsInternal` will set the property
    // `this.propertyBindingIndex` to the propertyBindingIndex of the first proto record. This is to
    // facilitate error reporting.
    AbstractChangeDetector.prototype.detectChangesInRecords = function (throwOnChange) {
        if (!this.hydrated()) {
            this.throwDehydratedError(this.id);
        }
        try {
            this.detectChangesInRecordsInternal(throwOnChange);
        }
        catch (e) {
            // throwOnChange errors aren't counted as fatal errors.
            if (!(e instanceof exceptions_1.ExpressionChangedAfterItHasBeenCheckedException)) {
                this.state = constants_1.ChangeDetectorState.Errored;
            }
            this._throwError(e, e.stack);
        }
    };
    // Subclasses should override this method to perform any work necessary to detect and report
    // changes. For example, changes should be reported via `ChangeDetectionUtil.addChange`, lifecycle
    // methods should be called, etc.
    // This implementation should also set `this.propertyBindingIndex` to the propertyBindingIndex of
    // the
    // first proto record to facilitate error reporting. See {@link #detectChangesInRecords}.
    AbstractChangeDetector.prototype.detectChangesInRecordsInternal = function (throwOnChange) { };
    // This method is not intended to be overridden. Subclasses should instead provide an
    // implementation of `hydrateDirectives`.
    AbstractChangeDetector.prototype.hydrate = function (context, locals, dispatcher, pipes) {
        this.dispatcher = dispatcher;
        this.mode = change_detection_util_1.ChangeDetectionUtil.changeDetectionMode(this.strategy);
        this.context = context;
        if (this.strategy === constants_1.ChangeDetectionStrategy.OnPushObserve) {
            this.observeComponent(context);
        }
        this.locals = locals;
        this.pipes = pipes;
        this.hydrateDirectives(dispatcher);
        this.state = constants_1.ChangeDetectorState.NeverChecked;
    };
    // Subclasses should override this method to hydrate any directives.
    AbstractChangeDetector.prototype.hydrateDirectives = function (dispatcher) { };
    // This method is not intended to be overridden. Subclasses should instead provide an
    // implementation of `dehydrateDirectives`.
    AbstractChangeDetector.prototype.dehydrate = function () {
        this.dehydrateDirectives(true);
        // This is an experimental feature. Works only in Dart.
        if (this.strategy === constants_1.ChangeDetectionStrategy.OnPushObserve) {
            this._unsubsribeFromObservables();
        }
        this._unsubscribeFromOutputs();
        this.dispatcher = null;
        this.context = null;
        this.locals = null;
        this.pipes = null;
    };
    // Subclasses should override this method to dehydrate any directives. This method should reverse
    // any work done in `hydrateDirectives`.
    AbstractChangeDetector.prototype.dehydrateDirectives = function (destroyPipes) { };
    AbstractChangeDetector.prototype.hydrated = function () { return lang_1.isPresent(this.context); };
    AbstractChangeDetector.prototype.destroyRecursive = function () {
        this.dispatcher.notifyOnDestroy();
        this.dehydrate();
        var children = this.contentChildren;
        for (var i = 0; i < children.length; i++) {
            children[i].destroyRecursive();
        }
        children = this.viewChildren;
        for (var i = 0; i < children.length; i++) {
            children[i].destroyRecursive();
        }
    };
    AbstractChangeDetector.prototype.afterContentLifecycleCallbacks = function () {
        this.dispatcher.notifyAfterContentChecked();
        this.afterContentLifecycleCallbacksInternal();
    };
    AbstractChangeDetector.prototype.afterContentLifecycleCallbacksInternal = function () { };
    AbstractChangeDetector.prototype.afterViewLifecycleCallbacks = function () {
        this.dispatcher.notifyAfterViewChecked();
        this.afterViewLifecycleCallbacksInternal();
    };
    AbstractChangeDetector.prototype.afterViewLifecycleCallbacksInternal = function () { };
    /** @internal */
    AbstractChangeDetector.prototype._detectChangesContentChildren = function (throwOnChange) {
        var c = this.contentChildren;
        for (var i = 0; i < c.length; ++i) {
            c[i].runDetectChanges(throwOnChange);
        }
    };
    /** @internal */
    AbstractChangeDetector.prototype._detectChangesInViewChildren = function (throwOnChange) {
        var c = this.viewChildren;
        for (var i = 0; i < c.length; ++i) {
            c[i].runDetectChanges(throwOnChange);
        }
    };
    AbstractChangeDetector.prototype.markAsCheckOnce = function () { this.mode = constants_1.ChangeDetectionStrategy.CheckOnce; };
    AbstractChangeDetector.prototype.markPathToRootAsCheckOnce = function () {
        var c = this;
        while (lang_1.isPresent(c) && c.mode !== constants_1.ChangeDetectionStrategy.Detached) {
            if (c.mode === constants_1.ChangeDetectionStrategy.Checked)
                c.mode = constants_1.ChangeDetectionStrategy.CheckOnce;
            c = c.parent;
        }
    };
    // This is an experimental feature. Works only in Dart.
    AbstractChangeDetector.prototype._unsubsribeFromObservables = function () {
        if (lang_1.isPresent(this.subscriptions)) {
            for (var i = 0; i < this.subscriptions.length; ++i) {
                var s = this.subscriptions[i];
                if (lang_1.isPresent(this.subscriptions[i])) {
                    s.cancel();
                    this.subscriptions[i] = null;
                }
            }
        }
    };
    AbstractChangeDetector.prototype._unsubscribeFromOutputs = function () {
        if (lang_1.isPresent(this.outputSubscriptions)) {
            for (var i = 0; i < this.outputSubscriptions.length; ++i) {
                async_1.ObservableWrapper.dispose(this.outputSubscriptions[i]);
                this.outputSubscriptions[i] = null;
            }
        }
    };
    // This is an experimental feature. Works only in Dart.
    AbstractChangeDetector.prototype.observeValue = function (value, index) {
        var _this = this;
        if (observable_facade_1.isObservable(value)) {
            this._createArrayToStoreObservables();
            if (lang_1.isBlank(this.subscriptions[index])) {
                this.streams[index] = value.changes;
                this.subscriptions[index] = value.changes.listen(function (_) { return _this.ref.markForCheck(); });
            }
            else if (this.streams[index] !== value.changes) {
                this.subscriptions[index].cancel();
                this.streams[index] = value.changes;
                this.subscriptions[index] = value.changes.listen(function (_) { return _this.ref.markForCheck(); });
            }
        }
        return value;
    };
    // This is an experimental feature. Works only in Dart.
    AbstractChangeDetector.prototype.observeDirective = function (value, index) {
        var _this = this;
        if (observable_facade_1.isObservable(value)) {
            this._createArrayToStoreObservables();
            var arrayIndex = this.numberOfPropertyProtoRecords + index + 2; // +1 is component
            this.streams[arrayIndex] = value.changes;
            this.subscriptions[arrayIndex] = value.changes.listen(function (_) { return _this.ref.markForCheck(); });
        }
        return value;
    };
    // This is an experimental feature. Works only in Dart.
    AbstractChangeDetector.prototype.observeComponent = function (value) {
        var _this = this;
        if (observable_facade_1.isObservable(value)) {
            this._createArrayToStoreObservables();
            var index = this.numberOfPropertyProtoRecords + 1;
            this.streams[index] = value.changes;
            this.subscriptions[index] = value.changes.listen(function (_) { return _this.ref.markForCheck(); });
        }
        return value;
    };
    AbstractChangeDetector.prototype._createArrayToStoreObservables = function () {
        if (lang_1.isBlank(this.subscriptions)) {
            this.subscriptions = collection_1.ListWrapper.createFixedSize(this.numberOfPropertyProtoRecords +
                this.directiveIndices.length + 2);
            this.streams = collection_1.ListWrapper.createFixedSize(this.numberOfPropertyProtoRecords +
                this.directiveIndices.length + 2);
        }
    };
    AbstractChangeDetector.prototype.getDirectiveFor = function (directives, index) {
        return directives.getDirectiveFor(this.directiveIndices[index]);
    };
    AbstractChangeDetector.prototype.getDetectorFor = function (directives, index) {
        return directives.getDetectorFor(this.directiveIndices[index]);
    };
    AbstractChangeDetector.prototype.notifyDispatcher = function (value) {
        this.dispatcher.notifyOnBinding(this._currentBinding(), value);
    };
    AbstractChangeDetector.prototype.logBindingUpdate = function (value) {
        this.dispatcher.logBindingUpdate(this._currentBinding(), value);
    };
    AbstractChangeDetector.prototype.addChange = function (changes, oldValue, newValue) {
        if (lang_1.isBlank(changes)) {
            changes = {};
        }
        changes[this._currentBinding().name] = change_detection_util_1.ChangeDetectionUtil.simpleChange(oldValue, newValue);
        return changes;
    };
    AbstractChangeDetector.prototype._throwError = function (exception, stack) {
        var error;
        try {
            var c = this.dispatcher.getDebugContext(null, this._currentBinding().elementIndex, null);
            var context = lang_1.isPresent(c) ? new _Context(c.element, c.componentElement, c.context, c.locals, c.injector, this._currentBinding().debug) :
                null;
            error = new exceptions_1.ChangeDetectionError(this._currentBinding().debug, exception, stack, context);
        }
        catch (e) {
            // if an error happens during getting the debug context, we throw a ChangeDetectionError
            // without the extra information.
            error = new exceptions_1.ChangeDetectionError(null, exception, stack, null);
        }
        throw error;
    };
    AbstractChangeDetector.prototype.throwOnChangeError = function (oldValue, newValue) {
        throw new exceptions_1.ExpressionChangedAfterItHasBeenCheckedException(this._currentBinding().debug, oldValue, newValue, null);
    };
    AbstractChangeDetector.prototype.throwDehydratedError = function (detail) { throw new exceptions_1.DehydratedException(detail); };
    AbstractChangeDetector.prototype._currentBinding = function () {
        return this.bindingTargets[this.propertyBindingIndex];
    };
    return AbstractChangeDetector;
})();
exports.AbstractChangeDetector = AbstractChangeDetector;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RfY2hhbmdlX2RldGVjdG9yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYW5ndWxhcjIvc3JjL2NvcmUvY2hhbmdlX2RldGVjdGlvbi9hYnN0cmFjdF9jaGFuZ2VfZGV0ZWN0b3IudHMiXSwibmFtZXMiOlsiX0NvbnRleHQiLCJfQ29udGV4dC5jb25zdHJ1Y3RvciIsIkFic3RyYWN0Q2hhbmdlRGV0ZWN0b3IiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmNvbnN0cnVjdG9yIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5hZGRDb250ZW50Q2hpbGQiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLnJlbW92ZUNvbnRlbnRDaGlsZCIsIkFic3RyYWN0Q2hhbmdlRGV0ZWN0b3IuYWRkVmlld0NoaWxkIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5yZW1vdmVWaWV3Q2hpbGQiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLnJlbW92ZSIsIkFic3RyYWN0Q2hhbmdlRGV0ZWN0b3IuaGFuZGxlRXZlbnQiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmhhbmRsZUV2ZW50SW50ZXJuYWwiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmRldGVjdENoYW5nZXMiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmNoZWNrTm9DaGFuZ2VzIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5ydW5EZXRlY3RDaGFuZ2VzIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5kZXRlY3RDaGFuZ2VzSW5SZWNvcmRzIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5kZXRlY3RDaGFuZ2VzSW5SZWNvcmRzSW50ZXJuYWwiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmh5ZHJhdGUiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmh5ZHJhdGVEaXJlY3RpdmVzIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5kZWh5ZHJhdGUiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmRlaHlkcmF0ZURpcmVjdGl2ZXMiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmh5ZHJhdGVkIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5kZXN0cm95UmVjdXJzaXZlIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5hZnRlckNvbnRlbnRMaWZlY3ljbGVDYWxsYmFja3MiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmFmdGVyQ29udGVudExpZmVjeWNsZUNhbGxiYWNrc0ludGVybmFsIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5hZnRlclZpZXdMaWZlY3ljbGVDYWxsYmFja3MiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmFmdGVyVmlld0xpZmVjeWNsZUNhbGxiYWNrc0ludGVybmFsIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5fZGV0ZWN0Q2hhbmdlc0NvbnRlbnRDaGlsZHJlbiIsIkFic3RyYWN0Q2hhbmdlRGV0ZWN0b3IuX2RldGVjdENoYW5nZXNJblZpZXdDaGlsZHJlbiIsIkFic3RyYWN0Q2hhbmdlRGV0ZWN0b3IubWFya0FzQ2hlY2tPbmNlIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5tYXJrUGF0aFRvUm9vdEFzQ2hlY2tPbmNlIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5fdW5zdWJzcmliZUZyb21PYnNlcnZhYmxlcyIsIkFic3RyYWN0Q2hhbmdlRGV0ZWN0b3IuX3Vuc3Vic2NyaWJlRnJvbU91dHB1dHMiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLm9ic2VydmVWYWx1ZSIsIkFic3RyYWN0Q2hhbmdlRGV0ZWN0b3Iub2JzZXJ2ZURpcmVjdGl2ZSIsIkFic3RyYWN0Q2hhbmdlRGV0ZWN0b3Iub2JzZXJ2ZUNvbXBvbmVudCIsIkFic3RyYWN0Q2hhbmdlRGV0ZWN0b3IuX2NyZWF0ZUFycmF5VG9TdG9yZU9ic2VydmFibGVzIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5nZXREaXJlY3RpdmVGb3IiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLmdldERldGVjdG9yRm9yIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5ub3RpZnlEaXNwYXRjaGVyIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5sb2dCaW5kaW5nVXBkYXRlIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5hZGRDaGFuZ2UiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLl90aHJvd0Vycm9yIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci50aHJvd09uQ2hhbmdlRXJyb3IiLCJBYnN0cmFjdENoYW5nZURldGVjdG9yLnRocm93RGVoeWRyYXRlZEVycm9yIiwiQWJzdHJhY3RDaGFuZ2VEZXRlY3Rvci5fY3VycmVudEJpbmRpbmciXSwibWFwcGluZ3MiOiJBQUFBLHFCQUFtRSwwQkFBMEIsQ0FBQyxDQUFBO0FBQzlGLDJCQUEwQixnQ0FBZ0MsQ0FBQyxDQUFBO0FBQzNELHNDQUFrQyx5QkFBeUIsQ0FBQyxDQUFBO0FBQzVELG9DQUFvRCx1QkFBdUIsQ0FBQyxDQUFBO0FBSTVFLDJCQU1PLGNBQWMsQ0FBQyxDQUFBO0FBRXRCLHVCQUFxQixpQkFBaUIsQ0FBQyxDQUFBO0FBQ3ZDLDBCQUEyRCxhQUFhLENBQUMsQ0FBQTtBQUN6RSx3QkFBbUQsb0JBQW9CLENBQUMsQ0FBQTtBQUN4RSxrQ0FBMkIscUJBQXFCLENBQUMsQ0FBQTtBQUNqRCxzQkFBZ0MsMkJBQTJCLENBQUMsQ0FBQTtBQUU1RCxJQUFJLFlBQVksR0FBZSx3QkFBYyxDQUFDLG9EQUFvRCxDQUFDLENBQUM7QUFFcEc7SUFDRUEsa0JBQW1CQSxPQUFZQSxFQUFTQSxnQkFBcUJBLEVBQVNBLE9BQVlBLEVBQy9EQSxNQUFXQSxFQUFTQSxRQUFhQSxFQUFTQSxVQUFlQTtRQUR6REMsWUFBT0EsR0FBUEEsT0FBT0EsQ0FBS0E7UUFBU0EscUJBQWdCQSxHQUFoQkEsZ0JBQWdCQSxDQUFLQTtRQUFTQSxZQUFPQSxHQUFQQSxPQUFPQSxDQUFLQTtRQUMvREEsV0FBTUEsR0FBTkEsTUFBTUEsQ0FBS0E7UUFBU0EsYUFBUUEsR0FBUkEsUUFBUUEsQ0FBS0E7UUFBU0EsZUFBVUEsR0FBVkEsVUFBVUEsQ0FBS0E7SUFBR0EsQ0FBQ0E7SUFDbEZELGVBQUNBO0FBQURBLENBQUNBLEFBSEQsSUFHQztBQUVEO0lBdUJFRSxnQ0FBbUJBLEVBQVVBLEVBQVNBLDRCQUFvQ0EsRUFDdkRBLGNBQStCQSxFQUFTQSxnQkFBa0NBLEVBQzFFQSxRQUFpQ0E7UUFGakNDLE9BQUVBLEdBQUZBLEVBQUVBLENBQVFBO1FBQVNBLGlDQUE0QkEsR0FBNUJBLDRCQUE0QkEsQ0FBUUE7UUFDdkRBLG1CQUFjQSxHQUFkQSxjQUFjQSxDQUFpQkE7UUFBU0EscUJBQWdCQSxHQUFoQkEsZ0JBQWdCQSxDQUFrQkE7UUFDMUVBLGFBQVFBLEdBQVJBLFFBQVFBLENBQXlCQTtRQXhCcERBLG9CQUFlQSxHQUFVQSxFQUFFQSxDQUFDQTtRQUM1QkEsaUJBQVlBLEdBQVVBLEVBQUVBLENBQUNBO1FBSXpCQSxrRkFBa0ZBO1FBQ2xGQSw4QkFBOEJBO1FBQzlCQSxVQUFLQSxHQUF3QkEsK0JBQW1CQSxDQUFDQSxZQUFZQSxDQUFDQTtRQUU5REEsV0FBTUEsR0FBV0EsSUFBSUEsQ0FBQ0E7UUFDdEJBLFNBQUlBLEdBQTRCQSxJQUFJQSxDQUFDQTtRQUNyQ0EsVUFBS0EsR0FBVUEsSUFBSUEsQ0FBQ0E7UUFjbEJBLElBQUlBLENBQUNBLEdBQUdBLEdBQUdBLElBQUlBLHdDQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDMUNBLENBQUNBO0lBRURELGdEQUFlQSxHQUFmQSxVQUFnQkEsRUFBa0JBO1FBQ2hDRSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUM5QkEsRUFBRUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDbkJBLENBQUNBO0lBRURGLG1EQUFrQkEsR0FBbEJBLFVBQW1CQSxFQUFrQkEsSUFBVUcsd0JBQVdBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBRTlGSCw2Q0FBWUEsR0FBWkEsVUFBYUEsRUFBa0JBO1FBQzdCSSxJQUFJQSxDQUFDQSxZQUFZQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUMzQkEsRUFBRUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7SUFDbkJBLENBQUNBO0lBRURKLGdEQUFlQSxHQUFmQSxVQUFnQkEsRUFBa0JBLElBQVVLLHdCQUFXQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxZQUFZQSxFQUFFQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUV4RkwsdUNBQU1BLEdBQU5BLGNBQWlCTSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxrQkFBa0JBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO0lBRXhETiw0Q0FBV0EsR0FBWEEsVUFBWUEsU0FBaUJBLEVBQUVBLE9BQWVBLEVBQUVBLEtBQVVBO1FBQ3hETyxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQkEsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFJQSxJQUFJQSxDQUFDQSxFQUFFQSxZQUFPQSxTQUFXQSxDQUFDQSxDQUFDQTtRQUMxREEsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0E7WUFDSEEsSUFBSUEsTUFBTUEsR0FBR0EsSUFBSUEsR0FBR0EsRUFBZUEsQ0FBQ0E7WUFDcENBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO1lBQzVCQSxJQUFJQSxHQUFHQSxHQUFHQSxDQUFDQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLFNBQVNBLEVBQUVBLE9BQU9BLEVBQUVBLElBQUlBLGVBQU1BLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLEVBQUVBLE1BQU1BLENBQUNBLENBQUNBLENBQUNBO1lBQ3pGQSxJQUFJQSxDQUFDQSx5QkFBeUJBLEVBQUVBLENBQUNBO1lBQ2pDQSxNQUFNQSxDQUFDQSxHQUFHQSxDQUFDQTtRQUNiQSxDQUFFQTtRQUFBQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNYQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxFQUFFQSxPQUFPQSxFQUFFQSxJQUFJQSxDQUFDQSxDQUFDQTtZQUM3REEsSUFBSUEsT0FBT0EsR0FBR0EsZ0JBQVNBLENBQUNBLENBQUNBLENBQUNBO2dCQUNSQSxJQUFJQSx3Q0FBMkJBLENBQUNBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsT0FBT0EsRUFDeENBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLENBQUNBLFFBQVFBLENBQUNBO2dCQUNyREEsSUFBSUEsQ0FBQ0E7WUFDdkJBLE1BQU1BLElBQUlBLGlDQUFvQkEsQ0FBQ0EsU0FBU0EsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsS0FBS0EsRUFBRUEsT0FBT0EsQ0FBQ0EsQ0FBQ0E7UUFDakVBLENBQUNBO0lBQ0hBLENBQUNBO0lBRURQLG9EQUFtQkEsR0FBbkJBLFVBQW9CQSxTQUFpQkEsRUFBRUEsT0FBZUEsRUFBRUEsTUFBY0EsSUFBYVEsTUFBTUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFFbEdSLDhDQUFhQSxHQUFiQSxjQUF3QlMsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUV2RFQsK0NBQWNBLEdBQWRBO1FBQ0VVLEVBQUVBLENBQUNBLENBQUNBLHdCQUFpQkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeEJBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFDOUJBLENBQUNBO0lBQ0hBLENBQUNBO0lBRURWLGlEQUFnQkEsR0FBaEJBLFVBQWlCQSxhQUFzQkE7UUFDckNXLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLG1DQUF1QkEsQ0FBQ0EsUUFBUUE7WUFDOUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLG1DQUF1QkEsQ0FBQ0EsT0FBT0EsSUFBSUEsSUFBSUEsQ0FBQ0EsS0FBS0EsS0FBS0EsK0JBQW1CQSxDQUFDQSxPQUFPQSxDQUFDQTtZQUM5RkEsTUFBTUEsQ0FBQ0E7UUFDVEEsSUFBSUEsQ0FBQ0EsR0FBR0EsWUFBWUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsRUFBRUEsYUFBYUEsQ0FBQ0EsQ0FBQ0E7UUFFN0NBLElBQUlBLENBQUNBLHNCQUFzQkEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7UUFFM0NBLElBQUlBLENBQUNBLDZCQUE2QkEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7UUFDbERBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLDhCQUE4QkEsRUFBRUEsQ0FBQ0E7UUFFMURBLElBQUlBLENBQUNBLDRCQUE0QkEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7UUFDakRBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLGFBQWFBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLDJCQUEyQkEsRUFBRUEsQ0FBQ0E7UUFFdkRBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLEtBQUtBLG1DQUF1QkEsQ0FBQ0EsU0FBU0EsQ0FBQ0E7WUFDbERBLElBQUlBLENBQUNBLElBQUlBLEdBQUdBLG1DQUF1QkEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7UUFFOUNBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLCtCQUFtQkEsQ0FBQ0EsYUFBYUEsQ0FBQ0E7UUFDL0NBLGtCQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUNkQSxDQUFDQTtJQUVEWCxxRkFBcUZBO0lBQ3JGQSw4RkFBOEZBO0lBQzlGQSxtQ0FBbUNBO0lBQ25DQSxrRkFBa0ZBO0lBQ2xGQSxnR0FBZ0dBO0lBQ2hHQSw4QkFBOEJBO0lBQzlCQSx1REFBc0JBLEdBQXRCQSxVQUF1QkEsYUFBc0JBO1FBQzNDWSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNyQkEsSUFBSUEsQ0FBQ0Esb0JBQW9CQSxDQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQTtRQUNyQ0EsQ0FBQ0E7UUFDREEsSUFBSUEsQ0FBQ0E7WUFDSEEsSUFBSUEsQ0FBQ0EsOEJBQThCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQTtRQUNyREEsQ0FBRUE7UUFBQUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDWEEsdURBQXVEQTtZQUN2REEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsWUFBWUEsNERBQStDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDcEVBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLCtCQUFtQkEsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDM0NBLENBQUNBO1lBQ0RBLElBQUlBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBO1FBQy9CQSxDQUFDQTtJQUNIQSxDQUFDQTtJQUVEWiw0RkFBNEZBO0lBQzVGQSxrR0FBa0dBO0lBQ2xHQSxpQ0FBaUNBO0lBQ2pDQSxpR0FBaUdBO0lBQ2pHQSxNQUFNQTtJQUNOQSx5RkFBeUZBO0lBQ3pGQSwrREFBOEJBLEdBQTlCQSxVQUErQkEsYUFBc0JBLElBQVNhLENBQUNBO0lBRS9EYixxRkFBcUZBO0lBQ3JGQSx5Q0FBeUNBO0lBQ3pDQSx3Q0FBT0EsR0FBUEEsVUFBUUEsT0FBVUEsRUFBRUEsTUFBY0EsRUFBRUEsVUFBNEJBLEVBQUVBLEtBQVlBO1FBQzVFYyxJQUFJQSxDQUFDQSxVQUFVQSxHQUFHQSxVQUFVQSxDQUFDQTtRQUM3QkEsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsMkNBQW1CQSxDQUFDQSxtQkFBbUJBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO1FBQ25FQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxPQUFPQSxDQUFDQTtRQUV2QkEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsS0FBS0EsbUNBQXVCQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM1REEsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxPQUFPQSxDQUFDQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7UUFFREEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsTUFBTUEsQ0FBQ0E7UUFDckJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLEtBQUtBLENBQUNBO1FBQ25CQSxJQUFJQSxDQUFDQSxpQkFBaUJBLENBQUNBLFVBQVVBLENBQUNBLENBQUNBO1FBQ25DQSxJQUFJQSxDQUFDQSxLQUFLQSxHQUFHQSwrQkFBbUJBLENBQUNBLFlBQVlBLENBQUNBO0lBQ2hEQSxDQUFDQTtJQUVEZCxvRUFBb0VBO0lBQ3BFQSxrREFBaUJBLEdBQWpCQSxVQUFrQkEsVUFBNEJBLElBQVNlLENBQUNBO0lBRXhEZixxRkFBcUZBO0lBQ3JGQSwyQ0FBMkNBO0lBQzNDQSwwQ0FBU0EsR0FBVEE7UUFDRWdCLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7UUFFL0JBLHVEQUF1REE7UUFDdkRBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLEtBQUtBLG1DQUF1QkEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDNURBLElBQUlBLENBQUNBLDBCQUEwQkEsRUFBRUEsQ0FBQ0E7UUFDcENBLENBQUNBO1FBRURBLElBQUlBLENBQUNBLHVCQUF1QkEsRUFBRUEsQ0FBQ0E7UUFFL0JBLElBQUlBLENBQUNBLFVBQVVBLEdBQUdBLElBQUlBLENBQUNBO1FBQ3ZCQSxJQUFJQSxDQUFDQSxPQUFPQSxHQUFHQSxJQUFJQSxDQUFDQTtRQUNwQkEsSUFBSUEsQ0FBQ0EsTUFBTUEsR0FBR0EsSUFBSUEsQ0FBQ0E7UUFDbkJBLElBQUlBLENBQUNBLEtBQUtBLEdBQUdBLElBQUlBLENBQUNBO0lBQ3BCQSxDQUFDQTtJQUVEaEIsaUdBQWlHQTtJQUNqR0Esd0NBQXdDQTtJQUN4Q0Esb0RBQW1CQSxHQUFuQkEsVUFBb0JBLFlBQXFCQSxJQUFTaUIsQ0FBQ0E7SUFFbkRqQix5Q0FBUUEsR0FBUkEsY0FBc0JrQixNQUFNQSxDQUFDQSxnQkFBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFFdkRsQixpREFBZ0JBLEdBQWhCQTtRQUNFbUIsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0E7UUFDbENBLElBQUlBLENBQUNBLFNBQVNBLEVBQUVBLENBQUNBO1FBQ2pCQSxJQUFJQSxRQUFRQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtRQUNwQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsUUFBUUEsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0EsRUFBRUEsRUFBRUEsQ0FBQ0E7WUFDekNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLGdCQUFnQkEsRUFBRUEsQ0FBQ0E7UUFDakNBLENBQUNBO1FBQ0RBLFFBQVFBLEdBQUdBLElBQUlBLENBQUNBLFlBQVlBLENBQUNBO1FBQzdCQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxHQUFHQSxDQUFDQSxFQUFFQSxDQUFDQSxHQUFHQSxRQUFRQSxDQUFDQSxNQUFNQSxFQUFFQSxDQUFDQSxFQUFFQSxFQUFFQSxDQUFDQTtZQUN6Q0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsZ0JBQWdCQSxFQUFFQSxDQUFDQTtRQUNqQ0EsQ0FBQ0E7SUFDSEEsQ0FBQ0E7SUFFRG5CLCtEQUE4QkEsR0FBOUJBO1FBQ0VvQixJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSx5QkFBeUJBLEVBQUVBLENBQUNBO1FBQzVDQSxJQUFJQSxDQUFDQSxzQ0FBc0NBLEVBQUVBLENBQUNBO0lBQ2hEQSxDQUFDQTtJQUVEcEIsdUVBQXNDQSxHQUF0Q0EsY0FBZ0RxQixDQUFDQTtJQUVqRHJCLDREQUEyQkEsR0FBM0JBO1FBQ0VzQixJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxzQkFBc0JBLEVBQUVBLENBQUNBO1FBQ3pDQSxJQUFJQSxDQUFDQSxtQ0FBbUNBLEVBQUVBLENBQUNBO0lBQzdDQSxDQUFDQTtJQUVEdEIsb0VBQW1DQSxHQUFuQ0EsY0FBNkN1QixDQUFDQTtJQUU5Q3ZCLGdCQUFnQkE7SUFDaEJBLDhEQUE2QkEsR0FBN0JBLFVBQThCQSxhQUFzQkE7UUFDbER3QixJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxlQUFlQSxDQUFDQTtRQUM3QkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7WUFDbENBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0E7UUFDdkNBLENBQUNBO0lBQ0hBLENBQUNBO0lBRUR4QixnQkFBZ0JBO0lBQ2hCQSw2REFBNEJBLEdBQTVCQSxVQUE2QkEsYUFBc0JBO1FBQ2pEeUIsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsWUFBWUEsQ0FBQ0E7UUFDMUJBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLEVBQUVBLENBQUNBLEVBQUVBLENBQUNBO1lBQ2xDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxnQkFBZ0JBLENBQUNBLGFBQWFBLENBQUNBLENBQUNBO1FBQ3ZDQSxDQUFDQTtJQUNIQSxDQUFDQTtJQUVEekIsZ0RBQWVBLEdBQWZBLGNBQTBCMEIsSUFBSUEsQ0FBQ0EsSUFBSUEsR0FBR0EsbUNBQXVCQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQTtJQUUxRTFCLDBEQUF5QkEsR0FBekJBO1FBQ0UyQixJQUFJQSxDQUFDQSxHQUFtQkEsSUFBSUEsQ0FBQ0E7UUFDN0JBLE9BQU9BLGdCQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxtQ0FBdUJBLENBQUNBLFFBQVFBLEVBQUVBLENBQUNBO1lBQ25FQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxLQUFLQSxtQ0FBdUJBLENBQUNBLE9BQU9BLENBQUNBO2dCQUFDQSxDQUFDQSxDQUFDQSxJQUFJQSxHQUFHQSxtQ0FBdUJBLENBQUNBLFNBQVNBLENBQUNBO1lBQzNGQSxDQUFDQSxHQUFHQSxDQUFDQSxDQUFDQSxNQUFNQSxDQUFDQTtRQUNmQSxDQUFDQTtJQUNIQSxDQUFDQTtJQUVEM0IsdURBQXVEQTtJQUMvQ0EsMkRBQTBCQSxHQUFsQ0E7UUFDRTRCLEVBQUVBLENBQUNBLENBQUNBLGdCQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNsQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsRUFBRUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ25EQSxJQUFJQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUJBLEVBQUVBLENBQUNBLENBQUNBLGdCQUFTQSxDQUFDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtvQkFDckNBLENBQUNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBO29CQUNYQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxDQUFDQTtnQkFDL0JBLENBQUNBO1lBQ0hBLENBQUNBO1FBQ0hBLENBQUNBO0lBQ0hBLENBQUNBO0lBRU81Qix3REFBdUJBLEdBQS9CQTtRQUNFNkIsRUFBRUEsQ0FBQ0EsQ0FBQ0EsZ0JBQVNBLENBQUNBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDeENBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsTUFBTUEsRUFBRUEsRUFBRUEsQ0FBQ0EsRUFBRUEsQ0FBQ0E7Z0JBQ3pEQSx5QkFBaUJBLENBQUNBLE9BQU9BLENBQUNBLElBQUlBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZEQSxJQUFJQSxDQUFDQSxtQkFBbUJBLENBQUNBLENBQUNBLENBQUNBLEdBQUdBLElBQUlBLENBQUNBO1lBQ3JDQSxDQUFDQTtRQUNIQSxDQUFDQTtJQUNIQSxDQUFDQTtJQUVEN0IsdURBQXVEQTtJQUN2REEsNkNBQVlBLEdBQVpBLFVBQWFBLEtBQVVBLEVBQUVBLEtBQWFBO1FBQXRDOEIsaUJBYUNBO1FBWkNBLEVBQUVBLENBQUNBLENBQUNBLGdDQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsQ0FBQ0EsOEJBQThCQSxFQUFFQSxDQUFDQTtZQUN0Q0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsY0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ3ZDQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTtnQkFDcENBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBLElBQUtBLE9BQUFBLEtBQUlBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLEVBQUVBLEVBQXZCQSxDQUF1QkEsQ0FBQ0EsQ0FBQ0E7WUFDbkZBLENBQUNBO1lBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLEtBQUtBLENBQUNBLEtBQUtBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBO2dCQUNqREEsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsTUFBTUEsRUFBRUEsQ0FBQ0E7Z0JBQ25DQSxJQUFJQSxDQUFDQSxPQUFPQSxDQUFDQSxLQUFLQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQTtnQkFDcENBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBLElBQUtBLE9BQUFBLEtBQUlBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLEVBQUVBLEVBQXZCQSxDQUF1QkEsQ0FBQ0EsQ0FBQ0E7WUFDbkZBLENBQUNBO1FBQ0hBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2ZBLENBQUNBO0lBRUQ5Qix1REFBdURBO0lBQ3ZEQSxpREFBZ0JBLEdBQWhCQSxVQUFpQkEsS0FBVUEsRUFBRUEsS0FBYUE7UUFBMUMrQixpQkFRQ0E7UUFQQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsZ0NBQVlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3hCQSxJQUFJQSxDQUFDQSw4QkFBOEJBLEVBQUVBLENBQUNBO1lBQ3RDQSxJQUFJQSxVQUFVQSxHQUFHQSxJQUFJQSxDQUFDQSw0QkFBNEJBLEdBQUdBLEtBQUtBLEdBQUdBLENBQUNBLENBQUNBLENBQUVBLGtCQUFrQkE7WUFDbkZBLElBQUlBLENBQUNBLE9BQU9BLENBQUNBLFVBQVVBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBO1lBQ3pDQSxJQUFJQSxDQUFDQSxhQUFhQSxDQUFDQSxVQUFVQSxDQUFDQSxHQUFHQSxLQUFLQSxDQUFDQSxPQUFPQSxDQUFDQSxNQUFNQSxDQUFDQSxVQUFDQSxDQUFDQSxJQUFLQSxPQUFBQSxLQUFJQSxDQUFDQSxHQUFHQSxDQUFDQSxZQUFZQSxFQUFFQSxFQUF2QkEsQ0FBdUJBLENBQUNBLENBQUNBO1FBQ3hGQSxDQUFDQTtRQUNEQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtJQUNmQSxDQUFDQTtJQUVEL0IsdURBQXVEQTtJQUN2REEsaURBQWdCQSxHQUFoQkEsVUFBaUJBLEtBQVVBO1FBQTNCZ0MsaUJBUUNBO1FBUENBLEVBQUVBLENBQUNBLENBQUNBLGdDQUFZQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUN4QkEsSUFBSUEsQ0FBQ0EsOEJBQThCQSxFQUFFQSxDQUFDQTtZQUN0Q0EsSUFBSUEsS0FBS0EsR0FBR0EsSUFBSUEsQ0FBQ0EsNEJBQTRCQSxHQUFHQSxDQUFDQSxDQUFDQTtZQUNsREEsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBQ0EsS0FBS0EsQ0FBQ0EsR0FBR0EsS0FBS0EsQ0FBQ0EsT0FBT0EsQ0FBQ0E7WUFDcENBLElBQUlBLENBQUNBLGFBQWFBLENBQUNBLEtBQUtBLENBQUNBLEdBQUdBLEtBQUtBLENBQUNBLE9BQU9BLENBQUNBLE1BQU1BLENBQUNBLFVBQUNBLENBQUNBLElBQUtBLE9BQUFBLEtBQUlBLENBQUNBLEdBQUdBLENBQUNBLFlBQVlBLEVBQUVBLEVBQXZCQSxDQUF1QkEsQ0FBQ0EsQ0FBQ0E7UUFDbkZBLENBQUNBO1FBQ0RBLE1BQU1BLENBQUNBLEtBQUtBLENBQUNBO0lBQ2ZBLENBQUNBO0lBRU9oQywrREFBOEJBLEdBQXRDQTtRQUNFaUMsRUFBRUEsQ0FBQ0EsQ0FBQ0EsY0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsYUFBYUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDaENBLElBQUlBLENBQUNBLGFBQWFBLEdBQUdBLHdCQUFXQSxDQUFDQSxlQUFlQSxDQUFDQSxJQUFJQSxDQUFDQSw0QkFBNEJBO2dCQUNqQ0EsSUFBSUEsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxNQUFNQSxHQUFHQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNuRkEsSUFBSUEsQ0FBQ0EsT0FBT0EsR0FBR0Esd0JBQVdBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLDRCQUE0QkE7Z0JBQ2pDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLE1BQU1BLEdBQUdBLENBQUNBLENBQUNBLENBQUNBO1FBQy9FQSxDQUFDQTtJQUNIQSxDQUFDQTtJQUVEakMsZ0RBQWVBLEdBQWZBLFVBQWdCQSxVQUFlQSxFQUFFQSxLQUFhQTtRQUM1Q2tDLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLGVBQWVBLENBQUNBLElBQUlBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFDbEVBLENBQUNBO0lBRURsQywrQ0FBY0EsR0FBZEEsVUFBZUEsVUFBZUEsRUFBRUEsS0FBYUE7UUFDM0NtQyxNQUFNQSxDQUFDQSxVQUFVQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxnQkFBZ0JBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBO0lBQ2pFQSxDQUFDQTtJQUVEbkMsaURBQWdCQSxHQUFoQkEsVUFBaUJBLEtBQVVBO1FBQ3pCb0MsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsRUFBRUEsS0FBS0EsQ0FBQ0EsQ0FBQ0E7SUFDakVBLENBQUNBO0lBRURwQyxpREFBZ0JBLEdBQWhCQSxVQUFpQkEsS0FBVUE7UUFDekJxQyxJQUFJQSxDQUFDQSxVQUFVQSxDQUFDQSxnQkFBZ0JBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLEVBQUVBLEtBQUtBLENBQUNBLENBQUNBO0lBQ2xFQSxDQUFDQTtJQUVEckMsMENBQVNBLEdBQVRBLFVBQVVBLE9BQTZCQSxFQUFFQSxRQUFhQSxFQUFFQSxRQUFhQTtRQUNuRXNDLEVBQUVBLENBQUNBLENBQUNBLGNBQU9BLENBQUNBLE9BQU9BLENBQUNBLENBQUNBLENBQUNBLENBQUNBO1lBQ3JCQSxPQUFPQSxHQUFHQSxFQUFFQSxDQUFDQTtRQUNmQSxDQUFDQTtRQUNEQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQSxJQUFJQSxDQUFDQSxHQUFHQSwyQ0FBbUJBLENBQUNBLFlBQVlBLENBQUNBLFFBQVFBLEVBQUVBLFFBQVFBLENBQUNBLENBQUNBO1FBQzVGQSxNQUFNQSxDQUFDQSxPQUFPQSxDQUFDQTtJQUNqQkEsQ0FBQ0E7SUFFT3RDLDRDQUFXQSxHQUFuQkEsVUFBb0JBLFNBQWNBLEVBQUVBLEtBQVVBO1FBQzVDdUMsSUFBSUEsS0FBS0EsQ0FBQ0E7UUFDVkEsSUFBSUEsQ0FBQ0E7WUFDSEEsSUFBSUEsQ0FBQ0EsR0FBR0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsZUFBZUEsQ0FBQ0EsSUFBSUEsRUFBRUEsSUFBSUEsQ0FBQ0EsZUFBZUEsRUFBRUEsQ0FBQ0EsWUFBWUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDekZBLElBQUlBLE9BQU9BLEdBQUdBLGdCQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxHQUFHQSxJQUFJQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQSxPQUFPQSxFQUFFQSxDQUFDQSxDQUFDQSxnQkFBZ0JBLEVBQUVBLENBQUNBLENBQUNBLE9BQU9BLEVBQUVBLENBQUNBLENBQUNBLE1BQU1BLEVBQ2xEQSxDQUFDQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQSxLQUFLQSxDQUFDQTtnQkFDdERBLElBQUlBLENBQUNBO1lBQ2xDQSxLQUFLQSxHQUFHQSxJQUFJQSxpQ0FBb0JBLENBQUNBLElBQUlBLENBQUNBLGVBQWVBLEVBQUVBLENBQUNBLEtBQUtBLEVBQUVBLFNBQVNBLEVBQUVBLEtBQUtBLEVBQUVBLE9BQU9BLENBQUNBLENBQUNBO1FBQzVGQSxDQUFFQTtRQUFBQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUNYQSx3RkFBd0ZBO1lBQ3hGQSxpQ0FBaUNBO1lBQ2pDQSxLQUFLQSxHQUFHQSxJQUFJQSxpQ0FBb0JBLENBQUNBLElBQUlBLEVBQUVBLFNBQVNBLEVBQUVBLEtBQUtBLEVBQUVBLElBQUlBLENBQUNBLENBQUNBO1FBQ2pFQSxDQUFDQTtRQUNEQSxNQUFNQSxLQUFLQSxDQUFDQTtJQUNkQSxDQUFDQTtJQUVEdkMsbURBQWtCQSxHQUFsQkEsVUFBbUJBLFFBQWFBLEVBQUVBLFFBQWFBO1FBQzdDd0MsTUFBTUEsSUFBSUEsNERBQStDQSxDQUFDQSxJQUFJQSxDQUFDQSxlQUFlQSxFQUFFQSxDQUFDQSxLQUFLQSxFQUM1QkEsUUFBUUEsRUFBRUEsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsQ0FBQ0E7SUFDdEZBLENBQUNBO0lBRUR4QyxxREFBb0JBLEdBQXBCQSxVQUFxQkEsTUFBY0EsSUFBVXlDLE1BQU1BLElBQUlBLGdDQUFtQkEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7SUFFN0V6QyxnREFBZUEsR0FBdkJBO1FBQ0UwQyxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBO0lBQ3hEQSxDQUFDQTtJQUNIMUMsNkJBQUNBO0FBQURBLENBQUNBLEFBclZELElBcVZDO0FBclZZLDhCQUFzQix5QkFxVmxDLENBQUEiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge2Fzc2VydGlvbnNFbmFibGVkLCBpc1ByZXNlbnQsIGlzQmxhbmssIFN0cmluZ1dyYXBwZXJ9IGZyb20gJ2FuZ3VsYXIyL3NyYy9mYWNhZGUvbGFuZyc7XG5pbXBvcnQge0xpc3RXcmFwcGVyfSBmcm9tICdhbmd1bGFyMi9zcmMvZmFjYWRlL2NvbGxlY3Rpb24nO1xuaW1wb3J0IHtDaGFuZ2VEZXRlY3Rpb25VdGlsfSBmcm9tICcuL2NoYW5nZV9kZXRlY3Rpb25fdXRpbCc7XG5pbXBvcnQge0NoYW5nZURldGVjdG9yUmVmLCBDaGFuZ2VEZXRlY3RvclJlZl99IGZyb20gJy4vY2hhbmdlX2RldGVjdG9yX3JlZic7XG5pbXBvcnQge0RpcmVjdGl2ZUluZGV4fSBmcm9tICcuL2RpcmVjdGl2ZV9yZWNvcmQnO1xuaW1wb3J0IHtDaGFuZ2VEZXRlY3RvciwgQ2hhbmdlRGlzcGF0Y2hlcn0gZnJvbSAnLi9pbnRlcmZhY2VzJztcbmltcG9ydCB7UGlwZXN9IGZyb20gJy4vcGlwZXMnO1xuaW1wb3J0IHtcbiAgQ2hhbmdlRGV0ZWN0aW9uRXJyb3IsXG4gIEV4cHJlc3Npb25DaGFuZ2VkQWZ0ZXJJdEhhc0JlZW5DaGVja2VkRXhjZXB0aW9uLFxuICBEZWh5ZHJhdGVkRXhjZXB0aW9uLFxuICBFdmVudEV2YWx1YXRpb25FcnJvckNvbnRleHQsXG4gIEV2ZW50RXZhbHVhdGlvbkVycm9yXG59IGZyb20gJy4vZXhjZXB0aW9ucyc7XG5pbXBvcnQge0JpbmRpbmdUYXJnZXR9IGZyb20gJy4vYmluZGluZ19yZWNvcmQnO1xuaW1wb3J0IHtMb2NhbHN9IGZyb20gJy4vcGFyc2VyL2xvY2Fscyc7XG5pbXBvcnQge0NoYW5nZURldGVjdGlvblN0cmF0ZWd5LCBDaGFuZ2VEZXRlY3RvclN0YXRlfSBmcm9tICcuL2NvbnN0YW50cyc7XG5pbXBvcnQge3d0ZkNyZWF0ZVNjb3BlLCB3dGZMZWF2ZSwgV3RmU2NvcGVGbn0gZnJvbSAnLi4vcHJvZmlsZS9wcm9maWxlJztcbmltcG9ydCB7aXNPYnNlcnZhYmxlfSBmcm9tICcuL29ic2VydmFibGVfZmFjYWRlJztcbmltcG9ydCB7T2JzZXJ2YWJsZVdyYXBwZXJ9IGZyb20gJ2FuZ3VsYXIyL3NyYy9mYWNhZGUvYXN5bmMnO1xuXG52YXIgX3Njb3BlX2NoZWNrOiBXdGZTY29wZUZuID0gd3RmQ3JlYXRlU2NvcGUoYENoYW5nZURldGVjdG9yI2NoZWNrKGFzY2lpIGlkLCBib29sIHRocm93T25DaGFuZ2UpYCk7XG5cbmNsYXNzIF9Db250ZXh0IHtcbiAgY29uc3RydWN0b3IocHVibGljIGVsZW1lbnQ6IGFueSwgcHVibGljIGNvbXBvbmVudEVsZW1lbnQ6IGFueSwgcHVibGljIGNvbnRleHQ6IGFueSxcbiAgICAgICAgICAgICAgcHVibGljIGxvY2FsczogYW55LCBwdWJsaWMgaW5qZWN0b3I6IGFueSwgcHVibGljIGV4cHJlc3Npb246IGFueSkge31cbn1cblxuZXhwb3J0IGNsYXNzIEFic3RyYWN0Q2hhbmdlRGV0ZWN0b3I8VD4gaW1wbGVtZW50cyBDaGFuZ2VEZXRlY3RvciB7XG4gIGNvbnRlbnRDaGlsZHJlbjogYW55W10gPSBbXTtcbiAgdmlld0NoaWxkcmVuOiBhbnlbXSA9IFtdO1xuICBwYXJlbnQ6IENoYW5nZURldGVjdG9yO1xuICByZWY6IENoYW5nZURldGVjdG9yUmVmO1xuXG4gIC8vIFRoZSBuYW1lcyBvZiB0aGUgYmVsb3cgZmllbGRzIG11c3QgYmUga2VwdCBpbiBzeW5jIHdpdGggY29kZWdlbl9uYW1lX3V0aWwudHMgb3JcbiAgLy8gY2hhbmdlIGRldGVjdGlvbiB3aWxsIGZhaWwuXG4gIHN0YXRlOiBDaGFuZ2VEZXRlY3RvclN0YXRlID0gQ2hhbmdlRGV0ZWN0b3JTdGF0ZS5OZXZlckNoZWNrZWQ7XG4gIGNvbnRleHQ6IFQ7XG4gIGxvY2FsczogTG9jYWxzID0gbnVsbDtcbiAgbW9kZTogQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kgPSBudWxsO1xuICBwaXBlczogUGlwZXMgPSBudWxsO1xuICBwcm9wZXJ0eUJpbmRpbmdJbmRleDogbnVtYmVyO1xuICBvdXRwdXRTdWJzY3JpcHRpb25zOiBhbnlbXTtcblxuICAvLyBUaGlzIGlzIGFuIGV4cGVyaW1lbnRhbCBmZWF0dXJlLiBXb3JrcyBvbmx5IGluIERhcnQuXG4gIHN1YnNjcmlwdGlvbnM6IGFueVtdO1xuICBzdHJlYW1zOiBhbnlbXTtcblxuICBkaXNwYXRjaGVyOiBDaGFuZ2VEaXNwYXRjaGVyO1xuXG5cbiAgY29uc3RydWN0b3IocHVibGljIGlkOiBzdHJpbmcsIHB1YmxpYyBudW1iZXJPZlByb3BlcnR5UHJvdG9SZWNvcmRzOiBudW1iZXIsXG4gICAgICAgICAgICAgIHB1YmxpYyBiaW5kaW5nVGFyZ2V0czogQmluZGluZ1RhcmdldFtdLCBwdWJsaWMgZGlyZWN0aXZlSW5kaWNlczogRGlyZWN0aXZlSW5kZXhbXSxcbiAgICAgICAgICAgICAgcHVibGljIHN0cmF0ZWd5OiBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneSkge1xuICAgIHRoaXMucmVmID0gbmV3IENoYW5nZURldGVjdG9yUmVmXyh0aGlzKTtcbiAgfVxuXG4gIGFkZENvbnRlbnRDaGlsZChjZDogQ2hhbmdlRGV0ZWN0b3IpOiB2b2lkIHtcbiAgICB0aGlzLmNvbnRlbnRDaGlsZHJlbi5wdXNoKGNkKTtcbiAgICBjZC5wYXJlbnQgPSB0aGlzO1xuICB9XG5cbiAgcmVtb3ZlQ29udGVudENoaWxkKGNkOiBDaGFuZ2VEZXRlY3Rvcik6IHZvaWQgeyBMaXN0V3JhcHBlci5yZW1vdmUodGhpcy5jb250ZW50Q2hpbGRyZW4sIGNkKTsgfVxuXG4gIGFkZFZpZXdDaGlsZChjZDogQ2hhbmdlRGV0ZWN0b3IpOiB2b2lkIHtcbiAgICB0aGlzLnZpZXdDaGlsZHJlbi5wdXNoKGNkKTtcbiAgICBjZC5wYXJlbnQgPSB0aGlzO1xuICB9XG5cbiAgcmVtb3ZlVmlld0NoaWxkKGNkOiBDaGFuZ2VEZXRlY3Rvcik6IHZvaWQgeyBMaXN0V3JhcHBlci5yZW1vdmUodGhpcy52aWV3Q2hpbGRyZW4sIGNkKTsgfVxuXG4gIHJlbW92ZSgpOiB2b2lkIHsgdGhpcy5wYXJlbnQucmVtb3ZlQ29udGVudENoaWxkKHRoaXMpOyB9XG5cbiAgaGFuZGxlRXZlbnQoZXZlbnROYW1lOiBzdHJpbmcsIGVsSW5kZXg6IG51bWJlciwgZXZlbnQ6IGFueSk6IGJvb2xlYW4ge1xuICAgIGlmICghdGhpcy5oeWRyYXRlZCgpKSB7XG4gICAgICB0aGlzLnRocm93RGVoeWRyYXRlZEVycm9yKGAke3RoaXMuaWR9IC0+ICR7ZXZlbnROYW1lfWApO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgdmFyIGxvY2FscyA9IG5ldyBNYXA8c3RyaW5nLCBhbnk+KCk7XG4gICAgICBsb2NhbHMuc2V0KCckZXZlbnQnLCBldmVudCk7XG4gICAgICB2YXIgcmVzID0gIXRoaXMuaGFuZGxlRXZlbnRJbnRlcm5hbChldmVudE5hbWUsIGVsSW5kZXgsIG5ldyBMb2NhbHModGhpcy5sb2NhbHMsIGxvY2FscykpO1xuICAgICAgdGhpcy5tYXJrUGF0aFRvUm9vdEFzQ2hlY2tPbmNlKCk7XG4gICAgICByZXR1cm4gcmVzO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHZhciBjID0gdGhpcy5kaXNwYXRjaGVyLmdldERlYnVnQ29udGV4dChudWxsLCBlbEluZGV4LCBudWxsKTtcbiAgICAgIHZhciBjb250ZXh0ID0gaXNQcmVzZW50KGMpID9cbiAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBFdmVudEV2YWx1YXRpb25FcnJvckNvbnRleHQoYy5lbGVtZW50LCBjLmNvbXBvbmVudEVsZW1lbnQsIGMuY29udGV4dCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYy5sb2NhbHMsIGMuaW5qZWN0b3IpIDpcbiAgICAgICAgICAgICAgICAgICAgICAgIG51bGw7XG4gICAgICB0aHJvdyBuZXcgRXZlbnRFdmFsdWF0aW9uRXJyb3IoZXZlbnROYW1lLCBlLCBlLnN0YWNrLCBjb250ZXh0KTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVFdmVudEludGVybmFsKGV2ZW50TmFtZTogc3RyaW5nLCBlbEluZGV4OiBudW1iZXIsIGxvY2FsczogTG9jYWxzKTogYm9vbGVhbiB7IHJldHVybiBmYWxzZTsgfVxuXG4gIGRldGVjdENoYW5nZXMoKTogdm9pZCB7IHRoaXMucnVuRGV0ZWN0Q2hhbmdlcyhmYWxzZSk7IH1cblxuICBjaGVja05vQ2hhbmdlcygpOiB2b2lkIHtcbiAgICBpZiAoYXNzZXJ0aW9uc0VuYWJsZWQoKSkge1xuICAgICAgdGhpcy5ydW5EZXRlY3RDaGFuZ2VzKHRydWUpO1xuICAgIH1cbiAgfVxuXG4gIHJ1bkRldGVjdENoYW5nZXModGhyb3dPbkNoYW5nZTogYm9vbGVhbik6IHZvaWQge1xuICAgIGlmICh0aGlzLm1vZGUgPT09IENoYW5nZURldGVjdGlvblN0cmF0ZWd5LkRldGFjaGVkIHx8XG4gICAgICAgIHRoaXMubW9kZSA9PT0gQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kuQ2hlY2tlZCB8fCB0aGlzLnN0YXRlID09PSBDaGFuZ2VEZXRlY3RvclN0YXRlLkVycm9yZWQpXG4gICAgICByZXR1cm47XG4gICAgdmFyIHMgPSBfc2NvcGVfY2hlY2sodGhpcy5pZCwgdGhyb3dPbkNoYW5nZSk7XG5cbiAgICB0aGlzLmRldGVjdENoYW5nZXNJblJlY29yZHModGhyb3dPbkNoYW5nZSk7XG5cbiAgICB0aGlzLl9kZXRlY3RDaGFuZ2VzQ29udGVudENoaWxkcmVuKHRocm93T25DaGFuZ2UpO1xuICAgIGlmICghdGhyb3dPbkNoYW5nZSkgdGhpcy5hZnRlckNvbnRlbnRMaWZlY3ljbGVDYWxsYmFja3MoKTtcblxuICAgIHRoaXMuX2RldGVjdENoYW5nZXNJblZpZXdDaGlsZHJlbih0aHJvd09uQ2hhbmdlKTtcbiAgICBpZiAoIXRocm93T25DaGFuZ2UpIHRoaXMuYWZ0ZXJWaWV3TGlmZWN5Y2xlQ2FsbGJhY2tzKCk7XG5cbiAgICBpZiAodGhpcy5tb2RlID09PSBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5DaGVja09uY2UpXG4gICAgICB0aGlzLm1vZGUgPSBDaGFuZ2VEZXRlY3Rpb25TdHJhdGVneS5DaGVja2VkO1xuXG4gICAgdGhpcy5zdGF0ZSA9IENoYW5nZURldGVjdG9yU3RhdGUuQ2hlY2tlZEJlZm9yZTtcbiAgICB3dGZMZWF2ZShzKTtcbiAgfVxuXG4gIC8vIFRoaXMgbWV0aG9kIGlzIG5vdCBpbnRlbmRlZCB0byBiZSBvdmVycmlkZGVuLiBTdWJjbGFzc2VzIHNob3VsZCBpbnN0ZWFkIHByb3ZpZGUgYW5cbiAgLy8gaW1wbGVtZW50YXRpb24gb2YgYGRldGVjdENoYW5nZXNJblJlY29yZHNJbnRlcm5hbGAgd2hpY2ggZG9lcyB0aGUgd29yayBvZiBkZXRlY3RpbmcgY2hhbmdlc1xuICAvLyBhbmQgd2hpY2ggdGhpcyBtZXRob2Qgd2lsbCBjYWxsLlxuICAvLyBUaGlzIG1ldGhvZCBleHBlY3RzIHRoYXQgYGRldGVjdENoYW5nZXNJblJlY29yZHNJbnRlcm5hbGAgd2lsbCBzZXQgdGhlIHByb3BlcnR5XG4gIC8vIGB0aGlzLnByb3BlcnR5QmluZGluZ0luZGV4YCB0byB0aGUgcHJvcGVydHlCaW5kaW5nSW5kZXggb2YgdGhlIGZpcnN0IHByb3RvIHJlY29yZC4gVGhpcyBpcyB0b1xuICAvLyBmYWNpbGl0YXRlIGVycm9yIHJlcG9ydGluZy5cbiAgZGV0ZWN0Q2hhbmdlc0luUmVjb3Jkcyh0aHJvd09uQ2hhbmdlOiBib29sZWFuKTogdm9pZCB7XG4gICAgaWYgKCF0aGlzLmh5ZHJhdGVkKCkpIHtcbiAgICAgIHRoaXMudGhyb3dEZWh5ZHJhdGVkRXJyb3IodGhpcy5pZCk7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICB0aGlzLmRldGVjdENoYW5nZXNJblJlY29yZHNJbnRlcm5hbCh0aHJvd09uQ2hhbmdlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAvLyB0aHJvd09uQ2hhbmdlIGVycm9ycyBhcmVuJ3QgY291bnRlZCBhcyBmYXRhbCBlcnJvcnMuXG4gICAgICBpZiAoIShlIGluc3RhbmNlb2YgRXhwcmVzc2lvbkNoYW5nZWRBZnRlckl0SGFzQmVlbkNoZWNrZWRFeGNlcHRpb24pKSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBDaGFuZ2VEZXRlY3RvclN0YXRlLkVycm9yZWQ7XG4gICAgICB9XG4gICAgICB0aGlzLl90aHJvd0Vycm9yKGUsIGUuc3RhY2spO1xuICAgIH1cbiAgfVxuXG4gIC8vIFN1YmNsYXNzZXMgc2hvdWxkIG92ZXJyaWRlIHRoaXMgbWV0aG9kIHRvIHBlcmZvcm0gYW55IHdvcmsgbmVjZXNzYXJ5IHRvIGRldGVjdCBhbmQgcmVwb3J0XG4gIC8vIGNoYW5nZXMuIEZvciBleGFtcGxlLCBjaGFuZ2VzIHNob3VsZCBiZSByZXBvcnRlZCB2aWEgYENoYW5nZURldGVjdGlvblV0aWwuYWRkQ2hhbmdlYCwgbGlmZWN5Y2xlXG4gIC8vIG1ldGhvZHMgc2hvdWxkIGJlIGNhbGxlZCwgZXRjLlxuICAvLyBUaGlzIGltcGxlbWVudGF0aW9uIHNob3VsZCBhbHNvIHNldCBgdGhpcy5wcm9wZXJ0eUJpbmRpbmdJbmRleGAgdG8gdGhlIHByb3BlcnR5QmluZGluZ0luZGV4IG9mXG4gIC8vIHRoZVxuICAvLyBmaXJzdCBwcm90byByZWNvcmQgdG8gZmFjaWxpdGF0ZSBlcnJvciByZXBvcnRpbmcuIFNlZSB7QGxpbmsgI2RldGVjdENoYW5nZXNJblJlY29yZHN9LlxuICBkZXRlY3RDaGFuZ2VzSW5SZWNvcmRzSW50ZXJuYWwodGhyb3dPbkNoYW5nZTogYm9vbGVhbik6IHZvaWQge31cblxuICAvLyBUaGlzIG1ldGhvZCBpcyBub3QgaW50ZW5kZWQgdG8gYmUgb3ZlcnJpZGRlbi4gU3ViY2xhc3NlcyBzaG91bGQgaW5zdGVhZCBwcm92aWRlIGFuXG4gIC8vIGltcGxlbWVudGF0aW9uIG9mIGBoeWRyYXRlRGlyZWN0aXZlc2AuXG4gIGh5ZHJhdGUoY29udGV4dDogVCwgbG9jYWxzOiBMb2NhbHMsIGRpc3BhdGNoZXI6IENoYW5nZURpc3BhdGNoZXIsIHBpcGVzOiBQaXBlcyk6IHZvaWQge1xuICAgIHRoaXMuZGlzcGF0Y2hlciA9IGRpc3BhdGNoZXI7XG4gICAgdGhpcy5tb2RlID0gQ2hhbmdlRGV0ZWN0aW9uVXRpbC5jaGFuZ2VEZXRlY3Rpb25Nb2RlKHRoaXMuc3RyYXRlZ3kpO1xuICAgIHRoaXMuY29udGV4dCA9IGNvbnRleHQ7XG5cbiAgICBpZiAodGhpcy5zdHJhdGVneSA9PT0gQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kuT25QdXNoT2JzZXJ2ZSkge1xuICAgICAgdGhpcy5vYnNlcnZlQ29tcG9uZW50KGNvbnRleHQpO1xuICAgIH1cblxuICAgIHRoaXMubG9jYWxzID0gbG9jYWxzO1xuICAgIHRoaXMucGlwZXMgPSBwaXBlcztcbiAgICB0aGlzLmh5ZHJhdGVEaXJlY3RpdmVzKGRpc3BhdGNoZXIpO1xuICAgIHRoaXMuc3RhdGUgPSBDaGFuZ2VEZXRlY3RvclN0YXRlLk5ldmVyQ2hlY2tlZDtcbiAgfVxuXG4gIC8vIFN1YmNsYXNzZXMgc2hvdWxkIG92ZXJyaWRlIHRoaXMgbWV0aG9kIHRvIGh5ZHJhdGUgYW55IGRpcmVjdGl2ZXMuXG4gIGh5ZHJhdGVEaXJlY3RpdmVzKGRpc3BhdGNoZXI6IENoYW5nZURpc3BhdGNoZXIpOiB2b2lkIHt9XG5cbiAgLy8gVGhpcyBtZXRob2QgaXMgbm90IGludGVuZGVkIHRvIGJlIG92ZXJyaWRkZW4uIFN1YmNsYXNzZXMgc2hvdWxkIGluc3RlYWQgcHJvdmlkZSBhblxuICAvLyBpbXBsZW1lbnRhdGlvbiBvZiBgZGVoeWRyYXRlRGlyZWN0aXZlc2AuXG4gIGRlaHlkcmF0ZSgpOiB2b2lkIHtcbiAgICB0aGlzLmRlaHlkcmF0ZURpcmVjdGl2ZXModHJ1ZSk7XG5cbiAgICAvLyBUaGlzIGlzIGFuIGV4cGVyaW1lbnRhbCBmZWF0dXJlLiBXb3JrcyBvbmx5IGluIERhcnQuXG4gICAgaWYgKHRoaXMuc3RyYXRlZ3kgPT09IENoYW5nZURldGVjdGlvblN0cmF0ZWd5Lk9uUHVzaE9ic2VydmUpIHtcbiAgICAgIHRoaXMuX3Vuc3Vic3JpYmVGcm9tT2JzZXJ2YWJsZXMoKTtcbiAgICB9XG5cbiAgICB0aGlzLl91bnN1YnNjcmliZUZyb21PdXRwdXRzKCk7XG5cbiAgICB0aGlzLmRpc3BhdGNoZXIgPSBudWxsO1xuICAgIHRoaXMuY29udGV4dCA9IG51bGw7XG4gICAgdGhpcy5sb2NhbHMgPSBudWxsO1xuICAgIHRoaXMucGlwZXMgPSBudWxsO1xuICB9XG5cbiAgLy8gU3ViY2xhc3NlcyBzaG91bGQgb3ZlcnJpZGUgdGhpcyBtZXRob2QgdG8gZGVoeWRyYXRlIGFueSBkaXJlY3RpdmVzLiBUaGlzIG1ldGhvZCBzaG91bGQgcmV2ZXJzZVxuICAvLyBhbnkgd29yayBkb25lIGluIGBoeWRyYXRlRGlyZWN0aXZlc2AuXG4gIGRlaHlkcmF0ZURpcmVjdGl2ZXMoZGVzdHJveVBpcGVzOiBib29sZWFuKTogdm9pZCB7fVxuXG4gIGh5ZHJhdGVkKCk6IGJvb2xlYW4geyByZXR1cm4gaXNQcmVzZW50KHRoaXMuY29udGV4dCk7IH1cblxuICBkZXN0cm95UmVjdXJzaXZlKCk6IHZvaWQge1xuICAgIHRoaXMuZGlzcGF0Y2hlci5ub3RpZnlPbkRlc3Ryb3koKTtcbiAgICB0aGlzLmRlaHlkcmF0ZSgpO1xuICAgIHZhciBjaGlsZHJlbiA9IHRoaXMuY29udGVudENoaWxkcmVuO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNoaWxkcmVuW2ldLmRlc3Ryb3lSZWN1cnNpdmUoKTtcbiAgICB9XG4gICAgY2hpbGRyZW4gPSB0aGlzLnZpZXdDaGlsZHJlbjtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjaGlsZHJlbltpXS5kZXN0cm95UmVjdXJzaXZlKCk7XG4gICAgfVxuICB9XG5cbiAgYWZ0ZXJDb250ZW50TGlmZWN5Y2xlQ2FsbGJhY2tzKCk6IHZvaWQge1xuICAgIHRoaXMuZGlzcGF0Y2hlci5ub3RpZnlBZnRlckNvbnRlbnRDaGVja2VkKCk7XG4gICAgdGhpcy5hZnRlckNvbnRlbnRMaWZlY3ljbGVDYWxsYmFja3NJbnRlcm5hbCgpO1xuICB9XG5cbiAgYWZ0ZXJDb250ZW50TGlmZWN5Y2xlQ2FsbGJhY2tzSW50ZXJuYWwoKTogdm9pZCB7fVxuXG4gIGFmdGVyVmlld0xpZmVjeWNsZUNhbGxiYWNrcygpOiB2b2lkIHtcbiAgICB0aGlzLmRpc3BhdGNoZXIubm90aWZ5QWZ0ZXJWaWV3Q2hlY2tlZCgpO1xuICAgIHRoaXMuYWZ0ZXJWaWV3TGlmZWN5Y2xlQ2FsbGJhY2tzSW50ZXJuYWwoKTtcbiAgfVxuXG4gIGFmdGVyVmlld0xpZmVjeWNsZUNhbGxiYWNrc0ludGVybmFsKCk6IHZvaWQge31cblxuICAvKiogQGludGVybmFsICovXG4gIF9kZXRlY3RDaGFuZ2VzQ29udGVudENoaWxkcmVuKHRocm93T25DaGFuZ2U6IGJvb2xlYW4pOiB2b2lkIHtcbiAgICB2YXIgYyA9IHRoaXMuY29udGVudENoaWxkcmVuO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYy5sZW5ndGg7ICsraSkge1xuICAgICAgY1tpXS5ydW5EZXRlY3RDaGFuZ2VzKHRocm93T25DaGFuZ2UpO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBAaW50ZXJuYWwgKi9cbiAgX2RldGVjdENoYW5nZXNJblZpZXdDaGlsZHJlbih0aHJvd09uQ2hhbmdlOiBib29sZWFuKTogdm9pZCB7XG4gICAgdmFyIGMgPSB0aGlzLnZpZXdDaGlsZHJlbjtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGMubGVuZ3RoOyArK2kpIHtcbiAgICAgIGNbaV0ucnVuRGV0ZWN0Q2hhbmdlcyh0aHJvd09uQ2hhbmdlKTtcbiAgICB9XG4gIH1cblxuICBtYXJrQXNDaGVja09uY2UoKTogdm9pZCB7IHRoaXMubW9kZSA9IENoYW5nZURldGVjdGlvblN0cmF0ZWd5LkNoZWNrT25jZTsgfVxuXG4gIG1hcmtQYXRoVG9Sb290QXNDaGVja09uY2UoKTogdm9pZCB7XG4gICAgdmFyIGM6IENoYW5nZURldGVjdG9yID0gdGhpcztcbiAgICB3aGlsZSAoaXNQcmVzZW50KGMpICYmIGMubW9kZSAhPT0gQ2hhbmdlRGV0ZWN0aW9uU3RyYXRlZ3kuRGV0YWNoZWQpIHtcbiAgICAgIGlmIChjLm1vZGUgPT09IENoYW5nZURldGVjdGlvblN0cmF0ZWd5LkNoZWNrZWQpIGMubW9kZSA9IENoYW5nZURldGVjdGlvblN0cmF0ZWd5LkNoZWNrT25jZTtcbiAgICAgIGMgPSBjLnBhcmVudDtcbiAgICB9XG4gIH1cblxuICAvLyBUaGlzIGlzIGFuIGV4cGVyaW1lbnRhbCBmZWF0dXJlLiBXb3JrcyBvbmx5IGluIERhcnQuXG4gIHByaXZhdGUgX3Vuc3Vic3JpYmVGcm9tT2JzZXJ2YWJsZXMoKTogdm9pZCB7XG4gICAgaWYgKGlzUHJlc2VudCh0aGlzLnN1YnNjcmlwdGlvbnMpKSB7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuc3Vic2NyaXB0aW9ucy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IHRoaXMuc3Vic2NyaXB0aW9uc1tpXTtcbiAgICAgICAgaWYgKGlzUHJlc2VudCh0aGlzLnN1YnNjcmlwdGlvbnNbaV0pKSB7XG4gICAgICAgICAgcy5jYW5jZWwoKTtcbiAgICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnNbaV0gPSBudWxsO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfdW5zdWJzY3JpYmVGcm9tT3V0cHV0cygpOiB2b2lkIHtcbiAgICBpZiAoaXNQcmVzZW50KHRoaXMub3V0cHV0U3Vic2NyaXB0aW9ucykpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5vdXRwdXRTdWJzY3JpcHRpb25zLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIE9ic2VydmFibGVXcmFwcGVyLmRpc3Bvc2UodGhpcy5vdXRwdXRTdWJzY3JpcHRpb25zW2ldKTtcbiAgICAgICAgdGhpcy5vdXRwdXRTdWJzY3JpcHRpb25zW2ldID0gbnVsbDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBUaGlzIGlzIGFuIGV4cGVyaW1lbnRhbCBmZWF0dXJlLiBXb3JrcyBvbmx5IGluIERhcnQuXG4gIG9ic2VydmVWYWx1ZSh2YWx1ZTogYW55LCBpbmRleDogbnVtYmVyKTogYW55IHtcbiAgICBpZiAoaXNPYnNlcnZhYmxlKHZhbHVlKSkge1xuICAgICAgdGhpcy5fY3JlYXRlQXJyYXlUb1N0b3JlT2JzZXJ2YWJsZXMoKTtcbiAgICAgIGlmIChpc0JsYW5rKHRoaXMuc3Vic2NyaXB0aW9uc1tpbmRleF0pKSB7XG4gICAgICAgIHRoaXMuc3RyZWFtc1tpbmRleF0gPSB2YWx1ZS5jaGFuZ2VzO1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnNbaW5kZXhdID0gdmFsdWUuY2hhbmdlcy5saXN0ZW4oKF8pID0+IHRoaXMucmVmLm1hcmtGb3JDaGVjaygpKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5zdHJlYW1zW2luZGV4XSAhPT0gdmFsdWUuY2hhbmdlcykge1xuICAgICAgICB0aGlzLnN1YnNjcmlwdGlvbnNbaW5kZXhdLmNhbmNlbCgpO1xuICAgICAgICB0aGlzLnN0cmVhbXNbaW5kZXhdID0gdmFsdWUuY2hhbmdlcztcbiAgICAgICAgdGhpcy5zdWJzY3JpcHRpb25zW2luZGV4XSA9IHZhbHVlLmNoYW5nZXMubGlzdGVuKChfKSA9PiB0aGlzLnJlZi5tYXJrRm9yQ2hlY2soKSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIC8vIFRoaXMgaXMgYW4gZXhwZXJpbWVudGFsIGZlYXR1cmUuIFdvcmtzIG9ubHkgaW4gRGFydC5cbiAgb2JzZXJ2ZURpcmVjdGl2ZSh2YWx1ZTogYW55LCBpbmRleDogbnVtYmVyKTogYW55IHtcbiAgICBpZiAoaXNPYnNlcnZhYmxlKHZhbHVlKSkge1xuICAgICAgdGhpcy5fY3JlYXRlQXJyYXlUb1N0b3JlT2JzZXJ2YWJsZXMoKTtcbiAgICAgIHZhciBhcnJheUluZGV4ID0gdGhpcy5udW1iZXJPZlByb3BlcnR5UHJvdG9SZWNvcmRzICsgaW5kZXggKyAyOyAgLy8gKzEgaXMgY29tcG9uZW50XG4gICAgICB0aGlzLnN0cmVhbXNbYXJyYXlJbmRleF0gPSB2YWx1ZS5jaGFuZ2VzO1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zW2FycmF5SW5kZXhdID0gdmFsdWUuY2hhbmdlcy5saXN0ZW4oKF8pID0+IHRoaXMucmVmLm1hcmtGb3JDaGVjaygpKTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgLy8gVGhpcyBpcyBhbiBleHBlcmltZW50YWwgZmVhdHVyZS4gV29ya3Mgb25seSBpbiBEYXJ0LlxuICBvYnNlcnZlQ29tcG9uZW50KHZhbHVlOiBhbnkpOiBhbnkge1xuICAgIGlmIChpc09ic2VydmFibGUodmFsdWUpKSB7XG4gICAgICB0aGlzLl9jcmVhdGVBcnJheVRvU3RvcmVPYnNlcnZhYmxlcygpO1xuICAgICAgdmFyIGluZGV4ID0gdGhpcy5udW1iZXJPZlByb3BlcnR5UHJvdG9SZWNvcmRzICsgMTtcbiAgICAgIHRoaXMuc3RyZWFtc1tpbmRleF0gPSB2YWx1ZS5jaGFuZ2VzO1xuICAgICAgdGhpcy5zdWJzY3JpcHRpb25zW2luZGV4XSA9IHZhbHVlLmNoYW5nZXMubGlzdGVuKChfKSA9PiB0aGlzLnJlZi5tYXJrRm9yQ2hlY2soKSk7XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHByaXZhdGUgX2NyZWF0ZUFycmF5VG9TdG9yZU9ic2VydmFibGVzKCk6IHZvaWQge1xuICAgIGlmIChpc0JsYW5rKHRoaXMuc3Vic2NyaXB0aW9ucykpIHtcbiAgICAgIHRoaXMuc3Vic2NyaXB0aW9ucyA9IExpc3RXcmFwcGVyLmNyZWF0ZUZpeGVkU2l6ZSh0aGlzLm51bWJlck9mUHJvcGVydHlQcm90b1JlY29yZHMgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlyZWN0aXZlSW5kaWNlcy5sZW5ndGggKyAyKTtcbiAgICAgIHRoaXMuc3RyZWFtcyA9IExpc3RXcmFwcGVyLmNyZWF0ZUZpeGVkU2l6ZSh0aGlzLm51bWJlck9mUHJvcGVydHlQcm90b1JlY29yZHMgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlyZWN0aXZlSW5kaWNlcy5sZW5ndGggKyAyKTtcbiAgICB9XG4gIH1cblxuICBnZXREaXJlY3RpdmVGb3IoZGlyZWN0aXZlczogYW55LCBpbmRleDogbnVtYmVyKTogYW55IHtcbiAgICByZXR1cm4gZGlyZWN0aXZlcy5nZXREaXJlY3RpdmVGb3IodGhpcy5kaXJlY3RpdmVJbmRpY2VzW2luZGV4XSk7XG4gIH1cblxuICBnZXREZXRlY3RvckZvcihkaXJlY3RpdmVzOiBhbnksIGluZGV4OiBudW1iZXIpOiBDaGFuZ2VEZXRlY3RvciB7XG4gICAgcmV0dXJuIGRpcmVjdGl2ZXMuZ2V0RGV0ZWN0b3JGb3IodGhpcy5kaXJlY3RpdmVJbmRpY2VzW2luZGV4XSk7XG4gIH1cblxuICBub3RpZnlEaXNwYXRjaGVyKHZhbHVlOiBhbnkpOiB2b2lkIHtcbiAgICB0aGlzLmRpc3BhdGNoZXIubm90aWZ5T25CaW5kaW5nKHRoaXMuX2N1cnJlbnRCaW5kaW5nKCksIHZhbHVlKTtcbiAgfVxuXG4gIGxvZ0JpbmRpbmdVcGRhdGUodmFsdWU6IGFueSk6IHZvaWQge1xuICAgIHRoaXMuZGlzcGF0Y2hlci5sb2dCaW5kaW5nVXBkYXRlKHRoaXMuX2N1cnJlbnRCaW5kaW5nKCksIHZhbHVlKTtcbiAgfVxuXG4gIGFkZENoYW5nZShjaGFuZ2VzOiB7W2tleTogc3RyaW5nXTogYW55fSwgb2xkVmFsdWU6IGFueSwgbmV3VmFsdWU6IGFueSk6IHtba2V5OiBzdHJpbmddOiBhbnl9IHtcbiAgICBpZiAoaXNCbGFuayhjaGFuZ2VzKSkge1xuICAgICAgY2hhbmdlcyA9IHt9O1xuICAgIH1cbiAgICBjaGFuZ2VzW3RoaXMuX2N1cnJlbnRCaW5kaW5nKCkubmFtZV0gPSBDaGFuZ2VEZXRlY3Rpb25VdGlsLnNpbXBsZUNoYW5nZShvbGRWYWx1ZSwgbmV3VmFsdWUpO1xuICAgIHJldHVybiBjaGFuZ2VzO1xuICB9XG5cbiAgcHJpdmF0ZSBfdGhyb3dFcnJvcihleGNlcHRpb246IGFueSwgc3RhY2s6IGFueSk6IHZvaWQge1xuICAgIHZhciBlcnJvcjtcbiAgICB0cnkge1xuICAgICAgdmFyIGMgPSB0aGlzLmRpc3BhdGNoZXIuZ2V0RGVidWdDb250ZXh0KG51bGwsIHRoaXMuX2N1cnJlbnRCaW5kaW5nKCkuZWxlbWVudEluZGV4LCBudWxsKTtcbiAgICAgIHZhciBjb250ZXh0ID0gaXNQcmVzZW50KGMpID8gbmV3IF9Db250ZXh0KGMuZWxlbWVudCwgYy5jb21wb25lbnRFbGVtZW50LCBjLmNvbnRleHQsIGMubG9jYWxzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYy5pbmplY3RvciwgdGhpcy5fY3VycmVudEJpbmRpbmcoKS5kZWJ1ZykgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBudWxsO1xuICAgICAgZXJyb3IgPSBuZXcgQ2hhbmdlRGV0ZWN0aW9uRXJyb3IodGhpcy5fY3VycmVudEJpbmRpbmcoKS5kZWJ1ZywgZXhjZXB0aW9uLCBzdGFjaywgY29udGV4dCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgLy8gaWYgYW4gZXJyb3IgaGFwcGVucyBkdXJpbmcgZ2V0dGluZyB0aGUgZGVidWcgY29udGV4dCwgd2UgdGhyb3cgYSBDaGFuZ2VEZXRlY3Rpb25FcnJvclxuICAgICAgLy8gd2l0aG91dCB0aGUgZXh0cmEgaW5mb3JtYXRpb24uXG4gICAgICBlcnJvciA9IG5ldyBDaGFuZ2VEZXRlY3Rpb25FcnJvcihudWxsLCBleGNlcHRpb24sIHN0YWNrLCBudWxsKTtcbiAgICB9XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICB0aHJvd09uQ2hhbmdlRXJyb3Iob2xkVmFsdWU6IGFueSwgbmV3VmFsdWU6IGFueSk6IHZvaWQge1xuICAgIHRocm93IG5ldyBFeHByZXNzaW9uQ2hhbmdlZEFmdGVySXRIYXNCZWVuQ2hlY2tlZEV4Y2VwdGlvbih0aGlzLl9jdXJyZW50QmluZGluZygpLmRlYnVnLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbGRWYWx1ZSwgbmV3VmFsdWUsIG51bGwpO1xuICB9XG5cbiAgdGhyb3dEZWh5ZHJhdGVkRXJyb3IoZGV0YWlsOiBzdHJpbmcpOiB2b2lkIHsgdGhyb3cgbmV3IERlaHlkcmF0ZWRFeGNlcHRpb24oZGV0YWlsKTsgfVxuXG4gIHByaXZhdGUgX2N1cnJlbnRCaW5kaW5nKCk6IEJpbmRpbmdUYXJnZXQge1xuICAgIHJldHVybiB0aGlzLmJpbmRpbmdUYXJnZXRzW3RoaXMucHJvcGVydHlCaW5kaW5nSW5kZXhdO1xuICB9XG59XG4iXX0=