/****************************************************************************
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
var JS = cc.js;
var SceneGraphHelper = require('./scene-graph-helper');
var Destroying = require('../platform/CCObject').Flags.Destroying;
var DirtyFlags = require('./misc').DirtyFlags;
var IdGenerater = require('../platform/id-generater');

// called after changing parent
function setMaxZOrder (node) {
    var siblings = node.parent.getChildren();
    var z = 0;
    if (siblings.length >= 2) {
        var prevNode = siblings[siblings.length - 2];
        z = prevNode.getOrderOfArrival() + 1;
    }
    node.setOrderOfArrival(z);
    return z;
}

var POSITION_CHANGED = 'position-changed';
var ROTATION_CHANGED = 'rotation-changed';
var SCALE_CHANGED = 'scale-changed';
var SIZE_CHANGED = 'size-changed';
var ANCHOR_CHANGED = 'anchor-changed';
var CHILD_ADDED = 'child-added';
var CHILD_REMOVED = 'child-removed';
var CHILD_REORDER = 'child-reorder';

var ERR_INVALID_NUMBER = CC_EDITOR && 'The %s is invalid';

var idGenerater = new IdGenerater('Node');

/**
 * A base node for CCNode and CCEScene, it will:
 * - provide the same api with origin cocos2d rendering node (SGNode)
 * - maintains properties of the internal SGNode
 * - retain and release the SGNode
 * - serialize datas for SGNode (but SGNode itself will not being serialized)
 * - notifications if some properties changed
 * - define some interfaces shares between CCNode and CCEScene
 *
 *
 * @class _BaseNode
 * @extends Object
 * @private
 */
var BaseNode = cc.Class(/** @lends cc.Node# */{
    extends: cc.Object,
    mixins: [cc.EventTarget],

    properties: {

        // SERIALIZABLE

        _opacity: 255,
        _color: cc.Color.WHITE,
        _cascadeOpacityEnabled: true,
        _parent: null,
        _anchorPoint: cc.p(0.5, 0.5),
        _contentSize: cc.size(0, 0),
        _children: [],
        _rotationX: 0,
        _rotationY: 0.0,
        _scaleX: 1.0,
        _scaleY: 1.0,
        _position: cc.p(0, 0),
        _skewX: 0,
        _skewY: 0,
        _localZOrder: 0,
        _globalZOrder: 0,
        _tag: cc.macro.NODE_TAG_INVALID,
        _opacityModifyRGB: false,
        _reorderChildDirty: false,

        // API

        /**
         * !#en Name of node.
         * !#zh 该节点名称。
         * @property name
         * @type {String}
         * @example
         * node.name = "New Node";
         * cc.log("Node Name: " + node.name);
         */
        name: {
            get: function () {
                return this._name;
            },
            set: function (value) {
                this._name = value;
            },
        },

        /**
         * !#en The parent of the node.
         * !#zh 该节点的父节点。
         * @property parent
         * @type {Node}
         * @default null
         * @example
         * node.parent = newNode;
         */
        parent: {
            get: function () {
                return this._parent;
            },
            set: function (value) {
                if (this._parent === value) {
                    return;
                }
                if (CC_EDITOR && !cc.engine.isPlaying) {
                    if (_Scene.DetectConflict.beforeAddChild(this)) {
                        return;
                    }
                }
                var node = this._sgNode;
                if (node.parent) {
                    node.parent.removeChild(node, false);
                }
                if (value) {
                    var parent = value._sgNode;
                    parent.addChild(node);
                    setMaxZOrder(node);
                    value._children.push(this);
                    value.emit(CHILD_ADDED, this);
                }
                //
                var oldParent = this._parent;
                this._parent = value || null;
                if (oldParent) {
                    if (!(oldParent._objFlags & Destroying)) {
                        var removeAt = oldParent._children.indexOf(this);
                        if (removeAt < 0 && CC_EDITOR) {
                            return cc.error('Internal error, should not remove unknown node from parent.');
                        }
                        oldParent._children.splice(removeAt, 1);
                        oldParent.emit(CHILD_REMOVED, this);
                        this._onHierarchyChanged(oldParent);
                    }
                }
                else if (value) {
                    this._onHierarchyChanged(null);
                }
            },
        },

        _id: {
            default: '',
            editorOnly: true
        },

        /**
         * !#en The uuid for editor, will be stripped before building project.
         * !#zh 用于编辑器使用的 uuid，在构建项目之前将会被剔除。
         * @property uuid
         * @type {String}
         * @readOnly
         * @example
         * cc.log("Node Uuid: " + node.uuid);
         */
        uuid: {
            get: function () {
                var id = this._id;
                if ( !id ) {
                    id = this._id = CC_EDITOR ? Editor.UuidUtils.uuid() : idGenerater.getNewId();
                }
                return id;
            }
        },

        /**
         * !#en Skew x
         * !#zh 该节点 Y 轴倾斜角度。
         * @property skewX
         * @type {Number}
         * @example
         * node.skewX = 0;
         * cc.log("Node SkewX: " + node.skewX);
         */
        skewX: {
            get: function () {
                return this._skewX;
            },
            set: function (value) {
                this._skewX = value;
                this._sgNode.skewX = value;
            }
        },

        /**
         * !#en Skew y
         * !#zh 该节点 X 轴倾斜角度。
         * @property skewY
         * @type {Number}
         * @example
         * node.skewY = 0;
         * cc.log("Node SkewY: " + node.skewY);
         */
        skewY: {
            get: function () {
                return this._skewY;
            },
            set: function (value) {
                this._skewY = value;
                this._sgNode.skewY = value;
            }
        },

        /**
         * !#en Z order in depth which stands for the drawing order.
         * !#zh 该节点渲染排序的 Z 轴深度。
         * @property zIndex
         * @type {Number}
         * @example
         * node.zIndex = 1;
         * cc.log("Node zIndex: " + node.zIndex);
         */
        zIndex: {
            get: function () {
                return this._localZOrder;
            },
            set: function (value) {
                this._localZOrder = value;
                this._sgNode.zIndex = value;

                if (!CC_JSB && this._parent) {
                    this._parent._reorderChildDirty = true;
                    this._parent._delaySort();
                    cc.eventManager._setDirtyForNode(this);
                }
            }
        },

        /**
         * !#en Rotation of node.
         * !#zh 该节点旋转角度。
         * @property rotation
         * @type {Number}
         * @example
         * node.rotation = 90;
         * cc.log("Node Rotation: " + node.rotation);
         */
        rotation: {
            get: function () {
                if (this._rotationX !== this._rotationY)
                    cc.log(cc._LogInfos.Node.getRotation);
                return this._rotationX;
            },
            set: function (value) {
                if (this._rotationX !== value || this._rotationY !== value ) {
                    var old = this._rotationX;
                    this._rotationX = this._rotationY = value;
                    this._sgNode.rotation = value;
                    this.emit(ROTATION_CHANGED, old);
                }
            }
        },

        /**
         * !#en Rotation on x axis.
         * !#zh 该节点 X 轴旋转角度。
         * @property rotationX
         * @type {Number}
         * @example
         * node.rotationX = 45;
         * cc.log("Node Rotation X: " + node.rotationX);
         */
        rotationX: {
            get: function () {
                return this._rotationX;
            },
            set: function (value) {
                if (this._rotationX !== value) {
                    var old = this._rotationX;
                    this._rotationX = value;
                    this._sgNode.rotationX = value;
                    this.emit(ROTATION_CHANGED, old);
                }
            },
        },

        /**
         * !#en Rotation on y axis.
         * !#zh 该节点 Y 轴旋转角度。
         * @property rotationY
         * @type {Number}
         * @example
         * node.rotationY = 45;
         * cc.log("Node Rotation Y: " + node.rotationY);
         */
        rotationY: {
            get: function () {
                return this._rotationY;
            },
            set: function (value) {
                if (this._rotationY !== value) {
                    // yes, ROTATION_CHANGED always send last rotation x...
                    var oldX = this._rotationX;

                    this._rotationY = value;
                    this._sgNode.rotationY = value;
                    this.emit(ROTATION_CHANGED, oldX);
                }
            },
        },

        /**
         * !#en Scale on x axis.
         * !#zh 节点 X 轴缩放。
         * @property scaleX
         * @type {Number}
         * @example
         * node.scaleX = 0.5;
         * cc.log("Node Scale X: " + node.scaleX);
         */
        scaleX: {
            get: function () {
                return this._scaleX;
            },
            set: function (value) {
                if (this._scaleX !== value) {
                    var oldX = this._scaleX;
                    this._scaleX = value;
                    this._sgNode.scaleX = value;
                    this.emit(SCALE_CHANGED, new cc.Vec2(oldX, this._scaleY));
                }
            },
        },

        /**
         * !#en Scale on y axis.
         * !#zh 节点 Y 轴缩放。
         * @property scaleY
         * @type {Number}
         * @example
         * node.scaleY = 0.5;
         * cc.log("Node Scale Y: " + node.scaleY);
         */
        scaleY: {
            get: function () {
                return this._scaleY;
            },
            set: function (value) {
                if (this._scaleY !== value) {
                    var oldY = this._scaleY;
                    this._scaleY = value;
                    this._sgNode.scaleY = value;
                    this.emit(SCALE_CHANGED, new cc.Vec2(this._scaleX, oldY));
                }
            },
        },

        /**
         * !#en x axis position of node.
         * !#zh 节点 X 轴坐标。
         * @property x
         * @type {Number}
         * @example
         * node.x = 100;
         * cc.log("Node Position X: " + node.x);
         */
        x: {
            get: function () {
                return this._position.x;
            },
            set: function (value) {
                var localPosition = this._position;
                if (value !== localPosition.x) {
                    if (isFinite(value) || !CC_EDITOR) {
                        var oldValue = localPosition.x;

                        localPosition.x = value;
                        this._sgNode.x = value;

                        if (this.emit) {
                            this.emit(POSITION_CHANGED, new cc.Vec2(oldValue, localPosition.y));
                        }
                    }
                    else {
                        cc.error(ERR_INVALID_NUMBER, 'new x');
                    }
                }
            },
        },

        /**
         * !#en y axis position of node.
         * !#zh 节点 Y 轴坐标。
         * @property y
         * @type {Number}
         * @example
         * node.y = 100;
         * cc.log("Node Position Y: " + node.y);
         */
        y: {
            get: function () {
                return this._position.y;
            },
            set: function (value) {
                var localPosition = this._position;
                if (value !== localPosition.y) {
                    if (isFinite(value) || !CC_EDITOR) {
                        var oldValue = localPosition.y;

                        localPosition.y = value;
                        this._sgNode.y = value;

                        if (this.emit) {
                            this.emit(POSITION_CHANGED, new cc.Vec2(localPosition.x, oldValue));
                        }
                    }
                    else {
                        cc.error(ERR_INVALID_NUMBER, 'new y');
                    }
                }
            },
        },

        /**
         * !#en All children nodes.
         * !#zh 节点的所有子节点。
         * @property children
         * @type {Node[]}
         * @readOnly
         * @example
         * var children = node.children;
         * for (var i = 0; i < children.lenght; ++i) {
         *     cc.log("Node: " + children[i]);
         * }
         */
        children: {
            get: function () {
                return this._children;
            }
        },

        /**
         * !#en All children nodes.
         * !#zh 节点的子节点数量。
         * @property childrenCount
         * @type {Number}
         * @readOnly
         * @example
         * var count = node.childrenCount;
         * cc.log("Node Children Count: " + count);
         */
        childrenCount: {
            get: function () {
                return this._children.length;
            }
        },

        /**
         * !#en Anchor point's position on x axis.
         * !#zh 节点 X 轴锚点位置。
         * @property anchorX
         * @type {Number}
         * @example
         * node.anchorX = 0;
         */
        anchorX: {
            get: function () {
                return this._anchorPoint.x;
            },
            set: function (value) {
                if (this._anchorPoint.x !== value) {
                    var old = cc.v2(this._anchorPoint);
                    this._anchorPoint.x = value;
                    this._onAnchorChanged();
                    this.emit(ANCHOR_CHANGED, old);
                }
            },
        },

        /**
         * !#en Anchor point's position on y axis.
         * !#zh 节点 Y 轴锚点位置。
         * @property anchorY
         * @type {Number}
         * @example
         * node.anchorY = 0;
         */
        anchorY: {
            get: function () {
                return this._anchorPoint.y;
            },
            set: function (value) {
                if (this._anchorPoint.y !== value) {
                    var old = cc.v2(this._anchorPoint);
                    this._anchorPoint.y = value;
                    this._onAnchorChanged();
                    this.emit(ANCHOR_CHANGED, old);
                }
            },
        },

        /**
         * !#en Width of node.
         * !#zh 节点宽度。
         * @property width
         * @type {Number}
         * @example
         * node.width = 100;
         */
        width: {
            get: function () {
                if (this._sizeProvider) {
                    var w = this._sizeProvider._getWidth();
                    this._contentSize.width = w;
                    return w;
                }
                else {
                    return this._contentSize.width;
                }
            },
            set: function (value) {
                if (value !== this._contentSize.width) {
                    if (this._sizeProvider) {
                        this._sizeProvider.setContentSize(value, this._sizeProvider._getHeight());
                    }
                    var clone = cc.size(this._contentSize);
                    this._contentSize.width = value;
                    this.emit(SIZE_CHANGED, clone);
                }
            },
        },

        /**
         * !#en Height of node.
         * !#zh 节点高度。
         * @property height
         * @type {Number}
         * @example
         * node.height = 100;
         */
        height: {
            get: function () {
                if (this._sizeProvider) {
                    var h = this._sizeProvider._getHeight();
                    this._contentSize.height = h;
                    return h;
                }
                else {
                    return this._contentSize.height;
                }
            },
            set: function (value) {
                if (value !== this._contentSize.height) {
                    if (this._sizeProvider) {
                        this._sizeProvider.setContentSize(this._sizeProvider._getWidth(), value);
                    }
                    var clone = cc.size(this._contentSize);
                    this._contentSize.height = value;
                    this.emit(SIZE_CHANGED, clone);
                }
            },
        },

        //running: {
        //    get: 
        //},

        /**
         * Indicate whether ignore the anchor point property for positioning.
         * @property _ignoreAnchor
         * @type {Boolean}
         * @private
         */
        _ignoreAnchor: {
            get: function () {
                return this.__ignoreAnchor;
            },
            set: function (value) {
                if (this.__ignoreAnchor !== value) {
                    this.__ignoreAnchor = value;
                    this._sgNode.ignoreAnchor = value;
                    this._onAnchorChanged();
                    this.emit(ANCHOR_CHANGED, this._anchorPoint);
                }
            },
        },

        /**
         * !#en Tag of node.
         * !#zh 节点标签。
         * @property tag
         * @type {Number}
         * @example
         * node.tag = 1001;
         */
        tag: {
            get: function () {
                return this._tag;
            },
            set: function (value) {
                this._tag = value;
                this._sgNode.tag = value;
            },
        },

        /**
         * !#en Opacity of node, default value is 255.
         * !#zh 节点透明度，默认值为 255。
         * @property opacity
         * @type {Number}
         * @example
         * node.opacity = 255;
         */
        opacity: {
            get: function () {
                return this._opacity;
            },
            set: function (value) {
                if (this._opacity !== value) {
                    this._opacity = value;
                    this._sgNode.opacity = value;

                    if (this._sizeProvider && !this._cascadeOpacityEnabled) {
                        this._sizeProvider.setOpacity(value);
                    }
                }
            },
            range: [0, 255]
        },

        /**
         * !#en Indicate whether node's opacity value affect its child nodes, default value is false.
         * !#zh 节点的不透明度值是否影响其子节点，默认值为 false。
         * @property cascadeOpacity
         * @type {Boolean}
         * @example
         * cc.log("CascadeOpacity: " + node.cascadeOpacity);
         */
        cascadeOpacity: {
            get: function () {
                return this._cascadeOpacityEnabled;
            },
            set: function (value) {
                if (this._cascadeOpacityEnabled !== value) {
                    this._cascadeOpacityEnabled = value;
                    this._sgNode.cascadeOpacity = value;
                    this._onCascadeChanged();
                }
            },
        },

        /**
         * !#en Color of node, default value is white: (255, 255, 255).
         * !#zh 节点颜色。默认为白色，数值为：（255，255，255）。
         * @property color
         * @type {Color}
         * @example
         * node.color = new cc.Color(255, 255, 255);
         */
        color: {
            get: function () {
                var color = this._color;
                return new cc.Color(color.r, color.g, color.b, color.a);
            },
            set: function (value) {
                if ( !this._color.equals(value) ) {
                    var color = this._color;
                    var old = cc.color(color);
                    color.r = value.r;
                    color.g = value.g;
                    color.b = value.b;
                    if (CC_DEV && value.a !== 255) {
                        cc.warn('Should not set alpha via "color", set "opacity" please.');
                    }
                    if (this._sizeProvider) {
                        this._sizeProvider.setColor(this.value);
                    }
                    this.emit(COLOR_CHANGED, old);
                }
            },
        },
    },

    ctor: function () {
        // dont reset _id when destroyed
        Object.defineProperty(this, '_id', {
            value: '',
            enumerable: false
        });

        var sgNode = this._sgNode = new _ccsg.Node();
        if (cc.sys.isNative) {
            sgNode.retain();
            var entity = this;
            sgNode.onEnter = function () {
                _ccsg.Node.prototype.onEnter.call(this);
                if (!entity._active) {
                    cc.director.getActionManager().pauseTarget(this);
                    cc.eventManager.pauseTarget(this);
                }
            };
        }
        if (!cc.game._isCloning) {
            sgNode.cascadeOpacity = true;
        }

        this._dirtyFlags = DirtyFlags.ALL;

        /**
         * Current active scene graph node which provides content size.
         *
         * @property _sizeProvider
         * @type {Object}
         * @private
         */
        // _ccsg.Node
        this._sizeProvider = null;

        this.__ignoreAnchor = false;
    },

    _onPreDestroy: function () {
        this._sgNode.release();
    },

    // ABSTRACT INTERFACES

    // called when the node's parent changed
    _onHierarchyChanged: null,
    // called when the node's anchor changed
    _onAnchorChanged: null,
    // called when the node's cascadeOpacity or cascadeColor changed
    _onCascadeChanged: null,
    // called when the node's isOpacityModifyRGB changed
    _onOpacityModifyRGBChanged: null,


    /*
     * Initializes the instance of cc.Node
     * @method init
     * @returns {Boolean} Whether the initialization was successful.
     * @deprecated, no need anymore
     */
    init: function () {
        return true;
    },

    /**
     * !#en
     * Properties configuration function </br>
     * All properties in attrs will be set to the node, </br>
     * when the setter of the node is available, </br>
     * the property will be set via setter function.</br>
     * !#zh 属性配置函数。在 attrs 的所有属性将被设置为节点属性。
     * @method attr
     * @param {Object} attrs - Properties to be set to node
     * @example
     * var attrs = { key: 0, num: 100 };
     * node.attr(attrs);
     */
    attr: function (attrs) {
        for (var key in attrs) {
            this[key] = attrs[key];
        }
    },

    /**
     * !#en
     * Defines the oder in which the nodes are renderer.
     * Nodes that have a Global Z Order lower, are renderer first.
     * <br/>
     * In case two or more nodes have the same Global Z Order, the oder is not guaranteed.
     * The only exception if the Nodes have a Global Z Order == 0. In that case, the Scene Graph order is used.
     * <br/>
     * By default, all nodes have a Global Z Order = 0. That means that by default, the Scene Graph order is used to render the nodes.
     * <br/>
     * Global Z Order is useful when you need to render nodes in an order different than the Scene Graph order.
     * <br/>
     * Limitations: Global Z Order can't be used used by Nodes that have SpriteBatchNode as one of their ancestors.
     * And if ClippingNode is one of the ancestors, then "global Z order" will be relative to the ClippingNode.
     * !#zh
     * 定义节点的渲染顺序。
     * 节点具有全局 Z 顺序，顺序越小的节点，最先渲染。
     * </br>
     * 假设两个或者更多的节点拥有相同的全局 Z 顺序，那么渲染顺序无法保证。
     * 唯一的例外是如果节点的全局 Z 顺序为零，那么场景中的顺序是可以使用默认的。
     * </br>
     * 所有的节点全局 Z 顺序都是零。这就是说，默认使用场景中的顺序来渲染节点。
     * </br>
     * 全局 Z 顺序是非常有用的当你需要渲染节点按照不同的顺序而不是场景顺序。
     * </br>
     * 局限性: 全局 Z 顺序不能够被拥有继承 “SpriteBatchNode” 的节点使用。
     * 并且如果 “ClippingNode” 是其中之一的上代，那么 “global Z order” 将会和 “ClippingNode” 有关。
     * @method setGlobalZOrder
     * @param {Number} globalZOrder
     * @example
     * node.setGlobalZOrder(0);
     */
    setGlobalZOrder: function (globalZOrder) {
        this._globalZOrder = globalZOrder;
        this._sgNode.setGlobalZOrder(globalZOrder);
    },

    /**
     * !#en Return the Node's Global Z Order.
     * !#zh 获取节点的全局 Z 顺序。
     * @method getGlobalZOrder
     * @returns {number} The node's global Z order
     * @example
     * cc.log("Global Z Order: " + node.getGlobalZOrder());
     */
    getGlobalZOrder: function () {
        this._globalZOrder = this._sgNode.getGlobalZOrder();
        return this._globalZOrder;
    },

    /**
     * !#en
     * Returns the scale factor of the node.
     * Assertion will fail when _scaleX != _scaleY.
     * !#zh 获取节点的缩放。当 X 轴和 Y 轴有相同的缩放数值时。
     * @method getScale
     * @return {Number} The scale factor
     * @example
     * cc.log("Node Scale: " + node.getScale());
     */
    getScale: function () {
        if (this._scaleX !== this._scaleY)
            cc.log(cc._LogInfos.Node.getScale);
        return this._scaleX;
    },

    /**
     * !#en Sets the scale factor of the node. 1.0 is the default scale factor. This function can modify the X and Y scale at the same time.
     * !#zh 设置节点的缩放比例，默认值为 1.0。这个函数可以在同一时间修改 X 和 Y 缩放。
     * @method setScale
     * @param {Number|Vec2} scale - scaleX or scale
     * @param {Number} [scaleY=scale]
     * @example
     * node.setScale(cc.v2(1, 1));
     * node.setScale(1, 1);
     */
    setScale: function (scale, scaleY) {
        if (scale instanceof cc.Vec2) {
            scaleY = scale.y;
            scale = scale.x
        }
        else {
            scaleY = (scaleY || scaleY === 0) ? scaleY : scale;
        }
        if (this._scaleX !== scale || this._scaleY !== scaleY) {
            var old = new cc.Vec2(this._scaleX, this._scaleY);
            this._scaleX = scale;
            this._scaleY = scaleY;
            this._sgNode.setScale(scale, scaleY);
            this.emit(SCALE_CHANGED, old);
        }
    },

    /**
     * !#en Returns a copy of the position (x,y) of the node in cocos2d coordinates. (0,0) is the left-bottom corner.
     * !#zh 获取在父节点坐标系中节点的位置（ x , y ）。
     * @method getPosition
     * @return {Vec2} The position (x,y) of the node in OpenGL coordinates
     * @example
     * cc.log("Node Position: " + node.getPosition());
     */
    getPosition: function () {
        return cc.p(this._position);
    },

    /**
     * !#en
     * Changes the position (x,y) of the node in cocos2d coordinates.<br/>
     * The original point (0,0) is at the left-bottom corner of screen.<br/>
     * Usually we use cc.v2(x,y) to compose CCVec2 object.<br/>
     * and Passing two numbers (x,y) is more efficient than passing CCPoint object.
     * !#zh
     * 设置节点在父坐标系中的位置。<br/>
     * 可以通过 2 种方式设置坐标点：<br/>
     * 1.传入 cc.v2(x, y) 类型为 cc.Vec2 的对象。<br/>
     * 2.传入 2 个数值 x 和 y。
     * @method setPosition
     * @param {Vec2|Number} newPosOrxValue - The position (x,y) of the node in coordinates or the X coordinate for position
     * @param {Number} [yValue] - Y coordinate for position
     * @example {@link utils/api/engine/docs/cocos2d/core/utils/base-node/setPosition.js}
     */
    setPosition: function (newPosOrxValue, yValue) {
        var xValue;
        if (yValue === undefined) {
            xValue = newPosOrxValue.x;
            yValue = newPosOrxValue.y;
        }
        else {
            xValue = newPosOrxValue;
            yValue = yValue;
        }

        var locPosition = this._position;
        if(locPosition.x === xValue && locPosition.y === yValue) {
            return;
        }

        var oldPosition = new cc.Vec2(locPosition);

        if (isFinite(xValue) || !CC_EDITOR) {
            locPosition.x = xValue;
        }
        else {
            return cc.error(ERR_INVALID_NUMBER, 'x of new position');
        }
        if (isFinite(yValue) || !CC_EDITOR) {
            locPosition.y = yValue;
        }
        else {
            return cc.error(ERR_INVALID_NUMBER, 'y of new position');
        }

        this._sgNode.setPosition(locPosition);

        if (this.emit) {
            this.emit(POSITION_CHANGED, oldPosition);
        }
    },

    /**
     * !#en
     * Returns a copy of the anchor point.<br/>
     * Anchor point is the point around which all transformations and positioning manipulations take place.<br/>
     * It's like a pin in the node where it is "attached" to its parent. <br/>
     * The anchorPoint is normalized, like a percentage. (0,0) means the bottom-left corner and (1,1) means the top-right corner. <br/>
     * But you can use values higher than (1,1) and lower than (0,0) too.  <br/>
     * The default anchor point is (0.5,0.5), so it starts at the center of the node.
     * !#zh
     * 获取节点锚点，用百分比表示。<br/>
     * 锚点应用于所有变换和坐标点的操作，它就像在节点上连接其父节点的大头针。<br/>
     * 锚点是标准化的，就像百分比一样。(0，0) 表示左下角，(1，1) 表示右上角。<br/>
     * 但是你可以使用比（1，1）更高的值或者比（0，0）更低的值。<br/>
     * 默认的锚点是（0.5，0.5），因此它开始于节点的中心位置。<br/>
     * 注意：Creator 中的锚点仅用于定位所在的节点，子节点的定位不受影响。
     * @method getAnchorPoint
     * @return {Vec2} The anchor point of node.
     * @example
     * cc.log("Node AnchorPoint: " + node.getAnchorPoint());
     */
    getAnchorPoint: function () {
        return cc.p(this._anchorPoint);
    },

    /**
     * !#en
     * Sets the anchor point in percent. <br/>
     * anchor point is the point around which all transformations and positioning manipulations take place. <br/>
     * It's like a pin in the node where it is "attached" to its parent. <br/>
     * The anchorPoint is normalized, like a percentage. (0,0) means the bottom-left corner and (1,1) means the top-right corner.<br/>
     * But you can use values higher than (1,1) and lower than (0,0) too.<br/>
     * The default anchor point is (0.5,0.5), so it starts at the center of the node.
     * !#zh
     * 设置锚点的百分比。<br/>
     * 锚点应用于所有变换和坐标点的操作，它就像在节点上连接其父节点的大头针。<br/>
     * 锚点是标准化的，就像百分比一样。(0，0) 表示左下角，(1，1) 表示右上角。<br/>
     * 但是你可以使用比（1，1）更高的值或者比（0，0）更低的值。<br/>
     * 默认的锚点是（0.5，0.5），因此它开始于节点的中心位置。<br/>
     * 注意：Creator 中的锚点仅用于定位所在的节点，子节点的定位不受影响。
     * @method setAnchorPoint
     * @param {Vec2|Number} point - The anchor point of node or The x axis anchor of node.
     * @param {Number} [y] - The y axis anchor of node.
     * @example
     * node.setAnchorPoint(cc.v2(1, 1));
     * node.setAnchorPoint(1, 1);
     */
    setAnchorPoint: function (point, y) {
        var locAnchorPoint = this._anchorPoint;
        var old;
        if (y === undefined) {
            if ((point.x === locAnchorPoint.x) && (point.y === locAnchorPoint.y))
                return;
            old = cc.v2(locAnchorPoint);
            locAnchorPoint.x = point.x;
            locAnchorPoint.y = point.y;
        } else {
            if ((point === locAnchorPoint.x) && (y === locAnchorPoint.y))
                return;
            old = cc.v2(locAnchorPoint);
            locAnchorPoint.x = point;
            locAnchorPoint.y = y;
        }
        this._onAnchorChanged();
        this.emit(ANCHOR_CHANGED, old);
    },

    /**
     * !#en
     * Returns a copy of the anchor point in absolute pixels.  <br/>
     * you can only read it. If you wish to modify it, use setAnchorPoint.
     * !#zh
     * 返回锚点的绝对像素位置。<br/>
     * 你只能读它。如果您要修改它，使用 setAnchorPoint。
     * @see cc.Node#getAnchorPoint
     * @method getAnchorPointInPoints
     * @return {Vec2} The anchor point in absolute pixels.
     * @example
     * cc.log("AnchorPointInPoints: " + node.getAnchorPointInPoints());
     */
    getAnchorPointInPoints: function () {
        return this._sgNode.getAnchorPointInPoints();
    },

    /**
     * !#en
     * Returns a copy the untransformed size of the node. <br/>
     * The contentSize remains the same no matter the node is scaled or rotated.<br/>
     * All nodes has a size. Layer and Scene has the same size of the screen by default. <br/>
     * !#zh 获取节点自身大小，不受该节点是否被缩放或者旋转的影响。
     * @method getContentSize
     * @param {Boolean} [ignoreSizeProvider=false] - true if you need to get the original size of the node
     * @return {Size} The untransformed size of the node.
     * @example
     * cc.log("Content Size: " + node.getContentSize());
     */
    getContentSize: function (ignoreSizeProvider) {
        if (this._sizeProvider && !ignoreSizeProvider) {
            var size = this._sizeProvider.getContentSize();
            this._contentSize = size;
            return size;
        }
        else {
            return cc.size(this._contentSize);
        }
    },

    /**
     * !#en
     * Sets the untransformed size of the node.<br/>
     * The contentSize remains the same no matter the node is scaled or rotated.<br/>
     * All nodes has a size. Layer and Scene has the same size of the screen.
     * !#zh 设置节点原始大小，不受该节点是否被缩放或者旋转的影响。
     * @method setContentSize
     * @param {Size|Number} size - The untransformed size of the node or The untransformed size's width of the node.
     * @param {Number} [height] - The untransformed size's height of the node.
     * @example
     * node.setContentSize(cc.size(100, 100));
     * node.setContentSize(100, 100);
     */
    setContentSize: function (size, height) {
        var locContentSize = this._contentSize;
        var clone;
        if (height === undefined) {
            if ((size.width === locContentSize.width) && (size.height === locContentSize.height))
                return;
            clone = cc.size(locContentSize);
            locContentSize.width = size.width;
            locContentSize.height = size.height;
        } else {
            if ((size === locContentSize.width) && (height === locContentSize.height))
                return;
            clone = cc.size(locContentSize);
            locContentSize.width = size;
            locContentSize.height = height;
        }
        if (this._sizeProvider) {
            this._sizeProvider.setContentSize(locContentSize);
        }
        this.emit(SIZE_CHANGED, clone);
    },

    /**
     * !#en
     * Returns a "local" axis aligned bounding box of the node. <br/>
     * The returned box is relative only to its parent.
     * !#zh 返回父节坐标系下的轴向对齐的包围盒。
     * @method getBoundingBox
     * @return {Rect} The calculated bounding box of the node
     * @example
     * var boundingBox = node.getBoundingBox();
     */
    getBoundingBox: function () {
        var size = this.getContentSize();
        var rect = cc.rect( 0, 0, size.width, size.height );
        return cc._rectApplyAffineTransformIn(rect, this.getNodeToParentTransform());
    },

    /**
     * !#en Stops all running actions and schedulers.
     * !#zh 停止所有正在播放的动作和计时器。
     * @method cleanup
     * @example
     * node.cleanup();
     */
    cleanup: function () {
        // actions
        cc.director.getActionManager().removeAllActionsFromTarget(this);
        // event
        cc.eventManager.removeListeners(this);

        // children
        var i, len = this._children.length, node;
        for (i = 0; i < len; ++i) {
            node = this._children[i];
            if (node)
                node.cleanup();
        }
    },

    // composition: GET

    /**
     * !#en Returns a child from the container given its tag.
     * !#zh 通过标签获取节点的子节点。
     * @method getChildByTag
     * @param {Number} aTag - An identifier to find the child node.
     * @return {Node} a CCNode object whose tag equals to the input parameter
     * @example
     * var child = node.getChildByTag(1001);
     */
    getChildByTag: function (aTag) {
        var children = this._children;
        if (children !== null) {
            for (var i = 0; i < children.length; i++) {
                var node = children[i];
                if (node && node.tag === aTag)
                    return node;
            }
        }
        return null;
    },

    /**
     * !#en Returns a child from the container given its uuid.
     * !#zh 通过 uuid 获取节点的子节点。
     * @method getChildByUuid
     * @param {String} uuid - The uuid to find the child node.
     * @return {Node} a Node whose uuid equals to the input parameter
     * @example
     * var child = node.getChildByUuid(uuid);
     */
    getChildByUuid: function(uuid){
        if(!uuid){
            cc.log("Invalid uuid");
            return null;
        }

        var locChildren = this._children;
        for(var i = 0, len = locChildren.length; i < len; i++){
            if(locChildren[i]._id === uuid)
                return locChildren[i];
        }
        return null;
    },

    /**
     * !#en Returns a child from the container given its name.
     * !#zh 通过名称获取节点的子节点。
     * @method getChildByName
     * @param {String} name - A name to find the child node.
     * @return {Node} a CCNode object whose name equals to the input parameter
     * @example
     * var child = node.getChildByName("Test Node");
     */
    getChildByName: function(name){
        if(!name){
            cc.log("Invalid name");
            return null;
        }

        var locChildren = this._children;
        for(var i = 0, len = locChildren.length; i < len; i++){
           if(locChildren[i]._name === name)
            return locChildren[i];
        }
        return null;
    },

    // composition: ADD

    /**
     * !#en
     * "add" logic MUST only be in this method <br/>
     * !#zh
     * 添加子节点，并且可以修改该节点的 局部 Z 顺序和标签。
     * @method addChild
     * @param {Node} child - A child node
     * @param {Number} [localZOrder] - Z order for drawing priority. Please refer to setZOrder(int)
     * @param {Number|String} [tag] - An integer or a name to identify the node easily. Please refer to setTag(int) and setName(string)
     * @example
     * node.addChild(newNode, 1, 1001);
     */
    addChild: function (child, localZOrder, tag) {
        localZOrder = localZOrder === undefined ? child._localZOrder : localZOrder;
        var name, setTag = false;
        if(typeof tag === 'undefined'){
            tag = undefined;
            name = child._name;
        } else if(cc.js.isString(tag)){
            name = tag;
            tag = undefined;
        } else if(cc.js.isNumber(tag)){
            setTag = true;
            name = "";
        }

        cc.assert(child, cc._LogInfos.Node.addChild_3);
        cc.assert(child._parent === null, "child already added. It can't be added again");

        this._addChildHelper(child, localZOrder, tag, name, setTag);
    },

    _addChildHelper: function(child, localZOrder, tag, name, setTag){
        this._insertChild(child, localZOrder);
        if (setTag)
            child.setTag(tag);
        else
            child.setName(name);
    },

    _insertChild: function (child, z) {
        child.parent = this;
        child.zIndex = z;
    },

    // composition: REMOVE

    /**
     * !#en
     * Remove itself from its parent node. If cleanup is true, then also remove all actions and callbacks. <br/>
     * If the cleanup parameter is not passed, it will force a cleanup. <br/>
     * If the node orphan, then nothing happens.
     * !#zh
     * 从父节点中删除一个节点。cleanup 参数为 true，那么在这个节点上所有的动作和回调都会被删除，反之则不会。<br/>
     * 如果不传入 cleanup 参数，默认是 true 的。<br/>
     * 如果这个节点是一个孤节点，那么什么都不会发生。
     * @method removeFromParent
     * @param {Boolean} [cleanup=true] - true if all actions and callbacks on this node should be removed, false otherwise.
     * @see cc.Node#removeFromParentAndCleanup
     * @example
     * node.removeFromParent();
     * node.removeFromParent(false);
     */
    removeFromParent: function (cleanup) {
        if (this._parent) {
            if (cleanup === undefined)
                cleanup = true;
            this._parent.removeChild(this, cleanup);
        }
    },

    /**
     * !#en
     * Removes a child from the container. It will also cleanup all running actions depending on the cleanup parameter. </p>
     * If the cleanup parameter is not passed, it will force a cleanup. <br/>
     * "remove" logic MUST only be on this method  <br/>
     * If a class wants to extend the 'removeChild' behavior it only needs <br/>
     * to override this method.
     * !#zh
     * 移除节点中指定的子节点，是否需要清理所有正在运行的行为取决于 cleanup 参数。<br/>
     * 如果 cleanup 参数不传入，默认为 true 表示清理。<br/>
     * @method removeChild
     * @param {Node} child - The child node which will be removed.
     * @param {Boolean} [cleanup=true] - true if all running actions and callbacks on the child node will be cleanup, false otherwise.
     * @example
     * node.removeChild(newNode);
     * node.removeChild(newNode, false);
     */
    removeChild: function (child, cleanup) {
        // explicit nil handling
        if (this._children.length === 0)
            return;

        if (cleanup === undefined)
            cleanup = true;
        if (this._children.indexOf(child) > -1)
            this._detachChild(child, cleanup);
    },

    /**
     * !#en
     * Removes a child from the container by tag value. It will also cleanup all running actions depending on the cleanup parameter.
     * If the cleanup parameter is not passed, it will force a cleanup. <br/>
     * !#zh
     * 通过标签移除节点中指定的子节点，是否需要清理所有正在运行的行为取决于 cleanup 参数。<br/>
     * 如果 cleanup 参数不传入，默认为 true 表示清理。
     * @method removeChildByTag
     * @param {Number} tag - An integer number that identifies a child node
     * @param {Boolean} [cleanup=true] - true if all running actions and callbacks on the child node will be cleanup, false otherwise.
     * @see cc.Node#removeChildByTag
     * @example
     * node.removeChildByTag(1001);
     * node.removeChildByTag(1001, false);
     */
    removeChildByTag: function (tag, cleanup) {
        if (tag === cc.macro.NODE_TAG_INVALID)
            cc.log(cc._LogInfos.Node.removeChildByTag);

        var child = this.getChildByTag(tag);
        if (!child)
            cc.log(cc._LogInfos.Node.removeChildByTag_2, tag);
        else
            this.removeChild(child, cleanup);
    },

    /**
     * !#en
     * Removes all children from the container and do a cleanup all running actions depending on the cleanup parameter. <br/>
     * If the cleanup parameter is not passed, it will force a cleanup.
     * !#zh
     * 移除节点所有的子节点，是否需要清理所有正在运行的行为取决于 cleanup 参数。<br/>
     * 如果 cleanup 参数不传入，默认为 true 表示清理。
     * @method removeAllChildren
     * @param {Boolean} [cleanup=true] - true if all running actions on all children nodes should be cleanup, false otherwise.
     * @example
     * node.removeAllChildren();
     * node.removeAllChildren(false);
     */
    removeAllChildren: function (cleanup) {
        // not using detachChild improves speed here
        var children = this._children;
        if (cleanup === undefined)
            cleanup = true;
        for (var i = children.length - 1; i >= 0; i--) {
            var node = children[i];
            if (node) {
                //if (this._running) {
                //    node.onExitTransitionDidStart();
                //    node.onExit();
                //}

                // If you don't do cleanup, the node's actions will not get removed and the
                if (cleanup)
                    node.cleanup();

                node.parent = null;
            }
        }
        this._children.length = 0;
    },

    _detachChild: function (child, doCleanup) {
        // IMPORTANT:
        //  - 1st do onExit
        //  - 2nd cleanup
        //if (this._running) {
        //    child.onExitTransitionDidStart();
        //    child.onExit();
        //}

        // If you don't do cleanup, the child's actions will not get removed and the
        if (doCleanup)
            child.cleanup();

        child.parent = null;
    },

    setNodeDirty: function(){
        this._sgNode.setNodeDirty();
    },

    /**
     * !#en
     * Returns the matrix that transform parent's space coordinates to the node's (local) space coordinates.<br/>
     * The matrix is in Pixels. The returned transform is readonly and cannot be changed.
     * !#zh
     * 返回将父节点的坐标系转换成节点（局部）的空间坐标系的矩阵。<br/>
     * 该矩阵以像素为单位。返回的矩阵是只读的，不能更改。
     * @method getParentToNodeTransform
     * @return {AffineTransform}
     * @example
     * var affineTransform = node.getParentToNodeTransform();
     */
    getParentToNodeTransform: function () {
        return this._sgNode.getParentToNodeTransform();
    },

    _isSgTransformArToMe: function (myContentSize) {
        var renderSize = this._sgNode.getContentSize();
        if (renderSize.width === 0 && renderSize.height === 0 &&
            (myContentSize.width !== 0 || myContentSize.height !== 0)) {
            // anchor point ignored
            return true;
        }
        if (this._sgNode.isIgnoreAnchorPointForPosition()) {
            // sg transform become anchor relative...
            return true;
        }
        return false;
    },
    
    /**
     * !#en Returns the world affine transform matrix. The matrix is in Pixels.
     * !#zh 返回节点到世界坐标系的仿射变换矩阵。矩阵单位是像素。
     * @method getNodeToWorldTransform
     * @return {AffineTransform}
     * @example
     * var affineTransform = node.getNodeToWorldTransform();
     */
    getNodeToWorldTransform: function () {
        var contentSize = this.getContentSize();

        if (cc._renderType === cc.game.RENDER_TYPE_CANVAS) {
            // ensure transform computed
            cc.director._visitScene();
        }
        var mat = this._sgNode.getNodeToWorldTransform();

        if (this._isSgTransformArToMe(contentSize)) {
            // _sgNode.getNodeToWorldTransform is not anchor relative (AR), in this case, 
            // we should translate to bottem left to consistent with it 
            // see https://github.com/cocos-creator/engine/pull/391
            var tx = - this._anchorPoint.x * contentSize.width;
            var ty = - this._anchorPoint.y * contentSize.height;
            var offset = cc.affineTransformMake(1, 0, 0, 1, tx, ty);
            mat = cc.affineTransformConcatIn(offset, mat);
        }
        return mat;
    },


    /**
     * !#en
     * Returns the world affine transform matrix. The matrix is in Pixels.<br/>
     * This method is AR (Anchor Relative).
     * !#zh
     * 返回节点到世界坐标仿射变换矩阵。矩阵单位是像素。<br/>
     * 该方法基于节点坐标。
     * @method getNodeToWorldTransformAR
     * @return {AffineTransform}
     * @example
     * var mat = node.getNodeToWorldTransformAR();
     */
    getNodeToWorldTransformAR: function () {
        var contentSize = this.getContentSize();

        if (cc._renderType === cc.game.RENDER_TYPE_CANVAS) {
            // ensure transform computed
            cc.director._visitScene();
        }
        var mat = this._sgNode.getNodeToWorldTransform();

        if ( !this._isSgTransformArToMe(contentSize) ) {
            // see getNodeToWorldTransform
            var tx = this._anchorPoint.x * contentSize.width;
            var ty = this._anchorPoint.y * contentSize.height;
            var offset = cc.affineTransformMake(1, 0, 0, 1, tx, ty);
            mat = cc.affineTransformConcatIn(offset, mat);
        }
        return mat;
    },
    /**
     * !#en Returns the inverse world affine transform matrix. The matrix is in Pixels.
     * !#en 返回世界坐标系到节点坐标系的逆矩阵。
     * @method getWorldToNodeTransform
     * @return {AffineTransform}
     * @example
     * var affineTransform = node.getWorldToNodeTransform();
     */
    getWorldToNodeTransform: function () {
        if (cc._renderType === cc.game.RENDER_TYPE_CANVAS) {
            // ensure transform computed
            cc.director._visitScene();
        }
        return this._sgNode.getWorldToNodeTransform();
    },

    /**
     * !#en Converts a Point to node (local) space coordinates. The result is in Vec2.
     * !#zh 将一个点转换到节点 (局部) 坐标系。结果以 Vec2 为单位。
     * @method convertToNodeSpace
     * @param {Vec2} worldPoint
     * @return {Vec2}
     * @example
     * var newVec2 = node.convertToNodeSpace(cc.v2(100, 100));
     */
    convertToNodeSpace: function (worldPoint) {
        if (cc._renderType === cc.game.RENDER_TYPE_CANVAS) {
            // ensure transform computed
            cc.director._visitScene();
        }
        var nodePositionIgnoreAnchorPoint = this._sgNode.convertToNodeSpace(worldPoint);
        return cc.pAdd(nodePositionIgnoreAnchorPoint, cc.p(this._anchorPoint.x * this._contentSize.width, this._anchorPoint.y * this._contentSize.height));
    },

    /**
     * !#en Converts a Point to world space coordinates. The result is in Points.
     * !#zh 将一个点转换到世界空间坐标系。结果以 Vec2 为单位。
     * @method convertToWorldSpace
     * @param {Vec2} nodePoint
     * @return {Vec2}
     * @example
     * var newVec2 = node.convertToWorldSpace(cc.v2(100, 100));
     */
    convertToWorldSpace: function (nodePoint) {
        if (cc._renderType === cc.game.RENDER_TYPE_CANVAS) {
            // ensure transform computed
            cc.director._visitScene();
        }
        var worldPositionIgnoreAnchorPoint = this._sgNode.convertToWorldSpace(nodePoint);
        return cc.pSub(worldPositionIgnoreAnchorPoint, cc.p(this._anchorPoint.x * this._contentSize.width, this._anchorPoint.y * this._contentSize.height));
    },

    /**
     * !#en
     * Converts a Point to node (local) space coordinates. The result is in Points.<br/>
     * treating the returned/received node point as anchor relative.
     * !#zh
     * 将一个点转换到节点 (局部) 空间坐标系。结果以 Vec2 为单位。<br/>
     * 返回值将基于节点坐标。
     * @method convertToNodeSpaceAR
     * @param {Vec2} worldPoint
     * @return {Vec2}
     * @example
     * var newVec2 = node.convertToNodeSpaceAR(cc.v2(100, 100));
     */
    convertToNodeSpaceAR: function (worldPoint) {
        if (cc._renderType === cc.game.RENDER_TYPE_CANVAS) {
            // ensure transform computed
            cc.director._visitScene();
        }
        if (this._sgNode.isIgnoreAnchorPointForPosition()) {
            // see https://github.com/cocos-creator/engine/pull/391
            return cc.v2(this._sgNode.convertToNodeSpace(worldPoint));
        }
        else {
            return this._sgNode.convertToNodeSpaceAR(worldPoint);
        }
    },

    /**
     * !#en
     * Converts a local Point to world space coordinates.The result is in Points.<br/>
     * treating the returned/received node point as anchor relative.
     * !#zh
     * 将一个点转换到世界空间坐标系。结果以 Vec2 为单位。<br/>
     * 返回值将基于节点坐标。
     * @method convertToWorldSpaceAR
     * @param {Vec2} nodePoint
     * @return {Vec2}
     * @example
     * var newVec2 = node.convertToWorldSpaceAR(cc.v2(100, 100));
     */
    convertToWorldSpaceAR: function (nodePoint) {
        if (cc._renderType === cc.game.RENDER_TYPE_CANVAS) {
            // ensure transform computed
            cc.director._visitScene();
        }
        if (this._sgNode.isIgnoreAnchorPointForPosition()) {
            // see https://github.com/cocos-creator/engine/pull/391
            return cc.v2(this._sgNode.convertToWorldSpace(nodePoint));
        }
        else {
            return cc.v2(this._sgNode.convertToWorldSpaceAR(nodePoint));
        }
    },

    /**
     * !#en convenience methods which take a cc.Touch instead of cc.Vec2.
     * !#zh 将触摸点转换成本地坐标系中位置。
     * @method convertTouchToNodeSpace
     * @param {Touch} touch - The touch object
     * @return {Vec2}
     * @example
     * var newVec2 = node.convertTouchToNodeSpace(touch);
     */
    convertTouchToNodeSpace: function (touch) {
        return this.convertToNodeSpace(touch.getLocation());
    },

    /**
     * !#en converts a cc.Touch (world coordinates) into a local coordinate. This method is AR (Anchor Relative).
     * !#zh 转换一个 cc.Touch（世界坐标）到一个局部坐标，该方法基于节点坐标。
     * @method convertTouchToNodeSpaceAR
     * @param {Touch} touch - The touch object
     * @return {Vec2}
     * @example
     * var newVec2 = node.convertTouchToNodeSpaceAR(touch);
     */
    convertTouchToNodeSpaceAR: function (touch) {
        return this.convertToNodeSpaceAR(touch.getLocation());
    },

    /**
     * !#en
     * Returns the matrix that transform the node's (local) space coordinates into the parent's space coordinates.<br/>
     * The matrix is in Pixels.
     * !#zh 返回这个将节点（局部）的空间坐标系转换成父节点的空间坐标系的矩阵。这个矩阵以像素为单位。
     * @method getNodeToParentTransform
     * @return {AffineTransform} The affine transform object
     * @example
     * var affineTransform = node.getNodeToParentTransform();
     */
    getNodeToParentTransform: function () {
        var contentSize = this.getContentSize();
        var mat = this._sgNode.getNodeToParentTransform();
        if (this._isSgTransformArToMe(contentSize)) {
            // see getNodeToWorldTransform
            var tx = - this._anchorPoint.x * contentSize.width;
            var ty = - this._anchorPoint.y * contentSize.height;
            var offset = cc.affineTransformMake(1, 0, 0, 1, tx, ty);
            mat = cc.affineTransformConcatIn(offset, mat);
        }
        return mat;
    },

    /**
     * !#en
     * Returns the matrix that transform the node's (local) space coordinates into the parent's space coordinates.<br/>
     * The matrix is in Pixels.<br/>
     * This method is AR (Anchor Relative).
     * !#zh
     * 返回这个将节点（局部）的空间坐标系转换成父节点的空间坐标系的矩阵。<br/>
     * 这个矩阵以像素为单位。<br/>
     * 该方法基于节点坐标。
     * @method getNodeToParentTransformAR
     * @return {AffineTransform} The affine transform object
     * @example
     * var affineTransform = node.getNodeToParentTransformAR();
     */
    getNodeToParentTransformAR: function () {
        var contentSize = this.getContentSize();
        var mat = this._sgNode.getNodeToParentTransform();
        if ( !this._isSgTransformArToMe(contentSize) ) {
            // see getNodeToWorldTransform
            var tx = this._anchorPoint.x * contentSize.width;
            var ty = this._anchorPoint.y * contentSize.height;
            var offset = cc.affineTransformMake(1, 0, 0, 1, tx, ty);
            mat = cc.affineTransformConcatIn(offset, mat);
        }
        return mat;
    },
    
    /**
     * !#en
     * Returns a "world" axis aligned bounding box of the node.<br/>
     * The bounding box contains self and active children's world bounding box.
     * !#zh
     * 返回节点在世界坐标系下的对齐轴向的包围盒（AABB）。<br/>
     * 该边框包含自身和已激活的子节点的世界边框。
     * @method getBoundingBoxToWorld
     * @return {Rect}
     * @example
     * var newRect = node.getBoundingBoxToWorld();
     */
    getBoundingBoxToWorld: function () {
        var trans;
        if (this.parent) {
            trans = this.parent.getNodeToWorldTransformAR();
        }
        return this._getBoundingBoxTo(trans);
    },

    _getBoundingBoxTo: function (parentTransformAR) {
        var size = this.getContentSize();
        var width = size.width;
        var height = size.height;
        var rect = cc.rect(- this._anchorPoint.x * width, - this._anchorPoint.y * height, width, height);
        
        var transAR = cc.affineTransformConcat(this.getNodeToParentTransformAR(), parentTransformAR);
        cc._rectApplyAffineTransformIn(rect, transAR);

        //query child's BoundingBox
        if (!this._children)
            return rect;

        var locChildren = this._children;
        for (var i = 0; i < locChildren.length; i++) {
            var child = locChildren[i];
            if (child && child.active) {
                var childRect = child._getBoundingBoxTo(transAR);
                if (childRect)
                    rect = cc.rectUnion(rect, childRect);
            }
        }
        return rect;
    },

    /**
     * !#en
     * Returns the displayed opacity of Node,
     * the difference between displayed opacity and opacity is that displayed opacity is calculated based on opacity and parent node's opacity when cascade opacity enabled.
     * !#zh
     * 获取节点显示透明度，
     * 显示透明度和透明度之间的不同之处在于当启用级连透明度时，
     * 显示透明度是基于自身透明度和父节点透明度计算的。
     *
     * @method getDisplayedOpacity
     * @returns {number} displayed opacity
     * @example
     * var displayOpacity = node.getDisplayedOpacity();
     */
    getDisplayedOpacity: function () {
        return this._sgNode.getDisplayedOpacity();
    },

    /*
     * !#en Update displayed opacity.
     * !#zh 更新显示透明度。
     * @method _updateDisplayedOpacity
     * @param {Number} parentOpacity
     * @example
     * node._updateDisplayedOpacity(255);
     */
    _updateDisplayedOpacity: function (parentOpacity) {
        this._sgNode.updateDisplayedOpacity(parentOpacity);
    },

    /**
     * !#en
     * Returns the displayed color of Node,
     * the difference between displayed color and color is that displayed color is calculated based on color and parent node's color when cascade color enabled.
     * !#zh
     * 获取节点的显示透明度，
     * 显示透明度和透明度之间的不同之处在于显示透明度是基于透明度和父节点透明度启用级连透明度时计算的。
     * @method getDisplayedColor
     * @returns {Color}
     * @example
     * var displayColor = node.getDisplayedColor();
     */
    getDisplayedColor: function () {
        return this._sgNode.getDisplayedColor();
    },

    /**
     * !#en
     * Set whether color should be changed with the opacity value,
     * useless in ccsg.Node, but this function is override in some class to have such behavior.
     * !#zh 设置更改透明度时是否修改RGB值，
     * @method setOpacityModifyRGB
     * @param {Boolean} opacityValue
     * @example
     * node.setOpacityModifyRGB(true);
     */
    setOpacityModifyRGB: function (opacityValue) {
        if (this._opacityModifyRGB !== opacityValue) {
            this._opacityModifyRGB = opacityValue;
            this._sgNode.setOpacityModifyRGB(opacityValue);
            this._onOpacityModifyRGBChanged();
        }
    },

    /**
     * !#en Get whether color should be changed with the opacity value.
     * !#zh 更改透明度时是否修改RGB值。
     * @method isOpacityModifyRGB
     * @return {Boolean}
     * @example
     * var hasChange = node.isOpacityModifyRGB();
     */
    isOpacityModifyRGB: function () {
        return this._opacityModifyRGB;
    },

    // HIERARCHY METHODS

    /**
     * !#en Get the sibling index.
     * !#zh 获取同级索引。
     * @method getSiblingIndex
     * @return {number}
     * @example
     * var index = node.getSiblingIndex();
     */
    getSiblingIndex: function () {
        if (this._parent) {
            return this._parent._children.indexOf(this);
        }
        else {
            return 0;
        }
    },

    /**
     * !#en Set the sibling index of this node.
     * !#zh 设置节点同级索引。
     * @method setSiblingIndex
     * @param {Number} index
     * @example
     * node.setSiblingIndex(1);
     */
    setSiblingIndex: function (index) {
        if (!this._parent) {
            return;
        }
        var array = this._parent._children;
        index = index !== -1 ? index : array.length - 1;
        var oldIndex = array.indexOf(this);
        if (index !== oldIndex) {
            array.splice(oldIndex, 1);
            if (index < array.length) {
                array.splice(index, 0, this);
            }
            else {
                array.push(this);
            }

            // update rendering scene graph, sort them by arrivalOrder
            var siblings = this._parent._children;
            for (var i = 0, len = siblings.length; i < len; i++) {
                var sibling = siblings[i];
                sibling._sgNode.arrivalOrder = i;
            }
            if ( !CC_JSB ) {
                cc.renderer.childrenOrderDirty = true;
                this._parent._sgNode._reorderChildDirty = true;
                this._parent._reorderChildDirty = true;
                this._parent._delaySort();
            }
        }
    },

    /**
     * !#en Is this node a child of the given node?
     * !#zh 是否是指定节点的子节点？
     * @method isChildOf
     * @param {Node} parent
     * @return {Boolean} - Returns true if this node is a child, deep child or identical to the given node.
     * @example
     * node.isChildOf(newNode);
     */
    isChildOf: function (parent) {
        var child = this;
        do {
            if (child === parent) {
                return true;
            }
            child = child._parent;
        }
        while (child);
        return false;
    },

    /**
     * !#en Sorts the children array depends on children's zIndex and arrivalOrder, 
     * normally you won't need to invoke this function.
     * !#zh 根据子节点的 zIndex 和 arrivalOrder 进行排序，正常情况下开发者不需要手动调用这个函数。
     * 
     * @method sortAllChildren
     */
    sortAllChildren: function () {
        if (this._reorderChildDirty) {
            var _children = this._children;

            if (!_children) {
                this._reorderChildDirty = false;
                return;
            }

            // insertion sort
            var len = _children.length, i, j, child;
            for (i = 1; i < len; i++){
                child = _children[i];
                j = i - 1;

                //continue moving element downwards while zOrder is smaller or when zOrder is the same but mutatedIndex is smaller
                while(j >= 0){
                    if (child._localZOrder < _children[j]._localZOrder) {
                        _children[j+1] = _children[j];
                    } else if (child._localZOrder === _children[j]._localZOrder && 
                               child._sgNode.arrivalOrder < _children[j]._sgNode.arrivalOrder) {
                        _children[j+1] = _children[j];
                    } else {
                        break;
                    }
                    j--;
                }
                _children[j+1] = child;
            }

            this._reorderChildDirty = false;
            this.emit(CHILD_REORDER);
        }
        cc.director.off(cc.Director.EVENT_AFTER_UPDATE, this.sortAllChildren, this);
    },

    _delaySort: function () {
        cc.director.on(cc.Director.EVENT_AFTER_UPDATE, this.sortAllChildren, this);
    },

    _updateDummySgNode: function () {
        var sgNode = this._sgNode;

        sgNode.setPosition(this._position);
        sgNode.setRotationX(this._rotationX);
        sgNode.setRotationY(this._rotationY);
        sgNode.setScale(this._scaleX, this._scaleY);
        sgNode.setSkewX(this._skewX);
        sgNode.setSkewY(this._skewY);
        sgNode.ignoreAnchorPointForPosition(this.__ignoreAnchor);

        var arrivalOrder = sgNode.arrivalOrder;
        sgNode.setLocalZOrder(this._localZOrder);
        sgNode.arrivalOrder = arrivalOrder;
        sgNode.setGlobalZOrder(this._globalZOrder);

        sgNode.setOpacity(this._opacity);
        sgNode.setOpacityModifyRGB(this._opacityModifyRGB);
        sgNode.setCascadeOpacityEnabled(this._cascadeOpacityEnabled);
        sgNode.setTag(this._tag);
    },
    
    _updateSgNode: function () {
        this._updateDummySgNode();
        var sgNode = this._sgNode;
        sgNode.setAnchorPoint(this._anchorPoint);
        sgNode.setVisible(this._active);
        sgNode.setColor(this._color);
        
        // update ActionManager and EventManager because sgNode maybe changed
        if (this._activeInHierarchy) {
            cc.director.getActionManager().resumeTarget(this);
            cc.eventManager.resumeTarget(this);
        }
        else {
            cc.director.getActionManager().pauseTarget(this);
            cc.eventManager.pauseTarget(this);
        }
    },

    // The deserializer for sgNode which will be called before components onLoad
    _onBatchCreated: function () {
        this._updateDummySgNode();

        if (this._parent) {
            this._parent._sgNode.addChild(this._sgNode);
        }

        if ( !this._activeInHierarchy ) {
            // deactivate ActionManager and EventManager by default
            cc.director.getActionManager().pauseTarget(this);
            cc.eventManager.pauseTarget(this);
        }

        var children = this._children;
        for (var i = 0, len = children.length; i < len; i++) {
            children[i]._onBatchCreated();
        }
    },

    _removeSgNode: SceneGraphHelper.removeSgNode,
});


(function () {

    // Define public getter and setter methods to ensure api compatibility.

    var SameNameGetSets = ['name', 'skewX', 'skewY', 'position', 'rotation', 'rotationX', 'rotationY',
                           'scale', 'scaleX', 'scaleY', 'children', 'childrenCount', 'parent', 'running',
                           /*'actionManager',*/ 'scheduler', /*'shaderProgram',*/ 'opacity', 'color', 'tag'];
    var DiffNameGetSets = {
        x: ['getPositionX', 'setPositionX'],
        y: ['getPositionY', 'setPositionY'],
        zIndex: ['getLocalZOrder', 'setLocalZOrder'],
        //running: ['isRunning'],
        opacityModifyRGB: ['isOpacityModifyRGB'],
        cascadeOpacity: ['isCascadeOpacityEnabled', 'setCascadeOpacityEnabled'],
        cascadeColor: ['isCascadeColorEnabled', 'setCascadeColorEnabled'],
        //// privates
        //width: ['_getWidth', '_setWidth'],
        //height: ['_getHeight', '_setHeight'],
        //anchorX: ['_getAnchorX', '_setAnchorX'],
        //anchorY: ['_getAnchorY', '_setAnchorY'],
    };
    var propName, np = BaseNode.prototype;
    for (var i = 0; i < SameNameGetSets.length; i++) {
        propName = SameNameGetSets[i];
        var suffix = propName[0].toUpperCase() + propName.slice(1);
        var pd = Object.getOwnPropertyDescriptor(np, propName);
        if (pd) {
            if (pd.get) np['get' + suffix] = pd.get;
            if (pd.set) np['set' + suffix] = pd.set;
        }
        else {
            JS.getset(np, propName, np['get' + suffix], np['set' + suffix]);
        }
    }
    for (propName in DiffNameGetSets) {
        var getset = DiffNameGetSets[propName];
        var pd = Object.getOwnPropertyDescriptor(np, propName);
        if (pd) {
            np[getset[0]] = pd.get;
            if (getset[1]) np[getset[1]] = pd.set;
        }
        else {
            JS.getset(np, propName, np[getset[0]], np[getset[1]]);
        }
    }
})();

/**
 * !#en position of node.
 * !#zh 节点相对父节点的坐标。
 * @property position
 * @type {Vec2}
 * @example
 * node.position = new cc.Vec2(0, 0);
 */

/**
 * !#en Scale of node.
 * !#zh 节点缩放
 * @property scale
 * @type {Number}
 * @example
 * node.scale = 1;
 */

/**
 * !#en Returns the x axis position of the node in cocos2d coordinates.
 * !#zh 获取节点 X 轴坐标。
 * @method getPositionX
 * @return {Number} x - The new position in x axis
 * @example
 * var posX = node.getPositionX();
 */

/**
 * !#en Sets the x axis position of the node in cocos2d coordinates.
 * !#zh 设置节点 X 轴坐标。
 * @method setPositionX
 * @param {Number} x
 * @example
 * node.setPositionX(1);
 */

/**
 * !#en Returns the y axis position of the node in cocos2d coordinates.
 * !#zh 获取节点 Y 轴坐标。
 * @method getPositionY
 * @return {Number}
 * @example
 * var posY = node.getPositionY();
 */

/**
 * !#en Sets the y axis position of the node in cocos2d coordinates.
 * !#zh 设置节点 Y 轴坐标。
 * @method setPositionY
 * @param {Number} y - The new position in y axis
 * @example
 * node.setPositionY(100);
 */

/**
 * !#en Returns the local Z order of this node.
 * !#zh 获取节点局部 Z 轴顺序。
 * @method getLocalZOrder
 * @returns {Number} The local (relative to its siblings) Z order.
 * @example
 * var localZorder = node.getLocalZOrder();
 */

/**
 * !#en
 * LocalZOrder is the 'key' used to sort the node relative to its siblings.                                        <br/>
 *                                                                                                                 <br/>
 * The Node's parent will sort all its children based ont the LocalZOrder value.                                   <br/>
 * If two nodes have the same LocalZOrder, then the node that was added first to the children's array              <br/>
 * will be in front of the other node in the array.                                                                <br/>
 * Also, the Scene Graph is traversed using the "In-Order" tree traversal algorithm ( http://en.wikipedia.org/wiki/Tree_traversal#In-order ) <br/>
 * And Nodes that have LocalZOder values smaller than 0 are the "left" subtree <br/>
 * While Nodes with LocalZOder greater than 0 are the "right" subtree.
 * !#zh
 * LocalZOrder 是 “key” (关键)来分辨节点和它兄弟节点的相关性。
 * 父节点将会通过 LocalZOrder 的值来分辨所有的子节点。
 * 如果两个节点有同样的 LocalZOrder，那么先加入子节点数组的节点将会显示在后加入的节点的前面。
 * 同样的，场景图使用 “In-Order（按顺序）” 遍历数算法来遍历
 * ( http://en.wikipedia.org/wiki/Tree_traversal#In-order ) 并且拥有小于 0 的 LocalZOrder 的值的节点是 “ left ” 子树（左子树）
 * 所以拥有大于 0 的 LocalZOrder 的值得节点是 “ right ”子树（右子树）。
 * @method setLocalZOrder
 * @param {Number} localZOrder
 * @example
 * node.setLocalZOrder(1);
 */

/**
 * !#en Returns whether node's opacity value affect its child nodes.
 * !#zh 返回节点的不透明度值是否影响其子节点。
 * @method isCascadeOpacityEnabled
 * @returns {Boolean}
 * @example
 * cc.log(node.isCascadeOpacityEnabled());
 */

/**
 * !#en Enable or disable cascade opacity, if cascade enabled, child nodes' opacity will be the multiplication of parent opacity and its own opacity.
 * !#zh 启用或禁用级连不透明度，如果级连启用，子节点的不透明度将是父不透明度乘上它自己的不透明度。
 * @method setCascadeOpacityEnabled
 * @param {Boolean} cascadeOpacityEnabled
 * @example
 * node.setCascadeOpacityEnabled(true);
 */

/*
 * !#en Returns whether node's color value affect its child nodes.
 * !#zh 返回节点的颜色值是否影响其子节点。
 * @method isCascadeColorEnabled
 * @returns {Boolean}
 * @example
 * cc.log(node.isCascadeColorEnabled());
 */

/**
 * !#en Enable or disable cascade color, if cascade enabled, child nodes' opacity will be the cascade value of parent color and its own color.
 * !#zh 启用或禁用级连颜色，如果级连启用，子节点的颜色将是父颜色和它自己的颜色的级连值。
 * @method setCascadeColorEnabled
 * @param {Boolean} cascadeColorEnabled
 * @example
 * node.setCascadeColorEnabled(true);
 */


cc._BaseNode = module.exports = BaseNode;
