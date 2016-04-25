var JS = require('./js');

// definitions for CCObject.Flags

var Destroyed = 1 << 0;
var ToDestroy = 1 << 1;
var DontSave = 1 << 2;
var EditorOnly  = 1 << 3;
var Dirty = 1 << 4;
var DontDestroy = 1 << 5;
var Destroying = 1 << 6;
//var RegisteredInEditor = 1 << 8;
var HideInGame = 1 << 9;
var HideInEditor = 1 << 10;

var IsOnEnableCalled = 1 << 12;
var IsOnLoadCalled = 1 << 13;
var IsOnLoadStarted = 1 << 14;
var IsOnStartCalled = 1 << 15;

var IsRotationLocked = 1 << 16;
var IsScaleLocked = 1 << 17;
var IsAnchorLocked = 1 << 18;
var IsSizeLocked = 1 << 19;
var IsPositionLocked = 1 << 20;

var Hide = HideInGame | HideInEditor;
// should not clone or serialize these flags
var PersistentMask = ~(ToDestroy | Dirty | Destroying | DontDestroy |
                       IsOnEnableCalled | IsOnLoadStarted | IsOnLoadCalled | IsOnStartCalled
                       /*RegisteredInEditor*/);

/**
 * The base class of most of all the objects in Fireball.
 * @class Object
 * @constructor
 * @main
 * @private
 */
function CCObject () {
    /**
     * @property {String} _name
     * @default ""
     * @private
     */
    this._name = '';

    /**
     * @property {Number} _objFlags
     * @default 0
     * @private
     */
    this._objFlags = 0;
}

/**
 * Bit mask that controls object states.
 * @class Flags
 * @static
 * @private
 */
CCObject.Flags = {

    Destroyed: Destroyed,
    //ToDestroy: ToDestroy,

    /**
     * !#en The object will not be saved.
     * !#zh 该对象将不会被保存。
     * @property {Number} DontSave
     */
    DontSave: DontSave,

    /**
     * !#en The object will not be saved when building a player.
     * !#zh 构建项目时，该对象将不会被保存。
     * @property {Number} EditorOnly
     */
    EditorOnly: EditorOnly,

    Dirty: Dirty,

    /**
     * !#en Dont destroy automatically when loading a new scene.
     * !#zh 加载一个新场景时，不自动删除该对象
     * @property DontDestroy
     * @private
     */
    DontDestroy: DontDestroy,

    PersistentMask: PersistentMask,

    // FLAGS FOR ENGINE

    Destroying: Destroying,

    /**
     * !#en
     * Hide in game and hierarchy.
     * This flag is readonly, it can only be used as an argument of scene.addEntity() or Entity.createWithFlags().
     * !#zh
     * 在游戏和层级中隐藏该对象。<br/>
     * 该标记只读，它只能被用作 scene.addEntity()的一个参数。
     * @property {Number} HideInGame
     */
    HideInGame: HideInGame,

    // FLAGS FOR EDITOR

    /**
     * !#en This flag is readonly, it can only be used as an argument of scene.addEntity() or Entity.createWithFlags().
     * !#zh 该标记只读，它只能被用作 scene.addEntity()的一个参数。
     * @property {Number} HideInEditor
     */
    HideInEditor: HideInEditor,

    /**
     * !#en
     * Hide in game view, hierarchy, and scene view... etc.
     * This flag is readonly, it can only be used as an argument of scene.addEntity() or Entity.createWithFlags().
     * !#zh
     * 在游戏视图，层级，场景视图等等...中隐藏该对象。
     * 该标记只读，它只能被用作 scene.addEntity()的一个参数。
     * @property {Number} Hide
     */
    Hide: Hide,

    //// UUID Registered in editor
    //RegisteredInEditor: RegisteredInEditor,

    // FLAGS FOR COMPONENT

    IsOnLoadCalled: IsOnLoadCalled,
    IsOnLoadStarted: IsOnLoadStarted,
    IsOnEnableCalled: IsOnEnableCalled,
    IsOnStartCalled: IsOnStartCalled,

    IsPositionLocked: IsPositionLocked,
    IsRotationLocked: IsRotationLocked,
    IsScaleLocked: IsScaleLocked,
    IsAnchorLocked: IsAnchorLocked,
    IsSizeLocked: IsSizeLocked,
};

require('./CCClass').fastDefine('cc.Object', CCObject, ['_name', '_objFlags']);

// internal static

var objectsToDestroy = [];

function deferredDestroy () {
    var deleteCount = objectsToDestroy.length;
    for (var i = 0; i < deleteCount; ++i) {
        var obj = objectsToDestroy[i];
        if (!(obj._objFlags & Destroyed)) {
            obj._destroyImmediate();
        }
    }
    // if we called b.destory() in a.onDestroy(), objectsToDestroy will be resized,
    // but we only destroy the objects which called destory in this frame.
    if (deleteCount === objectsToDestroy.length) {
        objectsToDestroy.length = 0;
    }
    else {
        objectsToDestroy.splice(0, deleteCount);
    }

    if (CC_EDITOR) {
        deferredDestroyTimer = null;
    }
}

Object.defineProperty(CCObject, '_deferredDestroy', {
    value: deferredDestroy,
    // enumerable is false by default
});

if (CC_EDITOR) {
    Object.defineProperty(CCObject, '_clearDeferredDestroyTimer', {
        value: function () {
            if (deferredDestroyTimer !== null) {
                clearImmediate(deferredDestroyTimer);
                deferredDestroyTimer = null;
            }
        },
        enumerable: false
    });
}

// MEMBER

/**
 * @class Object
 */

var prototype = CCObject.prototype;

/**
 * !#en The name of the object.
 * !#zh 该对象的名称。
 * @property {String} name
 * @default ""
 * @example
 * obj.name = "New Obj";
 */
JS.getset(prototype, 'name',
    function () {
        return this._name;
    },
    function (value) {
        this._name = value;
    }
);

/**
 * !#en Indicates whether the object is not yet destroyed.
 * !#zh 表示该对象是否可用（被销毁后将不可用）。
 * @property {Boolean} isValid
 * @default true
 * @readOnly
 * @example
 * cc.log(obj.isValid);
 */
JS.get(prototype, 'isValid', function () {
    return !(this._objFlags & Destroyed);
});

var deferredDestroyTimer = null;

/**
 * !#en
 * Destroy this Object, and release all its own references to other objects.<br/>
 * <br/>
 * After destroy, this CCObject is not usable any more.<br/>
 * You can use cc.isValid(obj) (or obj.isValid if obj is non-nil) to check whether the object is destroyed before
 * accessing it.
 * !#zh
 * 销毁该对象，并释放所有它对其它对象的引用。<br/>
 * 销毁后，CCObject 不再可用。<br/>
 * 您可以在访问对象之前使用 cc.isValid(obj)（或 obj.isValid 如果 obj 不为 null）来检查对象是否已被销毁。
 * @method destroy
 * @return {Boolean} whether it is the first time the destroy being called
 * @example
 * obj.destroy();
 */
prototype.destroy = function () {
    if (this._objFlags & Destroyed) {
        cc.warn('object already destroyed');
        return false;
    }
    if (this._objFlags & ToDestroy) {
        return false;
    }
    this._objFlags |= ToDestroy;
    objectsToDestroy.push(this);

    if (CC_EDITOR && deferredDestroyTimer === null && cc.engine && ! cc.engine._isUpdating) {
        // auto destroy immediate in edit mode
        deferredDestroyTimer = setImmediate(deferredDestroy);
    }
    return true;
};

if (CC_DEV) {
    /**
     * !#en
     * In fact, Object's "destroy" will not trigger the destruct operation in Firebal Editor.
     * The destruct operation will be executed by Undo system later.
     * !#zh
     * 事实上，对象的 “destroy” 不会在编辑器中触发析构操作，
     * 析构操作将在 Undo 系统中延后执行。
     * @method realDestroyInEditor
     * @example
     * cc.log(obj.realDestroyInEditor());
     */
    prototype.realDestroyInEditor = function () {
        if (this._objFlags & Destroyed) {
            cc.warn('object already destroyed');
            return false;
        }
        if (this._objFlags & ToDestroy) {
            return false;
        }
        this._objFlags |= ToDestroy;
        objectsToDestroy.push(this);

        if (CC_EDITOR && deferredDestroyTimer === null && cc.engine && ! cc.engine._isUpdating) {
            // auto destroy immediate in edit mode
            deferredDestroyTimer = setImmediate(deferredDestroy);
        }
        return true;
    };
}

/**
 * Clear all references in the instance.
 *
 * NOTE: this method will not clear the getter or setter functions which defined in the INSTANCE of CCObject.
 *       You can override the _destruct method if you need.
 * @method _destruct
 * @private
 */
prototype._destruct = function () {
    if (CC_EDITOR && !(this._objFlags & Destroyed)) {
        return cc.error('object not yet destroyed');
    }
    // 所有可枚举到的属性，都会被清空
    for (var key in this) {
        if (this.hasOwnProperty(key)) {
            switch (typeof this[key]) {
                case 'string':
                    this[key] = '';
                    break;
                case 'object':
                case 'function':
                    this[key] = null;
                    break;
            }
        }
    }
};

/**
 * Called before the object being destroyed.
 * @method _onPreDestroy
 * @private
 */
prototype._onPreDestroy = null;

prototype._destroyImmediate = function () {
    if (this._objFlags & Destroyed) {
        cc.error('object already destroyed');
        return;
    }
    // engine internal callback
    if (this._onPreDestroy) {
        this._onPreDestroy();
    }

    if (!CC_EDITOR || cc.engine._isPlaying) {
        // 这里 _destruct 将由编辑器进行调用
        this._destruct();
    }

    // mark destroyed
    this._objFlags |= Destroyed;
};

if (CC_EDITOR) {
    /**
     * The customized serialization for this object. (Editor Only)
     * @method _serialize
     * @param {Boolean} exporting
     * @return {object} the serialized json data object
     * @private
     */
    prototype._serialize = null;
}

/**
 * Init this object from the custom serialized data.
 * @method _deserialize
 * @param {Object} data - the serialized json data
 * @param {_Deserializer} ctx
 * @private
 */
prototype._deserialize = null;

/**
 * @module cc
 */

/**
 * !#en Checks whether the object is non-nil and not yet destroyed.
 * !#zh 检查该对象是否不为 null 并且尚未销毁。
 * @method isValid
 * @param {any} value
 * @return {Boolean} whether is valid
 * @example
 * cc.log(cc.isValid(target));
 */
cc.isValid = function (value) {
    if (typeof value === 'object') {
        return !!value && !(value._objFlags & Destroyed);
    }
    else {
        return typeof value !== 'undefined';
    }
};

if (CC_DEV) {
    Object.defineProperty(CCObject, '_willDestroy', {
        value: function (obj) {
            return !(obj._objFlags & Destroyed) && (obj._objFlags & ToDestroy) > 0;
        }
    });
    Object.defineProperty(CCObject, '_cancelDestroy', {
        value: function (obj) {
            obj._objFlags &= ~ToDestroy;
            var index = objectsToDestroy.indexOf(obj);
            if (index !== -1) {
                objectsToDestroy.splice(index, 1);
            }
        }
    });
}

cc.Object = CCObject;
module.exports = CCObject;
