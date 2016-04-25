﻿/****************************************************************************
 Copyright (c) 2013-2016 Chukong Technologies Inc.

 http://www.cocos.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
  worldwide, royalty-free, non-assignable, revocable and  non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
  not use Cocos Creator software for developing other software or tools that's
  used for developing games. You are not granted to publish, distribute,
  sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Chukong Aipu reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

var JS = require('./js');
var Enum = require('../value-types/CCEnum');
var Utils = require('./utils');
var _isPlainEmptyObj_DEV = Utils.isPlainEmptyObj_DEV;
var _cloneable_DEV = Utils.cloneable_DEV;
var Attr = require('./attribute');
var getTypeChecker = Attr.getTypeChecker;
var preprocessAttrs = require('./preprocess-attrs');

var BUILTIN_ENTRIES = ['name', 'extends', 'mixins', 'ctor', 'properties', 'statics', 'editor'];

var TYPO_TO_CORRECT = CC_DEV && {
    extend: 'extends',
    property: 'properties',
    static: 'statics',
    constructor: 'ctor'
};

var INVALID_STATICS = CC_DEV && ['name', '__ctors__', '__props__', 'arguments', 'call', 'apply', 'caller',
                       'length', 'prototype'];

var deferredInitializer = {

    // Configs for classes which needs deferred initialization
    datas: null,

    // register new class
    // data - {cls: cls, cb: properties, mixins: options.mixins}
    push: function (data) {
        if (this.datas) {
            this.datas.push(data);
        }
        else {
            this.datas = [data];
            // start a new timer to initialize
            var self = this;
            setTimeout(function () {
                self.init();
            }, 0);
        }
    },

    init: function () {
        var datas = this.datas;
        if (datas) {
            for (var i = 0; i < datas.length; ++i) {
                var data = datas[i];
                var cls = data.cls;
                var properties = data.props;
                if (typeof properties === 'function') {
                    properties = properties();
                }
                var name = JS.getClassName(cls);
                if (properties) {
                    declareProperties(cls, name, properties, cls.$super, data.mixins);
                }
                else {
                    cc.error('Properties function of "%s" should return an object!', name);
                }
            }
            this.datas = null;
        }
    }
};

///**
// * both getter and prop must register the name into __props__ array
// * @param {String} name - prop name
// */
function appendProp (cls, name/*, isGetter*/) {
    if (CC_DEV) {
        //var JsVarReg = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
        //if (!JsVarReg.test(name)) {
        //    cc.error('The property name "' + name + '" is not compliant with JavaScript naming standards');
        //    return;
        //}
        if (name.indexOf('.') !== -1) {
            cc.error('Disallow to use "." in property name');
            return;
        }
    }

    var index = cls.__props__.indexOf(name);
    if (index < 0) {
        cls.__props__.push(name);
    }
}

function defineProp (cls, className, propName, defaultValue, attrs) {
    if (CC_DEV) {
        // check default object value
        if (typeof defaultValue === 'object' && defaultValue) {
            if (Array.isArray(defaultValue)) {
                // check array empty
                if (defaultValue.length > 0) {
                    cc.error('Default array must be empty, set default value of %s.%s to [], ' +
                               'and initialize in "onLoad" or "ctor" please. (just like "this.%s = [...];")',
                        className, propName, propName);
                    return;
                }
            }
            else if (!_isPlainEmptyObj_DEV(defaultValue)) {
                // check cloneable
                if (!_cloneable_DEV(defaultValue)) {
                    cc.error('Do not set default value to non-empty object, ' +
    'unless the object defines its own "clone" function. Set default value of %s.%s to null or {}, ' +
    'and initialize in "onLoad" or "ctor" please. (just like "this.%s = {foo: bar};")',
                        className, propName, propName);
                    return;
                }
            }
        }

        // check base prototype to avoid name collision
        for (var base = cls.$super; base; base = base.$super) {
            // 这个循环只能检测到最上面的FireClass的父类，如果再上还有父类，将不做检测。
            if (base.prototype.hasOwnProperty(propName)) {
                cc.error('Can not declare %s.%s, it is already defined in the prototype of %s',
                    className, propName, className);
                return;
            }
        }
    }

    // set default value
    Attr.attr(cls, propName, { 'default': defaultValue });

    appendProp(cls, propName);

    // apply attributes
    if (attrs) {
        var onAfterProp = null;
        for (var i = 0; i < attrs.length; i++) {
            var attr = attrs[i];
            Attr.attr(cls, propName, attr);
            // register callback
            if (attr._onAfterProp) {
                onAfterProp = onAfterProp || [];
                onAfterProp.push(attr._onAfterProp);
            }
        }
        // call callback
        if (onAfterProp) {
            for (var c = 0; c < onAfterProp.length; c++) {
                onAfterProp[c](cls, propName);
            }
        }
    }
}

function defineGetSet (cls, name, propName, val, attrs) {
    var getter = val.get;
    var setter = val.set;
    var proto = cls.prototype;
    var d = Object.getOwnPropertyDescriptor(proto, propName);

    if (getter) {
        if (d && d.get && CC_DEV) {
            cc.error('"%s": the getter of "%s" is already defined!', name, propName);
            return;
        }

        if (attrs) {
            for (var i = 0; i < attrs.length; ++i) {
                var attr = attrs[i];
                if (CC_DEV && attr._canUsedInGetter === false) {
                    cc.error('Can not apply the specified attribute to the getter of "%s.%s", ' +
                             'attribute index: %s', name, propName, i);
                    continue;
                }

                Attr.attr(cls, propName, attr);

                // check attributes
                if (CC_DEV && (attr.serializable === false || attr.editorOnly === true)) {
                    cc.warn('No need to use "serializable: false" or "editorOnly: true" for ' +
                            'the getter of "%s.%s", every getter is actually non-serialized.',
                        name, propName);
                }
            }
        }

        var ForceSerializable = false;
        if (!ForceSerializable) {
            Attr.attr(cls, propName, Attr.NonSerialized);
        }
        if (ForceSerializable || CC_DEV) {
            // 不论是否 hide in inspector 都要添加到 props，否则 asset watcher 不能正常工作
            appendProp(cls, propName/*, true*/);
        }

        if (d) {
            Object.defineProperty(proto, propName, {
                get: getter
            });
        }
        else {
            Object.defineProperty(proto, propName, {
                get: getter,
                configurable: true,
                enumerable: true
            });
        }

        if (CC_DEV) {
            Attr.attr(cls, propName, {hasGetter: true}); // 方便 editor 做判断
        }
    }

    if (setter) {
        if (CC_DEV) {
            if (d && d.set) {
                return cc.error('"%s": the setter of "%s" is already defined!', name, propName);
            }

            Object.defineProperty(proto, propName, {
                set: setter,
                configurable: true,
                enumerable: true
            });
            Attr.attr(cls, propName, {hasSetter: true}); // 方便 editor 做判断
        }
        else {
            if (d) {
                Object.defineProperty(proto, propName, {
                    set: setter
                });
            }
            else {
                Object.defineProperty(proto, propName, {
                    set: setter,
                    configurable: true,
                    enumerable: true
                });
            }
        }
    }
}

function getDefault (defaultVal) {
    if (typeof defaultVal === 'function') {
        if (CC_EDITOR) {
            try {
                return defaultVal();
            }
            catch (e) {
                cc._throw(e);
                return undefined;
            }
        }
        else {
            return defaultVal();
        }
    }
    return defaultVal;
}

function instantiateProps (instance, itsClass) {
    var propList = itsClass.__props__;
    if (propList === null) {
        deferredInitializer.init();
        propList = itsClass.__props__;
    }
    for (var i = 0; i < propList.length; i++) {
        var prop = propList[i];
        var attrs = Attr.attr(itsClass, prop);
        if (attrs && attrs.hasOwnProperty('default')) {  // getter does not have default, default maybe 0
            var def = attrs.default;
            if (def) {
                if (typeof def === 'object' && def) {
                    if (typeof def.clone === 'function') {
                        def = def.clone();
                    }
                    else if (Array.isArray(def)) {
                        def = [];
                    }
                    else {
                        def = {};
                    }
                }
                else if (typeof def === 'function') {
                    def = getDefault(def);
                }
            }
            instance[prop] = def;
        }
    }
}

/**
 * Checks whether subclass is child of superclass or equals to superclass
 *
 * @method isChildClassOf
 * @param {Function} subclass
 * @param {Function} superclass
 * @return {Boolean}
 */
cc.isChildClassOf = function (subclass, superclass) {
    if (subclass && superclass) {
        if (typeof subclass !== 'function') {
            return false;
        }
        if (typeof superclass !== 'function') {
            if (CC_DEV) {
                cc.warn('[isChildClassOf] superclass should be function type, not', superclass);
            }
            return false;
        }
        // fireclass
        for (; subclass && subclass.$super; subclass = subclass.$super) {
            if (subclass === superclass) {
                return true;
            }
        }
        if (subclass === superclass) {
            return true;
        }
        // js class
        var dunderProto = Object.getPrototypeOf(subclass.prototype);
        while (dunderProto) {
            subclass = dunderProto.constructor;
            if (subclass === superclass) {
                return true;
            }
            dunderProto = Object.getPrototypeOf(subclass.prototype);
        }
    }
    return false;
};

function doDefine (className, baseClass, mixins, constructor, options) {
    var fireClass = _createCtor(constructor, baseClass, mixins, className, options);

    // extend - (NON-INHERITED) Create a new Class that inherits from this Class
    Object.defineProperty(fireClass, 'extend', {
        value: function (options) {
            options.extends = this;
            return CCClass(options);
        },
        writable: true,
        configurable: true
    });

    if (baseClass) {
        JS.extend(fireClass, baseClass);    // 这里会把父类的 __props__ 复制给子类
        fireClass.$super = baseClass;
    }

    if (mixins) {
        for (var m = 0; m < mixins.length; ++m) {
            var mixin = mixins[m];
            // mixin prototype
            JS.mixin(fireClass.prototype, mixin.prototype);

            // mixin statics (this will also copy editor attributes for component)
            for (var p in mixin)
                if (mixin.hasOwnProperty(p) && INVALID_STATICS.indexOf(p) < 0)
                    fireClass[p] = mixin[p];
        }
        // restore constuctor overridden by mixin
        fireClass.prototype.constructor = fireClass;
    }

    JS.setClassName(className, fireClass);
    return fireClass;
}

function define (className, baseClasses, mixins, constructor, options) {
    if (cc.isChildClassOf(baseClasses, cc.Component)) {
        var frame = cc._RFpeek();
        if (frame) {
            if (CC_DEV && constructor) {
                cc.warn('cc.Class: Should not define constructor for cc.Component.');
            }
            if (frame.beh) {
                cc.error('Each script can have at most one Component.');
                return;
            }
            var uuid = frame.uuid;
            if (uuid) {
                if (CC_EDITOR && className) {
                    cc.warn('Should not specify class name for Component which defines in project.');
                }
            }
            //else {
            //    builtin
            //}
            className = className || frame.script;
            var cls = doDefine(className, baseClasses, mixins, constructor, options);
            if (uuid) {
                JS._setClassId(uuid, cls);
                if (CC_EDITOR) {
                    cc.Component._addMenuItem(cls, 'i18n:MAIN_MENU.component.scripts/' + className, -1);
                    cls.prototype.__scriptUuid = Editor.UuidUtils.decompressUuid(uuid);
                }
            }
            frame.beh = cls;
            return cls;
        }
    }
    // not project component
    return doDefine(className, baseClasses, mixins, constructor, options);
}

function _checkCtor (ctor) {
    if (CC_DEV) {
        if (CCClass._isCCClass(ctor)) {
            cc.error("Constructor can not be another CCClass");
            return;
        }
        if (typeof ctor !== 'function') {
            cc.error("Constructor of CCClass must be function type");
            return;
        }
        if (ctor.length > 0) {
            // fireball-x/dev#138: To make a unified CCClass serialization process,
            // we don't allow parameters for constructor when creating instances of CCClass.
            // For advance user, construct arguments can still get from 'arguments'.
            cc.warn("Can not instantiate CCClass with arguments.");
            return;
        }
    }
}

function normalizeClassName (className) {
    if (CC_DEV) {
        var DefaultName = 'CCClass';
        if (className) {
            className = className.replace(/\./g, '_');
            className = className.split('').filter(function (x) { return /^[a-zA-Z0-9_$]/.test(x); }).join('');
            if (/^[0-9]/.test(className[0])) {
                className = '_' + className;
            }
            try {
                // validate name
                eval('function ' + className + '(){}');
            }
            catch (e) {
                className = 'FireClass_' + className;
                try {
                    eval('function ' + className + '(){}');
                }
                catch (e) {
                    return DefaultName;
                }
            }
            return className;
        }
        return DefaultName;
    }
}

function _createCtor (ctor, baseClass, mixins, className, options) {
    var useTryCatch = ! (className && className.startsWith('cc.'));
    var shouldAddProtoCtor;
    if (CC_EDITOR && ctor && baseClass) {
        // check super call in constructor
        var originCtor = ctor;
        if (SuperCallReg.test(ctor)) {
            cc.warn(cc._LogInfos.Editor.Class.callSuperCtor, className);
            // suppresss super call
            ctor = function () {
                this._super = function () {};
                var ret = originCtor.apply(this, arguments);
                this._super = null;
                return ret;
            };
        }
        if (/\bprototype.ctor\b/.test(originCtor)) {
            cc.warn(cc._LogInfos.Editor.Class.callSuperCtor, className);
            shouldAddProtoCtor = true;
        }
    }
    var superCallBounded = options && baseClass && boundSuperCalls(baseClass, options);

    if (ctor && CC_DEV) {
        _checkCtor(ctor);
    }
    // get base user constructors
    var ctors = [];
    var baseOrMixins = [baseClass].concat(mixins);
    for (var b = 0; b < baseOrMixins.length; b++) {
        var baseOrMixin = baseOrMixins[b];
        if (baseOrMixin) {
            if (CCClass._isCCClass(baseOrMixin)) {
                var baseCtors = baseOrMixin.__ctors__;
                if (baseCtors) {
                    ctors = ctors.concat(baseCtors);
                }
            }
            else if (baseOrMixin) {
                ctors.push(baseOrMixin);
            }
        }
    }

    // append subclass user constructors
    if (ctor) {
        ctors.push(ctor);
    }

    // create class constructor
    var body;
    if (CC_DEV) {
        body = '(function ' + normalizeClassName(className) + '(){\n';
    }
    else {
        body = '(function(){\n';
    }
    if (superCallBounded) {
        body += 'this._super=null;\n';
    }
    body += 'instantiateProps(this,fireClass);\n';

    // call user constructors
    if (ctors.length > 0) {
        body += 'var cs=fireClass.__ctors__;\n';

        if (useTryCatch) {
            body += 'try{\n';
        }

        if (ctors.length <= 5) {
            for (var i = 0; i < ctors.length; i++) {
                body += '(cs[' + i + ']).apply(this,arguments);\n';
            }
        }
        else {
            body += 'for(var i=0,l=cs.length;i<l;++i){\n';
            body += '(cs[i]).apply(this,arguments);\n}\n';
        }

        if (useTryCatch) {
            body += '}catch(e){\ncc._throw(e);\n}\n';
        }
    }
    body += '})';

    // jshint evil: true
    var fireClass = eval(body);
    // jshint evil: false

    Object.defineProperty(fireClass, '__ctors__', {
        value: ctors.length > 0 ? ctors : null,
        // writable should be false,
        // enumerable should be false
    });

    if (CC_EDITOR && shouldAddProtoCtor) {
        fireClass.prototype.ctor = function () {};
    }
    return fireClass;
}

var SuperCallReg = /xyz/.test(function(){xyz;}) ? /\b_super\b/ : /.*/;
function _boundSuperCall (func, funcName, base) {
    var superFunc = null;
    var pd = JS.getPropertyDescriptor(base.prototype, funcName);
    if (pd) {
        superFunc = pd.value;
        // ignore pd.get, assume that function defined by getter is just for warnings 
        if (typeof superFunc === 'function') {
            var hasSuperCall = SuperCallReg.test(func);
            if (hasSuperCall) {
                return function () {
                    var tmp = this._super;
    
                    // Add a new ._super() method that is the same method but on the super-Class
                    this._super = superFunc;
    
                    var ret = func.apply(this, arguments);
    
                    // The method only need to be bound temporarily, so we remove it when we're done executing
                    this._super = tmp;
    
                    return ret;
                };
            }
        }
    }
    return null;
}

function boundSuperCalls (baseClass, options) {
    var hasSuperCall = false;
    for (var funcName in options) {
        if (BUILTIN_ENTRIES.indexOf(funcName) < 0) {
            var func = options[funcName];
            if (typeof func === 'function') {
                var bounded = _boundSuperCall(func, funcName, baseClass);
                if (bounded) {
                    hasSuperCall = true;
                    options[funcName] = bounded;
                }
            }
        }
    }
    return hasSuperCall;
}

function declareProperties (cls, className, properties, baseClass, mixins) {
    cls.__props__ = [];

    if (baseClass && baseClass.__props__) {
        cls.__props__ = baseClass.__props__.slice();
    }

    if (mixins) {
        for (var m = 0; m < mixins.length; ++m) {
            var mixin = mixins[m];
            if (mixin.__props__) {
                cls.__props__ = cls.__props__.concat(mixin.__props__.filter(function (x) {
                    return cls.__props__.indexOf(x) < 0;
                }));
            }
        }
    }

    if (properties) {
        // 预处理属性
        preprocessAttrs(properties, className, cls);

        for (var propName in properties) {
            var val = properties[propName];
            var attrs = parseAttributes(val, className, propName);
            if ('default' in val) {
                defineProp(cls, className, propName, val.default, attrs);
            }
            else {
                defineGetSet(cls, className, propName, val, attrs);
            }
        }
    }
}

/**
 * @class _ComponentAttributes
 * @constructor
 */
/**
 * Automatically add required component as a dependency.
 *
 * @property requireComponent
 * @type {Component}
 * @default null
 */
/**
 * If specified to a type, prevents Component of the same type (or subtype) to be added more than once to a Node.
 *
 * @property disallowMultiple
 * @type {Component}
 * @default null
 */
/**
 * The menu path to register a component to the editors "Component" menu. Eg. "Rendering/Camera".
 *
 * @property menu
 * @type {String}
 * @default ""
 */
/**
 * Makes a component execute in edit mode.
 * By default, all components are only executed in play mode,
 * which means they will not have their callback functions executed while the Editor is in edit mode.
 *
 * @property executeInEditMode
 * @type {Boolean}
 * @default false
 */
/**
 * This property is only available if executeInEditMode is true.
 * If specified, the editor's scene view will keep updating this node in 60 fps when it is selected,
 * otherwise, it will update only if necessary.
 *
 * @property playOnFocus
 * @type {Boolean}
 * @default false
 */
/**
 * Specifying the url of the custom html to draw the component in inspector.
 *
 * @property inspector
 * @type {String}
 * @default ""
 */
/**
 * Specifying the url of the icon to display in inspector.
 *
 * @property icon
 * @type {String}
 * @default ""
 */

/**
 * The custom documentation URL
 *
 * @property help
 * @type {String}
 * @default ""
 */

/**
 * @module cc
 */

/**
 * !#en Defines a CCClass using the given specification, please see [Class](/en/scripting/class/) for details.
 * !#zh 定义一个 CCClass，传入参数必须是一个包含类型参数的字面量对象，具体用法请查阅[类型定义](/zh/scripting/class/)。
 * 
 * @method Class
 * 
 * @param {Object} [options]
 * @param {String} [options.name] - The class name used for serialization.
 * @param {Function} [options.extends] - The base class.
 * @param {Function} [options.ctor] - The constructor.
 * @param {Object} [options.properties] - The property definitions.
 * @param {Object} [options.statics] - The static members.
 * @param {Function[]} [options.mixins]
 * 
 * @param {Object} [options.editor] - attributes for Component, see {{#crossLink "_ComponentAttributes"}}ComponentAttributes{{/crossLink}}.
 * 
 * @param {Function} [options.update] - lifecycle method for Component, see {{#crossLink "Component/update:method"}}{{/crossLink}}
 * @param {Function} [options.lateUpdate] - lifecycle method for Component, see {{#crossLink "Component/lateUpdate:method"}}{{/crossLink}}
 * @param {Function} [options.onLoad] - lifecycle method for Component, see {{#crossLink "Component/onLoad:method"}}{{/crossLink}}
 * @param {Function} [options.start] - lifecycle method for Component, see {{#crossLink "Component/start:method"}}{{/crossLink}}
 * @param {Function} [options.onEnable] - lifecycle method for Component, see {{#crossLink "Component/onEnable:method"}}{{/crossLink}}
 * @param {Function} [options.onDisable] - lifecycle method for Component, see {{#crossLink "Component/onDisable:method"}}{{/crossLink}}
 * @param {Function} [options.onDestroy] - lifecycle method for Component, see {{#crossLink "Component/onDestroy:method"}}{{/crossLink}}
 * @param {Function} [options.onFocusInEditor] - lifecycle method for Component, see {{#crossLink "Component/onFocusInEditor:method"}}{{/crossLink}}
 * @param {Function} [options.onLostFocusInEditor] - lifecycle method for Component, see {{#crossLink "Component/onLostFocusInEditor:method"}}{{/crossLink}}
 * @param {Function} [options.onRestore] - for Component only, see {{#crossLink "Component/onRestore:method"}}{{/crossLink}}
 * @param {Function} [options._getLocalBounds] - for Component only, see {{#crossLink "Component/_getLocalBounds:method"}}{{/crossLink}}
 * 
 * @return {Function} - the created class
 * 
 * @example
 // define base class
 var Node = cc.Class();

 // define sub class
 var Sprite = cc.Class({
        name: 'Sprite',
        extends: Node,
        ctor: function () {
            this.url = "";
            this.id = 0;
        },

        properties {
            width: {
                default: 128,
                type: 'Integer',
                tooltip: 'The width of sprite'
            },
            height: 128,
            size: {
                get: function () {
                    return cc.v2(this.width, this.height);
                }
            }
        },

        load: function () {
            // load this.url
        };
    });

 // instantiate

 var obj = new Sprite();
 obj.url = 'sprite.png';
 obj.load();

 // define static member

 Sprite.count = 0;
 Sprite.getBounds = function (spriteList) {
        // ...
    };
 */
function CCClass (options) {
    if (arguments.length === 0) {
        return define();
    }
    if ( !options ) {
        cc.error('cc.Class: Option must be non-nil');
        return define();
    }

    var name = options.name;
    var base = options.extends/* || CCObject*/;
    var mixins = options.mixins;

    // create constructor
    var cls;
    cls = define(name, base, mixins, options.ctor, options);
    if (!name) {
        name = cc.js.getClassName(cls);
    }

    // define Properties
    var properties = options.properties;
    if (typeof properties === 'function' ||
        (base && base.__props__ === null) ||
        (mixins && mixins.some(function (x) {
            return x.__props__ === null;
        }))
    ) {
        deferredInitializer.push({cls: cls, props: properties, mixins: mixins});
        cls.__props__ = null;
    }
    else {
        declareProperties(cls, name, properties, base, options.mixins);
    }

    // define statics
    var statics = options.statics;
    if (statics) {
        var staticPropName;
        if (CC_DEV) {
            for (staticPropName in statics) {
                if (INVALID_STATICS.indexOf(staticPropName) !== -1) {
                    cc.error('Cannot define %s.%s because static member name can not be "%s".', name, staticPropName,
                        staticPropName);
                    continue;
                }
            }
        }
        for (staticPropName in statics) {
            cls[staticPropName] = statics[staticPropName];
        }
    }

    // define functions
    for (var funcName in options) {
        if (BUILTIN_ENTRIES.indexOf(funcName) >= 0) {
            continue;
        }
        if (CC_EDITOR && funcName === 'constructor') {
            cc.error('Can not define a member called "constructor" in the class "%s", please use "ctor" instead.', name);
            continue;
        }
        var func = options[funcName];
        if (typeof func === 'function' || func === null) {
            // use defineProperty to redefine some super method defined as getter
            Object.defineProperty(cls.prototype, funcName, {
                value: func,
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        else if (CC_DEV) {
            var correct = TYPO_TO_CORRECT[funcName];
            if (correct) {
                cc.warn('Unknown type of %s.%s, maybe you want is "%s".', name, funcName, correct);
            }
            else if (func) {
                cc.error('Unknown type of %s.%s, property should be defined in "properties" or "ctor"', name, funcName);
            }
        }
    }

    if (CC_DEV) {
        var editor = options.editor;
        if (editor) {
            if (cc.isChildClassOf(base, cc.Component)) {
                cc.Component._registerEditorProps(cls, editor);
            }
            else {
                cc.warn('Can not use "editor" attribute, "%s" not inherits from Components.', name);
            }
        }
    }

    return cls;
}

/**
 * Checks whether the constructor is created by cc.Class
 *
 * @method _isCCClass
 * @param {Function} constructor
 * @return {Boolean}
 * @private
 */
CCClass._isCCClass = function (constructor) {
    return !!constructor && typeof constructor.__ctors__ !== 'undefined';
};

//
// @method _convertToFireClass
// @param {Function} constructor
// @private
//
//CCClass._convertToFireClass = function (constructor) {
//    constructor.prop = _metaClass.prop;
//};

//
// Optimized define function only for internal classes
//
// @method _fastDefine
// @param {String} className
// @param {Function} constructor
// @param {string[]} serializableFields
// @private
//
CCClass._fastDefine = function (className, constructor, serializableFields) {
    JS.setClassName(className, constructor);
    constructor.__props__ = serializableFields;
    for (var i = 0; i < serializableFields.length; i++) {
        Attr.attr(constructor, serializableFields[i], { visible: false });
    }
};

CCClass.attr = Attr.attr;

var tmpAttrs = [];
function parseAttributes (attrs, className, propName) {
    var ERR_Type = CC_DEV ? 'The %s of %s must be type %s' : '';

    tmpAttrs.length = 0;
    var result = tmpAttrs;

    var type = attrs.type;
    if (type) {
        switch (type) {
            // Specify that the input value must be integer in Inspector.
            // Also used to indicates that the type of elements in array or the type of value in dictionary is integer.
            case 'Integer':
                result.push( { type: 'Integer'/*, expectedTypeOf: 'number'*/ } );
                break;
            // Indicates that the type of elements in array or the type of value in dictionary is double.
            case 'Float':
                result.push( { type: 'Float'/*, expectedTypeOf: 'number'*/ } );
                break;
            case 'Boolean':
                result.push({
                    type: 'Boolean',
                    //expectedTypeOf: 'number',
                    _onAfterProp: getTypeChecker('Boolean', 'Boolean')
                });
                break;
            case 'String':
                result.push({
                    type: 'String',
                    //expectedTypeOf: 'string',
                    _onAfterProp: getTypeChecker('String', 'String')
                });
                break;
            case 'Object':
                if (CC_DEV) {
                    cc.error('Please define "type" parameter of %s.%s as the actual constructor.', className, propName);
                }
                break;
            default:
                if (type === Attr.ScriptUuid) {
                    var attr = Attr.ObjectType(cc.ScriptAsset);
                    attr.type = 'Script';
                    result.push(attr);
                }
                else {
                    if (typeof type === 'object') {
                        if (Enum.isEnum(type)) {
                            result.push({
                                type: 'Enum',
                                //expectedTypeOf: 'number',
                                enumList: Enum.getList(type)
                            });
                        }
                        else if (CC_DEV) {
                            cc.error('Please define "type" parameter of %s.%s as the constructor of %s.', className, propName, type);
                        }
                    }
                    else if (typeof type === 'function') {
                        result.push(Attr.ObjectType(type));
                        //result.push( { expectedTypeOf: 'object' } );
                    }
                    else if (CC_DEV) {
                        cc.error('Unknown "type" parameter of %s.%s：%s', className, propName, type);
                    }
                }
                break;
        }
    }

    function parseSimpleAttr (attrName, expectType, attrCreater) {
        var val = attrs[attrName];
        if (val) {
            if (typeof val === expectType) {
                if (typeof attrCreater === 'undefined') {
                    var attr = {};
                    attr[attrName] = val;
                    result.push(attr);
                }
                else {
                    result.push(typeof attrCreater === 'function' ? attrCreater(val) : attrCreater);
                }
            }
            else if (CC_DEV) {
                cc.error('The %s of %s.%s must be type %s', attrName, className, propName, expectType);
            }
        }
    }

    parseSimpleAttr('rawType', 'string', Attr.RawType);
    parseSimpleAttr('editorOnly', 'boolean', Attr.EditorOnly);
    if (CC_DEV) {
        parseSimpleAttr('displayName', 'string');
        parseSimpleAttr('multiline', 'boolean', {multiline: true});
        parseSimpleAttr('readonly', 'boolean', {readonly: true});
        parseSimpleAttr('tooltip', 'string');
    }

    if (attrs.url) {
        result.push({ saveUrlAsAsset: true });
    }
    if (attrs.serializable === false) {
        result.push(Attr.NonSerialized);
    }
    if (CC_EDITOR) {
        if ('animatable' in attrs && !attrs.animatable) {
            result.push({ animatable: false });
        }
    }

    if (CC_DEV) {
        var visible = attrs.visible;
        if (typeof visible !== 'undefined') {
            if (!attrs.visible) {
                result.push({visible: false});
            }
        }
        else {
            var startsWithUS = (propName.charCodeAt(0) === 95);
            if (startsWithUS) {
                result.push({visible: false});
            }
        }
    }

    //if (attrs.custom) {
    //    result.push( { custom: attrs.custom });
    //}

    var range = attrs.range;
    if (range) {
        if (Array.isArray(range)) {
            if (range.length >= 2) {
                result.push(Attr.Range(range[0], range[1]));
            }
            else if (CC_DEV) {
                cc.error('The length of range array must be 2');
            }
        }
        else if (CC_DEV) {
            cc.error(ERR_Type, '"range"', className + '.' + propName, 'array');
        }
    }

    return result;
}

cc.Class = CCClass;

module.exports = {
    instantiateProps: instantiateProps,
    isArray: function (defaultVal) {
        defaultVal = getDefault(defaultVal);
        return Array.isArray(defaultVal);
    },
    fastDefine: CCClass._fastDefine
};

if (CC_EDITOR) {
    module.exports.getDefault = getDefault; 
}
